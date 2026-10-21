# Testing ONCE

Everything below was run on 2026-10-21. Commands are copy-pasteable.

## 1. Backend static + unit/integration tests

```bash
cd backend
uv run ruff check .
uv run pytest -q
```

Expected: `All checks passed!` and `16 passed`. The suite covers health, skill
lifecycle, ownership/sharing (including learner-side listing and revocation),
six-item save/reload, teach extraction, grounded recall (alias match, no-invent
404, sharing), session progression, wrong-event rejection, wrong-DOM-element
rejection and versioned updates.

Mock mode (no AWS) is the default for tests unless `backend/.env` sets
`APP_MODE=live`:

```bash
cd backend && APP_MODE=mock uv run pytest -q
```

## 2. Live AWS proofs

```bash
cd backend
APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

Expected: **4/4 PASS** — identity, DynamoDB skill write/read, DynamoDB session
write/read, private S3 roundtrip (with a public-read denial check). Each check
deletes what it creates.

Full live suite:

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest -q   # 16 passed
```

## 3. MCP server (independent client)

Keep the HTTP API running on `:8000`, then:

```bash
cd backend && uv run python scripts/mcp_smoke.py
```

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

## 4. Frontend

```bash
cd frontend
npm run lint
npm run build
```

Expected: no ESLint output and a successful production build with routes `/`,
`/recall`, `/skills`, `/skills/[skillId]`, `/demo/photoshare`.

## 5. Manual browser flow (2–3 minutes)

1. `/health` shows `app_mode: live` and the active inference provider/model.
2. `/` → type the event-bag paragraph → **Create draft with AI** → verify the
   engine badge names a real provider/model → edit one item → **Confirm & save**.
3. `/recall` → reader `demo-teacher` → query with the skill title → tick two
   items → **What's missing?** → the remaining required items are listed and the
   explanation says unconfirmed is not proof of absence.
4. `/demo/photoshare` → **Teach by demonstration** → **Start recording** → click
   *Open album → Select photo → Add tag → Share album* → **Save, share & start
   learner**.
5. In learner mode, click a deliberately wrong control: red mismatch, step does
   not advance. Then click the outlined control: verified, next step.
6. Optional: photo teaching on `/` with a real photo; the engine badge shows the
   vision model (e.g. `qwen2.5vl:3b`).

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `503 GEMINI_API_KEY is not configured` | Set `INFERENCE_PROVIDER=openai-compatible` for local Ollama, or add a key |
| `502` on extraction | Provider refused/timed out. Check `ollama list`; the API does not fake a result |
| `AccessDenied` from AWS | `AWS_PROFILE=once-local` missing/expired, or policy not applied |
| Shared skill not listed | Grant row missing; re-share. Grants are queried consistently |
| Photo extraction fails with a text-only model | Set `OPENAI_VISION_MODEL` to a vision model |
