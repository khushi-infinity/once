# ONCE: Build Plan (deadline Oct 23, 2026 12:00 PM PDT)

Working sequence; each phase has a done-criterion checked as real, not aspirational.

| # | Phase | Done criterion | State |
| --- | --- | --- | --- |
| 1 | Foundation: specs, models, backend, frontend, tests | App runs locally; tests pass; docs exist | ✅ **done** |
| 2 | Real AWS: DynamoDB stores, S3 evidence, IAM-fenced identity, smoke script; AI inference via labeled provider | One real DB roundtrip, one private S3 roundtrip acknowledged | ✅ **done**, 3 DynamoDB tables + private S3 + scoped identity verified (`smoke_live` **4/4**, live pytest **25 passed, 1 skipped** as `once-local`). Bedrock removed after the account-level restriction made inference impossible |
| 3 | Teach: voice/text/photo → draft → confirm → persisted skill | 6 arbitrary items taught→saved→reloaded match; image yields real analysis; no hardcoding | ✅ **done**, `/` teaches by text, browser speech or photo; real extraction via OpenRouter (`google/gemini-3.8-flash` text + vision) with engine metadata; local Ollama remains the explicit fallback; six-item roundtrip test added |
| 4 | Recall & verification: memory retrieval, missing-item comparison, sessions, sharing UX | Phrase query "going to an event…" returns stored list + unconfirmed items | ✅ **done**, `/recall` grounds on the stored skill, matches aliases, lists not-confirmed required items and never claims proof of absence; sharing enforced server-side |
| 5 | Browser teaching & guided learning (PhotoShare demo app) | Two separate sessions prove teach→learner handoff; wrong click blocks | **Removed at product direction (2026-10-22)**. The backend learning engine and tests remain, but the PhotoShare UI and seed are gone |
| 6 | MCP server (Streamable HTTP, spec ≥2025-11-25) + tool orchestration | Independent MCP client exercises tools; real calls visible | ✅ **MCP done**, 9 tools, protocol **2025-11-25**, 9-check independent client smoke, plus a real browser MCP client at `/alexa` with visible JSON-RPC traffic. The added tool is `once_get_agent_skill`. Strands agent framework intentionally **not** claimed: its model providers need cloud inference that this account cannot use; orchestration is explicit Python (extract → confirm → persist → recall), labeled honestly |
| 7 | UI polish pass | Type check + build clean; flows tested desktop+mobile; no dead buttons | ✅ **done**, production build + ESLint clean; Playwright checks for `/alexa`, `/recall`, and `/skills` passed with no console errors; recall copy now says **not confirmed**, not "missing" |
| 8 | Agent Skill export + native macOS window guide | Portable `SKILL.md`/zip from the stored record; native helper builds and makes a real vision call | ✅ **done**, `GET /api/skills/{id}/agent-skill`, MCP `once_get_agent_skill`, web download, and `macos/OnceWindow` with one-window capture and save-as-skill. 25 live / 24 mock tests, 9 MCP checks |
| 9 | Release: e2e audit, evidence docs, friction log, demo video, submit | README/AWS_EVIDENCE/TESTING/SUBMISSION complete; judge checklist passes | 🟡 **in progress**, docs + evidence complete; demo video and final Devpost form remain (hosted URL not required by the FAQ) |

## Verification commands

```bash
cd backend && uv run ruff check . && APP_MODE=mock uv run pytest   # 24 pass, 2 skip
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run pytest   # 25 pass, 1 skip
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run python scripts/mcp_smoke.py  # 9 MCP checks
cd frontend && npm run lint && npm run build
./scripts/build-macos.sh                                           # native helper
```

## Risks tracked

- Free/local inference can be slow or unavailable; the API surfaces that honestly (502/503) instead of substituting a fake result.
- `aws login` needs the user's own browser + MFA; the agent cannot and must not do this.
- MCP protocol version is verified in writing by the smoke client (**2025-11-25**).
- AWS spend: on-demand DynamoDB + minimal S3; no EC2; no Bedrock.
