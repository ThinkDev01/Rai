# convo-068 — Production Environment Setup: Proposal Review

**TL;DR**
- Reviewed the devops **Rai Production Environment Setup Proposal** (separate VPC, ALB, ASG, RDS, Cognito, SES, CI/CD).
- v2 of the proposal is **prod-grade** — fixes the HA gap (ASG min 2), solves duplicate-cron (EventBridge), separates staging/prod pipelines.
- Locked most decisions; a few small "pick one" items + repo code changes remain.
- Est. prod cost ~**$340/mo** full-HA (200 concurrent / 500 users), trim-able to ~**$200–230/mo** lean.
- **Next:** decide the open items tomorrow, then implement repo changes (port binding var, `.env` from Secrets Manager, migrate step).

---

## Context
This is the next step after staging (already LIVE at `rai-staging.novetum.com`). Goal: a **separate, secure, HA, scalable** production environment. The devops proposal went through two revisions during this convo — v2 is the one we're acting on.

---

## Proposed Production Architecture (agreed shape)

**Flow:** Users → GoDaddy DNS → ALB → FE ASG / BE ASG → RDS PostgreSQL

- Domains: `rai.novetum.com` (FE), `api.rai.novetum.com` (BE) → both point to one ALB (host-based routing).
- Separate **`rai-prod-vpc`** with public + private subnets across 2 AZs.

### Subnet layout
- **Public:** ALB + NAT Gateway
- **Private app:** FE EC2 + BE EC2
- **Private DB:** RDS PostgreSQL

---

## AWS tools in the production stack
- **VPC** — separate `rai-prod-vpc`, public + private subnets, multi-AZ
- **ALB** — public entry, host-based routing (FE vs API)
- **NAT Gateway** — outbound for private subnets
- **ACM** — SSL certs (DNS-validated via GoDaddy)
- **EC2 + Auto Scaling Groups** — FE ASG + BE ASG, min 2 / max 4, multi-AZ
- **Launch Template / AMI** — pre-baked runtime (Docker, agents, IAM)
- **RDS PostgreSQL** — separate prod DB, private, Multi-AZ
- **Cognito** — separate prod user pool, `custom:current_org_id`
- **SES** — app emails (SPF/DKIM/DMARC in GoDaddy)
- **EventBridge Scheduler** — runs cron once (not per-instance)
- **ECR** — Docker image registry (versioned tags)
- **CodePipeline / CodeBuild / CodeDeploy** — separate FE/BE, staging/prod pipelines
- **CloudWatch** — logs + alarms (EC2 / backend / RDS)
- **SNS** — alarm email notifications
- **Secrets Manager** — backend env vars
- **WAF** — on ALB
- **IAM** — roles per layer
- **Security Groups** — layered, SG-to-SG locking
- **SSM Session Manager** — instance access (no bastion/SSH)

---

## Key discussions & decisions

