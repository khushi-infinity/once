# ONCE: Demo video script (< 3 minutes)

Goal: prove **real teaching → real storage → grounded recall → real MCP calls
→ a Mac window guide → a portable Agent Skill**. Lead with the Alexa+ track
evidence; do not bury it.

## Pre-record checklist

- Inference is working before recording: `/health` reports provider `openrouter`
  and model `google/gemini-3.8-flash`, or `ollama list` shows
  `qwen2.5-coder:7b` and `qwen2.5vl:3b` if you deliberately switch to local.
  The curated demo skills already exist in DynamoDB.
- Public AWS demo: https://nrsvfngagk.us-east-1.awsapprunner.com. Public MCP:
  https://nrsvfngagk.us-east-1.awsapprunner.com/mcp. Backend health:
  https://m7ypexbma7.us-east-1.awsapprunner.com/health.
- For the Mac helper, point it at the AWS backend:
  `ONCE_API_URL=https://m7ypexbma7.us-east-1.awsapprunner.com
  ONCE_WEB_URL=https://nrsvfngagk.us-east-1.awsapprunner.com
  open macos/ONCEWindow.app`. The helper and the public web app read and write
  the same DynamoDB tables. A local backend also works if you prefer.
- Frontend: use the public URL, or `cd frontend && npm run dev` →
  http://localhost:3000
- Or one command: `./scripts/dev.sh` (live) / `APP_MODE=mock ./scripts/dev.sh` (offline)
- `/health` shows `app_mode: live`, provider `openrouter`, model `google/gemini-3.8-flash`.
- `/alexa` shows **MCP connected**, protocol **2025-11-25**, **9 tools**.
- The Render fallback is https://once-skill-memory.onrender.com if the AWS
  services are paused; do not mix URLs in one recording.
- Build the native helper with `./scripts/build-macos.sh --open`; grant Screen
  Recording on first use and test one question before recording.
- Open `/skills` in a second tab if you want to show the shared-skills list
  without leaving the recording flow. The server still uses the demo labels
  `demo-teacher` / `demo-learner`; they are not authentication.
- Terminal font large enough for the AWS smoke output; close noisy tabs.
- Record at 1080p or higher; keep the cursor deliberate.

## 0:00-0:12: Hook

> "Alexa remembers facts. ONCE remembers *how you do things*, and can hand that
> method to another person or another agent."

Quick cut of five surfaces: `/alexa`, `/recall`, `/skills`, the Mac helper, `/`.

## 0:12-0:42: Alexa+ track: a real MCP client, not a mock

1. Open `/alexa`. Point at the status row: **MCP connected · protocol
   2025-11-25 · 9 tools**.
2. Teach the event bag live, through MCP (it is intentionally not pre-seeded):
   ask by voice (or type) *"Remember I pack a laptop, charger, water bottle,
   notebook, pen and an extra bag for the conference."*
3. ONCE calls `once_extract_draft`; press **Review and save the draft** on the
   Teach screen and confirm with **Save as Skill**. Say: *"Nothing is stored
   until I confirm — the AI only drafted."*
4. Back on `/alexa`, ask: *"What am I missing for the conference?"* ONCE
   answers from the stored **My Event Bag** you just taught.
5. Open **Show MCP traffic**. Point at the real `tools/call` entries
   (`once_extract_draft`, then `once_recall_missing` with `reader_id`, `query`,
   `have`) and the returned `not_confirmed` list.
6. Say: *"This page is a real MCP client. It performs initialize, tools/list and
   tools/call over Streamable HTTP against our self-hosted server. The gated
   Alexa+ Add-on tools are select-partner only; this is the allowed simulated
   experience."*

## 0:42-1:12: Experience A: grounded recall, honest semantics

1. `/recall` → shown as **You** → *"what am I missing for the conference?"*
   → **Ask ONCE**.
2. Before ticking, point at the linked stored skill (**My Event Bag**, taught
   via MCP a moment earlier) for 3-4 seconds: *"This is the bag I taught just
   now; it is a real record, not a prompt."* If you have 5 spare seconds, open
   the skill detail and show the items.
3. Tick **Laptop** and **Charger**.
4. Press **Check my list**. Show the remaining items tagged **Not confirmed**
   (not "missing") and read the explanation.
5. Say: *"The stored skill is the source of truth. Unconfirmed is not proof of
   absence."*

## 1:12-1:55: Experience B: the Mac window guide

1. Open a real window with a visible menu, for example Preview with a document.
2. Click the eye in the menu bar, type *"Where is Export?"*, and press **Look at
   this window**.
3. Show the real answer, the steps, and the engine badge naming
   `openrouter / google/gemini-3.8-flash`. The helper captures only this window,
   on this button press.
4. Press **Save as skill**. Say: *"The screenshot answered one question. The
   saved record is the reusable skill."*
5. If the answer is wrong, say so and do not save it. Do not present a guess as
   verified.

## 1:55-2:12: Experience C: a skill an AI agent can save

1. `/skills` → open the new **Desktop guide**.
2. Show **Use this with AI agents** → **Download SKILL.md** and **Download skill
   folder (.zip)**.
3. Say: *"This is a portable SKILL.md plus a manifest. An agent can save the
   folder in its own skills directory. It is the same stored record, not a
   separate demo."*

## 2:12-2:37: AWS proof, no hand-waving

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

Show `protocol=2025-11-25` and the 9 PASS lines.

## 2:37-2:55: Close

Hard stop at **2:55**. Do not let the edit cross 3:00; the platform rejects it.

> "ONCE: teach once, let it teach anyone, forever. Every answer comes from your
> stored skill, never invented. The MCP server, the web client, the Mac helper,
> and the AWS data layer are all in the repo."

Show the repository URL and MIT license.

## Do not claim

- Do not say Bedrock or AWS AI is used. It is not.
- Do not claim Alexa+ SDK, Add-on tools, or a real Alexa+ device. They are not
  available to hackathon participants.
- Do not show fake request ids, logs, success states, or a mock MCP transcript.
- Do not say "definitely missing." The honest phrase is **not confirmed**.
- Do not claim the Mac helper clicks controls, reads the screen continuously, or
  knows what is off screen. It answers from one screenshot.
- If inference is unavailable while recording, show the honest error and
  continue with the stored-skill and recall path. **Make Tea (My Way)** and
  **Clean My Desk** already exist in DynamoDB; teach the event bag live with
  the text input if the voice path fails.

## Backup plan (if voice recognition fails on camera)

- Use the text input on `/alexa`; the same MCP call and traffic drawer appear.
- Use the text input on `/recall`; the same grounded result appears.
- Keep the voice attempt short; do not burn 20 seconds debugging the mic.
