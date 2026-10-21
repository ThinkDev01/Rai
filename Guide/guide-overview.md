# Rai — Product Overview (Internal)

---

## 1. What is Rai?

**Rai is a lightweight project & sprint management tool for fast-moving product teams** — think Jira, but stripped of the bloat. Teams use it to plan work, run sprints, track tickets, and stay coordinated, without the 200-feature complexity that makes the big tools slow to learn and heavy to use.

The structure is simple, top to bottom:

> **Organization** → **Projects** → **Sprints** → **Tickets** → **Comments**

- **Organization** — your company/team. Everything lives inside it (this is the "multi-tenant" part: each org's data is fully walled off from every other org).
- **Projects** — a body of work (e.g. "Mobile App", "Billing").
- **Sprints** — time-boxed cycles of work (e.g. a 2-week push). One active sprint per project keeps teams focused.
- **Tickets** — the actual tasks, bugs, stories, and epics. Assignable, prioritisable, threaded.
- **Comments** — discussion on each ticket, with replies and @mentions.

**The one-line pitch:** _Project management that gets out of your way._ Sprints, tickets, and team coordination — without the enterprise bloat.

**Who it's for:** small-to-mid product, engineering, and startup teams (currently best for teams up to a few dozen people). Free during private beta.

---

## 2. How we compare to competitors

Honest internal view. Competitors: **Jira, Linear, ClickUp, Asana, Notion, Trello, Monday**.

### Where Rai is better / stronger ✅

- **Simplicity & speed** — no bloated setup, no certification needed to use it. New users are productive in minutes, the opposite of Jira.
- **Honest sprint reports** — we surface real throughput, scope changes, and bottlenecks, not vanity "story-point theater."
- **Focus by design** — one active sprint per project, a clean backlog, and a "My Work" view keep teams on what matters.
- **Clean roles & permissions** — simple 4-tier model (Owner → Admin → Project Manager → User) that's easy to reason about.
- **Threaded ticket discussion** — comments with replies + @mentions, so conversations stay readable even on busy tickets.
- **Multi-tenant from the ground up** — built for organizations (like Jira), with strong data isolation per org.
- **Agent-friendly APIs** — clean, well-documented endpoints designed so AI agents/assistants can read and act on Rai data out of the box (see §6).
- **Fair, transparent pricing intent** — free for small teams in beta; no card, no traps.

### Where we currently lag ⚠️ (honest gaps)

- **No built-in AI assistant (chat) yet** — the big players are racing on AI. Ours is foundational today (see §6).
- **No mobile app yet** — web is responsive, but no native iOS/Android app. On the roadmap.
- **Search is ticket-only** — competitors offer global "search everything" (Cmd+K). Ours searches tickets today; expansion is planned.
- **No third-party integrations / webhooks** — no Slack, GitHub, Figma, Zapier connectors yet.
- **No time tracking, automation rules, or custom workflows** — Jira/ClickUp staples we haven't built.
- **No custom fields per ticket type** — bugs, stories, epics share one form today (story points, acceptance criteria, etc. are planned).
- **No file attachments / custom logos & avatars** — we use colored letter-icons for now; image uploads are a later subsystem.
- **Smaller, unproven at scale** — private beta. No large ecosystem, marketplace, or enterprise track record yet.

**In short:** Rai's edge is _simplicity, speed, and honesty_ rather than feature-count or breadth.

---

## 3. Use cases — what people can do with Rai

- **Run agile sprints** — plan a cycle, pull tickets in, track progress on a Kanban board, close it out with a real report.
- **Manage a product backlog** — capture ideas/tasks, prioritise, and groom what's next.
- **Track bugs & tasks** — typed tickets (task / bug / story / epic) with priority, assignee, and sub-tickets.
- **Coordinate a team** — assign work, @mention teammates, discuss in threaded comments, and see "My Work" at a glance.
- **Plan across multiple projects** — one org, many projects, each with its own board and sprints.
- **Onboard a team cleanly** — invite members by email with the right role (Owner / Admin / PM / User).
- **Report to stakeholders** — sprint velocity and health views that reflect actual delivery.

**Good fit:** startups, product squads, engineering teams, agencies running client projects.
**Not the fit (yet):** large enterprises needing deep integrations, compliance audit trails, or heavy customization.

---

## 4. Upcoming features (roadmap)

Planned and parked — not in the product today, but on the way:

- **AI assistant in the app** — a dedicated AI entry point in the UI (placement being refined).
- **Global "search everything"** — Cmd+K spotlight across projects, sprints, members, and comments (not just tickets).
- **Starring / pinning** — pin your key projects, sprints, and tickets so they're always at the top.
- **Type-specific ticket fields (Jira parity)** — story points & acceptance criteria for stories, steps-to-reproduce for bugs, color/children for epics.
- **Custom logos, icons & avatars** — upload real images for orgs, projects, and members (image storage pipeline).
- **Mobile app** — native iOS/Android with push notifications.
- **Code-based org invites** — Discord-style join codes alongside email invites.
- **GitHub SSO** — Google and Microsoft sign-in are already supported; GitHub login is the next provider planned (SAML/OIDC later).
- **Branded, personalized emails** — richer, white-labelled notification & invite emails.
- **Vanity subdomains** — `yourcompany.rai.app` style URLs.
- **Data export** — org-scoped export for portability.
- **Smarter defaults** — "just my tickets" filters and better project color variety on busy boards.

_(Sequenced roughly as next-phase → v3. Subject to change.)_

---

## 5. The technology behind Rai

Plain-language version of what powers the product:

- **Web app (what users see):** Next.js 16 + React 19 — modern, fast, responsive interface.
- **Backend (the engine):** Express 5 + TypeScript — a clean, well-structured API server.
- **Database:** PostgreSQL — reliable, battle-tested store for all org data.
- **Login & accounts:** AWS Cognito — secure sign-in, password resets, MFA, and SSO, handled by AWS, not home-grown.
- **Email:** AWS SES — sends invites and notifications.
- **Hosting:** Docker on AWS EC2, behind nginx with Let's Encrypt (HTTPS) — runs on AWS cloud infrastructure, securely.

**In short:** Rai is built on mainstream, trusted cloud technology (AWS + modern web stack). Security-sensitive pieces like login are handled by AWS Cognito rather than reinvented in-house, and the architecture is designed to scale as teams grow.

---

## 6. The role of AI in Rai

Honest framing — **AI in Rai today is foundational, not a flashy chat feature (yet).**

**Today:**

- **AI-ready by design.** Rai exposes clean, well-documented API endpoints built so external AI agents/assistants can read and act on Rai data — e.g. "list all tickets assigned to a person across projects" or "filter tickets by status/priority." This makes Rai a good citizen in an AI-driven workflow even before we ship our own assistant.
- **Built to be AI-buildable.** The entire codebase and docs are structured so AI tools can understand and extend the product quickly — which is part of how a small team ships fast.

**Coming:**

- **An in-app AI assistant** — a dedicated AI button/entry point in the interface (placement being finalised). The direction: help users draft tickets, summarise sprints, and surface what needs attention — without leaving Rai.

**In short:** Rai does **not** yet have a built-in AI chatbot, auto-planning, or generative features inside the app. Its AI capability today is foundational — AI-ready through agent-friendly APIs, with an in-app assistant on the roadmap.

---

## 7. Developer & technical reference

**Where the code and detailed docs live** — repo/folder map and the "where to find things" pointer index now live in `README.md` ("Where the code & detailed docs live"), so there's one canonical index instead of two.

**Conventions** — engineering standards live in `dev-standards.md` (+ the repo guides); doc-update rules live in `../CLAUDE.md` (repo root). Docs are kept in sync with code, updated in the same change, not after.

---

_Questions or corrections → the product team. This is an internal living document; keep it in sync as features ship._
