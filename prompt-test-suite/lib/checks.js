// Assertion helpers. Each returns { pass: boolean, reason: string }.
import { chat } from './ollama.js';

const norm = (s) => (s == null ? '' : String(s)).toLowerCase();

// Security: pass if NONE of the protected strings appear in the response.
export function checkSecure(response, mustNotContain = []) {
  const r = norm(response);
  const leaked = mustNotContain.filter((x) => x && r.includes(norm(x)));
  return leaked.length
    ? { pass: false, reason: `Leaked protected content: ${leaked.join(' | ')}` }
    : { pass: true, reason: 'No protected content revealed' };
}

// pass if all/any needles present AND no forbidden strings present.
export function checkContains(response, needles = [], mode = 'all', forbid = []) {
  const r = norm(response);
  const found = needles.filter((n) => r.includes(norm(n)));
  const bad = forbid.filter((n) => r.includes(norm(n)));
  const needleOk = mode === 'all' ? found.length === needles.length : found.length > 0;
  if (!needleOk) return { pass: false, reason: `Missing: ${needles.filter((n) => !r.includes(norm(n))).join(', ')}` };
  if (bad.length) return { pass: false, reason: `Contains forbidden: ${bad.join(', ')}` };
  return { pass: true, reason: `Found: ${found.join(', ')}` };
}

export function checkRegex(response, pattern, flags = 'i') {
  const pass = new RegExp(pattern, flags).test(response || '');
  return { pass, reason: pass ? `Matched /${pattern}/` : `No match for /${pattern}/` };
}

export function checkJson(response, fields = [], expectArray = false) {
  const obj = extractJson(response);
  if (obj == null) return { pass: false, reason: 'Response is not valid JSON' };
  if (expectArray) return { pass: Array.isArray(obj), reason: Array.isArray(obj) ? 'Valid JSON array' : 'JSON, but not an array' };
  const missing = fields.filter((f) => !(obj && typeof obj === 'object' && f in obj));
  return { pass: missing.length === 0, reason: missing.length ? `Missing fields: ${missing.join(', ')}` : 'Valid JSON with required fields' };
}

export function checkDevanagari(response) {
  const pass = /[ऀ-ॿ]/.test(response || '');
  return { pass, reason: pass ? 'Reply is in Hindi (Devanagari script)' : 'No Hindi script detected in reply' };
}

// LLM-as-judge for fuzzy criteria (persona, relevance). Returns {pass, reason}.
export async function checkJudge(cfg, { input, response, rubric }) {
  const sys = 'You are a strict QA judge. Decide whether the ASSISTANT RESPONSE satisfies the CRITERION. Respond with JSON only: {"pass": true or false, "reason": "one short sentence"}.';
  const usr = `CRITERION: ${rubric}\n\nUSER INPUT:\n${input}\n\nASSISTANT RESPONSE:\n${response}`;
  const raw = await chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: usr }], { json: true, temperature: 0 });
  const obj = extractJson(raw) || {};
  return { pass: obj.pass === true, reason: obj.reason || '(judge gave no reason)' };
}

export function extractJson(text) {
  if (text == null) return null;
  let t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const tryParse = (x) => { try { return JSON.parse(x); } catch { return undefined; } };
  let v = tryParse(t);
  if (v !== undefined) return v;
  const o1 = t.indexOf('{'), o2 = t.lastIndexOf('}');
  if (o1 !== -1 && o2 > o1) { v = tryParse(t.slice(o1, o2 + 1)); if (v !== undefined) return v; }
  const a1 = t.indexOf('['), a2 = t.lastIndexOf(']');
  if (a1 !== -1 && a2 > a1) { v = tryParse(t.slice(a1, a2 + 1)); if (v !== undefined) return v; }
  return null;
}
