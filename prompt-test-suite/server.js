import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, listModels } from './lib/ollama.js';
import { AREAS } from './lib/tests.js';
import { runSuite } from './lib/runner.js';
import { DEFAULT_SUT, DEFAULT_SECRET } from './lib/sut.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Static metadata so the UI can render the 12 area cards + default SUT.
app.get('/api/registry', (_req, res) => {
  res.json({
    areas: AREAS.map((a) => ({ id: a.id, area: a.area, category: a.category, priority: a.priority, metric: a.metric, attack: !!a.attack, total: a.tests.length })),
    defaultSut: DEFAULT_SUT,
    defaultSecret: DEFAULT_SECRET,
  });
});

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

// Run the suite (or one area). Streams newline-delimited JSON events as tests finish.
app.post('/api/run', async (req, res) => {
  const { sut, secret, area, model, baseUrl, apiKey } = req.body || {};
  const cfg = resolveConfig({ model, baseUrl, apiKey });

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const emit = (evt) => { try { res.write(JSON.stringify(evt) + '\n'); } catch { /* client gone */ } };

  try {
    await runSuite({
      cfg,
      sut: (sut && sut.trim()) || DEFAULT_SUT,
      secret: (secret && secret.trim()) || DEFAULT_SECRET,
      areaIds: area && area !== 'all' ? [area] : null,
      concurrency: Number(process.env.MAX_CONCURRENT || 2),
      emit,
    });
  } catch (err) {
    emit({ type: 'error', error: err.message });
  }
  res.end();
});

const PORT = process.env.PORT || 5090;
app.listen(PORT, () => console.log(`\n  Prompt Test Suite running →  http://localhost:${PORT}\n`));
