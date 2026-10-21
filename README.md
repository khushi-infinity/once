# ONCE

**Teach once. Let it teach anyone, forever.**

ONCE is a multimodal personal skill-memory application built for the
*Build, Ship, Shape: Amazon Developer Hackathon 2026* (primary track: **Alexa+**,
mini challenge: **AWS Builder**). A person teaches a personal method — by
speaking, typing, or showing a photo — or by demonstrating a browser task. ONCE
turns that teaching into a structured, persistent **Skill**. Later, the original
user or someone they authorize can retrieve it, follow it, and get grounded
feedback when reality differs from what was taught.

ONCE is not a chatbot wrapper: every answer about "what did I teach you" is
grounded in stored skill records, never invented by a language model.

## The two mandatory experiences

1. **Event-bag packing → "what am I missing?"**
   Teach items by text, voice or photo on `/`, confirm the draft, save it. Then
   open `/recall`, ask *"what am I missing for the conference?"*, tick what you
   already have and get the required items that are **not confirmed**. The
   answer is computed from the stored skill and says plainly that unconfirmed is
   not proof of absence.
2. **Browser workflow → second learner guided with a real DOM highlight**
   Open `/demo/photoshare`, choose *Teach by demonstration*, record
   *open album → select photo → add tag → share*, save + share + start a learner
   session. The learner view outlines the exact recorded control in the live
   DOM. A wrong click returns a server-side mismatch and does **not** advance.

## Repository layout

```
frontend/    Next.js 16 + TypeScript + Tailwind 4
backend/     FastAPI + Pydantic 2; DynamoDB/S3 stores; MCP server
```

- `backend/app/routers/` — health, skills/sessions, teach extraction, recall
- `backend/app/services/` — stores, inference providers, recall, learning engine
- `backend/app/mcp_server.py` — MCP tools over Streamable HTTP
- `backend/scripts/` — AWS provisioning, live smoke, MCP client smoke

## Run locally

Prerequisites: Node 22+, [uv](https://docs.astral.sh/uv/), and
[Ollama](https://ollama.com) for the default local inference.

```bash
# 0. Local models (one text, one vision)
ollama pull qwen2.5-coder:7b
ollama pull qwen2.5vl:3b

# 1. Backend (port 8000)
cd backend && uv sync
cp .env.example .env          # then set APP_MODE + AWS profile (see AWS_SETUP.md)
uv run uvicorn app.main:app --port 8000

# 2. Frontend (port 3000; proxies /api and /health to the backend)
cd frontend && npm install && npm run dev

# 3. Checks
cd backend && uv run ruff check . && uv run pytest
cd frontend && npm run lint && npm run build
```

Open **http://localhost:3000**.

### Inference providers (explicit, never auto-switched)

`INFERENCE_PROVIDER` selects exactly one provider; every extraction response
carries `engine: {provider, model, duration_ms, request_id}` and `/health`
reports the active provider.

- `openai-compatible` (default in the checked-in example for local use): any
  OpenAI-compatible endpoint. On this machine it points at Ollama
  (`OPENAI_BASE_URL=http://localhost:11434/v1`,
  `OPENAI_MODEL=qwen2.5-coder:7b`,
  `OPENAI_VISION_MODEL=qwen2.5vl:3b`). The same code works with Groq,
  OpenRouter or another hosted endpoint by changing the env vars.
- `gemini`: Google AI Studio via the Interactions API
  (`GEMINI_API_KEY`, `GEMINI_MODEL_ID`). Free tier. If the key's project is
  denied, the API returns an honest 503/502 — it does not fall back.

Mock mode (`APP_MODE=mock`) uses a deterministic, clearly-labeled non-AI
splitter for text and refuses photo extraction (no vision in mock mode).

### AWS (live mode)

`APP_MODE=live` makes every storage call real: DynamoDB for skills, sessions and
share grants; private S3 for consented evidence; a least-privilege IAM identity
(`once-local`). Failures surface as errors — never as fakes. Setup is in
[AWS_SETUP.md](AWS_SETUP.md); reproducible evidence is in
[AWS_EVIDENCE.md](AWS_EVIDENCE.md).

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

### MCP server

```bash
cd backend && uv run python -m app.mcp_server          # http://127.0.0.1:8765/mcp
uv run python scripts/mcp_smoke.py                     # independent client, 8 checks
```

The smoke client prints the negotiated protocol version (**2025-11-25**),
lists the tools, and exercises read, authz denial, grounded recall, session
start, correct verification, wrong-element rejection and draft extraction.

## Docs

- [TESTING.md](TESTING.md) — commands + expected results
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — <3 minute recording plan
- [AWS_EVIDENCE.md](AWS_EVIDENCE.md) — reproducible AWS proofs
- [FRICTION_LOG.md](FRICTION_LOG.md) — honest AWS tooling feedback

## Current status (honest)

| Working and verified | Still to do before submission |
| --- | --- |
| Text, voice (browser speech), and photo teaching UI → editable draft → confirm → persisted skill | Record the <3 min demo video |
| Real AI extraction with labeled engine metadata (local Ollama text + vision) | Deploy a public demo URL if the submission form requires one |
| Grounded recall / "what am I missing" with alias matching and honest not-confirmed wording | Manual mobile polish pass |
| Skill CRUD, versioned edits, sharing/revocation, learner sessions | |
| Browser-workflow teach-by-demonstration + learner mode with real DOM highlight and target-aware verification | |
| Live AWS: 3 DynamoDB tables, private S3, scoped IAM; `smoke_live` **4/4** | |
| MCP server over Streamable HTTP (protocol **2025-11-25**) with 8-check client smoke | |
| Backend **16 tests** passing; frontend lint + production build clean | |

## Why the AI is not on AWS

Amazon Bedrock was the original plan, but this AWS account is restricted at the
account level (`ValidationException: Operation not allowed`; every model
inference quota is 0.0). The adapter was removed rather than shipped dead; the
story is documented in [FRICTION_LOG.md](FRICTION_LOG.md). ONCE never claims
AWS AI usage. The AWS Builder story is the verified data layer.

## License

MIT — see [LICENSE](LICENSE). The repository is public (per hackathon rules).
