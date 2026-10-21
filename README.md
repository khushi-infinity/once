# ONCE

**Teach once. Let it teach anyone, forever.**

ONCE is a multimodal personal skill-memory application built for the
*Build, Ship, Shape: Amazon Developer Hackathon 2026* (primary track: **Alexa+**,
mini challenge: **AWS Builder**). A person teaches a personal method — by
speaking, typing, photo, camera, or by demonstrating a browser task. ONCE
converts that teaching into a structured, persistent **Skill**. Later, the
original user or someone they authorize can retrieve it, follow it, and get
grounded feedback when reality differs from what was taught.

ONCE is not a chatbot wrapper: every answer about "what did I teach you" is
grounded in stored skill records, never invented by a language model.

## Repository layout

```
frontend/    Next.js 16 + TypeScript + Tailwind 4 (Teach / Ask / My Skills)
backend/     FastAPI + Pydantic 2 (skill store, sessions — agents land in Prompt 6)
```

## Run locally

Prerequisites: Node 22+, [uv](https://docs.astral.sh/uv/) for Python.

```bash
# 1. Backend (port 8000)
cd backend && uv sync && uv run uvicorn app.main:app --port 8000

# 2. Frontend (port 3000, proxies /api and /health to the backend)
cd frontend && npm install && npm run dev

# 3. Tests
cd backend && uv run pytest            # backend: 5 endpoint/concurrency tests
cd frontend && npm run lint && npm run build
```

Then open **http://localhost:3000**. The home page shows live backend health.

## Current status (honest, per build)

| Working now | Not yet (planned) |
| --- | --- |
| FastAPI backend + health, typed Pydantic models | Real Amazon Bedrock calls (Prompt 2) |
| Skill create/read/update/delete with **server-side ownership checks** | Amazon DynamoDB + S3 persistence (Prompt 2) |
| Sharing grants + revocation, learner-scoped sessions, versioned updates | Voice/photo/camera teaching (Prompt 3) |
| Learner-session progression with real event verification | Recall & "what am I missing" (Prompt 4) |
| Next.js UI (home, skills list, ask stub) with live health check | Browser-workflow guided teaching (Prompt 5) |
| `mock`/`live` mode split; mock never silently fakes live calls | Strands agent orchestration + MCP server (Prompt 6) |

`APP_MODE=mock` (current) uses in-memory storage so the full flow runs with
zero cloud dependencies. When `APP_MODE=live` lands in Prompt 2, AWS calls are
real and their failures are surfaced as errors — never substituted.

## AWS

Setup steps and verification evidence will be documented in
[AWS_SETUP.md](AWS_SETUP.md) and [AWS_EVIDENCE.md](AWS_EVIDENCE.md) as the
real integrations land (Prompt 2). Credentials come from the AWS credential
provider chain (`aws login`); no keys are ever committed or placed in frontend code.

## License

TBD before public release (hackathon requires a public repo with license; see BUILD_PLAN.md).
