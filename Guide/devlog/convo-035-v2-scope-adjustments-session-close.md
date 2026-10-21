# Convo 035 — v2 Scope Adjustments & Session Close

**Date:** 13 May 2026

---

## What happened

Wrap-up of the Q10/Q11/Q14 session. Two scope adjustments + plan review.

## Scope adjustments

1. **Internal admin panel → moved from v2 to v3.**
   - Initially locked as v2 scope alongside Q10/Q11. Reconsidered at end of session.
   - For v2 customer base (internal team + handful of initial orgs), direct DB queries + `support@…` shared inbox handle support volume. Building the panel now is premature.
   - Full spec preserved in `upgrades.md` under "Internal Admin Panel (v3)" so v3 work picks it up cleanly.
   - Trigger to build earlier: support volume exceeds what one engineer can handle via direct DB.

2. **Google SSO → moved from `upgrades.md` parked into v2 scope (Phase B).**
   - Cognito federated identity toggle + Amplify UI work, ~3–4 hours total.
   - **Microsoft SSO recommended for v2 alongside Google** (same mechanism, B2B-essential for Office 365 users) — TBD pending user confirmation.
   - GitHub and SAML remain parked in `upgrades.md`.

## Internal-tool-vs-ship overengineering reflection

User raised: was the v2 work overengineered if the product never ships beyond internal use?

**Answer captured (one-liner):** Not overengineering. Retrofitting multi-tenancy onto a single-tenant app is the most expensive refactor class in B2B SaaS — touches schema, auth, every query, JWT, frontend. ~1 week of upfront design beats 2+ months of cleanup + downtime risk *if* the product is ever shipped externally. The strategic shift to multi-tenant before prod was the load-bearing decision; everything downstream of it is right-sized.

## Build plan reviewed

User-proposed sequence:
1. Q12 + Q13 ID format (tomorrow)
2. Phase re-sequencing conversation
3. Frontend shell first
4. APIs to match
5. Manual testing (user)
6. Happy path testing (me)
7. Automated edge-case testing
8. Staging
9. Production

**Added:** `/security-review` between automated tests and staging. Catches OWASP-class issues (auth bypass, SQL injection, IDOR, missing tenant-isolation filters). Standard pre-prod gate.

## Doc state at session close

- `docs/v2-decisions.md` — Q10, Q11, Q14 locked. Q11 internal admin panel note updated to reflect v3 move.
- `docs/v2-plans.md` — Internal Admin Panel section replaced with deferral note. Phase B updated to include Google SSO (Microsoft TBD).
- `docs/upgrades.md` — "Third-party SSO" entry updated (Google v2, others parked). New "Internal Admin Panel (v3)" entry with full spec.
- `docs/devlog/convo-033-*.md` — Q10 + Q11 lock.
- `docs/devlog/convo-034-*.md` — Q14 lock.
- `docs/devlog/convo-035-*.md` — this file (scope adjustments + session close).

## v2 decisions status at session close

- ✅ **14 locked** — Q1–Q11, Q14, Q15, Q16
- ⚠️ **1 partial** — Q13 migration order
- 🔜 **2 deferred** — Q12 (service layer), Q13 ID format

Both remaining are short. Next session ships both → all 16 questions locked → phase re-sequencing conversation.

## Resume context (when user returns)

User said: "Q12 and Q13 ID format I will handle tomorrow." Next session opens with Q12 first (the locked subscription schema makes BillingService boundary obvious), then Q13 ID format (5-min discussion). After both lock, move to phase re-sequencing.

**Microsoft SSO confirmed for v2** at end of session — alongside Google. Both ship in Phase B.

`/security-review` pre-prod gate also confirmed by user.
