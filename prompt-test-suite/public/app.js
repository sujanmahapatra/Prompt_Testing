// ---- Prompt Test Suite front-end (no framework) ----
const $ = (id) => document.getElementById(id);
const CLOUD_MODELS = ['gpt-oss:120b', 'gpt-oss:20b', 'deepseek-v3.1:671b', 'qwen3-coder:480b'];

const els = {
  connStatus: $('connStatus'), settings: $('settings'), settingsToggle: $('settingsToggle'),
  sut: $('sut'), secret: $('secret'), model: $('model'), modelList: $('modelList'),
  baseUrl: $('baseUrl'), apiKey: $('apiKey'), testConn: $('testConn'),
  runAll: $('runAll'), progress: $('progress'), summary: $('summary'),
  sumCoverage: $('sumCoverage'), sumAreasPass: $('sumAreasPass'), sumTests: $('sumTests'), sumSecurity: $('sumSecurity'),
  error: $('error'), cards: $('cards'), cardTpl: $('cardTpl'),
};

let REGISTRY = [];
let running = false;
const cardEls = new Map();          // areaId -> card element
let attackStats = { blocked: 0, total: 0 };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- boot ----------
async function boot() {
  try {
    const reg = await (await fetch('/api/registry')).json();
    REGISTRY = reg.areas;
    if (!els.sut.value) els.sut.value = reg.defaultSut;
    if (!els.secret.value) els.secret.value = reg.defaultSecret;
    renderCards();
  } catch (e) { showError('Could not load registry: ' + e.message); }
  checkConnection();
}

function renderCards() {
  els.cards.innerHTML = '';
  cardEls.clear();
  for (const a of REGISTRY) {
    const node = els.cardTpl.content.firstElementChild.cloneNode(true);
    node.dataset.area = a.id;
    node.querySelector('.area-name').textContent = a.area;
    const prio = node.querySelector('.prio'); prio.textContent = a.priority; prio.classList.add(a.priority);
    node.querySelector('.cat').textContent = a.category;
    node.querySelector('.metric-lbl').textContent = a.metric;
    node.querySelector('.run-one').addEventListener('click', () => run(a.id));
    els.cards.appendChild(node);
    cardEls.set(a.id, node);
  }
}

// ---------- connection ----------
async function checkConnection() {
  const params = new URLSearchParams({ baseUrl: els.baseUrl.value.trim(), apiKey: els.apiKey.value.trim() });
  els.connStatus.textContent = 'connecting…'; els.connStatus.className = 'status';
  try {
    const d = await (await fetch(`/api/health?${params}`)).json();
    if (!els.baseUrl.value && d.baseUrl) els.baseUrl.value = d.baseUrl;
    if (!els.model.value && d.defaultModel) els.model.value = d.defaultModel;
    const list = [...new Set([...(d.models || []), ...(d.cloud ? CLOUD_MODELS : [])])];
    els.modelList.innerHTML = list.map((m) => `<option value="${esc(m)}"></option>`).join('');
    if (d.ok) { els.connStatus.textContent = `✓ ${d.cloud ? 'cloud' : 'local'} · ${els.model.value}`; els.connStatus.className = 'status ok'; }
    else { els.connStatus.textContent = `✗ ${d.error || 'unreachable'}`; els.connStatus.className = 'status bad'; }
  } catch (e) { els.connStatus.textContent = '✗ ' + e.message; els.connStatus.className = 'status bad'; }
}

// ---------- run ----------
async function run(areaId) {
  if (running) return;
  running = true; hideError();
  setButtonsDisabled(true);
  const runningAll = !areaId || areaId === 'all';
  const targets = runningAll ? REGISTRY.map((a) => a.id) : [areaId];

  // reset target cards
  attackStats = { blocked: 0, total: 0 };
  let doneTests = 0, totalTests = 0;
  for (const id of targets) resetCard(id);
  if (runningAll) { els.summary.classList.remove('hidden'); }

  const body = {
    sut: els.sut.value, secret: els.secret.value, area: runningAll ? 'all' : areaId,
    model: els.model.value.trim(), baseUrl: els.baseUrl.value.trim(), apiKey: els.apiKey.value.trim(),
  };

  try {
    await streamRun(body, (evt) => {
      if (evt.type === 'start') {
        totalTests = evt.testsTotal;
        evt.areas.forEach((a) => setPill(a.id, 'running'));
        els.progress.textContent = `Running ${totalTests} tests…`;
      } else if (evt.type === 'result') {
        doneTests++;
        addResult(evt);
        if (evt.attack) { attackStats.total++; if (evt.pass) attackStats.blocked++; }
        els.progress.textContent = `${doneTests}/${totalTests} tests done…`;
        if (runningAll) updateSecurity();
      } else if (evt.type === 'area-metric') {
        setMetric(evt);
      } else if (evt.type === 'done') {
        setSummary(evt.summary);
        els.progress.textContent = `Done — ${evt.summary.testsPassed}/${evt.summary.testsTotal} tests passed across ${evt.summary.areasTotal} areas.`;
      } else if (evt.type === 'error') {
        showError(evt.error);
      }
    });
  } catch (e) {
    showError('Run failed: ' + e.message);
  } finally {
    running = false; setButtonsDisabled(false);
  }
}

