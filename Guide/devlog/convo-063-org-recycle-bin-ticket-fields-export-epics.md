# convo-063 — Org recycle bin, type-specific ticket fields, data export, epic UI

**TL;DR**
- **Planning:** cross-checked `upgrades.md` against an external notes file (nothing lost; added 4 "Needs Discussion" items + raw exploration notes), gave it a linked **Contents index**, and confirmed it's forward-looking only. Locked the **go-to-market batch** (what's truly needed before prod) and re-filed scope.
- **Shipped 3 features** (all typecheck-clean both ends, pending deploy): **(1) Org-level soft-delete / 30-day recycle bin** (migration 012), **(2) type-specific ticket fields** Epic/Story/Bug (migration 013), **(3) org data export** JSON + Excel via `exceljs`.
- **Epic UX:** epics now show a **progress bar + children**, and the **colored epic tag** renders on child tickets (board cards, backlog/sprint rows, parent link) so the color finally means something.
- **Scope decisions:** admin dashboard **skipped** for launch (support@ inbox), mobile app **ships to prod**; **entity recycle bin** + **data import** moved **back to v3**; export = yes, import = v3.
- **Next:** user tests tomorrow. Note: backend `.env` points at **staging RDS** — migrations 012/013 already applied there; `exceljs` needs `npm install` on any deploy target.

---

## 1. upgrades.md housekeeping

**Cross-check vs external notes file:** user pasted an old notes file; verified every item already lives in `upgrades.md`. Genuinely missing → added under a new **⚠ Needs Discussion** section (kept, not actioned):
- Email deliverability (SPF/DKIM/DMARC + warmup)
- Org-level soft-delete / trash-bin before billing
- "Bought sub then deleted org" edge case
- R&D / non-IT use of the PM tool
- Plus 3 raw exploration notes (Excel-replacement, Jira Story/Epic/Bug fields, Odoo-vs-us) tagged "need to discuss".

**Contents index:** added a `## Contents` section (grouped bold labels + anchor links, mirroring `v2-plans.md`) since the doc is long. Anchors use GitHub slug rules; emoji-led headings get a leading-hyphen anchor.

**Forward-looking check:** confirmed no old v1 work is "resurfaced" — the only v1 references are `/api/v1` path prefixes, "Decided at: v1 fix item 19" provenance lines, and baseline "carries v1's pattern" notes for swap alternatives. All legitimate. No changes needed.

## 2. Go-to-market lock (2026-06-08)

Walked "what's actually needed before charging real orgs" beyond billing + notifications. **Locked must-haves:** email deliverability (SES sandbox-exit + SPF/DKIM/DMARC + branded Cognito mail), **org soft-delete/recycle bin**, **DB backups + tested restore**, **critical-error alert pipeline + uptime ping**, MFA/2FA + active sessions, type-specific fields, export, pre-prod paperwork (ToS/Privacy/support@/DNS/Razorpay live keys).

**Decisions:** internal admin dashboard **skipped** for launch (support@ shared inbox until volume justifies it); mobile app **ready → ships to prod**; analytics deferred. Captured in `upgrades.md` § Go-to-market batch + `v2-plans.md` § Go-to-market lock. User confirmed SES is already verified + out of sandbox and RDS backups exist.

**Build order agreed (zero-setup first):** 1) org soft-delete, 2) type-specific fields, 3) Notifications, 4) MFA+sessions, 5) alert pipeline, 6) mobile push, 7) billing, 8) paperwork in parallel. (Notifications/Phase 3 itself was built in parallel — see convo-062.)

## 3. Org-level soft-delete / recycle bin (Task #1) — built

**Behaviour:** `DELETE /orgs/:id` is now a **soft delete** — stamps `deleted_at`/`deleted_by`, org vanishes app-wide, recoverable for **30 days** (`ORG_RESTORE_WINDOW_DAYS`), then a purge job hard-deletes (CASCADE). Slug stays reserved during the window (unique constraint spans soft-deleted rows). Subscription freeze/resume/cancel left as a **3-line hook** for Phase 4 billing.

