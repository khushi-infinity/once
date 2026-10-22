# ONCE — Demo video script (< 3 minutes)

Goal: prove **real teaching → real storage → grounded recall → real MCP calls
→ verified guidance**. Lead with the Alexa+ track evidence; do not bury it.

## Pre-record checklist

- `ollama list` shows `qwen2.5-coder:7b` and `qwen2.5vl:3b` (needed for live
  teach extraction; the curated demo skills already exist in DynamoDB).
- Backend API: `cd backend && APP_MODE=live AWS_PROFILE=once-local uv run uvicorn app.main:app --port 8000`
  (this process also serves MCP at `/mcp`; no second server needed)
- Frontend: `cd frontend && npm run dev` → http://localhost:3000
- Or one command: `./scripts/dev.sh` (live) / `APP_MODE=mock ./scripts/dev.sh` (offline)
- `/health` shows `app_mode: live` and `openai-compatible`.
- `/alexa` shows **MCP connected**, protocol **2025-11-25**, **8 tools**.
- Two browser windows/profiles: **Teacher** (`demo-teacher`) and **Learner**
  (`demo-learner`).
- Terminal font large enough for the AWS smoke output; close noisy tabs.
- Record at 1080p or higher; keep the cursor deliberate.

## 0:00–0:12 — Hook

> "Alexa remembers facts. ONCE remembers *how you do things* — and teaches the
> next person, with proof."

Quick cut of four surfaces: `/alexa`, `/recall`, `/demo/photoshare`, `/skills`.

## 0:12–0:42 — Alexa+ track: a real MCP client, not a mock

1. Open `/alexa`. Point at the status row: **MCP connected · protocol
   2025-11-25 · 8 tools**.
2. Ask by voice (or click): *"What am I missing for the conference?"*
3. ONCE answers from the stored **My Event Bag**: the required items that are
   not confirmed, plus the line *"Not confirmed is not proof of absence."*
4. Open **Show MCP traffic**. Point at the real `tools/call
   once_recall_missing` entry: arguments (`reader_id`, `query`, `have`) and the
   returned `not_confirmed` list.
5. Say: *"This page is a real MCP client. It performs initialize, tools/list and
   tools/call over Streamable HTTP against our self-hosted server. The gated
   Alexa+ Add-on tools are select-partner only; this is the allowed simulated
   experience."*

## 0:42–1:12 — Experience A: grounded recall, honest semantics

1. `/recall` → reader `demo-teacher` → *"what am I missing for the
   conference?"* → **Ask ONCE**.
2. Before ticking, point at the linked stored skill (**My Event Bag**, version
   1, six items) for 3–4 seconds: *"This is the bag I taught earlier; it is a
   real record, not a prompt."* If you have 5 spare seconds, open the skill
   detail and show the items.
3. Tick **Laptop** and **Charger**.
4. Press **Check my list**. Show the remaining items tagged **Not confirmed**
   (not "missing") and read the explanation.
5. Say: *"The stored skill is the source of truth. Unconfirmed is not proof of
   absence."*

## 1:12–2:12 — Experience B: teach a browser workflow, guide a second person

1. `/demo/photoshare` → **Teach by demonstration** → **Start recording**.
2. Click *Open album → Select photo → Add tag → Share album*. Show the recorded
   steps with their real element ids.
3. **Save, share & start learner**.
4. In learner mode: the next control is outlined in the live DOM with
   **Click here**.
5. Click the **wrong** control first → red mismatch, step stays. Say: *"The
   server verified the clicked element, not just that a click happened."*
6. Click the **outlined** control → verified → next step. Complete the workflow
   and show **Well done!**
7. Optional 5 seconds: open **My Skills** as the learner to show the shared
   skill appears; revoke as the teacher.

## 2:12–2:37 — AWS proof, no hand-waving

Cut to terminal:

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

Show **4/4 PASS**: scoped IAM identity, DynamoDB skill, DynamoDB session,
private S3 roundtrip. Say: *"Skills, grants and sessions live in DynamoDB;
evidence lives in a private S3 bucket; the app runs as a least-privilege IAM
user. The frontend never sees AWS credentials."*

Optional 8 seconds:

```bash
uv run python scripts/mcp_smoke.py
```

Show `protocol=2025-11-25` and the 8 PASS lines.

## 2:37–2:55 — Close

Hard stop at **2:55**. Do not let the edit cross 3:00; the platform rejects it.

> "ONCE: teach once, let it teach anyone, forever. Every answer comes from your
> stored skill — never invented. The MCP server, the web client, and the AWS
> data layer are all in the repo."

Show the repository URL and MIT license.

## Do not claim

- Do not say Bedrock or AWS AI is used. It is not.
- Do not claim Alexa+ SDK, Add-on tools, or a real Alexa+ device. They are not
  available to hackathon participants.
- Do not show fake request ids, logs, success states, or a mock MCP transcript.
- Do not say "definitely missing." The honest phrase is **not confirmed**.
- If inference is unavailable while recording, show the honest error and
  continue with the stored-skill/recall/guided path. The demo skills already
  exist in DynamoDB.

## Backup plan (if voice recognition fails on camera)

- Use the text input on `/alexa`; the same MCP call and traffic drawer appear.
- Use `Repeat` on the learner screen to show speech output.
- Keep the voice attempt short; do not burn 20 seconds debugging the mic.
