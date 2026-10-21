# ONCE — Demo video script (< 3 minutes)

Goal: prove **real teaching → real storage → real recall → real guidance**, and
show the AWS data layer without claiming anything unverified.

## Pre-record checklist

- `ollama list` shows `qwen2.5-coder:7b` and `qwen2.5vl:3b`.
- Backend: `cd backend && uv run uvicorn app.main:app --port 8000`.
- Frontend: `cd frontend && npm run dev` → http://localhost:3000.
- `/health` shows `live` + `openai-compatible` (or `gemini` if using a working key).
- Two browser profiles/windows ready: **Teacher** (`demo-teacher`) and
  **Learner** (`demo-learner`).

## 0:00–0:20 — Hook

> "Alexa remembers facts. ONCE remembers *how you do things* — and teaches the
> next person, with proof."

Show the four screens briefly: Teach, Recall, My Skills, PhotoShare.

## 0:20–1:05 — Experience A: teach an event bag, then ask what's missing

1. `/` → speak or type: *"For conferences I pack my laptop, charger, HDMI
   adapter, badge and water bottle. Charge everything the night before."*
2. **Create draft with AI**. Point at the engine badge: real provider + model +
   latency. Correct one item if needed.
3. **Confirm & save**. Open the skill; show the five stored items.
4. `/recall` → *"what am I missing for the conference?"* → tick **laptop** and
   **charger** → **What's missing?**
5. Read the result: HDMI adapter, badge, water bottle are **not confirmed**;
   say the honesty line: *"unconfirmed is not proof of absence."*

## 1:05–2:10 — Experience B: teach a browser workflow, guide a second person

1. `/demo/photoshare` → **Teach by demonstration** → **Start recording**.
2. Click *Open album → Select photo → Add tag → Share album*. Show the recorded
   steps with their real element ids.
3. **Save, share & start learner** (`demo-learner`).
4. In learner mode: the next control is outlined in the live DOM.
5. Click the **wrong** control first → red mismatch, step stays. Say: *"the
   server verified the clicked element, not just that a click happened."*
6. Click the **outlined** control → verified → next step. Complete the workflow.
7. Open **My Skills** as the learner to show the shared skill appears (grant
   table), then revoke as the teacher if time allows.

## 2:10–2:40 — AWS proof (no hand-waving)

Cut to terminal:

```bash
cd backend && AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

Show **4/4 PASS**: scoped IAM identity, DynamoDB skill, DynamoDB session,
private S3 roundtrip. State: *"Skills, grants and sessions live in DynamoDB;
evidence in a private S3 bucket; the app runs as a least-privilege IAM user."*

Optional 10 seconds:

```bash
uv run python scripts/mcp_smoke.py
```

Show `protocol=2025-11-25` and the 8 PASS lines.

## 2:40–3:00 — Close

> "ONCE: teach once, let it teach anyone, forever. Every answer comes from your
> stored skill — never invented."

Show repository URL + MIT license.

## Do not claim

- Do not say Bedrock or AWS AI is used.
- Do not show fake request ids, logs or success states.
- If inference is unavailable on the recording machine, show the honest error
  and continue with the stored-skill/recall path.
