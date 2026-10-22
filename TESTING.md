# Testing ONCE

Everything below was run on 2026-10-22. Commands are copy-pasteable.

## 1. Backend static + unit/integration tests

```bash
cd backend
uv run ruff check .
APP_MODE=mock uv run pytest -q
```

Expected: `All checks passed!` and `17 passed, 2 skipped` (the two live-store
tests skip without AWS). The suite covers health, skill lifecycle,
ownership/sharing (including learner-side listing and revocation), six-item
save/reload, teach extraction, grounded recall (alias match, no-invent 404,
sharing), session progression, wrong-event rejection, wrong-DOM-element
rejection, versioned updates, and the Gemini adapter's primary/fallback/403 behavior.

`backend/.env` may set `APP_MODE=live`; the explicit `APP_MODE=mock` above keeps
the offline suite deterministic. Live mode:

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest -q   # 19 passed
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
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest -q   # 19 passed
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
tools=[… 8 tools …]
[PASS] once_list_skills …
[PASS] once_get_skill authorized read
[PASS] once_get_skill denied a stranger (same authz as HTTP)
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

- status says **MCP connected**, protocol **2025-11-25**, **8 tools**;
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

## 4. Frontend

```bash
cd frontend
npm run lint
npm run build
```

Expected: no ESLint output and a successful production build with routes `/`,
`/recall`, `/skills`, `/skills/[skillId]`, and `/alexa`.

## 5. Manual browser flow (2-3 minutes)

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
5. `/alexa` → ask by voice or click a suggestion → inspect the real MCP
   traffic.
6. Optional: photo teaching on `/` with a real photo; the engine badge shows the
   vision model (e.g. `qwen2.5vl:3b`).
7. Optional Gemini adapter check: `cd backend && uv run python scripts/gemini_smoke.py`.
   It performs a real model listing, text extraction and image extraction. On the
   developer's current Google project it reports `text=FAIL` and `image=FAIL` with
   `403 PERMISSION_DENIED`; that is the honest result, not a skipped test.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `503 GEMINI_API_KEY is not configured` | Set `INFERENCE_PROVIDER=openai-compatible` for local Ollama, or add a key |
| `403 ... project has been denied access` | Google AI Studio project access is denied. Keep `INFERENCE_PROVIDER=openai-compatible` for the demo, or request model access; ONCE does not fake a Gemini result |
| `502` on extraction | Provider refused/timed out. Check `ollama list`; the API does not fake a result |
| `AccessDenied` from AWS | `AWS_PROFILE=once-local` missing/expired, or policy not applied |
| Shared skill not listed | Grant row missing; re-share. Grants are queried consistently |
| Photo extraction fails with a text-only model | Set `OPENAI_VISION_MODEL` to a vision model |
| `/alexa` says `MCP unavailable` | Start the API (`uv run uvicorn app.main:app --port 8000`); check `MCP_URL` (default `http://localhost:8000`) |
| MCP browser call returns a string instead of a list | The client handles both `structuredContent` and multi-block text; hard-refresh to clear an old bundle |
