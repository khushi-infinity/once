# ONCE: Architecture

## Product shape

Five user-facing destinations: **Teach** (`/`), **Recall** (`/recall`),
**My Skills** (`/skills`, `/skills/[id]`), the **PhotoShare demo**
(`/demo/photoshare`) and the **Alexa+ MCP surface** (`/alexa`). Under them, the
concepts below exist in code, not just names in a UI.

| Concept | Actual responsibility today |
| --- | --- |
| **Skill model** | Typed Pydantic records ([backend/app/models/core.py](backend/app/models/core.py)): `Skill`, `SkillItem` (aliases + tri-state packing verification), `SkillStep` (ordered, stable `target_element_id` + `expected_event`), `LearnerSession`, `ShareGrant` |
| **Skill store** | Persistence interface with server-side ownership checks ([backend/app/services/skill_store.py](backend/app/services/skill_store.py)); in-memory (mock) and real DynamoDB (live) behind the same interface |
| **Recall** | Deterministic retrieval + comparison ([backend/app/services/recall.py](backend/app/services/recall.py)); shared by the HTTP route and MCP tools. No LLM writes an answer about stored items |
| **Learning engine** | Session start/resume/verify ([backend/app/services/learning.py](backend/app/services/learning.py)); wrong event, wrong step or wrong DOM element provably does not advance |
| **Inference** | Explicit provider, never auto-switched ([backend/app/services/inference.py](backend/app/services/inference.py)): `openai-compatible` (local Ollama or any hosted endpoint) or `gemini` (Interactions API). Every result carries sanitized engine metadata |
| **MCP server** | Eight tools over Streamable HTTP ([backend/app/mcp_server.py](backend/app/mcp_server.py)) with the same store + authorization rules as HTTP; verified by an independent Python client |
| **MCP client** | `/alexa` uses a real browser Streamable HTTP client ([frontend/lib/mcp.ts](frontend/lib/mcp.ts)): `initialize` → `notifications/initialized` → `tools/list` → `tools/call`; shows protocol and traffic |
| **Frontend** | Next.js 16 App Router; client pages; dev proxy rewrites `/api/*`, `/health` and `/mcp` to local services (same origin) |

## Data flow

```
Browser (Teach / Recall / Skills / Demo)
   │  fetch /api/…  (same origin)
   ▼
FastAPI routers ──► Pydantic validation (never trust raw model output)
   │
   ▼
SkillStore interface (ownership + share-grant checks server-side)
   │
   ├─ mock:  InMemorySkillStore (tests, offline dev)
   └─ live:  DynamoDB ONCE_Skills / ONCE_Sessions / ONCE_Grants
             + private S3 evidence bucket
   │
   ▼
Inference (explicit provider): proposes structure only.
A human confirms; Pydantic validates; only then is a Skill persisted.
```

The MCP server enters at the same store/service layer, not around it:

```
Browser /alexa (real MCP client) ── Streamable HTTP ──► app/mcp_server.py
                                                       ├── stores (DynamoDB/S3)
                                                       ├── grounded recall
                                                       └── learning engine
```

The `/alexa` page is the Alexa+ simulated-experience path allowed by the
hackathon FAQ. It is not an Alexa+ Add-on integration; the gated tools are
select-partner only. The UI states this and shows the actual protocol and tool
calls so the claim is inspectable.

## Non-negotiable invariants (enforced in code)

1. **Memory is retrieval, not generation.** "What am I missing?" reads stored
   `Skill.items` and compares against user-confirmed items. The model may draft;
   it may not alter or invent stored items.
2. **Not-verified ≠ missing.** Absence of confirmation is reported as *not
   confirmed*, never as proof of absence.
3. **Ownership and sharing are server-side.** Wrong-reader access returns 404
   (no existence leak). Sharing writes a `(learnerId, skillId)` grant row, so
   learner-side listing stays query-only, no table scans.
4. **Auth never uses model output.**
5. **Versioned skill updates** (`PATCH` bumps `version`), no silent destroy.
6. **Failure is never masked.** Live-mode failures surface as errors; mock is
   opt-in and labeled in `/health`, extraction responses and the UI.
7. **No credentials in the browser.** AWS identity comes from the server-side
   provider chain; inference keys live only in `backend/.env` (gitignored).
8. **Guidance targets real DOM.** Browser-workflow steps store stable element
   ids; the learner page highlights that element and the server verifies the
   clicked id before advancing.
9. **MCP is not a sidecar demo.** The `/alexa` browser client and the Python
   smoke client both speak the same Streamable HTTP protocol to the same server
   and tools; neither gets a privileged path.
10. **Demo identities are labeled.** `demo-teacher` / `demo-learner` are not
    authentication. They make the authorization checks inspectable; production
    would replace them with Cognito or another IdP.

## Deployment shape

The backend is stateless per request (InMemory is dev-only) and stores state in
DynamoDB/S3, so it can run as a single container behind the Next.js frontend.
The MCP app is mounted in the FastAPI process at `/mcp` (the same process and
store as the HTTP API; a standalone process is kept for the smoke client). Set
`MCP_URL` for the Next.js rewrite. Local inference is the demo default; a hosted
OpenAI-compatible endpoint or Gemini can be selected with env vars without code
changes. The Gemini adapter uses `gemini-3.8-flash` with
`gemini-3.5-flash-lite` only for model/availability errors; a project-level 403
is surfaced immediately. The current project is denied at the provider level,
so the checked-in demo stays on the local provider and the smoke test reports
the real 403. The hackathon FAQ does not require a hosted URL for the Alexa+ track;
a locally runnable public repo plus the video is enough.
