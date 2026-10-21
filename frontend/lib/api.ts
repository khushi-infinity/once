export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body as T;
}

export function engineLabel(engine: {
  provider: string;
  model: string | null;
  duration_ms: number | null;
}): string {
  const model = engine.model ? ` · ${engine.model}` : "";
  const time = engine.duration_ms != null ? ` · ${(engine.duration_ms / 1000).toFixed(1)}s` : "";
  return `${engine.provider}${model}${time}`;
}
