# Rai — Deployment Guide

**Purpose:** Step-by-step runbook for getting Rai onto an EC2 instance — staging or production. Covers Docker setup, env config, deploy script usage, HTTPS via Let's Encrypt, common operational commands, troubleshooting, and forward-looking infra migrations (e.g. vanity subdomains). Operational reference for the human deploying — not the source of truth for architecture decisions (those live in `dev-standards.md`, `v2-plans.md`, `v2-decisions.md`).

---

## Prerequisites

- An EC2 instance (Ubuntu 22.04+ recommended, t2.small or larger)
- Security group allowing ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- Your repo pushed to GitHub

---

## 1. EC2 one-time setup

SSH into your instance and install Docker:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Install Docker Compose (comes with Docker now, but verify)
docker compose version

# Log out and back in for group changes to take effect
exit
# SSH back in

# Install git
sudo apt install -y git
```

---

## 2. Clone and configure

```bash
# Clone your repo
git clone https://github.com/YOUR_USERNAME/Rai.git
cd Rai

# Copy the env template
cp .env.staging .env

# Edit it — change these values:
nano .env
```

**What to change in .env:**

| Variable | What to put |
|----------|-------------|
| `POSTGRES_PASSWORD` | Any strong password (e.g. `MyStr0ng!Pass99`) |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NEXT_PUBLIC_API_URL` | `http://YOUR_EC2_PUBLIC_IP/api/v1` |
| `CORS_ORIGIN` | `http://YOUR_EC2_PUBLIC_IP` |

Leave `POSTGRES_DB` and `POSTGRES_USER` as defaults.

---

## 3. Deploy

```bash
# Make deploy script executable (first time only)
chmod +x deploy.sh

# Deploy!
./deploy.sh
```

This does: `git pull` → `docker compose build` → `docker compose up` → health check.

Takes 3-5 minutes on first run (downloads images, builds from scratch). Subsequent deploys are faster (Docker caches layers).

---

## 4. Verify

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Should see: rai-postgres, rai-api, rai-frontend, rai-nginx all "Up"

# Check health
curl http://localhost/api/health

# Visit in browser
http://YOUR_EC2_PUBLIC_IP
```

---

## 5. Future updates

When you push new code:

```bash
# On EC2
cd Rai
./deploy.sh
```

That's it. Two commands. Migrations run automatically on backend startup.

> The manual `./deploy.sh` flow above is the staging/fallback path. The automated production pipeline is below.

---

## 5a. Automated CI/CD pipeline (production)

Production deploys go through an automated pipeline instead of a manual SSH + `deploy.sh`. Pushing to the release branch triggers a chain of gates; only a fully-green build reaches EC2.

```
GitHub → CodePipeline → CodeBuild → ECR → CodeDeploy → EC2 (Docker + Nginx) → CloudWatch
```

### The devops files — what each one does

Each repo (`rai-backend`, `rai-frontend`) carries the same set of dev-owned pipeline files:

| File | Stage | What it does |
|---|---|---|
| `Dockerfile` | build | Recipe for the production container image. |
| `buildspec.yml` | CodeBuild | The build script. Runs the gates (install → typecheck → tests → audit → docker build → image scan) and pushes the image to **ECR**. Any gate fails → build stops. |
| `appspec.yml` | CodeDeploy | Tells CodeDeploy *what to run on the EC2 host* — points at the swap script below. |
| `scripts/deploy_container.sh` | CodeDeploy | The swap script. Pulls the new image from ECR, stops the old container, starts the new one, health-checks it. **No rebuild.** |
| `docker-compose.prod.yml` | manual fallback | Same container, run by hand on the host (`docker compose -f … up`) when not using the pipeline. |

**Split:** `buildspec` = *build + test + ship to ECR*. `appspec` + `deploy_container.sh` = *pull from ECR + run on the server*.

### Dev vs devops split

The dev side owns the **build** file and the **deploy** file(s); devops owns all the AWS wiring (the CodeDeploy app, deployment group, IAM role, and the EC2 CodeDeploy agent).

Dev-owned files per repo:
- **Both repos:** `buildspec.yml` (CodeBuild gates) + `Dockerfile` + `appspec.yml` + `scripts/deploy_container.sh`. The CodeDeploy hook (`appspec.yml` → `scripts/deploy_container.sh`) pulls the new image from ECR and swaps the running container on the host — no rebuild.
- **Frontend swap:** swaps the `rai-frontend` container; needs **no** runtime env vars (`NEXT_PUBLIC_*` are already baked in by `buildspec.yml`).
- **Backend swap:** swaps the `rai-api` container; differs from frontend in two ways — it **mounts `ENV_FILE` read-only** at `/app/.env` (runtime secrets: `ENVIRONMENT`, DB, Cognito — same contract as `docker-compose.prod.yml`; devops places the file, default `/opt/rai/backend/.env`), and it **ships container stdout to CloudWatch** via the `awslogs` driver (`--log-opt` flags mirror the compose file).

| Stage | Owner |
|---|---|
| GitHub trigger, CodePipeline | devops |
| **CodeBuild gates** (`buildspec.yml`) | **dev** |
| **CodeDeploy swap** (`appspec.yml` + `scripts/deploy_container.sh`, both repos) | **dev** |
| ECR, CodeDeploy app / deployment group / IAM role, EC2 user-data + agent | devops |
| CloudWatch logs + alerts (RF-8) | devops |

Devops sets the same env names `buildspec.yml` uses on the host for the swap script: `AWS_ACCOUNT_ID`, `AWS_DEFAULT_REGION`, `ECR_REPO`, plus optional `IMAGE_TAG` (defaults to `latest`; pin to a commit sha for traceable rollbacks).

### What CodeBuild runs

`backend/buildspec.yml` and `frontend/buildspec.yml` each run: install → static check (tsc) → tests → `npm audit` → docker build → Trivy image scan → push to ECR. **Any gate failing stops the build**, so a bad image never ships. Full gate table + the env vars devops must set live in **`dev-testing.md` §10**.

#### Base-image npm CVEs (Trivy HIGH findings)

The `node:20-alpine` base image pre-installs an older `npm`, whose bundled deps (`tar`, `minimatch`, `glob`, `cross-spawn`…) carry HIGH CVEs that Trivy flags even though the app code (`next`, `react`, etc.) is clean. Handled per repo by how each container runs:

- **Frontend** — runs `node server.js` (standalone build), never calls npm. The production stage **deletes npm/yarn** (`rm -rf …/node_modules/npm`, the `npm`/`npx`/`yarn` bins) → zero of these CVEs ship.
- **Backend** — runs `tsx server.ts` via `npm start`, so npm must stay. The Dockerfile **upgrades npm to patched latest** (`npm install -g npm@latest`) instead of removing it.

### Relationship to this guide

- **EC2 / Docker / Nginx setup** (§1–§4) stays the runtime — the pipeline just *delivers* images to it via CodeDeploy instead of a manual `git pull`.
- **HTTPS** (§6) is unchanged and still required (SSO needs it).

---

## 6. Adding HTTPS (when you have a domain)

### Step 1: Point your domain to EC2

Add an A record in your DNS:
```
staging.yourdomain.com → YOUR_EC2_PUBLIC_IP
```

Wait for DNS propagation (usually 5-15 minutes). Verify:
```bash
ping staging.yourdomain.com
```

### Step 2: Update .env

```bash
nano .env
# Change:
# NEXT_PUBLIC_API_URL=https://staging.yourdomain.com/api/v1
# CORS_ORIGIN=https://staging.yourdomain.com
```

### Step 3: Get SSL certificate

```bash
# Run certbot to get the certificate
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot --webroot-path=/var/www/certbot \
  -d staging.yourdomain.com \
  --email your@email.com \
  --agree-tos --no-eff-email
