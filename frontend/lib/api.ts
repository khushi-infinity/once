// Every call gets a hard timeout so the UI can never strand the user on a
// "Saving…"/"Thinking…" button with no error. Hosted vision extraction is the
// slowest path, so the default allows for that.
const DEFAULT_TIMEOUT_MS = 120_000;

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  // FastAPI validation errors arrive as a list of objects. String()ing that
  // list produced "[object Object]" in the UI; instead render the first
  // problem like a human would name it.
  if (Array.isArray(detail)) {
    const first = detail.find((d) => typeof d === "object" && d !== null);
    if (first && typeof first === "object") {
      const d = first as Record<string, unknown>;
      const loc = Array.isArray(d.loc)
        ? (d.loc as unknown[]).filter((p) => p !== "body").join(".")
        : "";
      const msg = typeof d.msg === "string" ? d.msg : "";
      if (msg) {
        const got = d.input != null && String(d.input).length > 0 ? ` (got “${String(d.input)}”)` : "";
        return `${loc ? `${loc}: ` : ""}${msg}${got}`;
      }
    }
    return "The server rejected this request. Fix the highlighted fields and try again.";
  }
  return "Unexpected server response.";
}

export async function api<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  // AbortController: if the backend or network never answers, the promise
  // rejects with a real message instead of hanging the button forever.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        `The request took longer than ${Math.round(timeoutMs / 1000)}s. Check the network and try again.`,
      );
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (body && typeof body === "object" && "detail" in body) {
      throw new Error(detailMessage((body as { detail: unknown }).detail));
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return body as T;
}

export function engineLabel(engine: {
  provider: string;
  model: string | null;
  duration_ms: number | null;
  fallback_from?: string | null;
}): string {
  const model = engine.model ? ` · ${engine.model}` : "";
  const time = engine.duration_ms != null ? ` · ${(engine.duration_ms / 1000).toFixed(1)}s` : "";
  const fallback = engine.fallback_from ? ` · fallback from ${engine.fallback_from}` : "";
  return `${engine.provider}${model}${time}${fallback}`;
}
