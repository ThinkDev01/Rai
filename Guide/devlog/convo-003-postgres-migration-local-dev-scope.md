# Convo 003 — PostgreSQL Migration, Local Dev Setup & Project Scope
Date: 2026-04-07

---

USER: switched from mysql to postgres, fix all references, verify setup, discuss scope before features

---

## Changes Made This Session

### MySQL → PostgreSQL
- `docker-compose.yml` — replaced `mysql:8.0` with `postgres:16-alpine`, `mysql-db` → `postgres-db`, port 3306 → 5432, `MYSQL_*` → `POSTGRES_*` env vars, `mysqladmin ping` healthcheck → `pg_isready`, volume `mysql_data` → `postgres_data`
- `backend/.env` + root `.env` — updated all env vars
- `backend/package.json` — removed `mysql2`, added `pg` + `@types/pg`
- `backend/config/db.ts` — rewrote using `pg` Pool
- `backend/scripts/migrate.ts` — removed mysql2 types, switched to pg query style (`$1` params, `result.rows`)
- `backend/scripts/seed.ts` — same
- All 7 SQL migrations — `AUTO_INCREMENT` → `SERIAL`, `TIMESTAMP` → `TIMESTAMPTZ`, `ENUM` → `VARCHAR + CHECK`, `LONGTEXT` → `TEXT`, removed `ENGINE=InnoDB`
- `info.txt`, `CONVENTIONS.md`, `.env.example` — all MySQL refs updated to PostgreSQL
- Devlog 001 + 002 — correction note added at top

### bcrypt → bcryptjs
- Switched from native `bcrypt` to pure-JS `bcryptjs` to fix cross-platform issues (Windows host + Linux Docker container native binary mismatch)

### ts-node → tsx
- Switched from `ts-node` to `tsx` — `ts-node` 10 not compatible with Node 24, caused clean exit after server start

### Frontend — Pages Router → App Router
- Deleted `pages/` (boilerplate only, no features built)
- Created `app/layout.tsx` + `app/page.tsx`
- Moved `globals.css` into `app/`
- Clean reinstall of `node_modules`

### Logging cleanup
- `pino-http` serializers trimmed — now logs only `method`, `url`, `statusCode`, `responseTime`
- Controller logs trimmed — no full header dumps, result summaries only
- CONVENTIONS.md updated to reflect new logging rules

### Local Dev Setup
- Hybrid approach: only `postgres-db` runs in Docker, backend + frontend run in local terminals
- `DB_HOST=localhost` in `backend/.env` for local dev (change to `postgres-db` for Docker)
- Backend: `npm run dev` in `backend/`
- Frontend: `npm run dev` in `frontend/`

---

## Scope Discussion

### Frontend
- State: **Zustand** (global/auth state) + **TanStack Query** (server/API state)
- Base axios instance with interceptors for all API calls

### Backend Security
- Already: JWT middleware, rate limiting
- To add: `helmet.js`, input sanitization
- API keys for AI integration — separate `api_keys` table, own middleware, same REST endpoints

### AI Integration Plan
- Users generate a personal API key in the app
- Any curl/AI request sends `Authorization: Bearer <api_key>`
- Backend validates key, identifies user, serves data from same REST APIs
- Stateless — no special architecture needed

### Modular Monolith — restructure before features
Current layer-based structure → modular by domain:
```
modules/
  auth/        auth.controller.ts, auth.model.ts, auth.routes.ts, auth.types.ts
  projects/
  sprints/
  tickets/
  comments/
  backlog/
```
Each module self-contained → easy microservice extraction later.

### Future Stack
- Redis + queues — add when needed, not now
- AWS Cognito — clean swap inside `modules/auth/` only
- Mobile apps — already stateless REST, works out of the box
- RDS — just change DB_HOST env var, no code changes

### Hosting Decision
- **Now**: Single EC2 + Docker Compose (~$15-30/month, t3.small)
- **Later (500+ users)**: ECS for backend, RDS for DB, CloudFront for frontend
- Don't over-engineer until hitting actual scale problems

### Pre-feature groundwork (next session)
1. Restructure backend to modular monolith
2. Add `helmet` middleware
3. Install Zustand + TanStack Query on frontend
4. Set up base axios client with interceptors

Then: auth feature first.

---

USER: save convo
