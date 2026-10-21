# Convo 004 — Modular Monolith, Frontend Groundwork & Scalability
Date: 2026-04-07

---

## Changes Made

### Backend — Modular Monolith Restructure
- Deleted layer-based folders: controllers/, models/, routes/
- Created modules/ with one folder per domain — each owns controller, model, routes
- Health module moved to modules/health/health.{controller,model,routes}.ts
- Empty module folders created and ready: auth/, projects/, sprints/, tickets/, comments/, backlog/
- server.ts updated — central router with commented placeholders for each future module

### Backend — Security & Dependencies
- Added helmet (HTTP security headers)
- Switched ts-node → tsx (Node 24 compatibility fix)
- Switched bcrypt → bcryptjs (cross-platform fix, no native binaries)

### Frontend — Base Infrastructure
- Zustand installed → store/auth.store.ts (user, token, setAuth, clearAuth)
- TanStack Query installed → providers/QueryProvider.tsx (wraps layout)
- axios installed → lib/api.ts (base instance, JWT interceptor, 401 redirect)
- layout.tsx updated to wrap children in QueryProvider
- .env.local created with NEXT_PUBLIC_API_URL

### Docs
- info.txt — fully updated with new folder structure, module→route mapping, local dev instructions
- scalability.md — created with bottlenecks, fixes, scale thresholds, upgrade order

---

## Scope & Architecture Decisions

### Zustand vs Redux
Zustand for global state (auth, current user — tiny and stable).
TanStack Query for all server/API state (tickets, sprints, lists).
With this split Zustand store stays ~20 lines forever. Redux would be overkill.
Migration concern is irrelevant — state management doesn't affect backend scaling.

### Rate Limiter (in-memory counters)
Current: express-rate-limit with in-memory store — fine for single instance.
Problem at scale: multiple instances each have own counter, limit effectively multiplied.
Fix when needed: add Redis store to rateLimiter.ts (one line swap, already isolated).
Documented in scalability.md.

### Current Scale Capacity
~100-300 concurrent users comfortably on single EC2 t3.small.
Weak point: pg pool (max 10) + no caching = DB is first bottleneck.
No Redis, no RDS, no multi-instance needed until 500+ users.

### Infra Upgrade Order (when needed)
1. RDS (env var change only)
2. Redis (rate limiter + caching)
3. ALB + multiple backend instances
4. ECS
5. CloudFront
6. RDS read replicas
7. Cognito (swap modules/auth only)

### Self-contained / Portable
Already achieved — Docker + env vars. Anyone with code + .env can run it.
JWT = stateless. No in-process sessions. Horizontal scale is plug-and-play.

---

USER: save convo
