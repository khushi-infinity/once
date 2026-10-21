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
cd backend && uv run pytest            # backend: 11 tests (7 live, +2 store-roundtrip live-only)
cd frontend && npm run lint && npm run build
```

Then open **http://localhost:3000**. The home page shows live backend health.

**Default run is mock mode.** For live AWS mode, create `backend/.env` from
[backend/.env.example](backend/.env.example) and follow
[AWS_SETUP.md](AWS_SETUP.md). Live verification:

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

## Current status (honest, per build)

| Working now | Not yet (planned) |
| --- | --- |
| FastAPI backend + health, typed Pydantic models | Voice/photo capture UX (Prompt 3) |
| Skill create/read/update/delete with **server-side ownership checks**; sharing grants + revocation; versioned updates | Recall & "what am I missing" UX (Prompt 4) |
| Learner-session progression with **real event verification** (wrong event provably does not advance) | Browser-workflow guided teaching (Prompt 5) |
| **Teach extraction API** (`/api/teach/extract`): transcript → validated draft → teacher confirms → persisted; engine labeled per response (`gemini` or deterministic-mock) | Agent orchestration + MCP server (Prompt 6) |
| **Live AWS mode**: skills + sessions in real DynamoDB (GSI-backed), consented evidence in fully-private S3 — verified with a **least-privilege IAM identity** | Deployment + demo video (Prompt 8) |
| Idempotent infra provisioning; smoke test **4/4 live proofs**; 11 backend tests | — |

`APP_MODE=mock` uses in-memory storage so the full flow runs with zero cloud
dependencies (tests default to this). `APP_MODE=live` makes every AWS call real
and surfaces failures as errors — never substitutes them, never silently fakes.

**AI inference** runs on Google AI Studio's free tier and is labeled as such in
every API response and screen; ONCE does not claim AWS AI usage. **AWS usage**
is the verified data layer: DynamoDB, S3 and least-privilege IAM (see
[AWS_EVIDENCE.md](AWS_EVIDENCE.md)).

## AWS

Setup steps live in [AWS_SETUP.md](AWS_SETUP.md) (account, `aws login`, the
least-privilege `once-local` runtime identity, idempotent provisioning) and
runtime verification evidence in [AWS_EVIDENCE.md](AWS_EVIDENCE.md). AWS usage is
the data layer — DynamoDB, S3, IAM — each with a reproducible check. AI
inference is a free-tier non-AWS provider, labeled in the product; why that
decision was made is documented honestly in [FRICTION_LOG.md](FRICTION_LOG.md).
Credentials come from the AWS credential provider chain; no keys are ever
committed or placed in frontend code.

## License

MIT — see [LICENSE](LICENSE). The repository is public (per hackathon rules).