```

### Step 4: Enable HTTPS in nginx

Edit `nginx/prod.conf`:
1. Uncomment the HTTPS `server { ... }` block at the bottom
2. Replace `YOUR_DOMAIN` with `staging.yourdomain.com`
3. Save

### Step 5: Rebuild

```bash
./deploy.sh
```

Now `https://staging.yourdomain.com` works. Certificate auto-renews via the certbot container.

---

## Common commands

```bash
# View logs (all services)
docker compose -f docker-compose.prod.yml logs -f

# View logs (specific service)
docker compose -f docker-compose.prod.yml logs -f node-api

# Stop everything
docker compose -f docker-compose.prod.yml down

# Stop and wipe database (fresh start)
docker compose -f docker-compose.prod.yml down -v

# Restart a single service
docker compose -f docker-compose.prod.yml restart node-api

# Enter postgres CLI
docker exec -it rai-postgres psql -U rai_user -d rai_db

# Backup database
docker exec rai-postgres pg_dump -U rai_user rai_db > backup_$(date +%Y%m%d).sql

# Restore database
cat backup_20260415.sql | docker exec -i rai-postgres psql -U rai_user -d rai_db
```

---

## Troubleshooting

**Container won't start — check logs:**
```bash
docker compose -f docker-compose.prod.yml logs node-api
```

**Frontend shows blank page:**
- Check `NEXT_PUBLIC_API_URL` in `.env` — it must match the URL users visit
- Rebuild: `./deploy.sh`

**API returns CORS error:**
- Check `CORS_ORIGIN` in `.env` — must match the browser URL exactly (including http/https)
- Rebuild: `./deploy.sh`

**Database connection refused:**
- Postgres might still be starting. Wait 30 seconds and try again.
- Check: `docker compose -f docker-compose.prod.yml ps` — postgres should be "Up (healthy)"

**Port 80 already in use:**
- Something else is using port 80. Check: `sudo lsof -i :80`
- Stop it or remove nginx from EC2 if installed outside Docker

---

## v2 Infra Architecture & Devops Handoff

v2 separates concerns the way v1 collapsed them. Each piece below is one bullet for devops to provision.

### Topology

```
GoDaddy DNS (kept; no Route 53)
├─ app.rai.app          → CloudFront → S3 (frontend prod build)
├─ staging.rai.app      → CloudFront → S3 (frontend staging build)
└─ api.rai.app          → ALB (later) | EC2 public IP (v2 day-1) → Docker → Node backend
                                                                       ↓
                                                            RDS PostgreSQL (private subnet)

Side rails (all AWS-managed, all per-env):
  Cognito user pool · SES · Secrets Manager · CloudWatch Logs · SNS · ACM · IAM
```

Two environments — **staging** (one EC2, one RDS, one Cognito pool) and **prod** (one EC2, one RDS, one Cognito pool) — fully isolated.

### Why this shape

- **v1 was everything-in-one-Docker** (frontend + backend + Postgres) on EC2 with no external DB access. v2 splits these so each scales independently, each is debuggable independently, and each can be replaced independently.
- **Repo split** (backend, frontend, mobile-later) mirrors the infra split. Mobile team in v3 consumes the same backend the web frontend does — zero special endpoints (per `dev-standards.md` §3 "APIs are mobile-compatible from v2 day one").

