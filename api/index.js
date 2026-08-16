import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create Express app
const app = express();
app.use(express.json({ limit: '1mb' }));

// Serve static files from prompt-rater public folder
app.use(express.static(path.join(__dirname, 'prompt-rater/public')));

// Import Ollama client
import { resolveConfig, listModels, chat } from './prompt-rater/lib/ollama.js';
import { SYSTEM_PROMPT, buildUserPrompt, extractJSON, DIMENSIONS } from './prompt-rater/lib/judgePrompt.js';

// Concurrency gate for Prompt Rater
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

// --- Prompt Rater API Routes ---

app.get('/api/dimensions', (_req, res) => res.json(DIMENSIONS));

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

app.post('/api/analyze', async (req, res) => {
  const { prompt, model, baseUrl, apiKey } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Please paste a prompt to analyze.' });
  }
  await acquire();
  try {
    const cfg = resolveConfig({ model, baseUrl, apiKey });
    const userPrompt = buildUserPrompt(prompt);
    const response = await chat(cfg, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);
    const json = extractJSON(response);
    if (!json) {
      return res.status(502).json({ error: 'Model did not return valid JSON. Try a larger model or a different provider.' });
    }
    res.json(json);
  } catch (err) {
    res.status(502).json({ error: err.message });
  } finally {
    release();
  }
});

// Serve index.html for SPA routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'prompt-rater/public/index.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'prompt-rater/public/index.html'));
});

// Export for Vercel serverless
export default app;

