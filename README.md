# ONCE

**Teach once. Let it teach anyone, forever.**

ONCE is a multimodal personal skill-memory application built for the
*Build, Ship, Shape: Amazon Developer Hackathon 2026* (primary track: **Alexa+**,
mini challenge: **AWS Builder**). A person teaches a personal method, by
speaking, typing, or showing a photo. ONCE turns that teaching into a
structured, persistent **Skill**. Later, the original user or someone they
authorize can retrieve it, follow it, and get grounded feedback when reality
differs from what was taught. The same record can be exported as a portable
Agent Skill, and a native macOS helper can answer questions about the window in
front of you.

ONCE is not a chatbot wrapper: every answer about "what did I teach you" is
grounded in stored skill records, never invented by a language model.

## What ships

1. **Event-bag packing to "what am I missing?"**
   Teach items by text, voice or photo on `/`, confirm the draft, save it. Then
   open `/recall`, ask *"what am I missing for the conference?"*, tick what you
   already have and get the required items that are **not confirmed**. The
   answer is computed from the stored skill and says plainly that unconfirmed
   is not proof of absence.
2. **A native macOS window guide**
   `macos/OnceWindow` is a menu bar helper. It captures one window only when
   you press **Look at this window**, asks the configured vision model where a
   control is or how to open something, speaks the answer, and can save it as a
   `desktop_workflow` skill. See [macos/README.md](macos/README.md).
3. **Portable Agent Skills**
   Every saved skill can be exported as a `SKILL.md` plus a JSON manifest, or
   as a zip folder, from the skill detail page or the MCP tool
   `once_get_agent_skill`. An AI agent can save the folder in its own skills
   directory and load the method later.

## Alexa+ track fit (what is and is not claimed)

Amazon's hackathon FAQ says the gated Alexa+ Add-on tools are select-partner
only and cannot be accessed by participants. The allowed path is a self-hosted
MCP server (spec 2025-11-25+, Streamable HTTP) or Agent Skill, demoed through
your own web simulator.

ONCE does exactly that:

- `backend/app/mcp_server.py` is a real MCP server with **9 tools** over
  Streamable HTTP, including `once_get_agent_skill`.
- `/alexa` is a **real browser MCP client**: it performs `initialize`,
  `notifications/initialized`, `tools/list`, and `tools/call`, shows the
  JSON-RPC traffic, and hands taught drafts to the review screen instead of
  dead-ending. The page shows the negotiated protocol, the tool surface, and
  the actual arguments/result for every answer.
- The MCP server shares the same store, authorization, recall, and learning
  logic as the HTTP API. There is no privileged demo path.

We do **not** claim Alexa+ SDK access, Add-on tooling, or real-device
integration. The UI says so. The real thing is the MCP transport, tools,
storage, and grounded answers.

## Repository layout

```
frontend/    Next.js 16 + TypeScript + Tailwind 4; /alexa MCP client
backend/     FastAPI + Pydantic 2; DynamoDB/S3 stores; MCP server
macos/       Native SwiftUI menu bar window guide
```

- `backend/app/routers/`, health, skills/sessions, teach extraction, recall
- `backend/app/services/`, stores, inference providers, recall, agent-skill export, window guide
- `backend/app/mcp_server.py`, MCP tools over Streamable HTTP
- `macos/OnceWindow`, native macOS capture + vision helper (build with `./scripts/build-macos.sh`)
- `frontend/lib/mcp.ts`, browser Streamable HTTP MCP client
- `frontend/app/alexa/page.tsx`, simulated Alexa+ experience + voice + traffic
- `backend/scripts/`, AWS provisioning, live smoke, MCP client smoke

## Run locally