### Component-by-component spec

| Component | What we use | Notes for devops |
|---|---|---|
| **DNS** | GoDaddy (kept) | Two A/CNAME records per env: frontend → CloudFront, API → ALB (or EC2 IP at day-1). No Route 53 — saves the migration. |
| **Frontend hosting** | S3 + CloudFront | Static React build uploaded to S3. CloudFront in front with ACM cert + WAF basic rate-limit. No server, no Docker. (Amplify rejected — past pain.) |
| **Backend hosting** | EC2 + Docker (single container) | One container = Node app. RDS / SES / Cognito / SNS are all external/managed. Docker as wrapper only — nothing else inside it. |
| **Backend TLS — v2 day-1** | Nginx + certbot on EC2 host | Same pattern as v1 (we know it works). Saves the ALB cost until prod load justifies it. |
| **Backend TLS — once scaling** | ALB + ACM | When monitoring shows sustained CPU/mem > 70% or response-time degradation, devops adds ALB in front of EC2 with ACM cert. Adds ~$16/mo. |
| **Database** | RDS PostgreSQL 16 | Private subnet, not publicly reachable. Backend SG is the only inbound rule. Multi-AZ for prod, single-AZ for staging. Automated daily backups, 7-day retention. Aurora deferred (~3× cost, swap target in `upgrades.md`). |
| **DB debug access** | SSM Session Manager port-forward | Devops sets up SSM access for developers; no public DB IP, no bastion host, no extra cost. Whitelist office IP via SG as alternative if preferred. |
| **Auth** | AWS Cognito user pool | One pool per env (`rai-staging`, `rai-prod`). See "v2 Infra Handoff — Cognito" section below for Rai-specific config. |
| **Outbound product email** | SES | Sign-up verification, password reset, ticket-assigned, invite, billing emails. Templates in `backend/modules/notifications/templates/`. Sender domain (`@rai.app`) verified in SES. |
| **Ops alerts (separate from product email)** | SNS topic + email subscriptions | CloudWatch alarm fires → SNS topic publishes → devops + on-call get emailed. ~10 min setup. See "v2 Infra Setup — Critical-error alert pipeline" below. |
| **TLS certs** | ACM | Free, auto-renews. One cert for CloudFront (frontend), one for ALB (when ALB lands). Devops issues once per env. Replaces v1's certbot-in-Docker pattern. |
| **Secrets** | AWS Secrets Manager (or SSM Parameter Store) | DB password, Cognito client IDs, JWT secret (transitional), Razorpay keys (v3). EC2 reads via IAM role. **Never** `.env` on disk, **never** in the repo. |
| **VPC + subnets** | Default VPC; one public subnet (EC2, ALB-later), one private subnet (RDS) | NAT Gateway intentionally avoided — backend stays in public subnet with security group locked down. Saves ~$32/mo. |
| **IAM roles** | EC2 has an instance role | Allows EC2 to call SES, Cognito Admin*, S3 (uploads), SNS publish — no AWS keys on disk. Per-env role, least-privilege. |
| **Logging** | Docker `awslogs` driver → CloudWatch Logs | Per-env log group (`/rai/backend/prod`, `/rai/backend/staging`). Same pattern as v1, just per-instance now. |
| **Source control** | GitHub | Three repos: backend, frontend, mobile-later. CI pipeline parked to v3 / post-prod-stabilization. Manual deploy script for v2. |

### SES vs SNS (confusing AWS names — clear distinction)

| | SES | SNS |
|---|---|---|
| Full name | Simple **Email** Service | Simple **Notification** Service |
| Sends what | Product emails to **users** | Ops alerts to **devops/on-call** |
| Examples | Signup verify, password reset, ticket-assigned, invite, billing warning | CloudWatch alarm fires, error rate spike, 5xx spike, DB CPU high |
| Templates | Yes, HTML templates per type | No — plain text triggered by alarms |
| Bounce / spam handling | Yes | N/A |
| Wired up via | Backend `email.service.ts` per `dev-standards.md` notifications pattern | Devops console (CloudWatch alarm → SNS topic → email subscriber) |
| Subscribers | End users (customers) | Team (~3-5 emails) |

Both are used — they serve totally different purposes.

### TLS / HTTPS strategy

| Phase | Frontend HTTPS | Backend HTTPS |
|---|---|---|
| v2 staging | CloudFront + ACM (free, AWS-managed) | EC2 + Nginx + certbot on host |
| v2 prod day-1 | CloudFront + ACM | EC2 + Nginx + certbot on host |
| v2 prod scaled | CloudFront + ACM (unchanged) | ALB + ACM (ALB terminates TLS, multiple EC2s behind) |

v1's pattern of certbot inside the Docker container does **not** carry over — frontend/backend separation makes that obsolete.

### Scaling strategy

Backend is **strictly stateless** (per `dev-standards.md` §1) — no in-memory session, no in-memory cache, no module-level mutable counters. Single state exception (rate limiter) swapped to a Postgres-backed store **during v2 build**, so scale-out works without a follow-up code change.

**When CPU / memory / latency degrade, in this order:**

1. **Vertical scale first.** t3.medium → t3.large → t3.xlarge. One click in AWS console, ~5 min restart. Cheapest, simplest. Covers most spikes.
2. **Horizontal scale second.** Add ALB → put existing EC2 + new EC2 in a target group → done. Works zero-config because backend is stateless. ~$16/mo for ALB.
3. **Database scale (if DB is the bottleneck).** RDS instance class up → Aurora (swap target, see `upgrades.md`) → read replicas (parked in `upgrades.md` under RF-14).