async function streamRun(body, onEvent) {
  const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.body) throw new Error('no response stream (HTTP ' + res.status + ')');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) { try { onEvent(JSON.parse(line)); } catch { /* skip */ } }
    }
  }
  if (buf.trim()) { try { onEvent(JSON.parse(buf.trim())); } catch { /* skip */ } }
}

// ---------- card updates ----------
function resetCard(id) {
  const c = cardEls.get(id); if (!c) return;
  c.className = 'card';
  c.querySelector('.tests').innerHTML = '';
  c.querySelector('.metric-val').textContent = '';
  setPill(id, 'idle');
}
function setPill(id, state, text) {
  const c = cardEls.get(id); if (!c) return;
  const pill = c.querySelector('.pill');
  pill.className = 'pill ' + state;
  pill.textContent = text || state;
}
function addResult(evt) {
  const c = cardEls.get(evt.areaId); if (!c) return;
  c.classList.add('running');
  const row = document.createElement('div');
  const cls = evt.evidence && evt.evidence.verdict === 'ERROR' ? 'err' : (evt.pass ? 'pass' : 'fail');
  row.className = 'trow ' + cls;
  const icon = cls === 'pass' ? '✓' : (cls === 'err' ? '!' : '✕');
  const ev = evt.evidence || {};
  row.innerHTML = `
    <div class="trow-head">
      <span class="ti">${icon}</span>
      <span class="trow-name">${esc(evt.name)}</span>
      <span class="trow-reason">${esc(evt.reason || '')}</span>
    </div>
    <div class="evidence">
      <span class="lbl">Input sent</span><pre>${esc(ev.input || '')}</pre>
      <span class="lbl">Model response</span><pre>${esc(ev.response || '')}</pre>
      <span class="lbl">Verdict</span><pre>${esc(ev.verdict || '')} — ${esc(evt.reason || '')}</pre>
    </div>`;
  row.querySelector('.trow-head').addEventListener('click', () => row.classList.toggle('open'));
  c.querySelector('.tests').appendChild(row);
}
function setMetric(evt) {
  const c = cardEls.get(evt.areaId); if (!c) return;
  c.classList.remove('running');
  c.classList.add(evt.status);
  setPill(evt.areaId, evt.status, evt.status);
  c.querySelector('.metric-val').textContent = `${evt.metricLabel}: ${evt.metricValue}`;
  c.querySelector('.metric-val').classList.remove('muted');
}

// ---------- summary ----------
function updateSecurity() {
  els.sumSecurity.textContent = attackStats.total ? `${attackStats.blocked}/${attackStats.total}` : '—';
}
function setSummary(s) {
  els.sumCoverage.textContent = `${s.areasTotal}/12`;
  els.sumAreasPass.textContent = `${s.areasPassed}/${s.areasTotal}`;
  els.sumTests.textContent = `${s.testsPassed}/${s.testsTotal}`;
  updateSecurity();
}

// ---------- misc ----------
function setButtonsDisabled(v) {
  els.runAll.disabled = v;
  document.querySelectorAll('.run-one').forEach((b) => (b.disabled = v));
}
function showError(msg) { els.error.textContent = msg; els.error.classList.remove('hidden'); }
function hideError() { els.error.classList.add('hidden'); }

// ---------- events ----------
els.settingsToggle.addEventListener('click', () => {
  const open = els.settings.classList.toggle('hidden') === false;
  els.settingsToggle.setAttribute('aria-expanded', String(open));
});
els.testConn.addEventListener('click', checkConnection);
els.runAll.addEventListener('click', () => run('all'));

boot();
