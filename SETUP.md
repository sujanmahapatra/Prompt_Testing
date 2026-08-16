# Chapter 08 — Setup & Installation Guide

This guide covers how to install, configure, and run both tools: **Prompt Rater** (static design scoring) and **Prompt Test Suite** (dynamic execution testing).

---

## Prerequisites

Before running either tool, ensure you have the following installed:

### Required
- **Node.js** (v18 or later) — [Download](https://nodejs.org/)
  - Verify: `node --version` and `npm --version` in terminal
- **Ollama Cloud Account** (free) — [Sign up at ollama.com](https://ollama.com)
  - An Ollama API key (will be placed in `.env`)

### Optional (recommended for easier setup)
- **Docker Desktop** — [Download](https://www.docker.com/products/docker-desktop)
  - Both tools can run in Docker containers (one-command setup)
- **Git** — for cloning and pushing to GitHub

---

## Global Setup: Ollama Cloud Configuration

Both **Prompt Rater** and **Prompt Test Suite** share the same Ollama Cloud credentials.

### Step 1: Get Your Ollama API Key

1. Visit [ollama.com](https://ollama.com) and sign in (or create an account).
2. Go to **API Keys** or **Settings**.
3. Generate or copy your existing API key.
4. Keep it safe (treat like a password).

### Step 2: Verify Your Key Works (Optional)

Open a terminal and test:
```bash
curl -X POST https://ollama.com/api/chat \
  -H "Authorization: Bearer YOUR_OLLAMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-oss:120b", "messages": [{"role": "user", "content": "Hello"}]}'
```

If you see a response (not an error), your key is valid.

---

## Tool 1: Prompt Rater (Static Design Scoring)

### Location
```
chapter_08_Prompt_Testing/
└── prompt-rater/
    ├── .env                  (← Ollama credentials go here)
    ├── .env.example          (← template, never commit .env)
    ├── package.json
    ├── server.js
    ├── Dockerfile
    ├── docker-compose.yml
    └── lib/
        ├── judgePrompt.js    (← the 12-dimension scoring logic)
        └── ollama.js         (← Ollama API client)
```

### Setup: Option A — Docker (Recommended for Windows/Mac)

1. **Install Docker Desktop** and start it.
2. **Navigate to the folder:**
   ```bash
   cd chapter_08_Prompt_Testing/prompt-rater
   ```
3. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```
4. **Edit `.env` and add your Ollama API key:**
   ```
   OLLAMA_BASE_URL=https://ollama.com
   OLLAMA_API_KEY=your_actual_api_key_here
   OLLAMA_MODEL=gpt-oss:120b
   ```
5. **Start with Docker Compose:**
   ```bash
   docker compose up --build
   ```
   This downloads the Node image, installs dependencies, and starts the server.
6. **Open browser:** http://localhost:5080
7. **Stop:** Press `Ctrl+C` in terminal (or `docker compose down`)

### Setup: Option B — Node (Works Right Now)

1. **Navigate to the folder:**
   ```bash
   cd chapter_08_Prompt_Testing/prompt-rater
   ```
2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```
3. **Edit `.env` and add your Ollama API key:**
   ```
   OLLAMA_BASE_URL=https://ollama.com
   OLLAMA_API_KEY=your_actual_api_key_here
   OLLAMA_MODEL=gpt-oss:120b
   ```
4. **Install dependencies:**
   ```bash
   npm install
   ```
5. **Start the server:**
   ```bash
   npm start
   ```
   You should see: `Server running on http://localhost:5080`
6. **Open browser:** http://localhost:5080
7. **Stop:** Press `Ctrl+C` in terminal

### Configuration: Changing the AI Model

Edit the `OLLAMA_MODEL` line in `.env` to pick a different model:

| Model | Performance | Use Case |
|-------|-------------|----------|
| `gpt-oss:120b` | **Excellent** (recommended) | Default; strong reasoning & JSON output |
| `gpt-oss:20b` | Good | Lighter, still reliable |
| `deepseek-v3.1:671b` | Very capable | Larger, slower |
| `qwen2.5:7b` | Medium (CPU-slow) | Local, free, privacy-first |
| `llama3.1:8b` | Medium (CPU-slow) | Local, free, privacy-first |

**For local Ollama (no cloud):**
- Install [Ollama](https://ollama.ai) on your machine.
- Pull a model: `ollama pull qwen2.5:7b`
- Set in `.env`:
  ```
  OLLAMA_BASE_URL=http://localhost:11434
  OLLAMA_API_KEY=
  OLLAMA_MODEL=qwen2.5:7b
  ```
- If running in Docker, use: `http://host.docker.internal:11434`

---

## Tool 2: Prompt Test Suite (Dynamic Execution Testing)

### Location
```
chapter_08_Prompt_Testing/
└── prompt-test-suite/
    ├── .env                  (← Ollama credentials go here)
    ├── .env.example
    ├── package.json
    ├── server.js
    ├── Dockerfile
    ├── docker-compose.yml
    └── lib/
        ├── tests.js          (← the 12 testing areas + test cases)
        ├── runner.js         (← executes tests, computes metrics)
        ├── checks.js         (← assertions & security checks)
        ├── ollama.js         (← Ollama API client)
        └── sut.js            (← sample system-under-test prompt)
```

### Setup: Option A — Docker (Recommended)

1. **Navigate to the folder:**
   ```bash
   cd chapter_08_Prompt_Testing/prompt-test-suite
   ```
2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```
3. **Edit `.env` and add your Ollama API key:**
   ```
   OLLAMA_BASE_URL=https://ollama.com
   OLLAMA_API_KEY=your_actual_api_key_here
   OLLAMA_MODEL=gpt-oss:120b
   ```
4. **Start with Docker Compose:**
   ```bash
   docker compose up --build
   ```
5. **Open browser:** http://localhost:5090
6. **Stop:** Press `Ctrl+C` in terminal

### Setup: Option B — Node (Works Right Now)

1. **Navigate to the folder:**
   ```bash
   cd chapter_08_Prompt_Testing/prompt-test-suite
   ```
2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```
3. **Edit `.env` and add your Ollama API key:**
   ```
   OLLAMA_BASE_URL=https://ollama.com
   OLLAMA_API_KEY=your_actual_api_key_here
   OLLAMA_MODEL=gpt-oss:120b
   ```
4. **Install dependencies:**
   ```bash
   npm install
   ```
5. **Start the server:**
   ```bash
   npm start
   ```
   You should see: `Server running on http://localhost:5090`
6. **Open browser:** http://localhost:5090
7. **Stop:** Press `Ctrl+C` in terminal

---

## Running Both Tools Together

You can run Prompt Rater and Prompt Test Suite side-by-side (they use different ports):

### Terminal 1 — Prompt Rater
```bash
cd chapter_08_Prompt_Testing/prompt-rater
npm install
npm start
# → http://localhost:5080
```

### Terminal 2 — Prompt Test Suite
```bash
cd chapter_08_Prompt_Testing/prompt-test-suite
npm install
npm start
# → http://localhost:5090
```

Or with Docker, in two separate terminal windows:
```bash
# Terminal 1
cd chapter_08_Prompt_Testing/prompt-rater && docker compose up

# Terminal 2
cd chapter_08_Prompt_Testing/prompt-test-suite && docker compose up
```

---

## Troubleshooting

### "Cannot connect to Ollama"
- **Check OLLAMA_BASE_URL** in `.env` — must be `https://ollama.com` for cloud
- **Check OLLAMA_API_KEY** — verify key is valid at ollama.com
- **Test the API manually:**
  ```bash
  curl https://ollama.com/api/health \
    -H "Authorization: Bearer YOUR_API_KEY"
  ```

### "Model did not return valid JSON"
- Try a larger model like `gpt-oss:120b` (more reliable output)
- Or upgrade to `deepseek-v3.1:671b`

### Port Already in Use (5080 or 5090)
- **Kill the process** on that port:
  - **macOS/Linux:** `lsof -i :5080` then `kill -9 <PID>`
  - **Windows:** `netstat -ano | findstr :5080` then `taskkill /PID <PID> /F`
- Or **start on a different port** (edit `server.js` and `PORT` in `.env`)

### Docker: "image not found" or "pull timeout"
- Check internet connection
- Run `docker pull node:18-slim` to pre-download base image
- Retry `docker compose up --build`

### Rate Limit Errors (HTTP 429)
- Both tools auto-backoff and retry
- If persistent, Ollama Cloud may be throttling; wait 1–2 minutes and retry

### .env File Not Being Loaded
- Ensure `.env` is in the **root of the tool folder** (not in `lib/` or `public/`)
- Ensure `npm install` was run (installs `dotenv`)
- Restart the server after editing `.env`

---

## Security Notes

⚠️ **Never commit `.env`** — it contains your Ollama API key.

- `.gitignore` includes `.env` — but verify it's listed if you cloned this repo
- Rotate your Ollama API key at https://ollama.com/settings after experimenting
- Treat your API key like a password (don't share in screenshots, logs, or chat)

---

## Next Steps

- **Prompt Rater:** See [SCREENSHOTS.md](./SCREENSHOTS.md) for how to use it
- **Prompt Test Suite:** See [SCREENSHOTS.md](./SCREENSHOTS.md) for how to run tests
- **Main Guide:** Return to [README.md](./README.md) for the big picture and testing strategy

---

*Chapter 08 · AI Tester Blueprint 3.x*
