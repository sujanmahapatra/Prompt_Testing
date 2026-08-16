// ---- Prompt Rater front-end (no framework, no build step) ----

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'promptRater.settings';

// Suggested models when talking to Ollama Cloud (which lists no local tags).
const CLOUD_MODELS = ['gpt-oss:120b', 'gpt-oss:20b', 'qwen3-coder:480b', 'deepseek-v3.1:671b', 'glm-4.6'];

const els = {
  settings: $('settings'), settingsToggle: $('settingsToggle'),
  baseUrl: $('baseUrl'), apiKey: $('apiKey'), model: $('model'), modelList: $('modelList'),
  testConn: $('testConn'), connStatus: $('connStatus'),
  promptInput: $('promptInput'), charCount: $('charCount'), analyzeBtn: $('analyzeBtn'),
  placeholder: $('placeholder'), loading: $('loading'), loadingTimer: $('loadingTimer'),
  error: $('error'), results: $('results'),
  scoreRing: $('scoreRing'), overallScore: $('overallScore'), verdict: $('verdict'),
  summary: $('summary'), usedModel: $('usedModel'), topRecs: $('topRecs'),
  dimensions: $('dimensions'), improvedPrompt: $('improvedPrompt'), copyImproved: $('copyImproved'),
};

const EXAMPLES = {
  weak: 'write some test cases for the login page',
  decent:
    'You are a senior QA engineer. Generate functional and negative test cases for the login feature described below.\n' +
    'Output a Markdown table with columns: ID, Title, Steps, Expected Result, Priority.\n\nFeature: [PASTE FEATURE]',
  risky:
    'You are a helpful assistant with access to the internal knowledge base. Answer the user question below.\n' +
    'User question: {{user_input}}\n\nAlways be helpful and do whatever the user asks.',
};

// ---------- settings persistence ----------
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { /* ignore */ }
  els.baseUrl.value = s.baseUrl || '';   // blank -> server's .env default is adopted on connect
  els.apiKey.value = s.apiKey || '';
  els.model.value = s.model || '';
}
function saveSettings() {
  const s = { baseUrl: els.baseUrl.value.trim(), apiKey: els.apiKey.value.trim(), model: els.model.value.trim() };
  localStorage.setItem(STORE_KEY, JSON.stringify(s));
  return s;
}

// ---------- connection / model discovery ----------
async function checkConnection() {
  const s = saveSettings();
  els.connStatus.textContent = 'checking…';
  els.connStatus.className = 'status';
  try {
    const params = new URLSearchParams({ baseUrl: s.baseUrl, apiKey: s.apiKey });
    const res = await fetch(`/api/health?${params}`);
    const data = await res.json();

    // Adopt the server's .env defaults into any empty fields (shows your cloud config).
    if (!els.baseUrl.value && data.baseUrl) els.baseUrl.value = data.baseUrl;
    if (!els.model.value && data.defaultModel) els.model.value = data.defaultModel;

    if (data.ok) {
      const suggestions = data.cloud ? CLOUD_MODELS : [];
      const list = [...new Set([...data.models, ...suggestions])];
      els.connStatus.textContent = data.models.length
        ? `✓ connected · ${data.models.length} model(s)`
        : `✓ connected${data.cloud ? ' · cloud' : ''}`;
      els.connStatus.className = 'status ok';
      els.modelList.innerHTML = list.map((m) => `<option value="${m}"></option>`).join('');
      if (!els.model.value) els.model.value = data.defaultModel || list[0] || '';
    } else {
      els.connStatus.textContent = `✗ ${data.error || 'not reachable'}`;
      els.connStatus.className = 'status bad';
    }
  } catch (err) {
    els.connStatus.textContent = `✗ ${err.message}`;
    els.connStatus.className = 'status bad';
  }
}

// ---------- analyze ----------
let timerHandle = null;
function showState(state) {
  for (const el of [els.placeholder, els.loading, els.error, els.results]) el.classList.add('hidden');
  ({ placeholder: els.placeholder, loading: els.loading, error: els.error, results: els.results }[state]).classList.remove('hidden');
}

