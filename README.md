# Rai — Documentation

This folder is the single home for all Rai documentation. It's flat except for two sub-folders — `devlog/` (session history) and `Official Documentation/` (customer-facing, publish-ready docs) — so you scan one list to find what you need.

Rai is a lightweight team project-management tool — **Organization → Projects → Sprints → Tickets → Comments** — currently being rebuilt as a multi-tenant product (v2).

**Three clusters, by filename prefix:**

- **`guide-*`** — **product & behavior**: what Rai is, how it behaves, who can do what. Evergreen reference, written for everyone.
- **`dev-*`** — **engineering**: architecture, standards, deploy, testing, notifications, scaling. Evergreen reference, for builders.
- **`v2-*` + `upgrades`** — **journey**: dated decisions, active plans, and the parked-features backlog. Version-prefixed because the version is part of the information. `devlog/` is the granular, per-session form of this.

## What's new

- **Set priority in one click** — choose Urgent / High / Medium / Low right when creating a ticket, so nothing important gets lost in the backlog.
- **Threads stay intact** — when the first comment in a discussion is deleted, replies keep their context and the conversation stays readable.
- **Rich text everywhere** — format ticket descriptions and comments with headings, lists, code blocks, links, and tables.
- **The board remembers your view** — filter to "just my tickets" once, and Rai keeps that choice the next time you open the board.
- **Built-in API docs** — developers can browse every API endpoint from inside the app, no external tools needed.
- **Better feedback emails** — suggestions you send us now arrive in a clean, readable format.

### Coming soon (not yet confirmed)

- **Attach files** — add files and screenshots to tickets and comments.
- **Preview images inline** — see images at a glance without downloading.
- **Sensible upload limits** — file size and type checks to keep things safe.
- **Automatic cleanup** — abandoned uploads are tidied up automatically.

## New here? Start in this order

1. **`guide-overview.md`** — what the product is.
2. **`guide-product.md`** — why it behaves the way it does (plain language).
3. **`v2-plans.md`** — what we're building now and why.
4. Then dip into the reference docs below as needed.

## Reference docs (evergreen)

**Product & behavior — `guide-*`**

| Doc | What it's for |
| --- | --- |
| `guide-overview.md` | Product overview — the Org → Projects → Sprints → Tickets → Comments model, competitors, roadmap, tech stack |
| `guide-rbac.md` | Permission matrices — who can do what (scan for the action, find the role, check the cell) |
| `guide-billing.md` | Billing & subscription — plain-language: the plan, trial, per-seat pricing, expiry/read-only, cancel/reactivate |
| `guide-product.md` | "Why Rai works the way it does" — plain-language rationale, written for everyone, not just engineers |

**Engineering — `dev-*`**

| Doc | What it's for |
| --- | --- |
| `dev-standards.md` | Engineering standards & patterns (architecture, backend, frontend, security, observability) + **§10 Scaling & Capacity** — scale thresholds, bottlenecks, capacity, infra upgrade order |
| `dev-notifications.md` | Notifications architecture & catalog — types, channels, recipients, DB schema |
| `dev-deployment.md` | Deploy runbook + v2 infra topology + the devops handoff sheet |
| `dev-testing.md` | Testing strategy & reference (layers, tools, edge cases) |
| `dev-tables.md` | Tables index — one-liner map of every DB table, grouped by area (full schema lives in `../backend/guide - db.md`) |

## Journey docs (dated decisions, plans & backlog)

| Doc | What it's for |
| --- | --- |
| `v2-plans.md` | Active v2 roadmap + architecture notes for the multi-tenant rebuild. Appendices: **A1** v1 backend phases, **A3** v2 rapid-fire decisions (short answers) |
| `v2-decisions.md` | Decision log — the 16 load-bearing architecture questions + the post-Q16 rapid-fire round, each with options, reasoning, and the locked call |
| `upgrades.md` | Parked features + alternative implementations we're ready to swap to (single source of truth for "later") |

## Official Documentation (customer-facing / publish-ready)

Internal `guide-*` and `dev-*` docs are written for the build team. The `Official Documentation/` sub-folder holds the **publish-ready, customer- and legal-facing** documents instead.

| Doc | What it's for |
| --- | --- |
| `Official Documentation/product-docs.md` | Public product guide, written for customers |
| `Official Documentation/release-notes.md` | What's new, latest release first |
| `Official Documentation/terms-of-service.md` | Terms of Service (India governing law) |
| `Official Documentation/privacy-policy.md` | Privacy Policy (DPDP Act 2023–aligned) |

## History

- **`devlog/`** — per-session conversation logs, append-only. Preserved as-is; this is the "why we decided X on date Y" trail, not living documentation. New devlogs open with a 3–5 line TL;DR header.

## Where the code & detailed docs live

Rai is split across two code repos plus this docs folder.

**Repos / folders**

- **`backend/`** — REST API (Express 5 + TypeScript, modular monolith). Key docs inside: `guide - backend.md`, `guide - db.md`, `guide - logging.md`, `Api-Documentation/`, `README.md`.
- **`frontend/`** — UI (Next.js 16 App Router). Key docs inside: `guide - frontend.md`, `guide - logging.md`, `README.md`.
- **`Guide/`** — cross-cutting project docs (this folder).

**Where to find things**

- Backend architecture / modules / request flow → `../backend/guide - backend.md`
- Frontend architecture / state / pages → `../frontend/guide - frontend.md`
- Every API endpoint (+ curl examples) → `../backend/Api-Documentation/`
- DB schema, tables, migrations → `../backend/guide - db.md`
- Logging format + CloudWatch → `guide - logging.md` (in each repo)
- Deploy, infra, env-var contract (all environments) → `dev-deployment.md`
- Engineering standards & patterns → `dev-standards.md`
- Scaling thresholds & bottlenecks → `dev-standards.md` § 10 (Scaling & Capacity)
- Roles & permissions matrix → `guide-rbac.md`
- Billing, trial, pricing & expiry behavior → `guide-billing.md`
- Quick map of all DB tables → `dev-tables.md` (full schema → `../backend/guide - db.md`)
- Notifications design → `dev-notifications.md`
- Testing strategy + manual checklist → `dev-testing.md`
- Parked features / "later" / swap targets → `upgrades.md`
- v2 plan & locked decisions → `v2-plans.md`, `v2-decisions.md`
- Session-by-session history → `devlog/`

**Conventions** — engineering standards live in `dev-standards.md` (+ the repo guides); doc-update rules live in `../CLAUDE.md` (repo root). Docs are kept in sync with code, updated in the same change, not after.

## How we work

Decisions are discussed in chat, locked with reasoning, and captured with **both** the conclusion and the discussion notes — so anyone can pick a doc up cold and understand not just *what* we decided but *why*.
