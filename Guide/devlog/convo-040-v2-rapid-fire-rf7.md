# Convo 040 — v2 Rapid-Fire RF-7 (SSO providers → user_orgs mapping)

**Date:** 15 May 2026

---

## What happened

Continuation of the rapid-fire round, same day as convo-039 (RF-6). RF-7 locked plus a side-band React Query convention pulled into both `v2-rapid-fire.md` (under RF-6) and `standards.md`. New feedback memory captured about not offering meta-alternatives after a directive.

User opened by recalling the prior SSO discussion (Q1 / `upgrades.md` "Third-party SSO" entry) and proposed the v2 shape directly:
- Email = identity, same as password flow
- Invites still gate org membership
- Enterprise = no special handling at v2
- SSO users skip email verification (Cognito marks federated emails verified automatically)
- Provider list: Google + Microsoft + GitHub from v2

I confirmed each point, raised one edge case (email collision between password and SSO accounts), and walked the industry options. User picked dual-mode auto-linking ("password user later signs in with Google should just work, and vice versa"), revised the provider list to Google + Microsoft in v2 with GitHub deferred to v3, and confirmed v2 treats all emails identically with domain-based auto-join parked for v3.

---

## Locked decision

**RF-7 → A + D + G.** Email-as-identity with auto-link + invites-only org grant + Google+Microsoft in v2.

**v2 shape:**

1. **Cognito "Trust provider for email" → ON.** Federated sign-in (Google, Microsoft) auto-links to existing native user when emails match AND both are verified. Single `users.id` per email.
2. **Google + Microsoft as Cognito federated IdPs.** ~3–4 hours each. OAuth client config in Cognito + Amplify `Auth.federatedSignIn()` button. No custom auth-flow code.
3. **SSO users skip Q7 email verification gate.** Federated `email_verified=true` claim from Google/Microsoft passes our backend check immediately.
4. **"Set a password" option in Settings** for SSO-only users who later want password login. `AdminSetUserPassword` call. Discoverable, not pushed.
5. **Invites still gate membership.** SSO authenticates only — never grants org access. Zero-org SSO users land on RF-4's empty-state screen.
6. **No domain-based auto-org-join.** Every email is independent at v2. `dip@acme.com` and `dip@gmail.com` are separate users with no implicit org binding.
7. **GitHub deferred to v3.** Same Cognito-toggle implementation, ~3–4 hours when we get there.

---

## Why this shape

- **Email-as-identity** (Option A vs provider-scoped or manual-link) — industry default. Notion, Linear, Slack, Vercel, Figma, Asana, Monday all do this. Cognito has it built in via one user-pool setting. No custom code, no UX friction.
- **Shadow-account hijack** (attacker pre-registers `victim@gmail.com` to claim the victim's later Google identity) is **closed by Q7** — Trust setting only auto-links when *both* sides are verified, and Q7 enforces verification before any org action.
- **SSO grants no implicit membership** (Option D vs domain auto-join or SAML federation) — keeps the v2 model consistent. Invites are the single source of org access, regardless of how the user authenticated.
- **Google + Microsoft in v2** covers ~95% of B2B sign-ins. Adding GitHub now would add ~3–4 more hours; user opted to keep v2 scope tight and pull GitHub into v3.

---

## React Query orgId-prefixed key rule

Originating from RF-6 (rapid org-switch race conditions) — a stale in-flight refetch from a previous org could flash wrong-tenant data on the new dashboard if cache keys didn't include orgId. User decided to lock it now in both:
- `v2-rapid-fire.md` — added as a "companion rule" paragraph under RF-6's answer.
- `standards.md` §3 Frontend Standards — new entry "React Query cache keys start with `orgId`" with the rule + reasoning. Industry-standard convention, no overthinking.

Convention: every TanStack Query `queryKey` for tenant-scoped data starts with `['org', orgId, ...]`. Same-key queries from different orgs cannot overwrite each other in the cache. Bonus: switching back to a previously-visited org survives a quick switch-back without a fresh fetch.

---

## Feedback memory captured

**`feedback_no_meta_options.md`** — don't tail responses with "Or I can do X instead, your call" after the user has given a clear directive. User flagged this directly: "huh wdym by i can hold it and add it with standards doc why are so talky." Specific pattern: when ambiguity is resolved, execute — don't re-offer the alternative the user just closed.

Index in `MEMORY.md` updated. This stacks with the existing `feedback_dont_over_explain` and `feedback_recall_confirm_dont_reexplore` — same family of "be direct, don't pad."

---

## Doc state at session close

**Modified:**
- `docs/v2-rapid-fire.md` — RF-7 moved from "Pending discussion" → "Decided." Short conversational answer. RF-6 entry got a companion-rule paragraph about orgId-prefixed React Query keys.
- `docs/v2-decisions.md` — new "## RF-7. SSO providers → user_orgs mapping" section appended after RF-6 in the "Edge-case decisions (post-Q16 rapid-fire round)" area. Full strategic format with three sub-option groups (identity / membership / providers), Decision = A+D+G, companion locks, full discussion notes including the shadow-hijack analysis and the industry comparison. RF-6's discussion notes got an extra line pointing at the new standards.md entry.
- `docs/standards.md` — new entry in §3 Frontend Standards: "React Query cache keys start with `orgId`." Pointers to RF-6 in v2-decisions.md.
- `docs/upgrades.md` — "Third-party SSO" entry updated: GitHub explicitly moved to v3 scope (was "still parked"), SAML/OIDC remain parked indefinitely. New entry added below: "Domain-based auto-org-join (`@acme.com` → Acme org) *(RF-7)*" parked for v3 with implementation sketch.
- `docs/devlog/convo-040-*.md` — this file.

**Memory:**
- `feedback_no_meta_options.md` — new.
- `MEMORY.md` index updated.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-7:** locked.
- 🔜 **Rapid-fire RF-8 to RF-16:** pending (9 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## Resume context (next session)

Pick up at **RF-8** in the rapid-fire queue. Remaining 9 in queue order:

- **RF-8.** DB ↔ Cognito sync failure reconciliation (DB write succeeds, Cognito write fails — or vice versa — rollback/retry/reconcile?)
- **RF-9.** Session and permission consistency mid-flight (user removed mid-session; role changed mid-session — frontend reaction?)
- **RF-10.** Subscription expiry session behavior (user-side UX moment expiry fires mid-action — partial: Q11 locks org state, this is the user-side delta)
- **RF-11.** Active-org deleted while user is logged in (auto-switch vs force org-selection — partial: Q14 locks retention, this is the user-side delta)
- **RF-12.** Invite edge cases beyond Q6 happy path (duplicates, expired tokens, accepted-after-removal)
- **RF-13.** Token refresh stale window during org switch (mid-switch refresh failure, block API calls during refresh, fallback, consistency)
- **RF-14.** Per-request membership validation scaling (Redis cache, shorter TTL, read replicas — when does this become a bottleneck, what's the trigger to add caching)
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping if we swap to Auth0 / custom IdP later)

**After all rapid-fire locks** (unchanged plan):
1. v1 functional issue capture (permissions, UX, broken flows triage into must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup.
3. Phase re-sequencing — map everything onto Phase A/B/C…
4. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.

**Carried action items:**
- None from RF-7. RF-6's React Query rule action item from convo-039 is now done (added to standards.md this convo).
