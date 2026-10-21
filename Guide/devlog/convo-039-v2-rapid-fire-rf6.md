# Convo 039 — v2 Rapid-Fire RF-6 (Rapid org-switch race conditions)

**Date:** 15 May 2026

---

## What happened

Resumed the v2 rapid-fire round after RF-5 closed in convo-038. One question locked this session: **RF-6 — rapid org-switch race conditions.**

User opened by recalling the RF-2 debounce ("we are handling it with UI debounce nah?") and asked whether serialization is needed if a user keeps hammering the switcher, plus what could actually go wrong. Per the recall-confirm-dont-reexplore feedback rule, I confirmed the locked RF-2 debounce up front rather than re-exploring from scratch, then walked the actual failure modes.

User pushed back on the first explanation pass: too label-heavy (A/B/C), sentences too dense. Asked for short, precise, scenario-style framing. Re-did the failure modes as five concrete situations with named orgs ("Acme" and "Globex") in 2–3 sentences each. That landed.

---

## Locked decision

**RF-6 → Option B: Frontend full-disable + `AbortController` safety net.**

While a switch is in flight, the org-switcher button is fully disabled (greyed out, non-interactive) for the entire flow:
1. `POST /api/v1/auth/switch-org` returns
2. `Auth.currentSession()` resolves with the refreshed token
3. Dashboard React Query refetch keyed to the new org completes (or errors out)

`AbortController` cancels any in-flight switch if a new one somehow gets initiated before the previous one resolves (defense against programmatic triggers, browser extensions, future code that forgets to honor `isSwitching`).

RF-2's 500ms debounce stays as the fast-double-click layer underneath.

**~15–20 lines of frontend code. No backend changes.**

---

## What could go wrong (the five scenarios that motivated the disable)

1. **Cognito attribute lands on the wrong org.** Acme write slow, Globex write fast — Globex completes first, Acme completes second, Cognito ends up = Acme even though user wanted Globex.
2. **Token-in-storage and UI display diverge.** Two parallel `Auth.currentSession()` refreshes, last writer to localStorage wins. UI says Globex, token says Acme, next API call returns Acme's data on a Globex-labelled screen.
3. **Dashboard data flash.** Old-org queries return after the switch; without org-keyed React Query keys, the new dashboard briefly renders the old org's rows.
4. **`last_accessed_at` ordering glitch.** Two `UPDATE user_orgs` land out of order; dropdown shows wrong "most recent" for a moment. Cosmetic, fixes itself on next switch.
5. **Other tabs flicker.** `storage` event from RF-1 fires per transition; second tab catches the mid-race sequence and visibly flips A → B → A → B before settling.

**No security issue from any of these.** Q3 middleware re-validates `user_orgs(user_id, current_org_id)` every request, so worst-case is wrong-org data the user is already authorized to see, briefly, with a mismatched header label.

---

## Rejected alternatives

- **A. Debounce alone (RF-2 only), accept rare races.** Loses on slow networks where one switch takes 2–3 seconds; a second click well after the 500ms debounce window can still overlap. Not chosen.
- **C. Backend per-user serialization lock (Redis or DB advisory).** Strongest guarantee. Overkill for v2 — we have exactly one client (our own React frontend) and we own the guard. Parked in `upgrades.md` under "Backend per-user serialization lock for org switching" with revisit trigger = first non-browser client (mobile SDK, CLI, third-party API) ships.
- **D. Backend last-write-wins with monotonic version stamp.** Doesn't actually fix the UI-flash problems, only deduplicates Cognito writes. Not worth the complexity.

---

## Companion locks that came out of RF-6

- **All React Query keys must include `orgId` as the first cache-key segment.** Standardized so a stale in-flight refetch from before the switch can't pollute the new org's view. Needs to land in `standards.md` under React Query conventions (action item — not done in this convo).
- **Backend Redis lock parked** in `upgrades.md` with concrete implementation sketch (Redis `SET NX PX` or Postgres `pg_advisory_xact_lock`).

---

## Doc state at session close

**Modified:**
- `docs/v2-rapid-fire.md` — RF-6 moved from "Pending discussion" → "Decided" section. Short conversational answer written.
- `docs/v2-decisions.md` — new "## RF-6. Rapid org-switch race conditions" section appended after RF-5 in the "Edge-case decisions (post-Q16 rapid-fire round)" area. Full strategic format (Why it matters / Options / Tradeoffs / Decision / Companion locks / Discussion notes).
- `docs/upgrades.md` — new park added: "Backend per-user serialization lock for org switching *(RF-6)*" between the Cognito multi-region park and the CSRF park. Includes Redis and Postgres advisory-lock implementation sketches.
- `docs/devlog/convo-039-*.md` — this file.

**Memory:** No new memory saved this session. The recall-confirm-dont-reexplore rule was applied successfully (confirmed RF-2 debounce up front, didn't re-explore). The "don't over-explain mid-decision clarifiers" + "simpler scenario format" feedback was a re-application of existing rules, not a new one.

---

## Process notes

- **First explanation pass was too label-dense.** Used A/B for the orgs in race scenarios — user found it abstract. Re-did with named orgs (Acme, Globex), and each scenario became 2–3 sentences max. Lesson: for failure-mode walk-throughs, named concrete entities beat letter placeholders. Already covered by existing `feedback_dont_over_explain` memory; no new memory needed.
- **User signalled recall right at the open** ("we are handling it with UI debounce nah?") — confirmed RF-2 immediately, didn't re-justify the debounce. The new feedback-recall rule from convo-038 worked as intended.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-6:** locked.
- 🔜 **Rapid-fire RF-7 to RF-16:** pending (10 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## Resume context (next session)

Pick up at **RF-7** in the rapid-fire queue. Remaining 10 in queue order:

- **RF-7.** SSO providers → `user_orgs` mapping (Google, Microsoft, SAML — email-based mapping? invitations still gate? enterprise IdP onboarding?)
- **RF-8.** DB ↔ Cognito sync failure reconciliation (DB write succeeds, Cognito write fails — or vice versa — rollback/retry/reconcile?)
- **RF-9.** Session and permission consistency mid-flight (user removed mid-session; role changed mid-session — frontend reaction?)
- **RF-10.** Subscription expiry session behavior (user-side UX moment expiry fires mid-action — partial: Q11 locks org state, this is the user-side delta)
- **RF-11.** Active-org deleted while user is logged in (auto-switch vs force org-selection — partial: Q14 locks retention, this is the user-side delta)
- **RF-12.** Invite edge cases beyond Q6 happy path (duplicates, expired tokens, accepted-after-removal)
- **RF-13.** Token refresh stale window during org switch (mid-switch refresh failure, block API calls during refresh, fallback, consistency)
- **RF-14.** Per-request membership validation scaling (Redis cache, shorter TTL, read replicas — when does this become a bottleneck, what's the trigger to add caching)
- **RF-15.** Cache invalidation strategy (future Redis) — bound to RF-14
- **RF-16.** Cognito swap future-proofing (preserving `users.id` mapping if we swap to Auth0 / custom IdP later)

**After all rapid-fire locks** (unchanged from convo-038 plan):
1. v1 functional issue capture (permissions, UX, broken flows triage into must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup (infra, docs structure, backend folder layout, frontend folder layout).
3. Phase re-sequencing — map everything onto Phase A/B/C…
4. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.

**Action item from RF-6 not yet done:** add a "React Query keys must include `orgId` as the first cache-key segment" rule to `standards.md` (under React Query conventions, if a section exists — otherwise create one). Bookkeeping; defer until standards-doc pass after rapid-fire round closes.