### 1. nginx vs no-nginx (port binding)
- Staging runs **host nginx** → containers bind `127.0.0.1:4000` (BE) / `127.0.0.1:3000` (FE).
- Prod uses **ALB directly** → nginx is redundant (ALB does TLS + routing + health). **Drop nginx in prod.**
- Containers must bind `0.0.0.0` so the ALB can reach them via private IP.
- **Safe:** backend SG allows 4000/3000 **only from the ALB SG**, never public.
- **Decision — env-based binding** (same repo serves both envs, don't hardcode):
  - Add a `PORT_BINDING` variable in `deploy_container.sh`.
  - Staging: `127.0.0.1:4000:4000` / `127.0.0.1:3000:3000` (nginx).
  - Prod: `4000:4000` / `3000:3000` (ALB direct).
  - Mirrors the existing `ENVIRONMENT=dev|prod` flag pattern that already splits log format.

### 2. How `/opt/rai/backend/.env` is created (no manual copy in prod)
- Staging = file created + copied manually. Won't work with ASG (instances are cattle, auto-launched).
- Two options considered:
  1. Bootstrap (Launch Template user-data) writes `.env` from Secrets Manager — but existing instances keep stale `.env` on secret change.
  2. **CodeDeploy script writes `.env` each deploy** from Secrets Manager — runs on scale-out too. ✅ **Chosen.**
- **Cleanest split:** bootstrap installs runtime only (Docker, agents); CodeDeploy script pulls secrets → writes `.env` → runs container.
- Requires instance IAM perm: `secretsmanager:GetSecretValue`.

### 3. DB migrations (the open uncertainty)
- Runner already exists: `backend/scripts/migrate.ts` (tracks applied files in `schema_migrations`, idempotent).
- **Risk:** with 2+ BE instances, running migrations on boot = race (same duplicate-execution problem as cron).
- **Recommended:** run migrations as a **one-off pipeline step** before deploy; add `pg_advisory_lock` in `migrate.ts` as a safety guard. Take an RDS snapshot before the migrate step.
- **Status: not finalised** — to decide tomorrow.

### 4. Cron → EventBridge Scheduler
- Move scheduled jobs out of BE web servers so they run **once** regardless of instance count.
- Recommended target: **EventBridge → secured backend job endpoint** (reuses existing code). Confirm endpoint exists/built.

### 5. Why separate VPC
- Blast-radius isolation: staging mistakes can't touch prod.
- Different access/monitoring/scaling for real users; cleaner billing/audit. Industry standard.
- Multi-tenancy note: **Rai's own customer orgs share one app + one DB** (isolated by `org_id`) — that's fine. A **different product/client** would get its **own VPC**, not share Rai's.

### 6. HA / scaling
- Single instance = efficient but never HA (single point of failure).
- **ASG min 2, multi-AZ** for both tiers = real zero-downtime HA.
- 500 users is small (~20–50 concurrent realistically) → bottleneck is **availability, not capacity**.
- FE is **SSR (heavy dynamic)** → must stay on EC2; S3/CloudFront-static is NOT viable. (Optional later: CloudFront in front of ALB for asset caching.)

---

## Confirmed from the codebase
- `/api/health` route **exists** (`modules/health/health.routes.ts`, already polled by `deploy_container.sh`) → use as ALB + ASG health check.
- `backend/scripts/migrate.ts` exists with `schema_migrations` tracking.
- `deploy_container.sh` currently binds `127.0.0.1:4000:4000`, mounts `/opt/rai/backend/.env` (devops-placed), ships logs via awslogs driver.

---

## Still to finalise (small picks, for tomorrow)
- **NAT:** 1 (cheap, SPOF) vs 2 (HA) → lean toward 1 to start, upgrade later.
- **DB migrations:** confirm one-off pipeline step + advisory lock approach.
- **Cron target:** confirm backend job endpoint exists for EventBridge.
- **CodeDeploy strategy:** rolling vs blue-green → lean rolling.
- **Instance sizes:** FE t3.small / BE t3.medium (tentative).
- **Branch → prod pipeline mapping.**

## Repo changes queued (not yet done)
- `backend/scripts/deploy_container.sh` → add `PORT_BINDING` var + pull Secrets Manager → write `.env`.
- (FE) `frontend/scripts/deploy_container.sh` → same `PORT_BINDING` treatment.
- Backend prod pipeline → add one-off **migrate step**.
- `migrate.ts` → optional `pg_advisory_lock` guard.

---

## Estimated monthly cost — PROD ONLY (ap-south-1, 200 concurrent / 500 users)

| Item | Spec | ~Cost/mo |
|---|---|---|
| EC2 FE ASG | 2× t3.small | $30 |
| EC2 BE ASG | 2× t3.medium | $60 |
| RDS PostgreSQL | db.t3.medium, Multi-AZ | $130 |
| ALB | 1, low LCU | $25 |
| NAT Gateway | 1 | $38 |
| ECR + S3 + snapshots | storage | $10 |
| CloudWatch + SNS | logs/alarms | $15 |
| WAF | ALB | $12 |
| Secrets Manager | few secrets | $3 |
| Data transfer | moderate | $15 |
| **Total (full HA)** | | **~$340/mo** |

> CI/CD ≈ near free-tier at this scale. Cognito/SES tiny.

### Where to cut if needed
- **RDS Single-AZ** → −$65/mo (biggest save; loses DB failover)
- **ASG min 1** (FE and/or BE) → −$30–45/mo (loses zero-downtime)
- **Drop WAF at launch** → −$12/mo
- **Smaller instances** → −$20–30/mo
- **Lean version ~$200–230/mo** (Single-AZ + min 1) — OK for soft launch, weaker HA.
- **Full HA ~$340/mo** — recommended for real prod.

---

## Next
- Decide the open "pick one" items tomorrow.
- Then implement the queued repo changes (port binding var, `.env` from Secrets Manager, migrate step + lock).
- Update `Guide/dev-deployment.md` with the finalised prod section once decisions lock.
