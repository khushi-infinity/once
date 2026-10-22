# AWS Setup (ONCE)

> **Who does what:** account creation, browser sign-in, MFA, billing, budgets and
> `aws login` are **performed by the developer**. Coding agents may run approved,
> read-only identity checks and resource scripts *after* credentials exist locally,
> and must never print tokens or hold root credentials.

## Step A: account safety (human)

1. AWS Account → enable **MFA** on the root user.
2. Billing → verify a **payment method** and check which account plan you are on.
3. Billing → create a small **AWS Budget with email alerts** (target ≤ $10).
4. Region for development: **us-east-1**.

## Step B: local authentication (human + agent)

AWS CLI ≥ 2.32 required (**installed: 2.37.5** ✔).

```bash
aws login                 # browser-based, short-term credentials (auto-rotate)
aws sts get-caller-identity --profile once
```

**Identity lesson (2026-10-21):** `aws login` on a personal account attaches to the
**root identity**, and root sessions **cannot** `sts:AssumeRole` ("Roles may not be
assumed by root accounts"). The login session ("once" profile) is therefore used for
one-time admin work only: provisioning, IAM setup. The app itself never runs as root.

## Step C: least-privilege runtime identity (one-time admin)

The backend runs as a scoped IAM user `once-local`:

```bash
aws iam create-user --profile once --user-name once-local --tags Key=project,Value=once

aws iam put-user-policy --profile once --user-name once-local --policy-name once-runtime \
  --policy-document file://backend/scripts/once-runtime-iam-policy.json

aws iam create-access-key --profile once --user-name once-local --output json
# put the two values into ~/.aws/credentials under [once-local]; never into this repo
```

The exact policy is committed at
[backend/scripts/once-runtime-iam-policy.json](backend/scripts/once-runtime-iam-policy.json):

| Statement | Scope |
| --- | --- |
| DynamoDB | item-level `Get/Put/Update/Delete/Query/ConditionCheck` on `ONCE_Skills`, `ONCE_Sessions`, `ONCE_Grants` + the two GSIs only |
| S3 | `GetObject/PutObject/DeleteObject` on `s3://once-evidence-<account>` objects only |

No IAM/admin/bucket-level powers; no table `Describe*` (needed only by the one-time
provisioning script, run with the admin session). Verify:
`aws sts get-caller-identity --profile once-local` → `...:user/once-local`.

## Step D: provision infrastructure (idempotent)

```bash
cd backend && AWS_PROFILE=once uv run python scripts/provision_aws.py
```

Creates (checking-before-creating): DynamoDB `ONCE_Skills` (PK `skillId`, GSI
`owner-index`, on-demand), `ONCE_Sessions` (PK `sessionId`, GSI
`skill-learner-index`, on-demand), `ONCE_Grants` (PK `learnerId`, SK `skillId`,
on-demand), and the private evidence bucket (all four public-access blocks,
default SSE-S3, no bucket policy).

## Step E: AI inference (explicit provider)

Bedrock is not used (see [AWS_EVIDENCE.md](AWS_EVIDENCE.md#ai-inference-what-is-not-aws-stated-plainly)).
Pick exactly one provider in `backend/.env`:

**Local, free, no key (default for the demo):**

```bash
ollama pull qwen2.5-coder:7b
ollama pull qwen2.5vl:3b
INFERENCE_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=qwen2.5-coder:7b
OPENAI_VISION_MODEL=qwen2.5vl:3b
```

**Gemini free tier (optional):**

1. Open **https://aistudio.google.com** → *Get API key* → create a free key.
2. `INFERENCE_PROVIDER=gemini` and `GEMINI_API_KEY=...` in `backend/.env`.
3. If the key's project is denied or the key is missing, extraction returns an
   honest `503`/`502`; skills/recall keep working. There is no silent fallback.

## Cost posture

- **No** Bedrock, EC2, SageMaker, AgentCore or vector DBs are used.
- DynamoDB **on-demand** (tests write+delete a handful of tiny items); S3 private
  bucket for consented evidence only.
- AI inference runs on the provider's free tier; no paid AI API is required.
- Cleanup: smoke tests delete everything they created.
