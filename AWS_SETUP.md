# AWS Setup (ONCE)

> **Who does what:** account creation, browser sign-in, MFA, billing, budgets and
> `aws login` are **performed by the developer**. Coding agents may run approved,
> read-only identity checks and resource scripts *after* credentials exist locally,
> and must never print tokens or hold root credentials.

## Step A — account safety (human)

1. AWS Account → enable **MFA** on the root user.
2. Billing → **verify a valid payment method is attached** (documented Bedrock
   model-access prerequisite — see FRICTION_LOG entry 1) and check which account
   plan you are on (a "Free plan" account restricts some services).
3. Billing → create a small **AWS Budget with email alerts** (target ≤ $10).
4. Region for development: **us-east-1**.

## Step B — local authentication (human + agent)

AWS CLI ≥ 2.32 required (**installed: 2.37.5** ✔).

```bash
aws login                 # browser-based, short-term credentials (auto-rotate)
aws sts get-caller-identity --profile once
```

**Important identity lesson (discovered 2026-10-21):** `aws login` on a personal
account attaches to the **root identity**, and root sessions **cannot** `sts:AssumeRole`
("Roles may not be assumed by root accounts"). So ONCE never runs its app code with
that session. The login session ("once" profile) is used for one-time admin work only:
provisioning (`scripts/provision_aws.py`), IAM setup, and this session's account checks.

## Step C — least-privilege runtime identity (one-time admin via the login session)

The backend runs as a scoped IAM user `once-local` — never root:

```bash
aws iam create-user --profile once --user-name once-local --tags Key=project,Value=once

aws iam put-user-policy --profile once --user-name once-local --policy-name once-runtime \
  --policy-document file://backend/scripts/once-runtime-iam-policy.json

aws iam create-access-key --profile once --user-name once-local \
  --output json | aws configure set --profile once-local \
  aws_access_key_id /dev/stdin   # or copy into ~/.aws/credentials manually (never into this repo)
```

The exact policy (also in [backend/scripts/once-runtime-iam-policy.json](backend/scripts/once-runtime-iam-policy.json)):

| Statement | Scope |
| --- | --- |
| Bedrock | `bedrock:Converse/InvokeModel*` on `foundation-model/amazon.nova-*` + `inference-profile/us.amazon.nova-*` (Nova family only) |
| DynamoDB | item-level `Get/Put/Update/Delete/Query/ConditionCheck` on `ONCE_Skills`, `ONCE_Sessions` + their indexes only |
| S3 | `GetObject/PutObject/DeleteObject` on `s3://once-evidence-<account>` objects only |

Deliberately **not** grantable root powers: no `Describe*`/`List*` on tables
(required only for the one-time provisioning script), no bucket-level deletes,
no IAM, no org. Verify: `aws sts get-caller-identity --profile once-local`
should show `...:user/once-local`.

## Step D — provision infrastructure (idempotent)

```bash
cd backend && AWS_PROFILE=once uv run python scripts/provision_aws.py
```

Creates (checking-before-creating): DynamoDB `ONCE_Skills` (PK `skillId`, GSI
`owner-index`, on-demand), `ONCE_Sessions` (PK `sessionId`, GSI
`skill-learner-index`, on-demand), and the private evidence bucket (all four
public-access blocks, default SSE-S3, no bucket policy).

## Step E — Bedrock model access (human verifies in console)

- Console → Amazon Bedrock → *Model catalog* → **Amazon Nova 2 Lite** → run one
  text + one image prompt in the playground.
- If the playground or `smoke_live.py` fails with
  `ValidationException: Operation not allowed`, your account has the documented
  **account-level security restriction** — invisible in the console, not
  fixable via IAM/model-access. Path: AWS Support/Sales. Full root-cause chain:
  [AWS_EVIDENCE.md](AWS_EVIDENCE.md), [FRICTION_LOG.md](FRICTION_LOG.md) entry 1.
- Check the tell-tale: Service Quotas → **Bedrock** — all model-inference quotas
  showing `0` is this restriction; non-zero means the model needs normal
  one-time access setup.

## Cost posture

- **No** EC2, SageMaker, AgentCore, vector DBs unless a proven need arises.
- DynamoDB **on-demand** (smoke/pytest write+delete a handful of tiny items);
  S3 private bucket; Bedrock is metered when unlocked — retries are bounded
  (2) and prompts short.
- Cleanup: smoke tests delete everything they created; nothing persistent is
  left behind by test runs.
