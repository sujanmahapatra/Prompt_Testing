// Flexible Ollama client (native /api/chat + /api/tags), local or cloud.
// Retries on HTTP 429/503 with backoff so we stay under rate limits.

const DEFAULT_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:120b';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function resolveConfig(o = {}) {
  const baseUrl = ((o.baseUrl || DEFAULT_BASE) + '').trim().replace(/\/+$/, '');
  const apiKey = ((o.apiKey || '').trim()) || process.env.OLLAMA_API_KEY || '';
  const model = ((o.model || DEFAULT_MODEL) + '').trim();
  return { baseUrl, apiKey, model };
}

function headers(apiKey) {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

export async function listModels(cfg) {
  const res = await fetch(`${cfg.baseUrl}/api/tags`, { headers: headers(cfg.apiKey) });
  if (!res.ok) throw new Error(`/api/tags responded ${res.status} ${res.statusText}`);
  const d = await res.json();
  return (d.models || []).map((m) => m.name).filter(Boolean);
}

// Send messages, return assistant text. json:true forces JSON mode (for the judge).
export async function chat(cfg, messages, { temperature = 0, json = false, timeoutMs = 180000, maxRetries = 4 } = {}) {
  const body = JSON.stringify({
    model: cfg.model,
    stream: false,
    ...(json ? { format: 'json' } : {}),
    options: { temperature },
    messages,
  });

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.baseUrl}/api/chat`, {
        method: 'POST', headers: headers(cfg.apiKey), body, signal: controller.signal,
      });
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after')) || Math.min(2 ** attempt, 30);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Ollama ${res.status} ${res.statusText}. ${detail}`.trim());
      }
      const data = await res.json();
      return data?.message?.content ?? '';
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
