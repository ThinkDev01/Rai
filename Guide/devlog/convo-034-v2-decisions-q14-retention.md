# Convo 034 — v2 Decisions Q14 Locked (Org Deletion / Retention)

**Date:** 13 May 2026

---

## What happened

Continuation of the deferred-batch session. Closed **Q14 (org deletion / retention)** — directly continues the "indefinite read-only" loop opened at Q11. Also clarified the backup vs export distinction (which got mixed up mid-conversation) and parked the v4–v5 "domain auction" idea for future high-value org-name reclamation.

---

## Q14 — Org deletion / retention

**Locked: C in v2 → B in v3.**

- **v2:** indefinite retention. Canceled/expired orgs sit in `read_only` forever. No auto-deletion. Acceptable because v2 customer base is small (internal + initial customers) — storage cost is negligible at this stage.
- **v3:** 1-year retention from cancellation/expiry → then hard delete. Cascade everything keyed by `org_id`.

**Companion locks:**

- **Slug locked during retention.** Org "acme" cancels → slug `acme` stays taken throughout the 1-year retention. New customers trying to create "acme" see "name taken." Slug only frees up after hard delete fires.
- **Reactivation:** within the 1-year retention, **any user who was admin/owner at time of cancellation** can reactivate. `internal_admin` override available for stuck cases (e.g. owner email changed, no admin reachable).
- **Pre-deletion warnings:** email at T-30d, T-7d, T-1d to owner + `billing_email`. Standard GDPR + customer-courtesy pattern.
- **Self-serve hard delete always available** — settings-page button gated behind **2FA confirmation**. Cascade-deletes immediately. Satisfies **GDPR right to be forgotten** (overrides the 1-year retention).

**Why 1 year (vs industry norm of 90–180 days):** B2B customer acquisition is expensive — a generous return window protects against churn-then-regret. Specifically targeted at customers who pause for business reasons (off-season, project gap, leadership transition) and want their environment intact when they come back.

## Backup posture (locked alongside Q14)

User raised backup as part of this conversation; mid-conversation we noticed it was being conflated with export. Cleaning up:

| Capability | Layer | v2 status |
|---|---|---|
| **Backup** (data protection) | Infrastructure | EBS volume snapshots in v2 EC2 hosting cover Docker Postgres. Post-Q8 RDS migration → RDS automated snapshots (daily + PITR up to 35 days). Already part of hosting plan. **No app-level backup feature in v2.** |
| **Restore from backup** | Infrastructure | Engineering operation for incidents. Not user-facing in v2. |
| **Export** (data portability) | Application | Already in `v2-plans.md` Phase E — "Export data (org-scoped)". |
| **Import** (data portability) | Application | v3+. Parked in `upgrades.md`. |
| **User-facing restore** (recycle bin) | Application | v3+. Separate from org-level retention. Parked in `upgrades.md`. |

## v4–v5 "domain auction" idea (parked)

For rare cases where a hard-deleted org name has business value and another party wants to claim it. Possible patterns: name-reclamation request flow + customer-support escalation, or "premium name" tier. No design done; placeholder so v3 work doesn't accidentally box us out of this option.

Parked in `upgrades.md` under Upcoming Features.

---

## Schema implications

No new tables. Existing `orgs.status` enum already supports the lifecycle:

```
active → trialing → past_due → canceled → read_only (indefinite v2)
                                                     ↓ (v3 only)
                                              hard delete @ +1 year
```

Hard delete = cascade DELETE on `orgs.id` (everything keyed by `org_id` goes with it). FK relationships need `ON DELETE CASCADE` where appropriate. Schema audit at v3 implementation time will verify.

---

## Resume context — what's left

| Status | Question |
|---|---|
| ✅ Locked this session | Q14 (org deletion / retention) |
| 🔜 Still deferred | Q12 (service layer decomposition), Q13 ID format (mixed vs all-UUID) |

**Recommended pick-up order:**

1. **Q12** — service layer decomposition (TenantService / AuthService / BillingService now vs later). The Q10/Q11 schema makes this answerable — we know what `BillingService` needs.
2. **Q13 ID format** — smallest, independent. UUID vs mixed.

After both lock, all 16 v2 questions are closed and we open the phase-planning conversation to re-sequence Phase A–F.

---

## Doc updates this session

- `docs/v2-decisions.md` — Q14 moved from DEFERRED to ✅ locked with full discussion notes. Status table updated (14 of 16 fully locked, 1 partial, 2 deferred).
- `docs/upgrades.md` — added parked items: org-level data import (counterpart to export), user-facing restore (recycle bin), v4–v5 org name reclamation / "domain auction".
- `docs/devlog/convo-034-*.md` — this file.

## Memory state

No new memory entries needed. All decisions doc-captured.