### v2 security checklist (priority order)

1. **HTTPS only.** ACM cert on CloudFront. Nginx + certbot on EC2 (day-1) → ACM on ALB (scaled).
2. **RDS in private subnet.** Only backend security group can reach it. Never publicly accessible.
3. **Secrets in Secrets Manager.** No `.env` in repo, no `.env` on EC2 disk after first boot.
4. **SSH disabled / via SSM Session Manager only.** Close port 22 in security group entirely.
5. **CloudFront WAF basic rate-limit.** Default rule set + per-IP rate cap.
6. **CloudWatch alarms.** 5xx spike, error rate, DB CPU, DB connections → SNS → email.
7. **RDS automated daily backups + manual snapshot before each schema migration.**
8. **IAM least-privilege per env.** Staging EC2 role can't touch prod resources; per-env Cognito pool ARNs.
9. **Logs scrubbed.** Never log passwords, tokens, full request bodies (per `dev-standards.md` §4 "Never").

### Devops handoff sheet — staging (build first, validate, then mirror for prod)

| Item | Spec |
|---|---|
| Region | ap-south-1 (Mumbai) — same as where customers are |
| EC2 instance | t3.medium (2 vCPU, 4 GB) — staging baseline |
| EC2 OS | Ubuntu 24.04 LTS |
| EC2 disk | 20 GB gp3 |
| EC2 security group | Inbound: 80, 443 from `0.0.0.0/0`; **no 22** (SSM only); Outbound: all |
| RDS engine | PostgreSQL 16.x |
| RDS instance class | db.t4g.small (staging); db.t4g.medium (prod) |
| RDS storage | 20 GB gp3, auto-scaling enabled (cap at 100 GB) |
| RDS placement | Private subnet, Multi-AZ for prod, single-AZ for staging |
| RDS backup | 7-day retention, automated daily snapshots |
| Cognito pool | `rai-staging`; mutable custom attribute `current_org_id` (string, max 256); USER_SRP_AUTH only; no app client secret; email verification required-before-sign-in. Full Rai-specific config in section below. |
| SES | Sender domain `@rai.app` verified; production-mode access requested (out of sandbox); per-env identity. |
| SNS | One topic `v2-{env}-alerts`; email subscribers: devops + on-call. |
| Secrets Manager | One secret per env: `rai/{env}/db-password`, `rai/{env}/cognito-client-id`, `rai/{env}/cognito-pool-id`, etc. |
| S3 | Two buckets per env: `rai-{env}-frontend` (static hosting), `rai-{env}-uploads` (user uploads, blocked public access). |
| CloudFront | One distribution per env, ACM cert in us-east-1 (CloudFront requirement), WAF basic rule set. |
| ACM | Frontend cert in us-east-1 (CloudFront), backend cert in ap-south-1 (ALB-day, parked). |
| IAM role for EC2 | Allow: `cognito-idp:Admin*` on env pool ARN, `ses:SendEmail`, `s3:PutObject` on uploads bucket, `secretsmanager:GetSecretValue` on env secrets, `logs:CreateLogStream` + `logs:PutLogEvents`. |
| CloudWatch agent | Installed on EC2, ships `/var/log/rai-backend/*.log` + Docker container stdout to log group `/rai/backend/{env}`. |
| CloudWatch alarms | (a) 5xx rate > 5/min over 5 min; (b) DB CPU > 80% for 10 min; (c) DB connections > 80% of pool; (d) reserved log markers `event: "*_rollback_failed"` and `event: "*_mismatch"` (see RF-8 pipeline below). All → SNS. |
| DNS records (GoDaddy) | `staging.rai.app` → CloudFront distribution; `api-staging.rai.app` → EC2 public IP (then ALB later). |

Same sheet, swapped values for prod. Prod adds: Multi-AZ RDS, larger instance class, more rigorous alarm thresholds.

### Local dev minimum (what blocks coding kickoff)

Far smaller scope than the staging sheet above. Hand this to devops as the **minimum to unblock Phase 1 coding**:

1. Create one Cognito user pool: `rai-dev` in `ap-south-1`.
2. Pool settings: password policy (8+ chars, mixed), email verification required-before-sign-in, account lockout 5 fails → 15-min.
3. Custom attribute on pool: `current_org_id` (string, mutable, max 256).
4. App client: `rai-web-dev`, USER_SRP_AUTH only, **no client secret**, callback URL `http://localhost:3000/auth/callback`.
5. IAM user: `rai-dev-cognito-admin`, inline policy with `cognito-idp:Admin*` permissions scoped to the `rai-dev` pool ARN only.
6. Access keys for the IAM user, shared via secure channel (1Password, Secrets Manager, encrypted message — never plain Slack/email).
7. Share with devs: pool ID, app client ID, region, access keys.

Total devops time: ~30 minutes. No EC2, RDS, S3, CloudFront, ALB, ACM, SES, SNS, CloudWatch, Route 53 needed yet — those are devops-parallel for staging and don't block local coding.

Developer local `.env` (backend):
```
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=<from devops>
AWS_SECRET_ACCESS_KEY=<from devops>
COGNITO_USER_POOL_ID=ap-south-1_xxxxx
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxx
DATABASE_URL=postgres://localhost:5432/rai_v2
```

