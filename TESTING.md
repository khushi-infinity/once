# Testing ONCE

Everything below was run on 2026-10-22. The public Render deployment was
verified on 2026-10-23. Commands are copy-pasteable.

## 1. Backend static + unit/integration tests

```bash
cd backend
uv run ruff check .
APP_MODE=mock uv run pytest -q
```

Expected: `All checks passed!` and `24 passed, 2 skipped` (the live-store and
live-window-guide tests skip without live services). The suite covers health, skill lifecycle,
ownership/sharing (including learner-side listing and revocation), six-item
save/reload, teach extraction, grounded recall (alias match, no-invent 404,
sharing), session progression, wrong-event rejection, wrong-DOM-element
rejection, versioned updates, the Gemini adapter's primary/model-fallback/403
behavior, and the explicit OpenRouter failover path.

`backend/.env` may set `APP_MODE=live`; the explicit `APP_MODE=mock` above keeps
the offline suite deterministic. Live mode:

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest -q   # 25 passed, 1 skipped
```

## 2. Live AWS proofs

```bash
cd backend
APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

Expected: **4/4 PASS**, identity, DynamoDB skill write/read, DynamoDB session
write/read, private S3 roundtrip (with a public-read denial check). Each check
deletes what it creates.

Full live suite:

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest -q   # 25 passed, 1 skipped
```

## 3. MCP server (independent client + real browser client)

The FastAPI process already mounts the MCP app at `/mcp`, so the HTTP API on
`:8000` is enough for the browser client. For the independent check:

```bash
cd backend && uv run python scripts/mcp_smoke.py
```

That script starts its own temporary Streamable HTTP server on `:8765` and
drives it with the official Python MCP client.

Expected (abridged):

```
[setup] shared <skill> with mcp-learner-…
protocol=2025-11-25 server=ONCE
tools=[… 9 tools …]
[PASS] once_list_skills …
[PASS] once_get_skill authorized read
[PASS] once_get_skill denied a stranger (same authz as HTTP)
[PASS] once_get_agent_skill returned a portable SKILL.md
[PASS] once_recall_missing grounded on the stored skill
[PASS] once_start_session …
[PASS] once_verify_step accepted the recorded element
[PASS] once_verify_step rejected a wrong element without advancing
[PASS] once_extract_draft returned a draft + engine metadata
```

Browser client (the exact path used by `/alexa`):

```bash
# One backend process is enough; MCP is mounted at http://localhost:8000/mcp.
cd backend && APP_MODE=mock uv run uvicorn app.main:app --port 8000
cd frontend && npm run dev
```

Open `http://localhost:3000/alexa` and check:

