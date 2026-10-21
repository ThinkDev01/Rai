# Rai — Claude Instructions

Source of truth for how Claude works on Rai. **Manually curated by the user.**

## Ground rules

- All the suggestions from claude regarding anything technical should be industry standard and best pratices

When starting a session or when I say "where were we?", read the latest Guide/devlog/ and lean on memory of past convos to recover context before doing anything.

- if i prompt small question try to keep the response short,crisp, precise and simple it should have all the info within less word

- **Never edit this file (`CLAUDE.md`) without explicit permission.** Manual entry only — Claude proposes, the user adds.

- **When the user says "save the convo"** (or "save conversation"), write/update the session log in `Guide/devlog/` — capture the full discussion, decisions made, and what's next. Devlogs are the detailed history; keep them current on request.
    - New devlogs (from now on) open with a 3–5 line **TL;DR header** — where we are + what's next. Don't retrofit old ones.

## Response style

- for general prompts responses you should be veryshort have full context and explain in bulletpoints list keeping every point short
- if the user is asking for generally give the response in very short 1 or 2 lines if user wants full context then go for bulletpoints
- Default to **short, precise, concise, simple** — same spirit as the docs: cover every relevant aspect, miss nothing, but keep it tight and scannable.
- Scale length to the task: quick things stay quick; big topics (e.g. architecture) may run long, but keep them **optimized** — structured, no padding.

## Logging (canonical: `backend/guide - logging.md`)

- **One source, two renders:** pretty in local (only the **level word** colored, nothing else), clean **JSON in cloud**. Times are **IST**.
- **`reqId` is automatic** — injected via `AsyncLocalStorage` + pino `mixin` (`config/requestContext.ts`). Never thread it through function args.
- **Messages are human** — narrate the step ("Saved the new ticket to the database"), not terse machine codes. Log every meaningful step (entry, validation, branch, success, error).
- **Cloud delivery:** `awslogs` Docker driver (clean `@message`, no wrapper) + `ENVIRONMENT=prod` (so JSON, not the dev pretty-printer).
- **Frontend** keyed by `component` (no reqId). **No CloudWatch for frontend** — backend is the only CloudWatch source. Server-side → structured to `docker logs`; client-side → lean (native `console.info/warn/error` + `Component — message` + raw object; devtools supplies time/level/source). Client info/warn dev-only; errors always.

## Documentation style (applies to all docs, especially `Guide/`)

Restructure for readability — **never** compress prose into denser prose.

- **Priority order:** (1) lose nothing from the source; (2) readable/scannable; (3) professional yet beginner-friendly.
- **Structure over prose:** markdown headers (never ASCII banners); a 1–2 line intro per section before the bullets; bullets over paragraphs; split multi-idea blocks into labelled sub-points (e.g. **Problem:** / **Fix:**).
- **Tables only for genuine grids** (matrices, comparisons), kept narrow (≤4–5 cols). Everything else = bullets.
- **Minimal emoji** — a few as professional signposts (e.g. one ⚠ for a warning); no decorative clutter.
- **Preserve phase numbering & order exactly.** Tag with version: `v1 Phase N` / `v2 Phase N` (the two versions number differently). Never renumber, reorder, or silently drop a phase reference.
- **Facts:** change a fact only when verified against a real source (code, devlogs, other docs). Never guess — flag anything unverifiable.
- **Keep history:** mark resolved/obsolete items (e.g. "✓ Done in v2" with Was/Now), don't delete them.
- **Dedup:** merge duplicates into one canonical doc; reference it instead of duplicating content.

## Docs — update in the same response as the code (not optional)

A task isn't done until its docs are updated — same response, no reminder needed.
Skip only for bug/typo/style/internal refactors that don't change API surface, structure, or behavior.

Trigger → file:

- New/changed/removed endpoint → `backend/Api-Documentation/` (the `- docs.md` + `- curl.md` pair + README inventory count)
- New migration / schema change → `backend/guide - db.md` (Tables + Migrations-in-order)
- Module / request-flow / middleware / route-map change → `backend/guide - backend.md`
- Frontend folder structure / new hook·store·route / page-pattern change → `frontend/guide - frontend.md`
- Arch / standard / scaling / new-pattern decision → `Guide/dev-standards.md`
- Env var added/changed, infra topology or deploy-step change → `Guide/dev-deployment.md`
- Role / permission rule change → `Guide/guide-rbac.md`
- New notification type/channel → `Guide/dev-notifications.md`
- Phase scope/status change → `Guide/v2-plans.md` (mark ✅); newly-locked decision → `Guide/v2-decisions.md` (append Q/RF entry)
- Feature parked / swap target found → `Guide/upgrades.md`
- Product model/behavior change → `Guide/guide-overview.md` / `Guide/guide-product.md`
- Logging format/delivery change → `guide - logging.md` (both repos)
- A Guide doc added/removed/renamed → `Guide/README.md` (index)
- "save the convo" → `Guide/devlog/convo-NNN-*.md`

Rarely touched (update only if that area's own convention changes):
`backend/README.md`, `frontend/README.md`, `frontend/content/README.md`, `frontend/content/emails/README.md`, `frontend/public/README.md`, `Guide/dev-testing.md`.
