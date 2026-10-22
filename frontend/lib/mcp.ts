/**
 * A tiny, real MCP client for the browser.
 *
 * It speaks the Streamable HTTP transport directly: initialize, the
 * `notifications/initialized` notification, tools/list and tools/call. This is
 * deliberately not a mock: the Alexa+ page shows the negotiated protocol and
 * the actual JSON-RPC result of every call.
 */

export type McpTool = {
  name: string;
  description: string | null;
};

export type McpCall = {
  tool: string;
  args: Record<string, unknown>;
  value: unknown;
  raw: unknown;
  durationMs: number;
};

type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: unknown;
  error?: JsonRpcError;
};

type ToolContent = {
  type?: string;
  text?: string;
};

type ToolsCallResult = {
  content?: ToolContent[];
  structuredContent?: unknown;
  isError?: boolean;
};

export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpError";
  }
}

function parseRpcBody(text: string, contentType: string): JsonRpcResponse {
  const trimmed = text.trim();
  if (!trimmed) throw new McpError("The MCP server returned an empty response.");

  if (contentType.includes("text/event-stream")) {
    // Collect every `data:` payload, then inspect newest-first. Notifications
    // and responses can share a stream; the response is the one with a result
    // or an error.
    const payloads = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    for (const payload of payloads.reverse()) {
      try {
        const parsed = JSON.parse(payload) as JsonRpcResponse;
        if (parsed.result !== undefined || parsed.error !== undefined) return parsed;
      } catch {
        // Ignore non-JSON keepalive/comment events.
      }
    }
    throw new McpError("The MCP event stream contained no JSON-RPC response.");
  }

  try {
    return JSON.parse(trimmed) as JsonRpcResponse;
  } catch {
    throw new McpError(`The MCP server returned non-JSON: ${trimmed.slice(0, 180)}`);
  }
}

function parseJsonOrString(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toolValue(result: ToolsCallResult): unknown {
  // The MCP SDK also returns a structuredContent payload. Its output schema
  // wraps tuple-like returns as { result: ... }, so unwrap that one key.
  if (result.structuredContent !== undefined) {
    const structured = result.structuredContent;
    if (
      structured !== null &&
      typeof structured === "object" &&
      !Array.isArray(structured) &&
      Object.keys(structured).length === 1 &&
      "result" in structured
    ) {
      return (structured as { result: unknown }).result;
    }
    return structured;
  }

  const texts = (result.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .filter((text) => text.trim().length > 0);

  if (texts.length === 0) return null;
  if (texts.length === 1) return parseJsonOrString(texts[0]);
  // list-returning tools emit one text block per item.
  return texts.map(parseJsonOrString);
}

export class OnceMcpClient {
  private readonly endpoint: string;
  private sessionId: string | null = null;
  private nextId = 1;

  protocolVersion: string | null = null;
  serverName: string | null = null;
  serverVersion: string | null = null;
  instructions: string | null = null;
  tools: McpTool[] = [];

  constructor(endpoint = "/mcp") {
    this.endpoint = endpoint;
  }

  get connected(): boolean {
    return this.sessionId !== null;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    return headers;
  }

  private async post(
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<{ response: Response; rpc: JsonRpcResponse | null }> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", ...body }),
      signal,
    });
    const sid = response.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const text = await response.text();
    const rpc =
      text.trim().length > 0
        ? parseRpcBody(text, response.headers.get("content-type") ?? "")
        : null;
    if (!response.ok) {
      const detail = rpc?.error?.message ?? `HTTP ${response.status}`;
      throw new McpError(`MCP request failed: ${detail}`);
    }
    if (rpc?.error) {
      throw new McpError(`${rpc.error.code}: ${rpc.error.message}`);
    }
    return { response, rpc };
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown> {
    const id = this.nextId++;
    const { rpc } = await this.post({ id, method, params }, signal);
    if (!rpc || rpc.result === undefined) {
      throw new McpError(`MCP ${method} returned no result.`);
    }
    return rpc.result;
  }

  async connect(signal?: AbortSignal): Promise<void> {
    // Reset state so a retry performs a clean handshake.
    this.sessionId = null;
    this.protocolVersion = null;
    this.serverName = null;
    this.serverVersion = null;
    this.instructions = null;
    this.tools = [];

    const init = (await this.request(
      "initialize",
      {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "once-web-simulator", version: "1.0.0" },
      },
      signal
    )) as {
      protocolVersion?: string;
      instructions?: string;
      serverInfo?: { name?: string; version?: string };
    };

    this.protocolVersion = init.protocolVersion ?? null;
    this.instructions = init.instructions ?? null;
    this.serverName = init.serverInfo?.name ?? null;
    this.serverVersion = init.serverInfo?.version ?? null;

    // JSON-RPC notification: no id, no response body (the spec says 202).
    await this.post({ method: "notifications/initialized" }, signal);

    const listed = (await this.request("tools/list", {}, signal)) as {
      tools?: { name?: string; description?: string }[];
    };
    this.tools = (listed.tools ?? [])
      .filter((tool): tool is { name: string; description?: string } => Boolean(tool.name))
      .map((tool) => ({ name: tool.name, description: tool.description ?? null }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    signal?: AbortSignal
  ): Promise<McpCall> {
    const started = performance.now();
    const result = (await this.request(
      "tools/call",
      { name, arguments: args },
      signal
    )) as ToolsCallResult;

    const value = toolValue(result);

    if (result.isError) {
      throw new McpError(
        typeof value === "string" ? value : `MCP tool ${name} reported an error.`
      );
    }

    return {
      tool: name,
      args,
      value,
      raw: result,
      durationMs: Math.round(performance.now() - started),
    };
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await fetch(this.endpoint, {
        method: "DELETE",
        headers: this.headers(),
      });
    } catch {
      // Closing is best-effort; the server expires idle sessions on its own.
    } finally {
      this.sessionId = null;
    }
  }
}
