import { ApiError, tokenStore } from './api';

/** POST to an endpoint that streams plain text; calls onChunk with the text so far. */
export async function streamText(path: string, body: unknown, onChunk: (full: string) => void, signal?: AbortSignal): Promise<string> {
  const t = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onChunk(full);
  }
  return full;
}
