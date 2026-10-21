# ONCE — Developer Friction Log

Genuine setup/tooling friction encountered while building ONCE with AWS services
(hackathon developer-feedback submission). Every entry is real, dated, and
reproduced with raw errors — nothing polished after the fact.

Environment for all entries: macOS (Apple Silicon), AWS CLI v2.37.5, Python 3.14,
account built Oct 2026 (account `552952091217`, region us-east-1 primary).

---

## 1. Amazon Bedrock blocked at the account level — invisible, un-self-serve-able (BLOCKER)

- **Date/Time:** 2026-10-21 (discovered ~15:00 IST, root-caused ~18:00 IST)
- **What happened:** Every Bedrock Runtime invocation returns
  `ValidationException: Operation not allowed` for **every model and every identity type**:
  - `amazon.nova-2-lite-v1:0` (direct id), `us.amazon.nova-2-lite-v1:0` (required US
    inference profile), `amazon.nova-lite-v1:0`, `amazon.nova-micro-v1:0` — all fail.
  - Failed identically as **root** session and as a **least-privilege IAM user**
    whose policy demonstrably allowed `bedrock:Converse` on the routed resource
    (`arn:aws:bedrock:us-east-2::foundation-model/amazon.nova-2-lite-v1:0`).
  - Failed in us-east-1 and ap-south-1.
- **Ruled out, with proof:**
  1. IAM permissions — a *wrong* policy surfaces the normal `AccessDeniedException`;
     once the policy is sufficient, the service returns `Operation not allowed`.
     So the block sits *after* IAM authorization.
  2. Organization restrictions — `organizations describe-organization` →
     `AWSOrganizationsNotInUseException` (account in no org; no SCP possible).
  3. Model access/EULA — new `list-foundation-model-agreement-offers`
     API → `ValidationException: Agreement not supported for this model`.
     There is no agreement to accept for Amazon models.
  4. Wrong model id type — Nova 2 Lite is `INFERENCE_PROFILE`-only per
     `list-foundation-models`; we use the correct `us.` profile id. Still blocked.
- **Positive indicator (AWS's own):** `service-quotas list-service-quotas
  --service-code bedrock` shows **every model-inference quota = 0.0** for this
  account (e.g. "On-demand model inference tokens per minute for Amazon Nova
  Lite = 0.0", "Cross-region … for Amazon Nova 2 Lite = 0.0"), which matches the
  documented account-restriction appearance (repost.aws KC "How do I
  troubleshoot InvokeModel API errors in Amazon Bedrock?" → *Account security
  restriction error*): these restrictions *"don't appear in the Amazon Bedrock
  console and can't be resolved through IAM permissions or model access
  settings"* — resolution is *"contact AWS Support"*.
- **Impact:** ONCE's core teach-by-voice/photo AI pipeline has no inference
  provider today. Storage, evidence and identity all work; only inference is gated.
- **Worked around?** No in-account fix exists. Decision: remove Bedrock from
  the product entirely rather than ship a permanently blocked dependency, and
  run inference on a clearly-labeled free-tier provider (API `engine`
  metadata, `/health`, UI). The AWS story stays on the verified data layer
  (DynamoDB, S3, IAM). This entry is kept because it is genuine Amazon
  developer-tooling feedback — not a product claim.
- **Suggestion to AWS:** expose the restriction **in the Bedrock console**
  (banner: "your account has a security restriction: quota 0") and/or an API:
  a single `GetModelAccessStatus` read that names the cause and the next step.
  Right now the only path to that knowledge is reading ~1,100 quota rows or a
  support ticket.

### Prerequisite check that surfaced alongside EC1
The same KC article lists **"a valid payment method"** as a model-access
prerequisite. We verified our config via console (Billing → payment methods)
and re-tested after ensuring a valid card was attached.

---

## 2. `aws login` produces a ROOT session for personal accounts — a security footgun

- **Date:** 2026-10-21
- **What happened:** `aws login` on a personal account was only ever attachable
  to the root identity: the resulting profile is
  `arn:aws:iam::<account>:root` (this is also printed in `.aws-login.log`).
  There is no in-flow choice to log in as a named IAM user.
- **Impact:** An agent-friendly "temporary credentials" flow silently delivers
  the most-privileged identity. We then had to hand-build the scoped
  `once-local` IAM user ourselves (see AWS_SETUP.md) so the app never runs as root.
- **Worse:** root sessions **cannot** `sts:AssumeRole` ("Roles may not be
  assumed by root accounts"), so the standard "log in then assume a scoped
  role" pattern is impossible — the only least-privilege path for local dev is
  a long-lived IAM-user key, which the login flow was presumably designed to avoid.
- **Suggestion:** `aws login` should offer an identity picker (account root vs
  IAM users) — or support assuming a specified role — and by default warn
  prominently when the resolved identity is `:root`.

## 3. `--help` on some newer Bedrock CLI commands runs ParamValidation

- **Date:** 2026-10-21
- **What happened:** `aws bedrock list-foundation-model-agreement-offers --help`
  printed an execution error (`the following arguments are required: --model-id`)
  instead of the help text, on two attempts. Help should always be inert.
- **Impact:** Discovery cost — we had to infer parameter shapes from errors.
- **Suggestion:** make `--help` short-circuit validation for all new commands.

## 4. No account-level "model access status" for Bedrock

- **Date:** 2026-10-21
- **What happened:** diagnosing the block in entry 1 required: IAM experiments,
  org lookup, the (brand-new, undocumented-in-Cheat-sheet) agreement API,
  `list-foundation-models` cross-referencing, and a scan of 1,107 quota rows.
- **Suggestion:** one read API + a console card (see entry 1's suggestion).

## 5. Model-access renewal from console had no observable effect (and no feedback)

- **Date:** 2026-10-21 (session prior)
- **What happened:** with the block in place, re-subscribing from the console's
  model-access UI produced no error, no progress indication and no change in
  the API behavior — consistent with the restriction being out-of-band, but
  indistinguishable from an unnoticed UI refresh.
- **Suggestion:** the console should tell the user whether the model-access
  "subscribe" action actually changed anything (request ID surfaced).

---

*Entries in this file count only what we could not self-serve around before
documenting it. Where we found a documented resolution later, the entry is
edited to include the link.*
