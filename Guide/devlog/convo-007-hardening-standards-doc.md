# Convo 007 — Server Hardening, API Versioning & Standards Doc
Date: 2026-04-08

---

## Changes Made

### backend/server.ts
- Added env validation on startup — checks all required vars, exits with clear error if missing
- Added `app.set('trust proxy', 1)` — correct client IP behind Nginx for rate limiting
- Changed `express.json()` → `express.json({ limit: '10kb' })` — prevent large payload attacks
- Added 404 handler — returns `{ success: false, error: 'Route not found' }` instead of Express HTML default
- Added graceful shutdown on SIGTERM/SIGINT — closes DB pool before exit
- Updated route comments: health stays at `/api/health` (unversioned), features mount at `/api/v1/*`

### backend/config/db.ts
- Added `pool.on('error', ...)` handler — prevents unhandled exception crash on idle client errors

### docs/info.md
- Updated MODULE → API ROUTE MAPPING to show versioned `/api/v1/` for feature routes
- Updated `NEXT_PUBLIC_API_URL` to `http://localhost:4000/api/v1`

### docs/devguide/00-overview.md
- Updated base URL to `/api/v1`
- Added versioning note

### docs/standards.md (NEW)
- Project-agnostic engineering best practices reference
- Covers: architecture, backend standards, frontend standards, security, resilience, observability, tooling decisions + tradeoffs, design patterns, and "what to think about on any new project"
- Living document — updated as project grows

### CONVENTIONS.md
- Added rule: update docs/standards.md when any new standard/pattern/decision is made

---

## Key Decisions

### API Versioning
- Versioning is done in code, in server.ts at route mount level — no separate config
- Health endpoint stays unversioned (`/api/health`) — it's infrastructure, not a feature API
- All feature APIs: `/api/v1/auth`, `/api/v1/projects`, etc.
- Frontend `NEXT_PUBLIC_API_URL` = `http://localhost:4000/api/v1`

### Standards Doc
- Lives at `docs/standards.md`
- Not project-specific — general guide for building any high-standard project
- Includes tradeoffs for every tooling decision
- Includes design patterns in use
- Ends with a "9 questions to answer before writing feature code" checklist

---

## What's In Place Now (full picture)
- Helmet, CORS (env-based), rate limiter (Redis-ready) ✓
- Trust proxy, payload limit, 404 handler ✓
- Env validation on startup ✓
- Graceful shutdown ✓
- DB pool error handler ✓
- Centralized error handler ✓
- Structured pino logging with userId on every log ✓
- PostgreSQL transactions rule (conventions) ✓
- Optimistic UI with rollback rule (conventions) ✓
- API versioning at `/api/v1/` ✓

## Next
Phase 2 — Auth: register + login API, JWT middleware, login page.

---

USER: save convo
