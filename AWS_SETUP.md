# AWS Setup (ONCE)

> **Who does what:** account creation, browser sign-in, MFA, billing, budgets and
> `aws login` are **performed by the developer**. Coding agents may run approved,
> read-only identity checks and resource scripts *after* credentials exist locally,
> and must never print tokens or hold root credentials.

## Step A — account safety (human)

1. AWS Account → enable **MFA** on the root user, then create a daily-use IAM user.
2. Billing → confirm credits & Free Tier; create a small **AWS Budget with email alerts** (target ≤ $10) before anything billable happens.
3. Region for development: **us-east-1** unless found otherwise.

## Step B — Bedrock model access (human verifies in console)

- Console → Amazon Bedrock → *Model catalog* → **Amazon Nova 2 Lite** (`amazon.nova-2-lite-v1:0`) → run one text + one image prompt in the playground.
- Document result in AWS_EVIDENCE.md; record an immediate fallback model if access is denied.

## Step C — local authentication (human + agent)

AWS CLI ≥ 2.32 required (**installed: 2.37.5** ✔).

```bash
aws login                 # browser-based, short-term credentials (auto-rotate)
aws sts get-caller-identity
```

The agent may run these commands for/with the developer; the browser step is human.
Root users do not need `SignInLocalDevelopmentAccess`; IAM users do.

## Step D — least-privilege IAM (Phase 2)

Dev identity needs roughly: `bedrock:InvokeModel/WithResponseStream` on the
model, `dynamodb:*`-subset on `ONCE_Skills`/`ONCE_Sessions`, `s3:PutObject/GetObject` on
the evidence bucket prefix. Fine-grained policy JSON lands in Phase 2 as an
IAM-fenced role for the deployed backend; the dev user keeps least privilege.

## Cost posture

- **No** EC2, SageMaker, AgentCore, vector DBs unless a proven need arises.
- DynamoDB **on-demand**; S3 private bucket with restricted uploads; Bedrock is
  metered — real calls during dev, bounded via retries and prompt sizes.
- Cleanup script at Phase end deletes test items/objects only, never user data.
