# Deploying ONCE

The app is two containers: a FastAPI backend (HTTP API plus the MCP app at
`/mcp`) and a Next.js frontend. Data stays in the existing DynamoDB tables and
private S3 bucket. Inference goes to an explicitly selected provider; the
deployable cloud path is OpenRouter.

There is no login in this build. The public demo uses demo identity labels and
non-sensitive demo skills. If you put it on the public internet, put an access
control in front of it (Caddy basic auth, ALB/Cognito auth, or a private demo
network) and do not store real personal data.

## Choose a target

| Option | Best for | Cost / effort | Trade-off |
| --- | --- | --- | --- |
| **Single EC2 + Docker Compose + Caddy** | Shipping before the deadline | Lowest cost, about 15 minutes | One host, manual TLS/domain, no autoscaling |
| **App Runner (backend) + Amplify Hosting (frontend)** | Managed AWS deployment | Low ops, two services | More setup than Compose; two URLs to wire |
| **ECS Fargate + ALB** | A production-shaped AWS deployment | Highest setup cost | Most control, scales, proper health checks |
| **App Runner backend + Vercel frontend** | Fastest frontend deploy | Free/low cost | Frontend is not AWS; backend and data are |

For this hackathon, **EC2 + Docker Compose + Caddy** is the shortest honest
path. Use App Runner or ECS if you want a managed URL and do not want to own a
server.

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

## Option B: App Runner backend + Amplify frontend

1. Push both images to ECR:

   ```bash
   aws ecr create-repository --repository-name once-backend
   aws ecr create-repository --repository-name once-frontend
   docker build -t once-backend ./backend
   docker tag once-backend:latest <account>.dkr.ecr.us-east-1.amazonaws.com/once-backend:latest
   docker push <account>.dkr.ecr.us-east-1.amazonaws.com/once-backend:latest
   ```

2. Create an App Runner service from the backend image. Port `8000`, health
   check `/health`. Add the backend environment above. Put
   `OPENROUTER_API_KEY` in Secrets Manager or SSM Parameter Store and reference
   it as a runtime secret instead of a plain environment variable.
3. Give the App Runner instance role the same DynamoDB/S3 policy. DynamoDB and
   S3 are reached over their public AWS endpoints, so no VPC connector is
   required for this data layer.
4. Build the frontend image with the backend's App Runner URL:

   ```bash
   docker build \
     --build-arg BACKEND_URL=https://<backend>.us-east-1.awsapprunner.com \
     --build-arg MCP_URL=https://<backend>.us-east-1.awsapprunner.com \
     -t once-frontend ./frontend
   ```

   Deploy it to App Runner (port `3000`) or connect the repo to Amplify
   Hosting. Set `CORS_ORIGINS` on the backend to the frontend URL.
5. Verify `/health`, create a skill through the UI, and call the MCP endpoint
   from the smoke client with the public URL.

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

## Secrets and access

- The OpenRouter key is server-side only. It is never sent to the browser or
  committed. `frontend` has no AWS or inference credentials.
- `backend/.env` is gitignored and excluded from the Docker build context.
- Prefer Secrets Manager/SSM over plain environment variables for a long-lived
  deployment.
- Rotate any key that was pasted into a chat, issue tracker, or screenshot.
- This build has no user authentication. Demo identities are labels, not
  authorization. Do not expose real personal data through it.

## Verification after deploy

```bash
curl -fsS https://your-host/health
curl -fsS https://your-host/api/skills
cd backend && ONCE_MCP_URL=https://your-host/mcp ONCE_API_URL=https://your-host APP_MODE=live uv run python scripts/mcp_smoke.py
```

Expected: `/health` reports `app_mode: live` and provider `openrouter`, the
skills response contains the three seeded demo skills (or the skills created in
that account), and all 9 MCP checks pass. If inference is unavailable, the API
returns a real error; it does not substitute mock output.