Developer local `.env` (frontend):
```
NEXT_PUBLIC_AWS_REGION=ap-south-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-south-1_xxxxx
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxx
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

**Email sender during dev:** Cognito's built-in default sender (5/day cap, generic `no-reply@verificationemail.com`) — covers Phase 1 testing. SES verified sender domain lands in Phase 3.

### Local → staging data dump (after all phases ship to staging)

**When:** after Phase 1–5 are built locally, before opening staging to wider testing. Once you've poked through all the features locally and want a known-state staging environment that mirrors what you exercised, dump local DB → restore to staging RDS.

**Steps:**

1. **Open SSM port-forward to staging RDS** (separate terminal — keep it running):
   ```
   aws ssm start-session \
     --target i-<staging-ec2-id> \
     --document-name AWS-StartPortForwardingSessionToRemoteHost \
     --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["15432"]}'
   ```
   Now `localhost:15432` tunnels to the staging RDS instance.

2. **Dump local DB:**
   ```
   pg_dump -h localhost -p 5432 -U raiuser -d rai_v2 -F c -f rai-staging-seed.dump
   ```
   `-F c` = custom (compressed binary) format — works well with `pg_restore`.

3. **Restore to staging:**
   ```
   pg_restore -h localhost -p 15432 -U raiuser -d rai_db --clean --if-exists rai-staging-seed.dump
   ```
   `--clean --if-exists` drops + re-creates each object so it's idempotent. Need `sslmode=require` if connecting directly without SSM (set via `PGSSLMODE=require`).

**Caveats / gotchas:**

- **Cognito users won't carry.** Local DB references Cognito `sub` UUIDs that exist in `rai-dev` pool, not `rai-staging` pool. After restore, either: (a) wipe `users` + `user_orgs` + dependent tables and signup fresh in staging Cognito; OR (b) write a one-off script that creates matching users in `rai-staging` pool via `AdminCreateUser` and updates the `users.id` column to the new staging `sub`. Option (a) is simpler — the data dump is really only useful for non-user-identity tables (projects, sprints, tickets, etc.). Plan for fresh signup at staging.
- **Sequences auto-reset** via `pg_dump` defaults — IDs continue from where they left off.
- **Run staging migrations first** if schema has drifted: `DATABASE_URL=postgres://...staging... npm run migrate`. Confirm `migrations` table is in sync before restoring.
- **For "fresh staging from scratch" path** (recommended for the first staging launch): skip the dump entirely — run migrations on empty staging DB, signup the first user via real Cognito + SES email flow. Tests the actual production-equivalent path.

**Recommendation:** the **first** staging launch should be fresh-everything (no dump) — that tests the real signup → email-verify → org-create flow with production-equivalent infrastructure (Cognito, SES, etc.). Use the dump-and-restore path **only later** when you want a richer test dataset on staging without re-creating it manually.

**Callback URLs per env (added to app client as each env comes online):** `http://localhost:3000/auth/callback` (dev), `https://staging.rai.app/auth/callback` (staging), `https://app.rai.app/auth/callback` (prod). SSO providers (Google, Microsoft) need these configured before SSO sign-in works.

**First owner bootstrap (no special flow needed):** the very first user signs up via the normal flow → email verify → log in → calls `/api/v1/orgs/create` → backend inserts `organizations` row + `user_orgs` row with role `owner`. Standard org-create flow handles the first org.

### Small but-don't-forget items (5-min each for devops)

| Item | What / why |
|---|---|
| CloudFront cache invalidation on frontend deploy | `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"` baked into the frontend deploy script. Otherwise users see stale JS for hours after deploy. |
| S3 uploads bucket versioning enabled | Toggle on the bucket. Free, recovers from accidental deletes. Backup safety net for user-uploaded files. |
| AWS Budgets alarm | Per-env budget (e.g. $50/mo staging, $200/mo prod) → email when forecasted spend exceeds threshold. Catches runaway log volume, infinite-loop egress, etc. |
| External uptime monitor (UptimeRobot — free tier) | 5-min ping from outside AWS. Catches outages CloudWatch can't see (CloudFront itself broken, DNS misconfigured, ALB issue). Email on first miss. |
| Container restart policy | `docker run --restart unless-stopped …` (or `restart: unless-stopped` in compose). EC2 reboot or backend crash auto-revives the container without manual SSH. |
| Backend `pg` pool size | App-level pool ~10 connections is fine for v2. Connection-exhausted alarm (in the alarm list above) is the signal to bump. Don't pre-tune. |

---

## v2 Infra Handoff — Cognito (Rai-specific)

RDS is straightforward (Postgres 16, in-VPC, not publicly accessible, Multi-AZ for prod, creds in Secrets Manager). Skipping the generic setup. The non-trivial piece is **how Cognito carries Rai's multi-tenant model**.

### Goal

One Cognito user pool serves all customer orgs. A single user can belong to many orgs (`user_orgs` table in our DB), but at any moment Cognito's tokens reflect *one* "currently active" org. Switching orgs in the UI = swapping that one value, which means re-issuing tokens.

### How Rai uses Cognito (the part that's not standard)

