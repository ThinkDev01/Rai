# Convo 009 — Auth Complete, Staging/Prod Plan, Testing Strategy
Date: 2026-04-09

---

## Context

Previous session (008) had completed all groundwork (logging, DB, migrations, seed, middleware).
This session picked up mid-auth-implementation after a context limit cut the previous session short.

---

## Changes Made

### backend/modules/auth/auth.model.ts
- Added `findUserById(id)` — queries users by PK, used by /me endpoint

### backend/modules/auth/auth.controller.ts
- Added `me` handler — protected, fetches user from DB by ID from JWT payload
- Imported `findUserById` and `AuthenticatedRequest`

### backend/modules/auth/auth.routes.ts
- Added `GET /me` route behind `authMiddleware`

### frontend/lib/api.ts
- Fixed bug: 401 redirect was going to `/login` (404) — corrected to `/auth/login`
- Added `localStorage.removeItem('rai_user')` on 401 clear (was only clearing token)

### frontend/store/auth.store.ts
- `hydrate()` is now async — hits `GET /api/v1/auth/me` on app mount to verify token server-side
- Added `isHydrating: true` state — starts true, set to false after /me resolves (success or fail)
- On /me success: updates user from server response (catches stale localStorage data)
- On /me fail: clears token + user from localStorage (catches expired/invalid tokens)

### frontend/providers/AuthProvider.tsx
- Updated to `void hydrate()` (async now)
- Added `isHydrating` guard — returns null until hydration completes, prevents redirect flash

### docs/devguide/02-auth.md (new)
- Full API reference for register, login, /me — includes curl examples, role table, seed users

### docs/scalability.md
- Added STAGING + PRODUCTION ENVIRONMENTS section (marked PRIORITY, first thing to do at deploy time)
- Added TESTING STRATEGY section (marked PRIORITY, do after feature freeze)

---

## Decisions Made

**Staging/prod setup:** Two separate EC2 instances, same codebase, different .env files.
Only environment variables differ (DB_PASSWORD, JWT_SECRET, CORS_ORIGIN, NODE_ENV).
No CI/CD yet — manual git pull + docker compose up per instance is fine for an internal tool.
Staging DB stays on Docker volume; prod DB moves to RDS before first real user data.

**Testing timing:** No automated tests while features are actively being built — too much churn.
Add integration tests (Jest + supertest, real test DB) after all core features are complete.
E2E with Playwright for critical browser flows after that.
Manual testing on staging is the current strategy.

**Why server-verified hydration:** The old hydrate() just trusted localStorage blindly.
An expired token would show the user as authenticated until the first API call failed.
Now /me runs on every app mount — expired tokens are caught immediately, user is redirected cleanly.

---

## State After This Session

Auth is fully implemented end-to-end. Nothing left to build in auth module.

Backend routes working:
  POST /api/v1/auth/register
  POST /api/v1/auth/login
  GET  /api/v1/auth/me  (protected)

Frontend working:
  /auth/login  → login form → JWT stored → redirect to /dashboard
  /auth/register → register form → auto login → redirect to /dashboard
  /dashboard → protected, logout clears state + localStorage
  /  → redirects to /dashboard or /auth/login based on auth state
  App mount → /me called → stale/expired tokens cleared automatically

---

## What's Next

Phase 3: Projects module
  POST   /api/v1/projects        — create project
  GET    /api/v1/projects        — list user's projects
  GET    /api/v1/projects/:id    — get single project
  PATCH  /api/v1/projects/:id    — update project
  DELETE /api/v1/projects/:id    — delete project (admin only)

Frontend: project list page, create project form, project detail page.
