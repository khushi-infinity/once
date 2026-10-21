# AWS Evidence — how judges can verify ONCE really uses AWS

This file is the running ledger of **runtime** proof. An AWS logo here is not
evidence; each row must point to a shipped command, endpoint, or console view
a judge can reproduce.

| # | Claim | Evidence mechanism (to be filled in Phase 2) | Status |
| --- | --- | --- | --- |
| 1 | Real Bedrock inference (model ID + request ID) | smoke test output + backend trace view | ⬜ pending Phase 2 |
| 2 | Real DynamoDB write/read of a skill | smoke script + DynamoDB console walkthrough | ⬜ pending Phase 2 |
| 3 | Private S3 evidence roundtrip | smoke script + upload-time consent flow | ⬜ pending Phase 2 |
| 4 | MCP tool calls over Streamable HTTP (spec ≥ 2025-11-25) | independent MCP client transcript | ⬜ pending Phase 6 |
| 5 | Modes are not conflated | `/health` reports `app_mode`; `live` failures surface, never faked | ✅ visible today |

Nothing in this table is claimed as passing before a real runtime check.