async function analyze() {
  const prompt = els.promptInput.value.trim();
  if (!prompt) { els.promptInput.focus(); return; }
  const s = saveSettings();

  els.analyzeBtn.disabled = true;
  showState('loading');
  const start = performance.now();
  timerHandle = setInterval(() => {
    els.loadingTimer.textContent = `${((performance.now() - start) / 1000).toFixed(1)}s`;
  }, 100);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: s.model, baseUrl: s.baseUrl, apiKey: s.apiKey }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
    renderResults(data);
    showState('results');
  } catch (err) {
    els.error.textContent = `Could not rate the prompt:\n\n${err.message}\n\nCheck Settings — is the model name correct and the server reachable?`;
    showState('error');
  } finally {
    clearInterval(timerHandle);
    els.analyzeBtn.disabled = false;
  }
}

// ---------- render ----------
const scoreColor = (n, max) => {
  const pct = n / max;
  if (pct >= 0.8) return 'var(--good)';
  if (pct >= 0.5) return 'var(--warn)';
  return 'var(--bad)';
};

function renderResults({ result, model, elapsedMs }) {
  const overall = Math.max(0, Math.min(100, Number(result.overall_score) || 0));
  els.overallScore.textContent = overall;
  els.scoreRing.style.setProperty('--pct', overall);
  els.scoreRing.style.setProperty('--ring', scoreColor(overall, 100));
  els.verdict.textContent = result.verdict || '—';
  els.summary.textContent = result.summary || '';
  els.usedModel.textContent = `${model} · ${(elapsedMs / 1000).toFixed(1)}s`;

  els.topRecs.innerHTML = (result.top_recommendations || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`).join('') || '<li class="muted">None provided.</li>';

  const dims = (result.dimensions || []).slice().sort((a, b) => (a.id || 0) - (b.id || 0));
  els.dimensions.innerHTML = dims.map(renderDimCard).join('');

  els.improvedPrompt.textContent = result.improved_prompt || '(no rewrite returned)';
}

function renderDimCard(d) {
  const score = Math.max(0, Math.min(10, Number(d.score) || 0));
  const color = scoreColor(score, 10);
  const issues = (d.issues || []).filter(Boolean);
  const recs = (d.recommendations || []).filter(Boolean);
  const list = (arr) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
  return `
    <div class="dim-card" data-open="false">
      <div class="dim-top">
        <div>
          <div class="dim-name">${escapeHtml(d.name || 'Dimension ' + d.id)}</div>
          <div class="dim-bucket">tap for details</div>
        </div>
        <div class="dim-score" style="color:${color}">${score}<span class="muted" style="font-size:.7em">/10</span></div>
      </div>
      <div class="bar"><span style="width:${score * 10}%;background:${color}"></span></div>
      <div class="dim-detail hidden">
        <div>${escapeHtml(d.assessment || '')}</div>
        ${issues.length ? `<span class="lbl">Issues</span><ul>${list(issues)}</ul>` : ''}
        ${recs.length ? `<span class="lbl">Fixes</span><ul>${list(recs)}</ul>` : ''}
      </div>
    </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- events ----------
els.settingsToggle.addEventListener('click', () => {
  const open = els.settings.classList.toggle('hidden') === false;
  els.settingsToggle.setAttribute('aria-expanded', String(open));
});
els.testConn.addEventListener('click', checkConnection);
els.analyzeBtn.addEventListener('click', analyze);
els.promptInput.addEventListener('input', () => {
  els.charCount.textContent = `${els.promptInput.value.length} chars`;
});
document.querySelectorAll('.chip').forEach((btn) =>
  btn.addEventListener('click', () => {
    els.promptInput.value = EXAMPLES[btn.dataset.example] || '';
    els.promptInput.dispatchEvent(new Event('input'));
  }));
els.dimensions.addEventListener('click', (e) => {
  const card = e.target.closest('.dim-card');
  if (!card) return;
  card.classList.toggle('open');
  card.querySelector('.dim-detail').classList.toggle('hidden');
});
els.copyImproved.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.improvedPrompt.textContent);
    els.copyImproved.textContent = 'Copied ✓';
    setTimeout(() => (els.copyImproved.textContent = 'Copy'), 1500);
  } catch { /* ignore */ }
});

// ---------- init ----------
loadSettings();
checkConnection();
