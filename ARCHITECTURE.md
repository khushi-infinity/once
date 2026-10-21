# ONCE — Architecture

## Product shape

Three user-facing destinations: **Teach** (home), **Ask** (recall), **My Skills** (library). Under them, five concepts exist in code — not just names in a UI:

| Concept | Actual responsibility today |
| --- | --- |
| **Skill model** | Typed Pydantic records ([backend/app/models/core.py](backend/app/models/core.py)): `Skill`, `SkillItem` (aliases + tri-state packing verification), `SkillStep` (ordered, with stable `target_element_id` + `expected_event`), `LearnerSession` (per-learner, separate from taught skill), `ShareGrant` |
| **Skill store** | Persistence interface with **server-side ownership checks** on every operation ([backend/app/services/skill_store.py](backend/app/services/skill_store.py)); in-memory (mock) and **real DynamoDB (live)** behind the same interface |
| **Session engine** | Learner progress: start/resume/verify endpoints where a wrong event provably does not advance ([backend/app/routers/skills.py](backend/app/routers/skills.py)) |
| **Agents (Observer/Binder/Memory/Coach/Verifier/Coordinator)** | Land in Prompt 6 on Strands + Bedrock; deterministic logic (auth, comparison, progression) stays plain Python — LLMs never own authorization or persistence |
| **Frontend** | Next.js App Router; dev proxy rewrites `/api/*` and `/health` to the backend (same-origin, no CORS friction) |

## Data flow (rightarrow rule: one source of truth)

```
Browser (Teach/Ask/UI)
   │  fetch /api/…  (same origin)
   ▼
FastAPI routers  ──► Pydantic validation (never trust raw model output)
   │
   ▼
SkillStore interface (ownership + share-grant checks server-side)
   │
   ├─ mock:  InMemorySkillStore (tests, offline dev)
   └─ live:  DynamoDB (ONCE_Skills / ONCE_Sessions) + S3 (private evidence)
                 │
                 ▼
   Inference dispatcher (app/services/inference.py) — never auto-switches
                 ├─ bedrock: Nova 2 Lite Converse (primary; blocked at
                 │   account level — AWS_EVIDENCE.md; adapter complete)
                 ├─ gemini: labeled free-tier fallback by explicit choice
                 └─ mock: deterministic-mock, always labeled via `engine`
        Only ever *proposes* structured content; a human confirms and Pydantic
                 validates before persisting. The Bedrock path unblocks with
                 zero code change when the account restriction is lifted.
```

## Non-negotiable invariants (enforced in code)

1. **Memory is retrieval, not generation.** "I'm going to an event, what's missing?" reads the stored `Skill.items` and compares against user-confirmed items. The LLM may suggest; it may not alter or invent stored items.
2. **Not-verified ≠ missing.** Item verification is enum-gated: `confirmed_packed` / `visible_packed` / `explicitly_missing` / `not_verified`. Absence from a photo of a closed bag is never evidence of absence.
3. **Ownership and sharing are server-side.** Wrong-reader access returns 404 (no existence leak) — tested.
4. **Auth never uses LLM output.** `authorized_reader_ids()` is computed from grants in the record.
5. **Versioned skill updates** (`PATCH` bumps `version`, preserves history) — no silent destroy.
6. **Failure is never masked.** `live` mode without connectivity errors; `mock` is opt-in and explicitly labeled in `/health` and the UI.
7. **No credentials in the browser.** AWS identity comes from the provider chain, server-side only.

## Lambda-shaped deployment (final phase)

The FastAPI app is dependency-light and stateless-per-request (InMemory store
is dev-only), so the deploy target is a single container/Lambda + static
frontend, with DynamoDB/S3 as durable state. Decision and specifics land in
BUILD_PLAN.md Phase 4.