- status says **MCP connected**, protocol **2025-11-25**, **9 tools**;
- ask *"What am I missing for the conference?"* → opens the stored **My Event
  Bag** and says required items are **not confirmed** (never "definitely
  missing");
- open **Show MCP traffic** → a real `tools/call once_recall_missing` entry with
  arguments and result;
- ask *"Remember I pack a laptop and charger"* → a real `once_extract_draft`
  call; **Review and save the draft** opens the Teach screen with the exact
  draft loaded, and **Save as Skill** persists it.

Mock mode seeds the same three demo skills in the same process, so this works
without AWS. If the page says **MCP unavailable**, the API process is not
running or `MCP_URL` does not match it (default `http://localhost:8000`). It
does not fall back to a fake response.

## 4. Agent Skill export

The web UI exposes this on every skill detail page. The HTTP form:

```bash
# Use any readable skill id. This prints SKILL.md to stdout.
curl -sS "http://localhost:8000/api/skills/<skill_id>/agent-skill?reader_id=demo-teacher"

# The zip variant contains <slug>/SKILL.md and <slug>/once-skill.json.
curl -sS -o /tmp/once-skill.zip \
  "http://localhost:8000/api/skills/<skill_id>/agent-skill?reader_id=demo-teacher&format=zip"
unzip -l /tmp/once-skill.zip
```

Expected: YAML frontmatter with `name:` and `description:`, the stored items or
steps, and a source section. A stranger gets `404`, never a copy of the skill.
The MCP tool `once_get_agent_skill` returns the same document plus a manifest.

## 5. Window guide

The Mac helper uses this endpoint. It requires live mode and a vision model.

```bash
# Use any PNG screenshot of a window. This is an example with a synthetic UI.
curl -sS -X POST http://localhost:8000/api/window/guide \
  -F 'file=@/path/to/window.png;type=image/png' \
  -F 'question=Where is the Export button?' \
  -F 'app_name=Preview' \
  -F 'window_title=Export Settings'
```

Expected: `answer`, optional `steps`, a `confidence` value, and real `engine`
metadata naming the vision model. In mock mode the endpoint returns an honest
`503`; it does not invent an answer.

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest -q
```

This includes the agent-export tests and skips the mock-only window-guide test.

## 6. Native macOS helper

```bash
./scripts/build-macos.sh
open macos/ONCEWindow.app
```

Expected: a successful `swift build`, an app bundle at
`macos/ONCEWindow.app`, and an eye icon in the menu bar. On first capture,
grant **Screen Recording** in System Settings, Privacy & Security. The helper
shows the real engine metadata and can save the answer as a `desktop_workflow`
skill. It writes the agent export to
`~/Library/Application Support/ONCE/agent-skills/<slug>/SKILL.md`.

## 7. Frontend

```bash
cd frontend
npm run lint
npm run build
```

Expected: no ESLint output and a successful production build with routes `/`,
`/recall`, `/skills`, `/skills/[skillId]`, and `/alexa`.

## 8. Docker images and deployment config

```bash
docker compose config --quiet
docker compose build
docker run --rm -d --name once-backend-test -p 18000:8000 \
  -e APP_MODE=mock once-backend:latest
curl -fsS http://localhost:18000/health
docker stop once-backend-test
```

Expected: Compose config validates, both images build, and the container reports
`app_mode: mock` with provider `deterministic-mock`. The backend image contains
only `app/` plus the locked environment; `backend/.env` is excluded by
`.dockerignore` and supplied at runtime. A live container needs the instance or
task role, not static AWS keys. See [DEPLOYMENT.md](DEPLOYMENT.md).

## 9. Public deployment

The public demo is two Render services:

- App: `https://once-skill-memory.onrender.com`
- API and MCP: `https://once-skill-memory-api.onrender.com`

Verify the deployed stack:

```bash
curl -fsS https://once-skill-memory.onrender.com/health
curl -fsS "https://once-skill-memory.onrender.com/api/skills?reader_id=demo-teacher"
curl -fsS "https://once-skill-memory.onrender.com/api/skills/b7291dc416cf/agent-skill?reader_id=demo-teacher" | head
```

Expected: `/health` reports `app_mode: live` and provider `openrouter`; the
skills response contains the three stored demo skills; the agent export returns
a real `SKILL.md`.

Remote MCP smoke through both the backend URL and the frontend proxy:

```bash
cd backend
ONCE_MCP_URL=https://once-skill-memory-api.onrender.com/mcp \
  ONCE_API_URL=https://once-skill-memory-api.onrender.com \
  uv run python scripts/mcp_smoke.py

ONCE_MCP_URL=https://once-skill-memory.onrender.com/mcp \
  ONCE_API_URL=https://once-skill-memory.onrender.com \
  uv run python scripts/mcp_smoke.py
```

Expected: `9/9` checks pass for both URLs. The backend allowlist is set with
`MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS`; an empty or mismatched allowlist
returns `421 Invalid Host header`.

Public browser check (Playwright, headless Chromium, 2026-10-23):

- `/` loads with the voice-first home and live mode badge.
- `/skills` renders **My Event Bag**, **Make Tea (My Way)** and **Clean My
  Desk**.
- `/recall` loads the grounded-recall screen.
- `/alexa` shows **MCP CONNECTED**, protocol **2025-11-25** and **9 tools**.
  Clicking *"What am I missing for the conference?"* produced a real
  `once_recall_missing` result in 676 ms, **Show MCP traffic (1)**, and the
  not-confirmed explanation. No browser console errors.

Real hosted inference:

```bash
curl -fsS -X POST https://once-skill-memory.onrender.com/api/teach/extract \
  -H 'content-type: application/json' \
  -d '{"transcript":"I pack a towel, a water bottle and a lock for the gym.","skill_type":"packing"}'
```

Expected: a structured draft with `engine.provider: openrouter` and
`engine.model: google/gemini-3.8-flash`. A provider failure returns a real
`502`, never a mock draft.

Public vision check:

```bash
curl -fsS -X POST https://once-skill-memory.onrender.com/api/window/guide \
  -F 'file=@/path/to/window.png;type=image/png' \
  -F 'question=Where is the Export button?' \
  -F 'app_name=Files'
```

Verified result: the answer located the blue Export button in the lower right,
confidence `high`, engine `openrouter / google/gemini-3.8-flash`. The same
image through `/api/teach/extract-image` returned a draft with items and steps
plus two honest ambiguities.

Render free services spin down after inactivity. Wake the app before recording
the demo. The backend uses the least-privilege data identity through
server-side Render environment variables; rotate those keys after the demo.

## 10. Manual browser flow (2-3 minutes)

1. `/health` shows `app_mode: live` and the active inference provider/model.
2. `/` → type the event-bag paragraph → **Create draft** → verify the
   engine badge names a real provider/model → edit one item → **Save as Skill**.
3. `/recall` → shown as **You** (label `demo-teacher`) → query with the skill title → tick two
   items → **Check my list** → the remaining required items are labeled
   **Not confirmed**, and the explanation says not confirmed is not proof of
   absence.
4. `/skills` → open a saved skill → **Share this skill** → **Share with
   Grandma** → switch the developer reader to `demo-learner` and confirm the
   skill appears.
5. `/skills` → open the skill → **Use this with AI agents** → download
   **SKILL.md** and **Download skill folder (.zip)**; inspect the frontmatter.
6. `/alexa` → ask by voice or click a suggestion → inspect the real MCP
   traffic.
7. Mac helper: open a window, press **Look at this window**, ask where a control
   is, then **Save as skill** and **Save SKILL.md for AI agents**.
8. Optional: photo teaching on `/` with a real photo; the engine badge shows the
   configured vision model (for example `google/gemini-3.8-flash`).
9. Optional Gemini adapter check: `cd backend && uv run python scripts/gemini_smoke.py`.
   It performs a real model listing, text extraction and image extraction. On the
   developer's current Google project it reports `text=FAIL` and `image=FAIL` with
   `403 PERMISSION_DENIED`; that is the honest result, not a skipped test.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `503 GEMINI_API_KEY is not configured` | Set `INFERENCE_PROVIDER=openrouter` with `OPENROUTER_API_KEY`, or use `openai-compatible` with local Ollama |
| `403 ... project has been denied access` | Google AI Studio project access is denied. Use `INFERENCE_PROVIDER=openrouter` for the demo, or request model access; ONCE does not fake a Gemini result |
| `502` on extraction | Provider refused, ran out of credit, or timed out. Check the provider response in the backend log; the API does not fake a result |
| `AccessDenied` from AWS | `AWS_PROFILE=once-local` missing/expired, or policy not applied |
| Shared skill not listed | Grant row missing; re-share. Grants are queried consistently |
| Photo extraction fails with a text-only model | Set `OPENAI_VISION_MODEL` to a vision model |
| Window guide returns `502` | The configured model is not vision-capable or the provider failed. Check `OPENROUTER_MODEL`/`OPENROUTER_VISION_MODEL` or `ollama list`, and the backend log; no answer is fabricated |
| Mac helper shows Screen Recording permission error | Enable **ONCE Window Guide** in System Settings, Privacy & Security, Screen Recording, then reopen the app |
| Mac helper cannot find a window | Open the target app window, then press **Look at this window** again |
| `/alexa` says `MCP unavailable` | Start the API (`uv run uvicorn app.main:app --port 8000`); check `MCP_URL` (default `http://localhost:8000`) |
| MCP browser call returns a string instead of a list | The client handles both `structuredContent` and multi-block text; hard-refresh to clear an old bundle |
