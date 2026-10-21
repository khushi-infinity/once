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
| 5 | Live-mode store tests incl. authorization (share → learner reads → revoke → blocked → owner delete) | `APP_MODE=live AWS_PROFILE=once-local uv run pytest` | **PASS (11/11)** |
| 6 | Agent + MCP tool calls | Phase 6 deliverable | pending |

## Which AWS services ONCE actually uses (AWS Builder answer)

- **Amazon DynamoDB** — the product's memory: every skill, share grant, learner
  session and progress record. On-demand tables + GSIs; no scans.
- **Amazon S3** — consented teaching evidence (photos/screenshots) in a fully
  private bucket; skill records store object *references* only.
- **AWS IAM** — the backend runs with a scoped identity (policy committed at
  `backend/scripts/once-runtime-iam-policy.json`); no root, no keys in the app.
- **AWS STS** — identity verification in the smoke test.
- Infrastructure is created idempotently by `backend/scripts/provision_aws.py`.

## AI inference (what is *not* AWS, stated plainly)

AI inference runs on **Google AI Studio's free tier (Gemini)** — not AWS. This is
deliberate and labeled everywhere (API `engine` metadata, `/health`, UI):

- The developer's AWS account carries an outstanding account-level restriction
  that makes every Bedrock model invocation fail (`ValidationException: Operation
  not allowed`); AWS Service Quotas show all model-inference quotas at `0.0`, and
  AWS documentation states such restrictions are not resolvable via IAM or
  model-access settings. Full write-up: [FRICTION_LOG.md](FRICTION_LOG.md) entry 1.
- ONCE therefore does not claim Bedrock usage anywhere. Judging claims are limited
  to the services above, each with a reproducible check.