- **Single pool, all orgs.** Pool-per-org rejected industry-wide (doesn't scale, kills federation, breaks multi-org-per-user).
- **Org membership lives in our DB**, not in Cognito. `user_orgs(user_id, org_id, role)` is the source of truth for "which orgs does this user belong to." Cognito only ever knows the *current* one.
- **`custom:current_org_id`** — Cognito custom user attribute (string, mutable). Carries the active org for the user's session. Gets baked into the ID token claims on every Cognito-issued token.
- **`users.id` in our DB == Cognito user `sub`** (UUID). When Cognito creates a user, our backend creates the matching `users` row keyed by the same UUID. **No password column on our side** — Cognito owns passwords.
- **All auth wrapped behind an `AuthService` interface** so we can swap providers later without touching controllers (see `dev-standards.md` §8).

### The three Rai-specific flows

**1. Org switch (the trickiest piece):**
```
User clicks switcher in UI
  → POST /api/v1/auth/switch-org { orgId }
  → Backend: validate user is a member of orgId in user_orgs
  → Backend: cognito-idp:AdminUpdateUserAttributes
       set custom:current_org_id = orgId
  → Backend: respond { ok }
  → Frontend: Auth.currentSession({ forceRefresh: true })
       Cognito issues new tokens with the new claim
  → Frontend: clear React Query cache, refetch dashboard
```
The trick: `AdminUpdateUserAttributes` mutates the Cognito user, but the user's currently-held tokens still have the old claim until refreshed. Frontend MUST force-refresh after the backend confirms the attribute change.

**2. Membership re-check on every request:**
```
Even though custom:current_org_id is in the JWT, the auth middleware
re-queries user_orgs(user_id, current_org_id) on EVERY API call.
```
Why: detect mid-session removal. If an org admin kicks a user, that user's *current token* still says they belong — middleware catches this and 403s the next request, not waiting for the 60-min token TTL. Same pattern catches subscription expiry (read `organizations.subscription_status`).

**3. Invite accept — no-account path:**
```
User clicks email invite link → redirect to signup with ?invite=<token>
  → User signs up in Cognito, verifies email
  → Backend: read pending invite, INSERT user_orgs row
  → Backend: AdminUpdateUserAttributes(custom:current_org_id = inviteOrgId)
  → User lands in the invited org with tokens already set
```

### Setup choices that matter for Rai

- **No post-confirmation Lambda — lazy-sync instead.** Cognito creates the user; our backend creates the matching `users` row on **first authenticated request** when it sees a JWT `sub` with no matching DB row. ~10 lines in the auth middleware (one extra `INSERT ... ON CONFLICT DO NOTHING`). Saves the Lambda function + deployment + IAM + monitoring overhead. After the first request, the existence check is a cheap `SELECT 1` already inside the auth chain's `loadUser` step.
- **App client auth flow:** USER_SRP_AUTH only. Don't enable USER_PASSWORD_AUTH (less secure, and Amplify uses SRP anyway).
- **No app client secret** for either backend or frontend — Amplify on the frontend doesn't accept secrets, and the backend uses Admin* APIs (IAM-authenticated, no client secret needed).
- **Custom attribute `current_org_id` must be mutable** in pool config (default for custom attrs is mutable, but verify on creation — it can't be changed later).
- **IAM role for backend EC2** needs `cognito-idp:AdminUpdateUserAttributes` for the pool ARN. Frontend can never write `custom:current_org_id` directly — backend gates the call after validating membership.
- **Email verification toggle ON** with `email_verified` as required-before-sign-in. Cognito sends verification email via SES — verified sender domain needed.
- **Skip Hosted UI** — we have our own login screens; Amplify SDK calls Cognito directly.
- **Skip Advanced Security tier** for v2 — it's a paid add-on for risk-based auth + adaptive MFA. Turn on only when the suspicious-activity feature lands (parked in `upgrades.md`).

### What to study deeper

1. **Access token vs ID token vs refresh token** — Cognito issues all three. Access token authorizes API calls; **ID token carries `custom:current_org_id`** and other claims; refresh token rotates the pair. Don't conflate them.
2. **JWKS endpoint + `aws-jwt-verify`** — backend validates JWTs offline against cached public keys, no AWS round-trip per request.
3. **`AdminUpdateUserAttributes` API** — IAM permissions, when a token refresh is needed after the write, attribute validation rules.
4. **Custom attribute caveats** — `custom:` prefix is mandatory in the claim name; max 50 per pool; mutability flag is set-once at creation; can't be deleted once defined.
5. **Pre-Token-Generation Lambda** — alternative to the custom-attribute approach for higher freshness on org switch. Parked in `upgrades.md` as the "industrial strength" upgrade. Worth knowing it exists; not needed for v2.
6. **`Auth.signOut({ global: true })`** — Cognito's built-in "logout from all devices." Sub-second, no Redis blacklist needed (which is why we don't have one — see `upgrades.md`).
7. **Federated identity providers** — Cognito supports Google/Microsoft/GitHub/SAML as toggles in pool config. Wire-up for future SSO feature (parked in `upgrades.md`).

### Don'ts (Rai-specific)

- **Don't let frontend write `custom:current_org_id` directly.** Always go through the backend's `/auth/switch-org` endpoint so `user_orgs` membership is validated first.
- **Don't trust the `custom:current_org_id` claim alone in middleware.** Always re-check `user_orgs` per request. The claim is convenience; the DB is truth.
- **Don't use Cognito groups for RBAC.** Roles live in `user_orgs.role` (per-org). Cognito groups don't model "different role per org per user" cleanly.
- **Don't reuse staging Cognito pool for prod.** Separate pools per env (the IDs leak into client bundles, so they're effectively env identifiers).
- **Don't enable MFA at pool level for v2.** It's parked in `upgrades.md` as a later toggle — turning it on now blocks every existing test user without warning.

---

