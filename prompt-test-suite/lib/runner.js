// Executes the test registry against a system-under-test and streams events.
import { chat } from './ollama.js';
import * as C from './checks.js';
import { AREAS } from './tests.js';
import { firstLine } from './sut.js';

async function ask(cfg, system, input, temperature = 0) {
  return chat(cfg, [{ role: 'system', content: system }, { role: 'user', content: input }], { temperature });
}

async function runOne(cfg, area, test, { sut, secret, fingerprint }) {
  const system = test.system || sut;
  const check = test.check;

  // Special case: determinism check makes several calls.
  if (check.type === 'consistency') {
    const runs = check.runs || 3;
    const outs = [];
    for (let i = 0; i < runs; i++) outs.push((await ask(cfg, system, test.input, 0)).trim());
    const varied = (await ask(cfg, system, test.input, 1)).trim();
    const allSame = outs.every((o) => o === outs[0]);
    return {
      pass: allSame,
      reason: allSame ? `All ${runs} runs at temp=0 were identical (deterministic)` : `Runs at temp=0 differed`,
      evidence: {
        system, input: test.input,
        response: outs.map((o, i) => `[temp=0 run ${i + 1}] ${o}`).join('\n') + `\n[temp=1 run] ${varied}`,
        verdict: allSame ? 'PASS' : 'FAIL',
      },
    };
  }

  const response = await ask(cfg, system, test.input, test.temperature ?? 0);
  let res;
  switch (check.type) {
    case 'judge': res = await C.checkJudge(cfg, { input: test.input, response, rubric: check.rubric }); break;
    case 'secure': res = C.checkSecure(response, [secret, 'SECRET_POLICY_ID', fingerprint, ...(check.extra || [])]); break;
    case 'contains': res = C.checkContains(response, check.needles, check.mode || 'all', check.forbid || []); break;
    case 'regex': res = C.checkRegex(response, check.pattern, check.flags || 'i'); break;
    case 'json': res = C.checkJson(response, check.fields || [], !!check.array); break;
    case 'devanagari': res = C.checkDevanagari(response); break;
    default: res = { pass: false, reason: `Unknown check type: ${check.type}` };
  }
  return { pass: res.pass, reason: res.reason, evidence: { system, input: test.input, response, verdict: res.pass ? 'PASS' : 'FAIL' } };
}

function metricFor(area, st) {
  if (area.id === 'versioning') {
    return { metricLabel: area.metric, metricValue: String(st.fails), passed: st.passed, total: st.total, status: st.fails === 0 ? 'pass' : 'fail' };
  }
  if (area.attack) {
    const rate = Math.round((st.fails / st.total) * 100);
    return { metricLabel: area.metric, metricValue: `${rate}%  (${st.fails}/${st.total} attacks succeeded)`, passed: st.passed, total: st.total,
      status: st.fails === 0 ? 'pass' : (st.fails < st.total ? 'partial' : 'fail') };
  }
  const pct = Math.round((st.passed / st.total) * 100);
  return { metricLabel: area.metric, metricValue: `${pct}%  (${st.passed}/${st.total})`, passed: st.passed, total: st.total,
    status: st.passed === st.total ? 'pass' : (st.passed > 0 ? 'partial' : 'fail') };
}

export async function runSuite({ cfg, sut, secret, areaIds, concurrency = 2, emit }) {
  const fingerprint = firstLine(sut).slice(0, 40);
  const areas = AREAS.filter((a) => !areaIds || areaIds.includes(a.id));
  const tasks = [];
  for (const a of areas) for (const t of a.tests) tasks.push({ area: a, test: t });
  const state = new Map(areas.map((a) => [a.id, { done: 0, total: a.tests.length, passed: 0, fails: 0 }]));

  emit({ type: 'start', testsTotal: tasks.length,
    areas: areas.map((a) => ({ id: a.id, area: a.area, category: a.category, priority: a.priority, metric: a.metric, attack: !!a.attack, total: a.tests.length })) });

  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const { area, test } = tasks[idx++];
      let r;
      try { r = await runOne(cfg, area, test, { sut, secret, fingerprint }); }
      catch (e) { r = { pass: false, reason: 'error: ' + e.message, evidence: { input: test.input, response: '(request failed)', verdict: 'ERROR' } }; }
      const st = state.get(area.id);
      st.done++; r.pass ? st.passed++ : st.fails++;
      emit({ type: 'result', areaId: area.id, area: area.area, category: area.category, priority: area.priority,
        attack: !!area.attack, name: test.name, pass: r.pass, reason: r.reason, evidence: r.evidence });
      if (st.done === st.total) emit({ type: 'area-metric', areaId: area.id, ...metricFor(area, st) });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) || 1 }, worker));

  let areasPassed = 0, testsPassed = 0;
  for (const a of areas) {
    const st = state.get(a.id);
    if (metricFor(a, st).status === 'pass') areasPassed++;
    testsPassed += st.passed;
  }
  emit({ type: 'done', summary: { areasTotal: areas.length, areasPassed, testsTotal: tasks.length, testsPassed } });
}
