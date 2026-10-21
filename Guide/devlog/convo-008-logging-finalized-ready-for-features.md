# Convo 008 — Logging Finalized, All Groundwork Complete, Ready for Features
Date: 2026-04-08

---

## Changes Made

### backend/config/logger.ts
- Added `singleLine: true` — all log fields on one line in dev terminal
- Added `userId` to ignore list — no duplicate userId in the JSON blob (already in prefix)
- Timestamp format: `dd-mm-yyyy HH:MM:ss`
- messageFormat: `[{userId}] {msg}` — userId always first in the readable line

### backend/server.ts
- Added `customProps: () => ({ userId: 'http' })` to pino-http — HTTP access logs now show `[http]` not `[]`

### frontend/lib/logger.ts (new)
- Dev-only logger for client components
- Format: `[userId] [Component] message {"remaining":"fields"}` — userId extracted from data, placed first
- `logger.info` — suppressed in production
- `logger.error` — always logs, never sensitive data
- All frontend logs go to browser DevTools console (F12) only

### frontend/lib/api.ts
- Updated baseURL fallback from `/api` to `/api/v1`

### frontend/.env.local
- Updated `NEXT_PUBLIC_API_URL` from `http://localhost:4000/api` to `http://localhost:4000/api/v1`

### CONVENTIONS.md
- Added API versioning rule: feature routes under `/api/v1/`, health stays at `/api/health`
- Added frontend logger rule: always use `lib/logger.ts`, never console.log directly
- Added doc ownership + update trigger rules
- Added CONVENTIONS.md lock rule (requires explicit user permission to change)

### docs/scalability.md
- Added item 8: Sentry frontend error tracking (add before prod deploy, Phase 9)
- Updated infra upgrade order to include Sentry at step 2

---

## Final Log Format

Backend terminal:
```
[08-04-2026 20:01:39] INFO: [system] Rai API server started {"port":4000,"env":"development"}
[08-04-2026 20:01:39] INFO: [http] request completed {"req":{"method":"GET","url":"/api/health"},"res":{"statusCode":200}}
[08-04-2026 20:01:39] INFO: [anonymous] Controller accessed {"route":"/api/health","method":"GET"}
```

Frontend browser console:
```
[anonymous] [LoginPage] login API call {"email":"user@x.com"}
[user-123]  [LoginPage] login success
[anonymous] [LoginPage] login failed {"status":401}
```

---

## Decisions Locked

- Frontend logs = browser DevTools only. No terminal for frontend.
- Backend logs = terminal (dev) + CloudWatch JSON (prod). Already production-ready.
- http://localhost (NOT https) for local dev. https is Nginx's job in production.
- CONVENTIONS.md is locked — requires explicit user permission to change.

## Full Groundwork Status — COMPLETE

- PostgreSQL running, 7 migrations applied ✓
- Server: env validation, trust proxy, payload limit, 404, graceful shutdown ✓
- Security: Helmet, CORS, rate limiter ✓
- Logging: pino (backend) + frontend logger ✓
- TypeScript compiles clean ✓
- All docs current ✓
- Conventions locked ✓

## Next
Phase 2 — Auth:
  Backend: POST /api/v1/auth/register, POST /api/v1/auth/login, authMiddleware.ts
  Frontend: login page, Zustand auth store wired up, axios interceptor active

---

USER: save convo