**Backend:**
- Migration **012** — `deleted_at` + `deleted_by` + partial index `idx_organizations_active`.
- `auth.model` `getMembership` + `getMembershipsForUser` filter `deleted_at IS NULL` (the chokepoints that make a deleted org un-resolvable as tenant + invisible in listings); domain-discovery filtered too.
- `orgs.model`: `softDeleteOrg` (idempotent), `restoreOrg` (returns row / `not_deleted` / `window_expired`), `listDeletedOrgsForOwner`.
- New endpoints: `POST /orgs/:id/restore` (owner-only, 410 if expired), `GET /orgs/deleted` (owner's restorable list).
- `scripts/purge-orgs.ts` + `npm run purge:orgs` (idempotent; wire to scheduler in Phase 3).

**Frontend:**
- `hooks/useDeletedOrgs.ts` — `useDeletedOrgs()` + `useRestoreOrg()`.
- **Recently deleted** restore list in two places: `/welcome` (`RecentlyDeletedOrgs`, for owners who deleted their last org) and **Settings** (`RecentlyDeletedOrgsSection`, muted, placed **above Danger zone** per user request, for owners with other orgs). Owner-only, "X days left" countdown, inline restore confirm, hard-navigate into restored org.
- Settings delete modal/toast copy → "recoverable for 30 days".

## 4. Type-specific ticket fields (Task #2) — built

Per-type fields (Jira parity), hard-coded type→fields mapping (no admin screen config — that's v3):
- **Epic** → epic_name, epic_color · **Story** → story_points, acceptance_criteria · **Bug** → steps_to_reproduce, environment · **Task** → none.

**Backend:** migration **013** (six nullable columns) · `TicketRowFull`/`CreateTicketBody`/`UpdateTicketBody`/`TicketResponse` + `toTicketResponse` extended · `ticketSelect`/`createTicket`/`updateTicket` carry the fields · controller `buildTypeFields` validates + filters to the owned fields, and **clears stale fields on a type change**.

**Frontend:** shared `TicketTypeFieldsForm` (used by CreateTicketModal) + `TicketDetailsCard` read/edit wrapper (used by detail page + TicketPanel). Epic color swatches + story-point scale in `lib/ticket.meta.tsx`.

## 5. Data export (export = yes, import = v3) — built

`GET /orgs/:id/export?format=json|xlsx` — **owner/admin only**, streams a file download. New `modules/export/` gathers Members/Projects/Sprints/Tickets/Comments (org-scoped, resolved emails/keys). Excel via **`exceljs`** (multi-sheet) — chosen over SheetJS/`xlsx` (CVE history + off-npm). JSON = structured bundle.

**Frontend:** Settings **"Export your data"** section (owner/admin) — JSON + Excel buttons, blob download via authed axios, filename from `Content-Disposition`.

**Bug found + fixed during testing:** export returned a generic failure. Diagnosed via direct route probe → **404, route not loaded**: the running backend was **stale** because `exceljs` is a new dependency and `tsx watch` doesn't pick up newly-installed packages without a restart (documented dev-server rule). Not a code bug. While there: improved the frontend catch to read the blob error body + surface the real message/status, bumped the export request timeout to 120s, and exposed `Content-Disposition` via CORS so the filename works cross-origin.

**Library note:** `exceljs`'s only flagged advisory is a transitive `uuid` bounds-check in `v3/v5/v6`; exceljs uses `uuid.v4`, so not reachable. Did **not** run `npm audit fix --force` (would downgrade exceljs).

## 6. Epic UI — built

The complaint: an epic page showed only "Epic name" and the color felt useless. Fixed (frontend-only — backend already returns the data):
- **`EpicProgress`** (children done/total + % + colored bar) on the epic detail page + TicketPanel, above the existing Children list (shows even with 0 children).
- **`EpicTag`** (color dot + epic name) on the epic's **child tickets**: board cards (`CardContent`, threaded `epicLookup`), backlog + sprint rows, and the child's parent link on detail/panel. `buildEpicLookup(tickets)` in `lib/ticket.meta.tsx` maps epic key → {name, color}.

## 7. Scope re-filing

- **Entity recycle bin** (restore deleted tasks/sprints/projects) → **back to v3** (was briefly v2 Phase 5). Distinct from the org-level recycle bin that shipped.
- **Org data import** → **back to v3** (export-only covers the launch "leave with my data" need).
- Updated `v2-plans.md` (Phase 5/6 marked, Go-to-market lock) + `upgrades.md` (§ User-facing restore, § Org-level data import, promoted table) accordingly.

## Docs updated this session
`upgrades.md` (Contents, Needs Discussion, Go-to-market batch, re-filing), `v2-plans.md` (Go-to-market lock, pre-prod items, Phase 5/6 ✅), `backend/guide - db.md` (migrations 011–013 + soft-delete rule + ticket columns), `backend/guide - backend.md` (orgs route map), `backend/Api-Documentation/` (orgs delete rewrite + restore/deleted/export pairs + README count; tickets create/update/get fields), `frontend/guide - frontend.md` (recycle bin, export, epic UI, components/ticket).

## State at session end
- Branch: `Pre-v2`. Typecheck clean both ends.
- Migrations **012 + 013 already applied to staging RDS** (the `.env` target). Export endpoint + `exceljs` need a backend restart / `npm install` on any deploy target.
- **Next:** user tests tomorrow (org delete→restore from both /welcome and Settings; epic + children + progress + tags on board/backlog; export JSON + Excel).
