// Minimal Ollama client (native /api/chat + /api/tags).
// Works with BOTH:
//   - Local Ollama  -> base URL http://localhost:11434, no API key
//   - Ollama Cloud  -> base URL https://ollama.com, Authorization: Bearer <key>
// Includes rate-limit protection: automatic backoff + retry on HTTP 429 / 503.

const DEFAULT_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Merge request-time overrides (from the browser Settings panel) with .env defaults. */
export function resolveConfig(overrides = {}) {
  const baseUrl = (overrides.baseUrl || DEFAULT_BASE).trim().replace(/\/+$/, '');
  // A blank override must NOT clobber the .env key (empty string is "not provided").
  const apiKey = ((overrides.apiKey || '').trim()) || process.env.OLLAMA_API_KEY || '';
  const model = (overrides.model || DEFAULT_MODEL).trim();
  return { baseUrl, apiKey, model };
}

function buildHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/** List models available on the target Ollama server (empty on Ollama Cloud). */
export async function listModels({ baseUrl, apiKey }) {
  const res = await fetch(`${baseUrl}/api/tags`, { headers: buildHeaders(apiKey) });
  if (!res.ok) {
    throw new Error(`Ollama /api/tags responded ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return (data.models || []).map((m) => m.name).filter(Boolean);
}

/**
 * Send a system + user message to Ollama's chat endpoint and return the raw
 * assistant text. Uses JSON mode + temperature 0 for deterministic, parseable
 * ratings. On rate-limit (429) or overload (503) it waits and retries with
 * exponential backoff, honouring a Retry-After header if the server sends one.
 */
export async function chat({ baseUrl, apiKey, model }, systemPrompt, userPrompt, { timeoutMs = 300000, maxRetries = 4 } = {}) {
  const payload = JSON.stringify({
    model,
    stream: false,
    format: 'json',
    options: { temperature: 0 },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: payload,
        signal: controller.signal,
      });

      // Rate limited / temporarily overloaded -> back off and retry.
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after')) || Math.min(2 ** attempt, 30);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status === 429) {
        throw new Error('Ollama Cloud rate limit reached. Wait a minute and try again — the app already backs off and retries automatically.');
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Ollama /api/chat responded ${res.status} ${res.statusText}. ${detail}`.trim());
      }

      const data = await res.json();
      return data?.message?.content ?? '';
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${Math.round(timeoutMs / 1000)}s. Try a smaller/faster model.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
