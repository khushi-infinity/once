# ONCE — Build Plan (deadline Oct 23, 2026 12:00 PM PDT)

Working sequence; each phase has a done-criterion checked as real, not aspirational.

| # | Phase | Done criterion | State |
| --- | --- | --- | --- |
| 1 | Foundation: specs, models, backend, frontend, tests | App runs locally; tests pass; docs exist | ✅ **done** |
| 2 | Real AWS: DynamoDB stores, S3 evidence, IAM-fenced identity, smoke script; AI inference via labeled free-tier provider | One real DB roundtrip, one private S3 roundtrip acknowledged | ✅ **done** — storage + evidence + scoped identity verified (`smoke_live` **4/4**, live pytest **11/11** as `once-local`). Bedrock removed from the product after the AWS account-level restriction made inference impossible; AI runs on a labeled free-tier provider |
| 3 | Teach: voice/text/photo/camera → draft → confirm → persisted skill | 6 arbitrary items taught→saved→reloaded match; image yields real analysis; no hardcoding | ⏳ next — extraction API + confirmed-item persistence already live; capture UI next |
| 4 | Recall & verification: memory retrieval, missing-item comparison, sessions, sharing UX | Phrase query "going to an event…" returns stored list + unconfirmed items | ⬜ |
| 5 | Browser teaching & guided learning (PhotoShare demo app) | Two separate sessions prove teach→learner handoff; wrong click blocks | ⬜ |
| 6 | Agent orchestration (Strands + labeled free-tier inference) + MCP server (Streamable HTTP, spec ≥2025-11-25) | Independent MCP client exercises tools; trace view shows real calls | ⬜ |
| 7 | UI polish pass | Type check + build clean; flows tested desktop+mobile; no dead buttons | ⬜ |
| 8 | Release: e2e audit, deploy, evidence docs, friction log, demo video, submit | README/AWS_EVIDENCE/TESTING complete; judge checklist passes | ⬜ |

## Prompt 1 deliverables (this phase)

- Specs: [PRODUCT_SPEC.md](PRODUCT_SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), this file.
- Data models + API contracts: [backend/app/models/](backend/app/models/).
- Backend: FastAPI health + skill lifecycle + sharing + learner sessions, **5 tests passing**.
- Frontend: ONCE home (mic + text + cards + live health), My Skills (real API list), Ask stub.
- Config: [.env.example](.env.example) covering APP_MODE/AWS vars, mock≠live separation.

Explicitly unfinished (by design, next prompt): all AWS wiring, voice, photos, browser work.

## Risks being tracked

- Free-tier inference can rate-limit (429) or be unavailable; the API surfaces that honestly (502/503) instead of substituting a fake result.
- `aws login` needs the user's own browser + MFA; agent cannot and must not do this.
- MCP protocol version support must be *verified*, in writing, before claiming compliance.
- AWS spend: on-demand DynamoDB + minimal S3; no EC2; budget alert before Phase 2.
