# convo-062 — My Work pinning (projects + tickets)

**TL;DR**
- Shipped per-user **pinning**: pin up to **3 projects** (Projects page) and **3 tickets** (My Work), DB-backed, not frontend-only. A small UX add scoped to the projects index + My Work only.
- New `user_pins` table (polymorphic, FK-cascade), 4 toggle endpoints under `/me/pins/*`, `isPinned` folded into the existing `/projects` + `/me/tickets` reads.
- Pulled forward from the v3 "starring" backlog item — partially, with a 3-pin cap. Sprint pinning, sidebar reorder, and the "Starred" filter chip stay parked.
- **Next:** add pin/unpin/limit cases to `tests/v2-api.test.ts` (not yet covered). Heads-up: an in-progress project-avatar refactor was breaking the frontend typecheck (`EpicTag`, `projectColor`) — unrelated to pins.

---

## Request

> "add a pin button for projects and for tickets in my work section only — pin top 3 projects or top 3 tickets. Make it dynamic from DB, not just frontend. Small feature for better UX. Only for projects and my tickets, nothing else."

## Clarification (the one real fork)

My Work currently shows **only tickets**, not projects — so "pin projects + tickets in My Work" was ambiguous. Asked once, two options:
- **A — Pin in place** ✅ (chosen): pin button on each Projects-page row (top 3 float up) **and** each My Work ticket row (top 3 float up). Each list pins its own items where it already lives.
- B — A single "Pinned" panel in My Work showing both pinned projects + tickets.

Also note: the Projects page already carried a `// Star-based pinning is parked for v3` comment — this is that feature landing early, in a reduced form.

## Decisions locked

- **Scope:** per-user (each teammate's own pins), per-org, **max 3 per type**, enforced server-side. Pinning lives **in place** (Projects page + My Work), nothing else.
- **Table shape:** one polymorphic `user_pins` table — nullable `project_id` / `ticket_id` FKs + a `CHECK (num_nonnulls(project_id, ticket_id) = 1)`. Chosen over the parked spec's `user_stars(target_type, target_id)` because real FK cascade (from users/orgs/projects/tickets) auto-cleans dead pins, so an orphan can never count toward the limit. Partial unique indexes = one-pin-per-target.
- **API surface:** pins are a *me* resource → `PUT`/`DELETE /api/v1/me/pins/{projects,tickets}/:id`. Read flag (`isPinned`) rides on the **existing** list responses — no new GET, no extra round-trip.
- **Limit enforcement:** app layer (`PIN_LIMIT = 3`) — a partial unique index can guarantee one-pin-per-target but not a row count. Over-limit → `422` with a human message surfaced verbatim in the UI.
- **No optimistic patch:** toggling invalidates the host query (projects list / my-work) and re-reads `isPinned` — DB is authoritative (per standards).
- **My Work layout:** pinned tickets render in a dedicated **Pinned** section at the top, **excluded** from the grouped list below so a ticket never shows twice. Pins respect the active status filter (toolbar stays predictable).
- **Projects layout:** pinned float to the top regardless of the sort dropdown (stable partition).

## What changed

### Backend
- `config/migrations/015_user_pins.sql` — new table + partial unique indexes (auto-runs on boot).
- `modules/me/pins.model.ts` — `targetExistsInOrg` (tenant wall on write), `countPinsOfKind`, `isPinned`, `insertPin` (idempotent `ON CONFLICT DO NOTHING`), `deletePin`. `PIN_LIMIT = 3`.
- `modules/me/pins.controller.ts` — `makePinHandler` / `makeUnpinHandler` factories (route fixes `kind`, never request-controlled) → `pinProject`/`unpinProject`/`pinTicket`/`unpinTicket`. Idempotent toggles; `404` if target not in org; `422` at the cap.
- `modules/me/me.routes.ts` — `PUT`/`DELETE /pins/{projects,tickets}/:id` (auth + requireOrgContext).
- `modules/projects/projects.model.ts` + `.types.ts` — `is_pinned` EXISTS subquery in `getAllProjectSummaries`; `isPinned` on `ProjectSummaryRow` / `ProjectSummaryResponse` / `toProjectSummary`.
- `modules/users/users.model.ts` + `users.controller.ts` — `is_pinned` EXISTS (always the **caller's** pin) in `getTicketsAssignedTo`; `isPinned` in `shapeMyWorkItem`.

### Frontend
- `components/ui/PinButton.tsx` — shared toggle; stops `<Link>` propagation; filled (primary tint) when pinned.
- `hooks/useProjects.ts` — `useToggleProjectPin()` (`{ projectId, pin }`).
- `hooks/useMyWork.ts` — `useToggleTicketPin()` (`{ ticketId, pin }`). Both invalidate the host query; surface backend `422` message verbatim.
- `app/orgs/[slug]/projects/page.tsx` — pin button on list rows + grid cards; pinned float to top; stale "parked for v3" comment replaced.
- `app/orgs/[slug]/my-work/page.tsx` — extracted shared `TicketRow`; added top **Pinned** section; pin button on every row.
- `types/api.types.ts` — `ProjectSummary.isPinned?` (optional; MyWorkItem.project sub-object omits it) + `MyWorkTicket.isPinned`.

### Docs (same response as code)
- `backend/guide - db.md` — `user_pins` table row + migration 015.
- `Api-Documentation/` — `me-api/pin-project` + `pin-ticket` doc/curl pairs; README inventory **51 → 55** (new Pins row); `isPinned` added to projects-`list` + `my-tickets` response examples.
- `frontend/guide - frontend.md` — PinButton in the `ui/` list + a Hooks bullet for the pin pattern.
- `Guide/upgrades.md` — starring backlog item marked **✓ partially shipped in v2** (Was/Now + remaining scope).

## Verification
- Backend `tsc --noEmit`: **clean**.
- Frontend `tsc --noEmit`: pin code clean (passed in isolation). Two unrelated errors surfaced from an in-progress **project-avatar** refactor (`EpicTag` in board page, `projectColor` in `ProjectKeySquare`) — left untouched.

## Next / parked
- **Tests:** add pin / unpin / over-limit (422) / cross-org-404 cases to `tests/v2-api.test.ts`.
- **Parked (still v3):** sprint pinning, sidebar reorder by pins, cross-page "Starred" filter chip, ticket-detail/board/backlog star surfaces, star-order preservation. See `upgrades.md` § "Per-user starring".
