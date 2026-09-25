/**
 * LLM gateway. Groq's OpenAI-compatible Chat Completions API with JSON output.
 * Swap providers by changing the base URL/model: the same request shape works
 * for Huawei Cloud ModelArts Studio (MaaS), OpenAI, or Cloudflare AI Gateway.
 */
import type { Env } from './env';
import { mockLlm } from './llm-mock';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

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
}

export async function llmJson<T>(env: Env, call: LlmCall): Promise<T> {
  if (env.LLM_PROVIDER === 'mock') return mockLlm(call.task, call.input) as T;
  if (!env.GROQ_API_KEY) throw new LlmError('AI is not configured: set the GROQ_API_KEY secret.', 503);

  const body = {
    model: env.GROQ_MODEL || DEFAULT_MODEL,
    temperature: call.temperature ?? 0.4,
    max_tokens: Math.max(4000, (call.maxTokens ?? 2000) * 2),
    // gpt-oss models reason before answering; keep it short so JSON fits the budget
    ...(/gpt-oss/.test(env.GROQ_MODEL || DEFAULT_MODEL) ? { reasoning_effort: 'low' } : {}),
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
