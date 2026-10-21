# AWS Evidence — how judges can verify ONCE really uses AWS

Reproduce everything below with:

```bash
cd backend && APP_MODE=live AWS_PROFILE=once-local uv run python scripts/smoke_live.py
```

Infrastructure recreation (idempotent, one-time admin):

```bash
cd backend && AWS_PROFILE=once uv run python scripts/provision_aws.py
```

Last run: 2026-10-21, runtime identity `arn:aws:iam::552952091217:user/once-local`
(least-privilege IAM user — the app never runs as root; see AWS_SETUP.md).

## Verified claims

| # | Claim | Evidence mechanism | Status |
| --- | --- | --- | --- |
| 1 | Valid AWS identity via least-privilege IAM user | smoke check `aws_identity` — prints account + ARN | **PASS** |
| 2 | Real DynamoDB write + read of a skill record | smoke check `dynamodb_skill_write_read` on table `ONCE_Skills` (PK `skillId`, GSI `owner-index`, on-demand) | **PASS** |
| 3 | Real DynamoDB write + read of a session record | smoke check `dynamodb_sessions_write_read` on table `ONCE_Sessions` (PK `sessionId`, GSI `skill-learner-index`) | **PASS** |
| 4 | Private S3 evidence roundtrip | smoke check `s3_private_roundtrip` — upload + read back + **verifies the object is not publicly readable**; bucket has all four PublicAccessBlock switches on + default SSE-S3 + no bucket policy | **PASS** |
| 5 | Share-grant table supports learner-side listing without scans | `ONCE_Grants` (PK `learnerId`, SK `skillId`); live test share → learner lists → revoke → blocked | **PASS** |
| 6 | Live-mode store + API tests incl. authorization and target-aware verification | `APP_MODE=live AWS_PROFILE=once-local uv run pytest` | **PASS (16/16)** |
| 7 | MCP tool calls over Streamable HTTP | `uv run python scripts/mcp_smoke.py` — independent client, protocol **2025-11-25**, 8 checks | **PASS** |

## Which AWS services ONCE actually uses (AWS Builder answer)

- **Amazon DynamoDB** — the product's memory: skills, share grants, learner
  sessions and progress. Three on-demand tables + GSIs; queries only, no scans.
- **Amazon S3** — consented teaching evidence in a fully private bucket; skill
  records store object references only.
- **AWS IAM** — the backend runs with a scoped identity (policy committed at
  `backend/scripts/once-runtime-iam-policy.json`); no root, no keys in the app.
- **AWS STS** — identity verification in the smoke test.
- Infrastructure is created idempotently by `backend/scripts/provision_aws.py`.

## AI inference (what is *not* AWS, stated plainly)

AI inference does **not** run on AWS and ONCE never claims that it does. The
provider is selected explicitly and labeled in every response (`engine`),
`/health` and the UI:

- `openai-compatible` — local Ollama by default (`qwen2.5-coder:7b` for text,
  `qwen2.5vl:3b` for photos); works unchanged with Groq/OpenRouter/any hosted
  OpenAI-compatible endpoint.
- `gemini` — Google AI Studio free tier via the Interactions API.

Why Bedrock is absent: the developer's AWS account carries an account-level
restriction that makes every Bedrock model invocation fail
(`ValidationException: Operation not allowed`); AWS Service Quotas show all
model-inference quotas at `0.0`, and AWS documentation states such restrictions
are not resolvable via IAM or model-access settings. Full write-up:
[FRICTION_LOG.md](FRICTION_LOG.md) entry 1. The adapter was removed rather than
shipped dead. Judging claims are limited to the services above, each with a
reproducible check.
