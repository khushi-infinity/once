# Deploying ONCE

The app is two containers: a FastAPI backend (HTTP API plus the MCP app at
`/mcp`) and a Next.js frontend. Data stays in the existing DynamoDB tables and
private S3 bucket. Inference goes to an explicitly selected provider; the
deployable cloud path is OpenRouter.

There is no login in this build. The public demo uses demo identity labels and
non-sensitive demo skills. If you put it on the public internet, put an access
control in front of it (Caddy basic auth, ALB/Cognito auth, or a private demo
network) and do not store real personal data.

## Current deployment: AWS App Runner

The shipped public demo is live in account `552952091217`, region `us-east-1`:

| Piece | Value |
| --- | --- |
| Frontend | `https://nrsvfngagk.us-east-1.awsapprunner.com` |
| Backend / MCP | `https://m7ypexbma7.us-east-1.awsapprunner.com` |
| ECR images | `552952091217.dkr.ecr.us-east-1.amazonaws.com/once-backend:latest`, `.../once-frontend:latest` |
| Backend instance role | `arn:aws:iam::552952091217:role/once-apprunner-backend-instance` |
| ECR access role | `arn:aws:iam::552952091217:role/once-apprunner-ecr-access` |
| OpenRouter secret | `arn:aws:secretsmanager:us-east-1:552952091217:secret:once/openrouter-api-key-QAAKeB` |
| Auto scaling | `once-demo-autoscaling`, min 1, max 2, concurrency 20 |

The backend role is scoped to the three DynamoDB tables, the evidence bucket,
and read access to that one secret. The frontend has no instance role and no
AWS credentials. Both images are `linux/amd64`. The frontend image was built
with `BACKEND_URL` and `MCP_URL` set to the backend App Runner URL.

Bootstrap caveat: the resources were created while signed in as the account
root identity because that was the only identity with create permissions
available at the deadline. The running services do **not** use root. A
long-lived deployment should replace the bootstrap session with a scoped
deployment role and remove root access keys. The runtime role is already
least-privilege and is the security boundary that matters for the app.

Cost note: App Runner has no scale-to-zero. At the current 0.5 vCPU / 1 GB
configuration, two services bill while they run. Pause or delete the services
after judging if the demo does not need to stay online.

## Choose a target

| Option | Best for | Cost / effort | Trade-off |
| --- | --- | --- | --- |
| **App Runner (backend + frontend)** | The shipped demo | Low ops, two managed URLs | No scale-to-zero; two services to wire |
| **Single EC2 + Docker Compose + Caddy** | Lowest ongoing cost | About 15 minutes | One host, manual TLS/domain, no autoscaling |
| **ECS Fargate + ALB** | A production-shaped AWS deployment | Highest setup cost | Most control, scales, proper health checks |
| **App Runner backend + Vercel frontend** | Fastest frontend deploy | Free/low cost | Frontend is not AWS; backend and data are |

The shipped demo uses **App Runner for both containers** because it gives
managed HTTPS URLs without owning a domain. Use EC2 + Compose if you want the
lowest bill, or ECS if you want a production-shaped deployment.

## What the deployment needs

Backend environment:

```dotenv
APP_MODE=live
AWS_REGION=us-east-1
AWS_PROFILE=
DYNAMODB_SKILLS_TABLE=ONCE_Skills
DYNAMODB_SESSIONS_TABLE=ONCE_Sessions
DYNAMODB_GRANTS_TABLE=ONCE_Grants
S3_EVIDENCE_BUCKET=once-evidence-552952091217
CORS_ORIGINS=https://your-frontend.example.com
MCP_ALLOWED_HOSTS=localhost:*,127.0.0.1:*,your-backend.example.com
MCP_ALLOWED_ORIGINS=https://your-frontend.example.com

INFERENCE_PROVIDER=openrouter
INFERENCE_FALLBACK_PROVIDER=
INFERENCE_MAX_TOKENS=2048
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=replace-me
OPENROUTER_MODEL=google/gemini-3.8-flash
OPENROUTER_VISION_MODEL=google/gemini-3.8-flash
```

