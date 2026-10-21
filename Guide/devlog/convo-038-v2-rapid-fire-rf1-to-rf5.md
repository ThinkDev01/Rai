# Convo 038 — v2 Rapid-Fire Round, Part 1 (RF-1 through RF-5)

**Date:** 14 May 2026

---

## What happened

Continuation of the v2 decision sessions after Q12 (convo-036) and Q13 (convo-037) closed out the original 16 strategic questions. Today opened the **rapid-fire round** — a queue of edge-case and operational questions raised by the team after seeing the strategic locks. User dumped ~22 raw questions; deduped to 16 unique items + 1 already-decided (RLS).

Five locked this session: RF-1 through RF-5. Eleven still pending for tomorrow.

---

## Process / format pivot mid-session

Mid-round the user pushed back on doc format:

1. **Capture-as-we-go, not batched-at-end.** When the user asked "are you writing these somewhere?" I admitted I'd been planning to batch. Fixed immediately — created `docs/v2-rapid-fire.md` and started writing each lock in the same response as the discussion.

2. **Two-file format split.** User wanted:
   - `v2-rapid-fire.md` — flat Q&A, team's original question phrasing kept verbatim, short conversational answers (2–4 sentences). For team sharing.
   - `v2-decisions.md` — same RF entries but in the strategic Q1–Q16 format (Why it matters / Options / Tradeoffs / Decision / Companion locks / Discussion notes). Added as a new section "Edge-case decisions (post-Q16 rapid-fire round)" at the bottom of the strategic doc.

3. **Stop re-exploring options when user signals recall.** New feedback memory saved (`feedback_recall_confirm_dont_reexplore.md`) — when user says "didn't we handle this?" or "I think we did X nah?", confirm against locked state in 1–3 lines and move on, don't re-list A/B/C. Updated to apply *proactively* too — check existing decisions before launching a fresh option analysis, even when user doesn't signal.

---

## Locked decisions

### RF-1. Multi-device and multi-tab session sync

- **Same browser tabs:** `storage` event listener on Amplify's localStorage auth keys. Logout / org switch / role change in one tab reflects in all others immediately. ~10 lines of frontend code.
- **Cross-device (web ↔ mobile, web ↔ different browser):** lazy detection — next API call hits the 401/403 interceptor, device cleans up and redirects on its own.
- **Mobile vs web tokens are fully separate** — each device authenticates independently with Cognito.
- **v3 parks:** WebSocket/SSE active push + "Active sessions" UI (already in `upgrades.md`).

### RF-2. Cognito API rate limits and retry/backoff

- **Backend `withCognitoBackoff` helper** wraps every Cognito write SDK call. Retries on `TooManyRequestsException` / `ThrottlingException` only — 100ms → 300ms → 1s with ±20% jitter, max 3 retries, then 503 to client.
- **Frontend debounce** on org-switcher button (~500ms after click).
- **AWS Service Quotas ticket** is the actual scaling lever (raise 25/sec admin write limit to 250/sec+, free, 1–2 business days). Not multi-pool sharding.
- **v3 parks (new):** multi-region Cognito user pools, token-refresh-storm handling. Both added to `upgrades.md`.

### RF-3. Auth and security audit logging

- **Deferred to v3.** Dedicated `audit_log` table + retention + compliance UI is full v3 project.
- **v2 baseline (no new code):** standard request logger (per `standards.md` §6) + Cognito's `AdminListUserAuthEvents` (30-day auth event history, free) + DB `created_at` / `updated_at` + centralized error handler + support inbox for manual incident response.
- **v3 park:** comprehensive audit logging (already in `upgrades.md`). **Suspicious-activity detection** (Cognito Advanced Security tier, $0.05/MAU) is a separate independent toggle, also parked.

### RF-4. No-org post-signup UX

- **Empty-state screen, two paths:** "Create organization" (form → user becomes owner → trial subscription created per Q10) OR "Wait for invite" (informational text only, not a button).
- **No browse-and-request-to-join.** Joining requires self-create or invite. Same screen for new users post-signup AND existing users who lose their last membership.
- **Sequence:** Signup → Cognito email verify → first sign-in → backend checks `user_orgs` count → zero → empty state.
- **Invite click bypasses empty state** at any later point (per Q6's logged-in path).
- Largely consolidates pieces already locked in Q1, Q6, Q7 — RF-4 just makes the full sequence explicit.

### RF-5. Many-orgs UX

- **Top-right switcher renders 8 most recently accessed orgs** sorted by `user_orgs.last_accessed_at DESC` (new column, updated on each switch).
- **"Show more" button** loads +8 per click (16, 24, 32, …).
- **Search input appears at 20+ orgs** — client-side filter over full list.
- **`MAX_ORGS_PER_USER=100`** env-configurable cap enforced at accept-invite and create-org paths; rejects with "max orgs reached" past the limit. `internal_admin` can override via env.
- **v3+ parks:** server-side pagination, true fuzzy search backend, pinning/favorites, weighted recency, sidebar workspace switcher.

---

## Doc state at session close

**Modified:**
- `docs/v2-rapid-fire.md` — new file. RF-1 to RF-5 in "Decided" section; RF-6 to RF-16 in "Pending discussion"; RF-17 (RLS) under "Already decided in Q1–Q16."
- `docs/v2-decisions.md` — new section "Edge-case decisions (post-Q16 rapid-fire round)" appended after Q16. RF-1 through RF-5 fully written up in strategic format. Companion-doc reference updated at top.
- `docs/upgrades.md` — two new v3 parks added: "Token refresh storm handling" and "Multi-region Cognito user pools," both tagged with `*(RF-2)*` back-reference.
- `docs/devlog/convo-038-*.md` — this file.

**Memory:**
- `feedback_recall_confirm_dont_reexplore.md` — new memory. When user signals recall or proposes an answer, confirm against locked state in 1–3 lines. Also applies proactively — check existing decisions (Q1–Q16 + RF-N + standards + upgrades + recent devlogs) before re-exploring options.
- `MEMORY.md` index updated.

---

## v2 decisions status at session close

- ✅ **Strategic Q1–Q16:** all 16 locked.
- ✅ **Rapid-fire RF-1 to RF-5:** locked.
- 🔜 **Rapid-fire RF-6 to RF-16:** pending (11 entries queued in `v2-rapid-fire.md`).
- ✅ **RF-17 (RLS):** already covered by Q3.

---

## Resume context (next session)

Pick up at **RF-6** in the rapid-fire queue. The remaining 11 in queue order:

- **RF-6.** Rapid org-switch race conditions (serialize switch requests? frontend disable during switch? response ordering?)
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

**After all rapid-fire locks** (per the flow user laid out in convo-035 + this session):
1. v1 functional issue capture (permissions, UX, broken flows triage into must-fix-v2 / defer-v3 / won't-fix).
2. Overall app + infra review + structural cleanup (infra, docs structure, backend folder layout, frontend folder layout).
3. Phase re-sequencing — map everything onto Phase A/B/C…
4. Build kickoff: frontend shell → APIs → testing → `/security-review` → staging → prod.
