import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, listModels, chat } from './lib/ollama.js';
import { SYSTEM_PROMPT, buildUserPrompt, extractJSON, DIMENSIONS } from './lib/judgePrompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Concurrency gate: never run more than MAX_CONCURRENT ratings at once, so we
//     stay well under the Ollama Cloud rate limit. Extra requests queue politely. ---
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 1);
let active = 0;
const waiters = [];
function acquire() {
  if (active < MAX_CONCURRENT) { active++; return Promise.resolve(); }
  return new Promise((resolve) => waiters.push(resolve));
}
function release() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) { active++; next(); }
}

// The 12 rating dimensions (so the UI can render labels without hardcoding them).
app.get('/api/dimensions', (_req, res) => res.json(DIMENSIONS));

// Connection check + installed-model list. Never 500s — the UI needs a friendly answer.
app.get('/api/health', async (req, res) => {
  const cfg = resolveConfig({ baseUrl: req.query.baseUrl, apiKey: req.query.apiKey });
  const cloud = /ollama\.com/i.test(cfg.baseUrl);
  try {
    const models = await listModels(cfg);
    res.json({ ok: true, baseUrl: cfg.baseUrl, defaultModel: cfg.model, cloud, models });
  } catch (err) {
    res.json({ ok: false, baseUrl: cfg.baseUrl, defaultModel: cfg.model, cloud, models: [], error: err.message });
  }
});

// The main event: rate a pasted prompt.
app.post('/api/analyze', async (req, res) => {
  const { prompt, model, baseUrl, apiKey } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Please paste a prompt to analyze.' });
  }

  const cfg = resolveConfig({ model, baseUrl, apiKey });
  const startedAt = Date.now();

  await acquire();
  try {
    const raw = await chat(cfg, SYSTEM_PROMPT, buildUserPrompt(prompt));
    const result = extractJSON(raw);
    if (!result || !Array.isArray(result.dimensions)) {
      return res.status(502).json({
        error: 'The model did not return valid JSON. Try a more capable model (e.g. gpt-oss:120b).',
        raw,
      });
    }
    res.json({ ok: true, model: cfg.model, elapsedMs: Date.now() - startedAt, result });
  } catch (err) {
    res.status(502).json({ error: err.message });
  } finally {
    release();
  }
});

const PORT = process.env.PORT || 5080;
app.listen(PORT, () => {
  console.log(`\n  Prompt Rater is running →  http://localhost:${PORT}\n`);
});