Do not copy a local `backend/.env` that contains `AWS_PROFILE=once-local` or
local Ollama settings. In the cloud, `AWS_PROFILE` must be empty so the
container uses the instance or task role.

Frontend build arguments:

- `BACKEND_URL`: the backend base URL the Next.js server proxies to.
- `MCP_URL`: the backend base URL for `/mcp`.

When both containers share a Docker network, use `http://backend:8000`. When
they are separate managed services, use the backend's public HTTPS URL and
rebuild the frontend, because Next.js records rewrite destinations at build
time.

## Option A: single EC2 host (recommended for the deadline)

1. Launch Ubuntu 24.04 on a `t3.small` (or `t3.medium` if you want headroom).
   Open ports 22, 80 and 443. Allocate an Elastic IP and point a domain's `A`
   record at it.
2. Attach an IAM instance profile whose policy is
   `backend/scripts/once-runtime-iam-policy.json`. The backend then uses the
   instance role through the standard credential chain. No AWS keys go in the
   image or the frontend.
3. Install Docker and the Compose plugin, then clone the repo:

   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker "$USER"
   git clone https://github.com/khushi-infinity/once.git
   cd once
   ```

4. Create `backend/.env` from `.env.example` with the backend environment
   above. Keep it readable only by the deploy user (`chmod 600`).
5. Start the stack with TLS:

   ```bash
   DOMAIN=demo.example.com docker compose --profile https up -d --build
   ```

6. Check the real services:

   ```bash
   curl -fsS https://demo.example.com/health
   curl -fsS https://demo.example.com/api/skills
   ```

   `/health` must say `app_mode: live` and provider `openrouter`. If it says
   `deterministic-mock`, `APP_MODE` is wrong.

Caddy obtains a certificate for the domain. The Caddyfile proxies everything to
the Next.js container, which proxies `/api`, `/health` and `/mcp` to the
backend. If you want to add a shared demo password, put Caddy `basic_auth` in
front of the site and give judges the credential separately. Generate a hash
with `caddy hash-password` and add it to the site block in
`deploy/Caddyfile`:

```caddyfile
basic_auth {
    demo $2a$14$replace_with_a_real_bcrypt_hash
}
```

That gate protects both the UI and the API. It is not user-level
authentication, but it stops anonymous writes to a public demo.

## Option B: App Runner backend + frontend (the shipped path)

1. Create ECR repositories and push both images. Build for the App Runner
   runtime architecture:

   ```bash
   aws ecr create-repository --repository-name once-backend
   aws ecr create-repository --repository-name once-frontend
   aws ecr get-login-password --region us-east-1 \
     | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

   docker build --platform linux/amd64 -t once-backend ./backend
   docker tag once-backend:latest <account>.dkr.ecr.us-east-1.amazonaws.com/once-backend:latest
   docker push <account>.dkr.ecr.us-east-1.amazonaws.com/once-backend:latest
   ```

2. Create the App Runner ECR access role with the managed
   `AWSAppRunnerServicePolicyForECRAccess` policy and trust
   `build.apprunner.amazonaws.com`.
3. Create a backend instance role with trust
   `tasks.apprunner.amazonaws.com`, attach
   `backend/scripts/once-runtime-iam-policy.json`, and add
   `secretsmanager:GetSecretValue` scoped to the OpenRouter secret. Store the
   key as a plain-string secret and reference it in
   `RuntimeEnvironmentSecrets.OPENROUTER_API_KEY`.
4. Create the backend App Runner service from the ECR image. Port `8000`,
   health check `/health`, and the backend environment above. Set
   `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` to the backend and frontend
   App Runner hostnames. The instance role supplies AWS credentials; do not set
   static AWS keys.
5. Build the frontend image with the backend URL baked in, then create the
   frontend App Runner service on port `3000`:

   ```bash
   docker build --platform linux/amd64 \
     --build-arg BACKEND_URL=https://<backend>.us-east-1.awsapprunner.com \
     --build-arg MCP_URL=https://<backend>.us-east-1.awsapprunner.com \
     -t once-frontend ./frontend
   ```

   Use `/` for the frontend health check. `/health` is a Next.js rewrite to the
   backend; if the backend is deploying at the same time, App Runner can mark
   the frontend create as `CREATE_FAILED` without useful logs.
6. Update the backend `CORS_ORIGINS` with the frontend URL. Verify `/health`,
   create a skill through the UI, and run the MCP smoke client against the
   frontend proxy.

The service names, roles, and URLs above are the actual resources used for the
shipped deployment. Do not commit the secret value or account root credentials.

## Option C: ECS Fargate + ALB

Use one ALB with two target groups:

- `backend`: port `8000`, health check `/health`.
- `frontend`: port `3000`, health check `/`.

ALB listener rules:

- `/api/*`, `/health`, `/mcp` and `/mcp/*` → `backend`
- everything else → `frontend`

Set `BACKEND_URL` and `MCP_URL` to the public ALB URL when building the
frontend. Attach the backend task role policy, store the OpenRouter key in
Secrets Manager, and put WAF rate rules in front of the ALB. This is the option
to choose if the demo needs to stay up after the hackathon.

## Option D: Render (fallback demo)

The earlier public demo is still deployed as two Render web services:

- `once-skill-memory-api`: FastAPI + MCP, root directory `backend`, Python
  runtime, health check `/health`.
- `once-skill-memory`: Next.js frontend, root directory `frontend`, Node
  runtime, health check `/health`.

Public URLs:

- App: `https://once-skill-memory.onrender.com`
- API and MCP: `https://once-skill-memory-api.onrender.com`

Render builds from `https://github.com/khushi-infinity/once` on `main`. The
backend uses the existing least-privilege `once-local` data-only IAM identity
for DynamoDB and S3. Those keys live only in Render's server-side environment
variables, never in the repo or the frontend. This is a hackathon tradeoff:
rotate the keys after the demo and move to a role or OIDC-based credential path
for a long-lived deployment.

Both services are on the free plan, so they spin down after inactivity and the
first request after a pause is slow. The demo video should wake both services
before recording. For an always-on deployment, use Option A or C.

Set the backend `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` to the Render
hostnames. The frontend build needs `BACKEND_URL` and `MCP_URL` set to the
backend URL; Render exposes environment variables at build time, and Next.js
records the rewrite destinations during the build.

## Secrets and access

- The OpenRouter key is server-side only. It is never sent to the browser or
  committed. `frontend` has no AWS or inference credentials.
- The AWS deployment stores the key in Secrets Manager and injects it as an
  App Runner runtime secret. The backend instance role can read only that one
  secret.
- `backend/.env` is gitignored and excluded from the Docker build context.
- Rotate any key that was pasted into a chat, issue tracker, or screenshot.
- This build has no user authentication. Demo identities are labels, not
  authorization. Do not expose real personal data through it.
- The AWS resources were bootstrapped with the account root identity. Replace
  that bootstrap session with a scoped deployment role for any long-lived use.

## Verification after deploy

For the shipped AWS demo:

```bash
curl -fsS https://nrsvfngagk.us-east-1.awsapprunner.com/health
curl -fsS "https://nrsvfngagk.us-east-1.awsapprunner.com/api/skills?reader_id=demo-teacher"
cd backend && ONCE_MCP_URL=https://nrsvfngagk.us-east-1.awsapprunner.com/mcp \
  ONCE_API_URL=https://nrsvfngagk.us-east-1.awsapprunner.com \
  uv run python scripts/mcp_smoke.py
```

Expected: `/health` reports `app_mode: live` and provider `openrouter`, the
skills response contains the three stored demo skills, and all 9 MCP checks
pass. If inference is unavailable, the API returns a real error; it does not
substitute mock output.

The same checks against the Render fallback use
`https://once-skill-memory.onrender.com`.