## v2 Infra Setup — Critical-error alert pipeline (RF-8)

**Goal:** when a cross-system Cognito ↔ Postgres mismatch happens despite retries + compensation (rare, should fire near-never), get an email within minutes so the residual state can be fixed manually.

**Pipeline:**

1. **Backend logs** structured pino JSON to stdout. Specific events use reserved markers (per `dev-standards.md` §6 logging):
   - `event: "<flow>_rollback_failed"` — compensation attempted and failed
   - `event: "<flow>_mismatch"` — middleware detected JWT-claim ↔ DB-row mismatch
   - Both are tagged `severity: "critical"`
2. **Docker → CloudWatch Logs.** EC2 instance runs the CloudWatch unified agent (one-time install + config). Logs from the backend container stream to a CloudWatch log group (e.g. `/rai/backend/prod`). Standard setup, ~15 min.
3. **CloudWatch metric filter** on the log group with pattern `{ $.severity = "critical" && $.event = "*_rollback_failed" || $.event = "*_mismatch" }`. Creates a custom metric (e.g. `rai/backend/CriticalErrors`).
4. **CloudWatch alarm** on the metric: threshold = 1 occurrence in any 5-minute window. State `ALARM` triggers SNS.
5. **SNS topic** with email subscription to the on-call inbox (`diptanshu@novetum.com` at v2). Email arrives within 1–5 minutes of the event.

**Total one-time setup:** ~1 hour including the agent install + IAM permissions + alarm + SNS. Recurring cost: pennies/month (CloudWatch Logs has a generous free tier; SNS email is free for the first 1k notifications/month).

**Land this in the same phase as EC2 + Docker + Nginx setup.** Don't ship to production without it — RF-8's "manual ops fix" path assumes someone is notified.

**Same pipeline reused for:** future critical errors (DB pool exhaustion, Cognito quota breaches, unhandled exceptions in middleware) — extend the metric-filter pattern to additional `severity: "critical"` events. The pipeline itself doesn't need rebuilding per error type.

---

## Future: vanity subdomain migration (`acme.rai.app`)

Rai launches with path-based tenancy (`rai.app/orgs/<slug>`). Subdomain support is a deferred Phase E feature. Because `org_id` is sourced from the JWT (not the URL), no schema, auth, or query code changes — this is an infra-only migration.

**Checklist when the time comes:**