Prerequisites: Node 22+, [uv](https://docs.astral.sh/uv/), and either
[Ollama](https://ollama.com) for local inference or an OpenRouter key for hosted
inference.

```bash
# 0. Optional: local models (one text, one vision). Skip if using OpenRouter.
ollama pull qwen2.5-coder:7b
ollama pull qwen2.5vl:3b

# 1. Backend (port 8000): also serves the MCP endpoint at /mcp
cd backend && uv sync
cp .env.example .env          # then set APP_MODE + AWS profile (see AWS_SETUP.md)
uv run uvicorn app.main:app --port 8000

# 2. Frontend (port 3000; proxies /api, /health and /mcp)
cd frontend && npm install && npm run dev

# 3. Checks
cd backend && uv run ruff check . && APP_MODE=mock uv run pytest
cd frontend && npm run lint && npm run build
./scripts/build-macos.sh          # native menu bar helper
```

Or run both with one command:

```bash
./scripts/dev.sh                 # live AWS mode
APP_MODE=mock ./scripts/dev.sh   # offline: seeded skills, no AWS/Ollama
```

Open **http://localhost:3000**. The API process mounts the MCP server at
`/mcp`, so `/alexa` and the HTTP pages share the same store in both live and
mock mode. The standalone
`python -m app.mcp_server` process is optional and used only by the independent
smoke client.

### Inference providers (explicit, with optional labeled fallback)

`INFERENCE_PROVIDER` selects the primary provider. Every extraction response
carries `engine: {provider, model, duration_ms, request_id, fallback_from}` and
`/health` reports the active provider and any configured fallback.

- `openai-compatible`: any OpenAI-compatible endpoint. For local development
  this points at Ollama (`OPENAI_BASE_URL=http://localhost:11434/v1`,
  `OPENAI_MODEL=qwen2.5-coder:7b`,
  `OPENAI_VISION_MODEL=qwen2.5vl:3b`).
- `openrouter`: hosted OpenAI-compatible inference at
  `https://openrouter.ai/api/v1`. The active demo uses
  `google/gemini-3.8-flash` for text and vision, with bounded output tokens.
  This path is verified with real text and image calls.
- `gemini`: Google AI Studio via the Interactions API
  (`GEMINI_API_KEY`, `GEMINI_MODEL_ID=gemini-3.8-flash`,
  `GEMINI_FALLBACK_MODEL_ID=gemini-3.5-flash-lite`). The adapter retries the
  model fallback only for model/availability errors. The developer's Google
  project still returns `403 PERMISSION_DENIED` for generation even though model
  listing succeeds, so Gemini is not the active demo path.
  `cd backend && uv run python scripts/gemini_smoke.py` reproduces the real
  result without changing the demo runtime.

`INFERENCE_FALLBACK_PROVIDER` is optional. It runs only when the primary
reports a provider-level failure, and the result names the primary in
`engine.fallback_from`; the UI shows `fallback from <provider>`. It is never a
silent substitution and it never replaces a real call with mock output. In the
local live config, OpenRouter is primary and local Ollama is the fallback.

Mock mode (`APP_MODE=mock`) uses a deterministic, clearly-labeled non-AI
splitter for text and refuses photo extraction (no vision in mock mode).

### AWS (live mode)

`APP_MODE=live` makes every storage call real: DynamoDB for skills, sessions and
share grants; private S3 for consented evidence; a least-privilege IAM identity
(`once-local`). Failures surface as errors, never as fakes. Setup is in
[AWS_SETUP.md](AWS_SETUP.md); reproducible evidence is in
[AWS_EVIDENCE.md](AWS_EVIDENCE.md).

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

### Deploy

Both services have production Dockerfiles and a single-host Compose file. The
shortest path is one EC2 instance with an instance role, `backend/.env`, and
Caddy TLS. Managed alternatives are App Runner plus Amplify, or ECS Fargate plus
ALB. See [DEPLOYMENT.md](DEPLOYMENT.md) for the env matrix, commands, and the
public-demo access warning.

```bash
DOMAIN=demo.example.com docker compose --profile https up -d --build
```

### MCP server + real browser client

The app itself needs no second process: `app.main` mounts the MCP app at
`/mcp`. The standalone process is for the independent smoke client:

```bash
cd backend && uv run python scripts/mcp_smoke.py       # starts its own :8765 server, 9 checks
```

The smoke client prints the negotiated protocol version (**2025-11-25**),
lists the tools, and exercises read, authz denial, grounded recall, session
start, correct verification, wrong-element rejection and draft extraction.

Open **http://localhost:3000/alexa** for the same server through a real browser
MCP client. It shows `initialize`, `tools/list`, and the actual `tools/call`
arguments/result; use the traffic drawer to inspect them. The Next.js dev proxy
rewrites `/mcp` to `MCP_URL` (default `http://localhost:8000`) so the browser
stays same-origin. In **mock mode** the same process also seeds the three demo
skills, so a judge can run `/alexa` end-to-end without AWS credentials.

## Docs

- [SUBMISSION.md](SUBMISSION.md), Devpost text, track fit, judge quickstart
- [TESTING.md](TESTING.md), commands + expected results
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md), <3 minute recording plan
- [AWS_EVIDENCE.md](AWS_EVIDENCE.md), reproducible AWS proofs
- [DEPLOYMENT.md](DEPLOYMENT.md), AWS deployment options and commands
- [FRICTION_LOG.md](FRICTION_LOG.md), honest AWS/Alexa+/MCP tooling feedback

## Current status (honest)

| Working and verified | Still to do before submission |
| --- | --- |
| Text, voice (browser speech), and photo teaching UI → editable draft → confirm → persisted skill | Record the <3 min demo video |
| Real AI extraction with labeled engine metadata (OpenRouter text + vision; local Ollama fallback) | Submit the Devpost entry with the video and `SUBMISSION.md` |
| Grounded recall / "what am I missing" with alias matching and **not confirmed** semantics | |
| Responsive cream/blue UI (mobile nav, orb, draft review) | |
| Skill CRUD, versioned edits, sharing/revocation | |
| MCP server over Streamable HTTP (protocol **2025-11-25**) with 9-check independent client smoke | |
| Portable Agent Skill export (`SKILL.md` + manifest, web + MCP) | |
| Native macOS window guide with real vision call and save-as-skill | |
| Shareable desktop guide records with typed `desktop_workflow` skills | |
| `/alexa` real browser MCP client with voice input, spoken replies, and visible JSON-RPC traffic | |
| Live AWS: 3 DynamoDB tables, private S3, scoped IAM; `smoke_live` **4/4** | |
| Backend **25 live tests** / 24 mock tests passing; frontend lint + production build clean | |

A public hosted URL is **not required** by the hackathon FAQ; a locally runnable
public repo plus the demo video is enough. If a URL is added later, it must be a
genuine working deployment, no static mock.

### Demo-only, clearly labeled

- `demo-teacher` / `demo-learner` are demo identity labels, not authentication.
  Server-side ownership/share checks are real for the selected id; production
  would use Cognito or another IdP.
- The browser-workflow UI and its seeded skill were removed. The backend
  learning engine is not exposed by the shipped UI. The Mac window guide is a
  separate opt-in desktop surface, not a browser automation feature.
- Alexa+ Add-on SDK access is not available to hackathon participants and is
  not claimed. The MCP server and web simulator are the allowed path.

## Limits that are stated, not hidden

- The macOS helper needs Screen Recording permission and a live vision model.
  It captures only when you press the button, never in the background, and the
  backend does not store the screenshot.
- Agent Skill export is a portable folder. It does not install itself into a
  particular agent's directory; the agent or the user copies it.
- Window guidance answers from one screenshot plus stable macOS conventions. It
  does not click controls or claim to know what is off screen.

## Inference and AWS scope

Inference is explicit local/hosted OpenAI-compatible; mock mode is a labeled
deterministic parser. ONCE never claims AWS AI usage. The AWS Builder story is
the verified data layer (DynamoDB, S3, least-privilege IAM). The account-level
model-access constraint that shaped this choice is documented in
[FRICTION_LOG.md](FRICTION_LOG.md).

## License

MIT, see [LICENSE](LICENSE). The repository is public (per hackathon rules).
