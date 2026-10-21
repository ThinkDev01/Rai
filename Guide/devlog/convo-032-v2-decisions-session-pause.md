# Convo 032 — v2 Decisions Session Pause

**Date:** 5 May 2026

---

## What happened

Wrap-up of the v2 decisions arc that ran across convo-030 and convo-031. Two final adjustments before pausing:

- **Q8 (RDS migration timing) confirmed clean.** Locked text already correct in `v2-decisions.md`. Operational reality: change `.env` to point at fresh RDS endpoint at staging cutover, run migrations against the empty RDS instance, drop Docker DB. No data migration step (Q4 = drop and reseed already handled it).
- **Q13 ID format moved from "awaiting confirmation" → "deferred batch."** User wants more time to think it through; bundled with the billing-adjacent deferred questions even though it's not strictly billing-related, since both need more deliberation.

---

## Final v2 decisions status (paused state)

| Status | Count | Questions |
|---|---|---|
| ✅ Locked | 11 | Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q15, Q16 |
| ⚠️ Partial — locked | 1 | Q13 migration order (drop + recreate) |
| 🔜 Deferred to focused future conversation | 5 | Q10, Q11, Q12, Q13 ID format, Q14 |

**11 of 16 fully locked. Q13 migration order locked. 5 sub-questions deferred for a focused future conversation.**

---

## Resume context (what to pick up next session)

When user returns, the next conversation has two natural anchors:

1. **The deferred batch** — Q10 (free trial card on file), Q11 (subscription expiry behavior), Q12 (service layer decomposition), Q14 (org deletion — hard vs soft + retention), and Q13 ID format (mixed vs all-UUID). Q10/Q11/Q12/Q14 are tightly interlinked (billing/subscription policy); Q13 ID format is independent but sitting in the same deferred batch by user request.

2. **After all 16 lock**, a separate dedicated phase-planning conversation re-sequences the work into concrete phases. The phase organization in `v2-plans.md` (Phase A–F) is currently tentative — the locked decisions might shuffle their relative ordering.

---

## Doc state at pause

- `docs/v2-decisions.md` — 11 questions fully closed, Q13 partial, 5 deferred. Each closed question has Decision + Discussion notes.
- `docs/v2-plans.md` — purpose header; URL strategy + Multi-org session model subsections reflect Cognito-based architecture.
- `docs/standards.md` — security table + tooling table + design patterns all reflect Cognito as v2 auth provider; `AuthService` interface codified.
- `docs/upgrades.md` — parked features and alternative implementations consolidated; self-built JWT documented as fallback alt; code-based invite spec refined to 24-hr auto-refresh.
- `docs/deployment.md` — purpose header; future vanity subdomain migration checklist appended.
- `docs/info.md` — folder structure + tech stack updated to reflect Cognito.
- `docs/devlog/convo-030-*.md` — Q1/Q2/Cognito pivot/doc restructure session.
- `docs/devlog/convo-031-*.md` — Q3–Q16 bulk lock session.
- This file (`convo-032-*.md`) — pause marker.

## Memory state at pause

Auto-memory updated with:
- `feedback_no_phase_mentions.md` — don't reference Phase A/B/etc in decision discussions.
- `project_v2_cognito.md` — v2 auth = Cognito; key implementation details.
- `feedback_dont_over_explain.md` — clarifier-mid-flow gets a 1–2 line answer, not a primer.

`MEMORY.md` index up to date.

---

## What's next (when user returns)

User said: "we will meet after some days or some time" — session paused, no pressing follow-up. Next session, user will likely either:
- Open the deferred batch conversation (Q10/Q11/Q12/Q13-format/Q14), or
- Move on to other work and revisit the deferred batch later

Pick up from `v2-decisions.md` "How to use this doc" status table — it's the source of truth for what's locked, partial, and deferred.
