# Work Transcript — AI Prompt Testing Initiative

A plain record of what was built and decided, so anyone can understand the work.

- **Owner:** Sujan Mahapatro (Test Engineer, nextturn)
- **Repo:** `AITesterBlueprint3x` · new module: `chapter_08_Prompt_Testing/`
- **Span:** 2026-07-26 → 2026-08-04
- **Goal:** Automate + test AI prompts across 12 categories (correctness, template, priority, example validation, reasoning, security, jailbreak, leakage, injection, temperature, output formatting, multilingual).

---

## 1. What was requested (in order)

1. Research the 12 test categories; give a beginner-friendly roadmap; keep context in memory; apply feedback without being told twice.
2. Build a browser tool: paste any prompt + pick an Ollama model → it rates the prompt on those parameters and recommends improvements.
3. Make it standalone (works for any repo, not tied to this one).
4. Use an Ollama API key; stay under rate limits; include a sample prompt; containerize and run.
5. Install Docker and run everything.
6. Read `AI_Prompt_Testing_Strategy.xlsx` and assess how much was complete.
7. "Complete the entire sheet" and launch locally to test.
8. Generate this transcript.

---

## 2. What was delivered

### A. Research + roadmap
- Verified the current (2026) tool landscape: **promptfoo** (now OpenAI-owned) for prompt testing + red-team, **DeepEval** for metrics, **garak**/**PyRIT** for security, mapped to the **OWASP LLM Top 10 (2025)**.
- Wrote a beginner roadmap covering all 12 categories → [chapter_08_Prompt_Testing/README.md](README.md).

### B. Tool 1 — Prompt Rater (static)  ·  `prompt-rater/`  ·  http://localhost:5080
- Paste a prompt → an LLM scores it **0–10 on each of the 12 dimensions**, lists issues/fixes, and returns a **rewritten, stronger prompt**.
- Node/Express + no-build browser UI. The judge prompt is **injection-hardened** (treats the pasted text as untrusted data).
- Verified live: a weak prompt scored **21/100** and was rewritten with a safety clause, JSON schema, and injection boundaries.

### C. Tool 2 — Prompt Test Suite (dynamic)  ·  `prompt-test-suite/`  ·  http://localhost:5090
- Executes **real tests for all 12 strategy areas + the 6 attacks** against a **system-under-test** (a sample bank assistant with a planted secret, or your own prompt).
- Computes each area's Excel metric (Compliance %, Attack Success Rate, Leakage Rate, Consistency Score, etc.), captures **evidence** (input + response + verdict) per test, and streams results to a live dashboard.
- Verified live: injection/formatting/reasoning/multilingual = **9/9 tests passed** (injection Attack Success Rate 0%, replied correctly in Hindi, valid JSON). HTTP streaming confirmed.

### D. Memory (so context persists between sessions)
Saved under the project's memory store: who you are, the project + its status, a working-agreement/feedback note, and the tool landscape. Updated after each milestone.

---

## 3. Key decisions & findings

| Topic | What happened |
|---|---|
| **Model backend** | Local Ollama (v0.31.2) was installed but **CPU-only and too slow** — a local rating timed out. Switched to **Ollama Cloud** for speed. |
| **The API key** | You supplied a key labelled "Ollama". Its format looked like Zhipu/GLM, so I tested it — Z.ai/BigModel rejected it (401) but **ollama.com accepted it**. Confirmed: it's an **Ollama Cloud** key. |
| **Model chosen** | **`gpt-oss:120b`** on Ollama Cloud — strong reasoning + reliable JSON, ~25–30s per call. |
| **Rate limits** | Added a **concurrency gate** (max 2 at once) + **automatic 429/503 backoff** so we stay under limits. |
| **Docker** | Was not installed. Installed **Docker Desktop 4.83.0** via winget (exit code 0). It needs **one reboot + first launch** before the `docker` command works. Both tools ship `Dockerfile` + `docker-compose.yml`. |
| **Static vs dynamic** | The Rater *reads* a prompt and scores its design. The Suite *runs* attacks/tests against a live target. They're complementary — both are in scope. |
| **The Excel** | It's a **strategy/plan** (3 sheets, fully authored) with **no status column**. Before Tool 2, the dynamic testing it describes was ~10–15% built; Tool 2 now executes all 12 areas. |

---

## 4. Current state (as of this transcript)

- ✅ **Prompt Rater** running → http://localhost:5080
- ✅ **Prompt Test Suite** running → http://localhost:5090
- ✅ **Docker Desktop installed** — pending one reboot to activate the `docker` CLI
- 🔐 Your Ollama Cloud key is stored **only** in each tool's gitignored `.env` — **rotate it at ollama.com** when convenient, since it was shared in chat.

---

## 5. How to run everything

```bash
# Tool 1 — Prompt Rater (static scoring)
cd chapter_08_Prompt_Testing/prompt-rater
npm install && npm start           # → http://localhost:5080

# Tool 2 — Prompt Test Suite (dynamic, "the whole sheet")
cd chapter_08_Prompt_Testing/prompt-test-suite
npm install && npm start           # → http://localhost:5090
# In the browser: click "Run all 12 areas"; open ⚙ Config to test your own prompt.

# Either tool via Docker (after the reboot):
docker compose up --build
```

---

## 6. Files created

- **Roadmap:** `chapter_08_Prompt_Testing/README.md`
- **Prompt Rater:** `prompt-rater/` → `server.js`, `lib/ollama.js`, `lib/judgePrompt.js`, `public/{index.html,styles.css,app.js}`, `Dockerfile`, `docker-compose.yml`, `README.md`, `.env` (gitignored)
- **Prompt Test Suite:** `prompt-test-suite/` → `server.js`, `lib/{ollama,checks,tests,runner,sut}.js`, `public/{index.html,styles.css,app.js}`, `Dockerfile`, `docker-compose.yml`, `README.md`, `.env` (gitignored)
- **Memory:** `MEMORY.md` + `user-sujan.md`, `project-prompt-testing.md`, `feedback-working-agreement.md`, `reference-prompt-testing-tools.md` (in the project memory store)

---

## 7. Open items / suggested next steps

- **Reboot** to finish Docker, then `docker compose up --build` in either tool.
- **Tune** the Suite's correctness/template/multilingual test inputs in `prompt-test-suite/lib/tests.js` if you test a non-banking prompt (security/formatting/reasoning areas already work on any prompt).
- Optional: add a **Download report / transcript button** inside the Suite UI; add a **Status column** back into the Excel from a run; build the **promptfoo** CI suite from the roadmap for pipeline gating.

---

*Chapter 08 · AI Tester Blueprint 3.x — work transcript.*
