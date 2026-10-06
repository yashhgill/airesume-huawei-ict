/**
 * LLM gateway. Groq's OpenAI-compatible Chat Completions API with JSON output.
 * Swap providers by changing the base URL/model: the same request shape works
 * for Huawei Cloud ModelArts Studio (MaaS), OpenAI, or Cloudflare AI Gateway.
 */
import type { Env } from './env';
import { mockLlm } from './llm-mock';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';   // careful reasoning: resumes, plans, reviews
const FAST_MODEL = 'openai/gpt-oss-20b';       // conversation: coach chat, interview turns

/** Pick a model per task: big for structured documents, small for snappy chat. */
export const modelFor = (env: Env, speed: 'smart' | 'fast' = 'smart') =>
  speed === 'fast' ? (env.GROQ_FAST_MODEL || FAST_MODEL) : (env.GROQ_MODEL || DEFAULT_MODEL);

export class LlmError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

export interface LlmCall {
  task: string;          // short name, used for logging and the offline mock
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  input?: unknown;       // structured input, only used by the offline mock
  speed?: 'smart' | 'fast';
}

export async function llmJson<T>(env: Env, call: LlmCall): Promise<T> {
  if (env.LLM_PROVIDER === 'mock') return mockLlm(call.task, call.input) as T;
  if (!env.GROQ_API_KEY) throw new LlmError('AI is not configured: set the GROQ_API_KEY secret.', 503);

  const model = modelFor(env, call.speed);
  const body = {
    model,
    temperature: call.temperature ?? 0.4,
    max_tokens: Math.max(4000, (call.maxTokens ?? 2000) * 2),
    // gpt-oss models reason before answering; keep it short so JSON fits the budget
    ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${call.system}\n\nRespond with a single valid JSON object only.` },
      { role: 'user', content: call.user },
    ],
  };

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429) { lastErr = 'The AI service is busy (rate limit). Try again in a few seconds.'; await sleep(1500); continue; }
    if (!res.ok) { lastErr = `AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`; continue; }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    try { return JSON.parse(stripFences(text)) as T; }
    catch { lastErr = 'The AI returned malformed JSON.'; }
  }
  throw new LlmError(lastErr || 'AI request failed.');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const stripFences = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');

export interface ChatTurn { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Stream a plain-text reply token by token. Returns a ReadableStream of UTF-8
 * text (not SSE), so the browser can append chunks as they arrive. `onDone`
 * receives the full reply, e.g. to save it, once the stream finishes.
 */
export async function llmStream(env: Env, opts: { task: string; messages: ChatTurn[]; temperature?: number; maxTokens?: number; speed?: 'smart' | 'fast'; input?: unknown; onDone?: (full: string) => Promise<void> | void }): Promise<ReadableStream<Uint8Array>> {
  const enc = new TextEncoder();
  let full = '';
  if (env.LLM_PROVIDER === 'mock') {
    const words = String(mockLlm(opts.task, opts.input) ?? '').split(/(?<= )/);
    return new ReadableStream({
      async pull(ctl) {
        const w = words.shift();
        if (w === undefined) { await opts.onDone?.(full); ctl.close(); return; }
        full += w; ctl.enqueue(enc.encode(w));
      },
    });
  }
  if (!env.GROQ_API_KEY) throw new LlmError('AI is not configured: set the GROQ_API_KEY secret.', 503);
  const model = modelFor(env, opts.speed ?? 'fast');
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model, stream: true, temperature: opts.temperature ?? 0.6, max_tokens: opts.maxTokens ?? 1500,
      ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
      messages: opts.messages,
    }),
  });
  if (res.status === 429) throw new LlmError('The AI service is busy (rate limit). Try again in a few seconds.', 429);
  if (!res.ok || !res.body) throw new LlmError(`AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  return new ReadableStream({
    async pull(ctl) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { await opts.onDone?.(full); ctl.close(); return; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        let out = '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') continue;
          try { out += (JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? ''; } catch { /* partial line */ }
        }
        if (out) { full += out; ctl.enqueue(enc.encode(out)); return; }
      }
    },
    cancel() { reader.cancel(); },
  });
}