1. **Wildcard SSL cert** — issue `*.rai.app` (Let's Encrypt with DNS-01 challenge, or ACM if behind ALB).
2. **Wildcard DNS** — add `*.rai.app` A/ALIAS record pointing to the same load balancer / EC2 as `rai.app`.
3. **Cookie scope** — change auth cookie `Domain` from `rai.app` to `.rai.app` so it's shared across subdomains.
4. **CORS allowlist** — extend `CORS_ORIGIN` to accept `https://*.rai.app` (or generate the list from active org slugs).
5. **Redirects** — 301 from `rai.app/orgs/<slug>/<rest>` → `<slug>.rai.app/<rest>` so old bookmarks still work.
6. **Routing** — Nginx/ALB extracts the subdomain and either rewrites to `/orgs/<slug>/...` internally, or the app reads `Host` and treats the subdomain identically to the path slug. Either way, JWT remains the only source of truth for `org_id`.
7. **Reserved subdomains** — block `www`, `api`, `app`, `admin`, `auth`, `mail`, `status` from being claimed as org slugs.

No data migration. No JWT rotation. No client rewrite.


---

## Appendix — Deployment Quickstart

_Merged in from the former `deployment-quickstart.md` on 2026-06-02._

Condensed hand-over checklist. For the long-form runbook with troubleshooting + future infra, see everything above this section.

---

### What to hand over

Per environment, two files (each repo has exactly one `.env` + one `.env.example`, nothing else):
- `backend/.env`   (copy from `backend/.env.example`; set `ENVIRONMENT=prod`, RDS + Cognito + SES values)
- `frontend/.env`  (copy from `frontend/.env.example`; Cognito public values + API URL)

Nothing else. Code + those two files = deployable.

**Env reload model (important):**
- **Backend** — `.env` is *mounted* into the container. Edit it, then `docker compose -f docker-compose.prod.yml restart api` → changes apply. **No rebuild.**
- **Frontend** — `NEXT_PUBLIC_*` are *baked* into the bundle at build. Changing any value needs `docker compose -f docker-compose.prod.yml up -d --build`. **A restart will NOT pick them up.**

---

### One-time AWS setup (before first deploy)

- RDS Postgres → security group allows EC2 IP on 5432 → endpoint goes into `DB_HOST`
- Cognito user pool already exists → grab pool id + app client id + domain
- SES → verify domain → enable DKIM → exit sandbox → from address goes into `SES_FROM_EMAIL`
- Cognito → Messaging → switch sender to SES + paste HTML from `frontend/content/emails/*.html`
- IAM user with SES + Cognito admin perms → access key into backend `.env`
- **Attachments bucket** — uploads bucket name (`rai-{env}-uploads`) goes into backend `S3_BUCKET` (required at boot; attachments presign against it). Local dev: placeholder is fine — presigns just won't resolve until a real bucket is set.
- **(Optional) Mobile push** — Firebase project → Cloud Messaging → generate a service-account key → base64 it into backend `FIREBASE_SERVICE_ACCOUNT`. Unset = push disabled (in-app + email still work). Full steps in `dev-notifications.md` → "Firebase setup".
- **Billing — Razorpay (required)** — Razorpay dashboard → grab **Key Id + Key Secret** (Settings → API Keys) → create a **recurring monthly Plan priced per seat** (Subscriptions → Plans) and copy its plan id → set up a **Webhook** to `https://<api-domain>/api/v1/billing/webhook` with the subscription events and copy the **webhook secret**. Put all four into backend `.env` (below). Razorpay is the **only** billing provider — there is **no NoOp fallback**. All four vars are **required in every environment**; `validateEnv()` checks them at boot and **the server refuses to start** if any is missing. Subscribing always opens a real Razorpay checkout — use **test-mode keys** (`rzp_test_*`) in local/staging, live keys only in production. Product behavior → `guide-billing.md`.

```
# Billing (Razorpay) — backend .env. ALL four REQUIRED — boot fails if any is missing.
# Use rzp_test_* keys for local/staging; rzp_live_* only in production.
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=<from devops>
RAZORPAY_WEBHOOK_SECRET=<from the webhook you created>
RAZORPAY_PLAN_ID=<recurring plan id from the dashboard>   # required (recurring/auto-renew)
```
**Fully env — no DB edit.** `RAZORPAY_PLAN_ID` (recurring plan) is read from env first (falls back to `plans.razorpay_plan_id` if you prefer the table). All four are validated at boot, so a misconfigured deploy stops loudly instead of failing at the user's first click.
Frontend needs **no** billing env — the public key id is delivered by the backend in the billing summary, so turning billing on is a backend-only `.env` + restart (no frontend rebuild).
- **(Optional) Feedback inbox** — in-app feedback emails go to `SUPPORT_EMAIL` (defaults to `support@rai.novetum.com`). Make sure that mailbox exists + is monitored, and (if SES is in sandbox) is a verified recipient.
- **(Pending) Scheduler** — wire `npm run billing:sweep` (trial warnings + expiry → read-only) and `npm run purge:orgs` into a daily cron/EventBridge job. Until then, trials don't auto-expire and warning emails don't fire.

---

### Backend deploy (EC2, Dockerized)

```
git clone <backend-repo>
cp .env.example .env   # then edit: ENVIRONMENT=prod + RDS/Cognito/SES values
npm install
docker compose -f docker-compose.prod.yml up -d --build
```

Single-stage image runs the API with `tsx` (all deps installed, no build step) — boots identically to local dev, so a from-scratch build can't hit a missing-devDependency crash. On boot it logs a masked env summary (first3…last4) + a "PRODUCTION MODE" banner when `ENVIRONMENT=prod`, then (after migrations) a health/usage banner with the exact curl command. Health endpoint is **`/api/health`** (not `/api/v1/...`). Set `BACKEND_BASE_URL=http://<ip-or-domain>` in `.env` so the banner prints the public URL. Smoke test: `curl http://<host>/api/health`.

- **Env change only:** edit `.env` → `docker compose -f docker-compose.prod.yml restart api` (no rebuild).
- **Code change:** `git pull && docker compose -f docker-compose.prod.yml up -d --build`.

---

### Frontend deploy (two paths)

**EC2 + nginx (Dockerized):**
```
git clone <frontend-repo>
cp .env.example .env   # then edit (NEXT_PUBLIC_* values)
npm install
docker compose -f docker-compose.prod.yml up -d --build
```
Compose reads `frontend/.env` automatically for the build-arg interpolation. Any later env change = rebuild (see reload model above).

**Vercel (frontend only):** connect repo → paste env vars in UI → auto-deploy on push.
- **Import:** on vercel.com/new, import the **frontend** app as a single project. Root Directory = `frontend`, preset Next.js. Don't import `backend`; it stays on AWS.
- **`output: 'standalone'`** is skipped automatically on Vercel (`next.config.ts` checks `VERCEL`). Docker builds still produce standalone.
  - **Was:** always standalone, which broke Vercel's post-build step (`ENOENT … next-server.js.nft.json`).
- **Env:** `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after any change. Add the Vercel URL to the backend's `CORS_ORIGIN`.

---

### DNS

- `rai.<domain>`     → frontend
- `api.rai.<domain>` → backend
- SSL via Let's Encrypt (certbot in Docker stack)

---

### Smoke test (5 min)

1. `GET /api/health` → 200
2. Sign up with real email → branded verification email arrives via SES
3. Sign in → land on dashboard
4. Create org → invite teammate → invite email arrives
5. Check RDS: `SELECT COUNT(*) FROM schema_migrations;` → 10

---

### Gotchas

- **RDS not fresh** → migration runner skips files, schema goes wrong. Verify empty DB before first boot.
- **CORS errors** → `CORS_ORIGIN` must EXACTLY match the frontend origin (scheme + host, no trailing slash). Multiple origins = comma-separated. After editing, **restart** the api container (env_file would need a recreate; the mounted `.env` only reloads on restart). A rejected origin is logged as `CORS rejected origin`.
- **Federated SSO (Google/Microsoft) fails with `crypto.subtle is undefined`** → the page is served over plain `http://`. WebCrypto only exists in a secure context (HTTPS or localhost). Email/password login still works on http; SSO needs HTTPS. Raw-IP hosts cannot get a Let's Encrypt cert — a domain is required.
- **Frontend env didn't change after restart** → `NEXT_PUBLIC_*` are baked at build. Rebuild (`up -d --build`), don't restart.
- **Cognito redirects** → `NEXT_PUBLIC_OAUTH_REDIRECT_SIGNIN/SIGNOUT` must be added as Allowed callback URLs in Cognito App Client.
