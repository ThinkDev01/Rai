# Convo 061 — Logging revamp (backend + frontend) + UI polish

**Date:** 5 June 2026

---

> **TL;DR**
> - **Where we are:** Big logging overhaul done end-to-end. Backend: pretty-local / clean-JSON-cloud, IST time, auto `reqId` (AsyncLocalStorage), human messages, `awslogs` driver, startup banner de-bannered, reserved-`name`-key bug fixed. Frontend: logger split (server structured / client lean), ~47 raw `console.*` routed through the logger, **no CloudWatch for frontend**, `usePageView` hook added to 11 pages, OrgLayout jargon humanized. Plus a batch of small UI fixes.
> - **Verified:** backend `tsc` + prod-import smoke clean (no pino-pretty crash); frontend `tsc` + `next build` clean. Live dev runs look right both ends.
> - **What's left:** (1) optional ~60–70 message humanization pass (API-path + terse fragments still dev-shorthand); (2) user deploys: backend `ENVIRONMENT=prod` + `docker compose up -d` (awslogs recreate, IAM already set).

---

## 1. UI polish (start of session)

- **Logo + favicon swap.** Header logo moved from inline SVG in `Logo.tsx` to file-based (`/logo-full.svg` + `/logo-full-dark.svg`, swapped via Tailwind `dark:` after adding `@custom-variant dark` to `globals.css` — v4 was keying `dark:` off OS, not the `.dark` class). Favicons now `app` metadata → `/icon-badge.svg` (bright white-on-blue badge; the transparent mark looked dull on dark tabs). Deleted old `app/icon.svg` + `public/favicon.ico` + its metadata `shortcut`.
- **Marketing copy:** trimmed `trustLine` → "No credit card required" (dropped "· Free for teams up to 5").
- **Ticket filters decoupled (Jira-style).** The single Clear button used to reset **both** type + assignee. Removed it entirely: **Type** clears via the "All types" chip (and now clicking the active type chip toggles it off), **Assignee** clears by toggling avatars. Removed the popover "Clear all" too. Deleted dead `ClearFiltersButton.tsx` + doc refs.
- **Reports chart legends** (`reports/page.tsx`): Burndown + Velocity legends moved OUT of the SVG plot (were overlapping bars/lines) into HTML rows above — consistent with the donut/workload/priority charts.
- **Org-name capitalization:** discussed enforcing capital first letter — **decided against** (breaks lowercase brands like eBay/openAI; industry standard is trim-only). No change.

## 2. Logging revamp — backend

Canonical doc: `backend/guide - logging.md` (trimmed to usage). Implementation detail: `Guide/standards.md` §6.

- **Two renders, one source:** dev → pretty single-line (only the **level word** ANSI-colored); prod → clean JSON. Switched by `ENVIRONMENT`. Dev uses an in-process pino-pretty **stream** (not a transport worker) so function prettifiers work — and so a missing pino-pretty degrades to JSON instead of the old EC2 crash.
- **Time = IST** (`YYYY-MM-DD HH:MM:SS IST`) via Intl `Asia/Kolkata` (not `process.env.TZ`). CloudWatch keeps its own UTC `@timestamp`.
- **`reqId` auto-attached** — per-process incrementing counter in `AsyncLocalStorage` (`config/requestContext.ts`), middleware in `app.ts`, injected by pino `mixin`. Zero controller changes. Filter by reqId → one request's full sequence.
- **Human messages** — narrate the step, not terse codes.
- **`err`/`error` kept inline** — set pino `errorKey` + pino-pretty `errorLikeObjectKeys` to a sentinel (pino-pretty folds pino's errorKey into its error set).
- **Startup banner** (`config/env.ts`) de-bannered into 4 discrete clean lines (no ASCII box, no multi-line `msg`); fixed a stale `PUBLIC_BASE_URL`→`BACKEND_BASE_URL` mismatch; clarified the two header lines.
- **Reserved-key bug fixed:** logs passing a top-level `name:` field made pino-pretty render `LEVEL (name):`. Renamed log keys to `sprintName`/`orgName` (sprints ×4, orgs ×1).
- **Delivery:** `awslogs` driver added to `backend/docker-compose.prod.yml` (region `ap-south-2`, group `backend-logs`, stream `rai-api`) → CloudWatch `@message` is the JSON line itself, no `{"log":…,"stream":…}` wrapper. Needs EC2 role CloudWatch Logs perms (already set) + recreate (`up -d`).

## 3. Logging revamp — frontend

Guide: `frontend/guide - logging.md` (frontend-focused, points to backend guide + standards).

- **Split by runtime** (`lib/logger.ts`):
  - **Server-side** → structured (IST, JSON prod) to `docker logs`.
  - **Client-side** → **lean**: native `console.info/warn/error` + `Component — message` + the **raw (expandable) object**, printed **only when data is passed**. No manual time / per-line userId / JSON-string (devtools supplies time, level color, source).
- **No CloudWatch for the frontend** (user decision) — client logs can't reach it and server-side frontend logging is minimal. Removed the `awslogs` block from `frontend/docker-compose.prod.yml`. Backend is the single CloudWatch source.
- **~47 raw `console.*` routed through the logger:** `cognito-client.ts` (31), `auth-storage-guard.ts` (14), `lib/env.ts`, `error.tsx`; removed the `[layout] render` debug leftover. Component names preserved, messages humanized, errors passed as `String(err)`.
- **`usePageView` hook** (`lib/usePageView.ts`) added to 11 pages that had no self-log (Ticket/Board/Backlog/Sprints/SprintDetail/Reports/Overview/ProjectSettings/Archive/Dashboard/MyWork) — each now logs `<PageName> — <Page> opened ▸ {ids}` on mount.
- **OrgLayout's 7 jargon messages humanized** (e.g. `gate effect ran` → `Checking access for this page`).

## 4. Decisions locked

- Backend = the only CloudWatch source; frontend = browser devtools (+ Sentry later if needed).
- Client logs stay lean/free-form (no structure imposed — they never leave the browser).
- IST everywhere; reqId is per-request (not per-user/ticket); resets on restart.
- Never use `name` as a top-level log key (pino-pretty reserved).

## 5. What's next

- **Optional:** finish humanizing the remaining ~60–70 dev-shorthand messages (API-path style like `POST /orgs`, terse fragments like `accept failed`) across SettingsPage/WelcomePage/TeamPage/hooks.
- **User to deploy (staging):** set `ENVIRONMENT=prod` in backend `.env`, then `docker compose -f docker-compose.prod.yml up -d` for backend (awslogs recreate). Frontend just rebuilds normally (no awslogs).
- Then back to the parked pre-prod queue (RF-8 alert pipeline, branded Cognito emails) and Phase 3 notifications.
