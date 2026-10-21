# Convo 036 — v2 Q12 Locked: Service Layer Decomposition

**Date:** 14 May 2026

---

## What happened

Q12 (service layer decomposition) was the first item on today's agenda. Walked through it from first principles because the user wasn't fully clear on what "service layer" meant in the context of their existing module structure (`routes → controller → model` per module). Discussion converged on a **modular monolith** layout that's microservice-ready by construction.

---

## The framing

User's starting point: existing modules already have `routes → controller → model → DB`. Where does a "service" fit, and why would we even add one?

Answer captured in plain terms:
- **Controller** = HTTP layer (req/res). No business logic.
- **Service** = business rules. Owns "the answer" to questions like "is this org active?" Called by controllers; calls one or more models.
- **Model** = pure SQL. No business rules.

The reason a service layer becomes load-bearing in v2: v2 introduces rules that span modules (every write path needs an `isOrgActive(orgId)` check, every read needs `isUserInOrg(userId, orgId)`). If those checks live in controllers, they get copy-pasted into 8 places. If they live in models, models stop being pure SQL. A service is the only correct home.

---

## What got rejected

**Top-level `backend/services/` folder** (my initial proposal). User pushed back when they realized the existing `modules/auth/` would create split-brain — "is auth a module or a service?" Reshuffling the entire auth module to live under `services/` was clearly worse than the alternative.

**Inlining tenant/billing logic in existing modules** (option C from the decisions doc). Rejected on day one — guaranteed regret by mid-build.

---

## What got locked

**Layout — modular monolith. Every concern is a module; the module's `*.service.ts` is its public API.**

```
backend/modules/
  auth/         ← existing; add auth.service.ts (CognitoAuthService impl)
  orgs/         ← NEW for v2 — owns org CRUD + membership + role lookups
  billing/      ← NEW for v2 — subscriptions + seat enforcement + read-only checks
  tickets/, projects/, sprints/, ...  ← consume the above via *.service.ts only
```

**Rules locked:**

1. **Service-file-only cross-module imports.** Module A imports from `modules/B/B.service.ts` only — never from `B.model.ts`, `B.controller.ts`, or `B.routes.ts`. Rejected at PR review.
2. **Service file is opt-in.** Only required when another module consumes the logic, or when the controller is doing real business logic (multiple model calls, validation chains). Modules that stay controller → model today: `health`, `me`, `comments`, `reports`, `search`, `backlog`.
3. **No top-level `services/` folder.** Every service has a home module.
4. **Interface-first for swappable services.** `AuthService` already follows this (`standards.md` §8). `BillingService` follows the same pattern from day one: interface + `LocalBillingService` implementation, so a future `HttpBillingService` swap is mechanical.

---

## Microservice future-readiness

Three services, three different futures — and the layout accommodates all of them:

- **Billing** — natural first peel-out. Own schema, payment-provider integration, background jobs. The day it splits, `mv modules/billing/ ../billing-service/` + replace `LocalBillingService` with `HttpBillingService` implementing the same interface. Controllers stay unchanged.
- **Auth** — already external (Cognito). The in-repo `auth.service.ts` is already a thin client.
- **Orgs (TenantService)** — *worst* microservice candidate. Every request needs "is user in org?", and turning that into a network call would add 5–20ms latency to every endpoint. Stays in-process indefinitely. The layout doesn't force the split — the rule is "interface contract makes the option available," not "make it a service every time."

The key insight: **the folder layout doesn't matter for the split. The interface contract does.** As long as services are accessed through an interface, the split is mechanical regardless of how the code is organized today.

---

## Discussion notes

- User asked "isn't 'import only *.service.ts' overkill — every module needs a service file then?" Answer: no, opt-in. Walked through their 13 existing modules and flagged which need a service file (auth, orgs, billing, tickets, projects, sprints, users) vs which don't (health, me, comments, reports, search, backlog).
- Industry references named to ground the pattern: Domain-Driven Design bounded contexts, NestJS module/provider system (framework-enforced version of this rule), Spring Boot `@Service` classes, Kamil Grzybek's "Modular Monolith" series, Simon Brown's C4 model.
- Rule of thumb captured: don't pre-create empty service files. Add when consumed by another module or controller crosses ~20 lines of real logic.
- User specifically asked about long-term microservice play. Confirmed that the interface pattern (already in place for `AuthService` via `standards.md` §8) is what makes the split painless, and that billing should be designed for it from day one while orgs explicitly should not.

---

## Doc state at session close

- `docs/v2-decisions.md` — Q12 rewritten from DEFERRED to locked, with full layout + rules + microservice rationale. Status list updated: Q12 marked ✅, removed from deferred list.
- `docs/standards.md` — new entry in §2 "Service layer + cross-module imports" codifying the rule for PR review enforcement. Cross-references Q12 in v2-decisions.md.
- `docs/devlog/convo-036-*.md` — this file.

---

## v2 decisions status at session close

- ✅ **15 locked** — Q1–Q12, Q14, Q15, Q16
- ⚠️ **1 partial** — Q13 migration order (locked) + ID format (deferred)

One remaining: Q13 ID format. ~5-minute discussion expected (mixed vs all-UUID).

---

## Resume context (next session)

Next up: **Q13 ID format.** Short. Two options on the table from the existing Q13 entry:
- **Mixed (recommended):** `users.id` UUID (Cognito constraint), `organizations.id` UUID + slug, BIGSERIAL for tenant tables (tickets/projects/sprints/comments).
- **All-UUID:** consistent everywhere; ~10–15% bigger indexes; cleaner mental model.

After Q13 locks → **phase re-sequencing conversation** → build kickoff per the user's plan from convo-035 (frontend shell → APIs → testing → `/security-review` → staging → prod).
