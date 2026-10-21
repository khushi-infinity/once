# ONCE — Build Plan (deadline Oct 23, 2026 12:00 PM PDT)

Working sequence; each phase has a done-criterion checked as real, not aspirational.

| # | Phase | Done criterion | State |
| --- | --- | --- | --- |
| 1 | Foundation: specs, models, backend, frontend, tests | App runs locally; tests pass; docs exist | ✅ **done** |
| 2 | Real AWS: Bedrock adapter, DynamoDB stores, S3 evidence, IAM-fenced identity, smoke script | One real Bedrock call, one real DB roundtrip, one private S3 roundtrip acknowledged | ✅ **done, 1 exception:** storage + evidence + scoped identity all verified (`smoke_live` 4/5, `test_live_store` 2/2 as scoped identity); **Bedrock inference is blocked by an AWS account-level security restriction** — root-caused with AWS-doc citations ([AWS_EVIDENCE.md](AWS_EVIDENCE.md)); support case is the only resolution path; adapter unblocks with zero code change |
| 3 | Teach: voice/text/photo/camera → draft → confirm → persisted skill | 6 arbitrary items taught→saved→reloaded match; image yields real analysis; no hardcoding | ⏳ next — start with the Bedrock-independent parts (draft→confirm→persist works against live DynamoDB today) |
| 4 | Recall & verification: memory retrieval, missing-item comparison, sessions, sharing UX | Phrase query "going to an event…" returns stored list + unconfirmed items | ⬜ |
| 5 | Browser teaching & guided learning (PhotoShare demo app) | Two separate sessions prove teach→learner handoff; wrong click blocks | ⬜ |
| 6 | Agent orchestration (Strands+Bedrock) + MCP server (Streamable HTTP, spec ≥2025-11-25) | Independent MCP client exercises tools; trace view shows real calls | ⬜ |
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

- Nova 2 Lite availability/entitlement in us-east-1 unknown until real probe (Phase 2 starts there).
- `aws login` needs the user's own browser + MFA; agent cannot and must not do this.
- MCP protocol version support must be *verified*, in writing, before claiming compliance.
- AWS spend: on-demand DynamoDB + minimal S3; no EC2; budget alert before Phase 2.
