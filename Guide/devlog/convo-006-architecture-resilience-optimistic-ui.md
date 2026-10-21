# Convo 006 — Architecture, Resilience & Optimistic UI Strategy
Date: 2026-04-08

---

## Discussion Topics

### Session Continuity
- Established pattern: AI reads CONVENTIONS.md + latest devlog at start of every session
- Added "Note to AI — Session Start" section to CONVENTIONS.md
- User will always say "save the convo" at end of important sessions

### Rate Limiter Counters (Multi-Instance)
- Current: `express-rate-limit` uses in-memory store — fine for single instance local dev
- Multi-instance production: counters would be per-instance (broken)
- Fix when needed: swap to `rate-limit-redis` store — one-line change
- No action needed now

### System Resilience — Current State
- System is currently basic (only health module built, no features yet)
- Nothing is fragile yet — patterns we use while building features will determine safety

### Rules for Every Feature (especially tickets)
- **DB transactions** for any operation touching multiple tables — all or nothing
- **DB constraints** as last line of defense (status enums, FK, not-null at DB level)
- **Atomic operations** — never two separate queries where one can silently fail
- **Meaningful error responses** — exact failure reason so frontend can react correctly

### Smooth + Snappy + Fail-Proof Strategy
- Pattern: **Optimistic UI with rollback** (Google Keep feel, not Notion heaviness)
- User action → UI updates immediately → API fires in background
  - SUCCESS → server confirms, state is truth
  - FAILURE → UI rolls back + error toast shown
- TanStack Query (already in stack) handles this via `onMutate`, `onError`, `onSettled`
- Implement this pattern once on first ticket feature → becomes standard for all features after

---

## Decisions

- Auth has no optimistic updates needed — straightforward request/response
- Optimistic update pattern introduced when we hit tickets (first stateful UI feature)
- Every ticket state change must go through a transaction on the backend

## Next
Phase 2 — Auth: register + login API, JWT middleware, login page.

---

USER: save convo
