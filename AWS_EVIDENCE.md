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

| # | Claim | Evidence mechanism | Status |
| --- | --- | --- | --- |
| 1 | Valid AWS identity via least-privilege IAM user | smoke check `aws_identity` — prints account + ARN | **PASS** |
| 2 | Real DynamoDB write + read of a skill record | smoke check `dynamodb_skill_write_read` on table `ONCE_Skills` (PK `skillId`, GSI `owner-index`, on-demand) | **PASS** |
| 3 | Real DynamoDB write + read of a session record | smoke check `dynamodb_sessions_write_read` on table `ONCE_Sessions` (PK `sessionId`, GSI `skill-learner-index`) | **PASS** |
| 4 | Private S3 evidence roundtrip | smoke check `s3_private_roundtrip` — upload + read back + **verifies the object is not publicly readable**; bucket has all four PublicAccessBlock switches on + default SSE-S3 + no bucket policy | **PASS** |
| 5 | Live-mode store tests incl. authorization (share → learner reads → revoke → blocked → owner delete) | `APP_MODE=live AWS_PROFILE=once-local uv run pytest tests/test_live_store.py` | **PASS (2/2)** |
| 6 | Real Bedrock inference | smoke check `bedrock_inference` (model id + duration + AWS request id) | **BLOCKED — account-level restriction, full record below**. Meanwhile `/api/teach/extract` can run on a **clearly-labeled free-tier fallback** (`INFERENCE_PROVIDER=gemini`, operator-set env var, never auto-selected; engine metadata in every API response) or on the labeled deterministic-mock parser in mock mode. |
| 7 | Real agent + MCP tool calls | Phase 6 deliverable | pending |

## The Bedrock blocker (truthful record, root-caused 2026-10-21)

**Symptom.** Every Bedrock Runtime invocation returns
`ValidationException: Operation not allowed` in this account — for every model id
(`us.amazon.nova-2-lite-v1:0`, `amazon.nova-lite-v1:0`, `amazon.nova-micro-v1:0`,
direct ids and inference profiles) and in every probed region
(us-east-1, us-west-2, ap-south-1).

**What we ruled out, in order, with evidence:**

| Hypothesis | Test | Result |
| --- | --- | --- |
| IAM permissions missing | Least-privilege IAM user `once-local` without Bedrock rights | Normal `AccessDeniedException` naming the missing action — normal IAM behavior |
| IAM still, after full authorization | Same user, policy covering `bedrock:Converse` on the exact routed resource | **Same** `Operation not allowed` → the block sits *after* IAM |
| Organization SCP / declarative policy | `organizations describe-organization` | `AWSOrganizationsNotInUseException` — account in no org |
| Missing model agreement/EULA | `list-foundation-model-agreement-offers` | `ValidationException: Agreement not supported for this model` — nothing to accept for Amazon models |
| Mistake in model id form | `list-foundation-models` | Nova 2 Lite is `INFERENCE_PROFILE`-only; the correct `us.` profile id was already in use |
| Root-identity quirk | Re-test as scoped IAM user | Identical failure — not identity-specific |

**Positive indicator (documented, AWS's own).** The Service Quotas for
`bedrock` in this account show **every model-inference quota as 0.0**
(including "On-demand model inference tokens per minute for Amazon Nova Lite"
and both cross-region and global quotas for Amazon Nova 2 Lite), exactly the
indicator in the AWS Knowledge Center article *"How do I troubleshoot
InvokeModel API errors in Amazon Bedrock?"* → **Account security restriction
error**, which states these restrictions *"don't appear in the Amazon Bedrock
console and can't be resolved through IAM permissions or model access
settings"* and directs to AWS Support. The same article's prerequisites
(checklist: Marketplace permissions, Anthropic FTU form — N/A — and **a valid
payment method**) were checked in the console; none changed the result.
Full chain in [FRICTION_LOG.md](FRICTION_LOG.md) entry 1.

**What ONCE ships while the case is open.** Per the no-silent-substitution rule:
- The full live pipeline works end-to-end for storage: skills + learner sessions
  persist in real DynamoDB (GSI-backed), evidence lands in real private S3,
  verified with a **least-privilege runtime identity** — stronger proof, not weaker.
- The Bedrock adapter is implemented and wired
  ([backend/app/services/bedrock.py](backend/app/services/bedrock.py)): the moment
  model access is granted, the same code path starts making real calls —
  zero code change, only `Support` unlocking the account.
- `APP_MODE` stays honest: Bedrock-dependent features surface real errors
  instead of fake output; nothing pretends an inference happened.
- This row flips to **PASS only by a real, logged inference
  (model id + duration + AWS request id)** — never by a manual note.

## What this honestly means for the demo

- Demo Experience A (packing recall) works end-to-end on real AWS storage with
  typed user confirmations; AI extraction shows its real error state until the
  support case resolves.
- If the restriction persists into judging, the honest degradation is visible
  in the UI, and the reliance claim is scaled back truthfully — AWS Builder
  evidence remains DynamoDB + S3 + IAM + the adapter itself.
