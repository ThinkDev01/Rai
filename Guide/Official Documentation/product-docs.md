# Rai — Product Guide

Everything you need to get productive with Rai. Plain language, no jargon — start at the top, or jump to the section you need.

---

## What is Rai?

Rai is a lightweight project and sprint management tool for fast-moving product teams. Plan work, run sprints, track tickets, and keep your team coordinated — without the heavy setup and feature overload of the bigger tools.

Everything in Rai follows one simple structure:

> **Organization → Projects → Sprints → Tickets → Comments**

| Level | What it is |
| --- | --- |
| **Organization** | Your company or team. Everything lives inside it, and each organization's data is fully walled off from every other. |
| **Project** | A body of work — e.g. "Mobile App" or "Billing". |
| **Sprint** | A time-boxed cycle of work, like a two-week push. One active sprint per project keeps the team focused. |
| **Ticket** | The actual work — tasks, bugs, stories, and epics. Assignable, prioritizable, discussable. |
| **Comment** | Threaded discussion on a ticket, with replies and @mentions. |

---

## Getting started

### 1. Create your account

Sign up with **email and password**, or use **Google** or **Microsoft** single sign-on. You'll verify your email before you can do anything else — this keeps the platform clean and ties every account to a real inbox.

### 2. Create or join an organization

- **Starting fresh?** Create a new organization. You become its **Owner**.
- **Invited by a teammate?** Open the invite email and accept it to join their organization with the role they assigned you.

You can belong to more than one organization and switch between them at any time (see *Switching organizations* below).

### 3. Build out your workspace

Create your first **project**, plan a **sprint**, and start adding **tickets**. Invite the rest of your team by email and assign each person a role.

---

## Organizations

Your organization is the top-level container for everything — projects, members, billing, and settings. Data is **fully isolated** per organization: nobody outside it can see your work.

Because organizations can share the same display name, each one also has a unique **handle** (shown as `@your-org`). You'll see the handle alongside the name anywhere organizations are listed, so there's never any confusion about which one you're in.

### Switching organizations

If you belong to more than one organization, switch between them from the organization menu. The page takes a brief moment to refresh your session, then updates everything at once — sidebar, header, and content all reflect the new organization together. No half-loaded states.

Switch in one browser tab and your other tabs update automatically. Other devices pick up the change on their next action.

---

## Roles & permissions

Rai uses a clear four-tier role model so responsibility is always obvious:

| Role | What they do |
| --- | --- |
| **Owner** | The founding member. Manages billing. The only role that can delete the organization or transfer ownership. |
| **Admin** | Runs the organization day-to-day — manages members, changes roles, sees everything. |
| **Project Manager** | Runs specific projects — adds members, runs sprints, manages ticket flow. |
| **User** | Works on the tickets assigned to them. |

Role names can be customized to match your team's vocabulary (e.g. "Engineer", "Designer") — the permissions underneath stay the same.

**A few deliberate rules:**

- Only the **reporter** and **assignee** of a ticket can change its status or reassign it. Anyone on the project can still create tickets, comment, and edit titles and descriptions.
- **Project settings** are limited to admins and project managers — visibility, members, and naming stay with the people running the project.
- **Deleting a project** is limited to admins and the owner, and requires typing the project's name to confirm.

For the full breakdown of who can do what, see your in-app permissions or ask your admin.

---

## Projects

A project is a body of work with its own board, sprints, and members.

- **Private project** — only people explicitly added can see it.
- **Public project** — visible to everyone in your organization. Non-members get a read-only view and can request to join.

Admins and project managers can change a project's visibility and members at any time.

---

## Sprints

A sprint is a time-boxed cycle of work. Each project runs **one active sprint at a time** to keep the team focused on what's in front of them.

**Planning a sprint** — set a start and end date, then pull tickets in from your backlog.

**Auto-start** — once you set a start date, the sprint begins automatically on that day. No need to log in and click "start". By default there's no notification when it auto-starts (it might begin overnight), but you can **opt in to a start alert** at a time you choose — either when creating the sprint or later from the sprint page.

**Editing dates** — an active sprint's dates can be adjusted (extend for a holiday, shorten if work finished early). Once a sprint is **completed**, its dates lock to preserve the historical record and keep your reports accurate.

**Completing vs. archiving** — these are separate, deliberate actions:

- **Complete** a sprint when its cycle ends. It stays in your sprint list with a "Completed" tag, sorted to the bottom, so you can still reference it.
- **Archive** a sprint (or a whole project) when you're truly done with it and want it out of the active view. Archived items move to a dedicated archive section, and admins or project managers can restore them anytime.

You'll close sprints all the time; you'll archive a project once, at the very end.

---

## Tickets

Tickets are the actual work. Each one has a **type** — task, bug, story, or epic — plus a priority, status, and people attached to it.

**Reporter and assignee** — every ticket has two roles:

- **Reporter** — the person tracking that this work needs to land.
- **Assignee** — the person actually doing it.

Both can change the ticket's status and hand it off to someone else. If a ticket has no reporter or assignee, anyone on the project can **claim it** and become both in a single step.

**Status flow** — todo → in progress → done. You can also create a ticket directly in "Done" when you're logging work that's already finished.

**Sub-tickets** — break larger work into smaller pieces nested under a parent ticket.

**Discussion** — every ticket has a threaded comment section with replies and **@mentions**, so conversation stays readable even on busy tickets. Mention a teammate and they get notified.

---

## My Work

The **My Work** view gathers every ticket assigned to you across all your projects in one place — so you can see what's on your plate without hunting through boards.

---

## Search

Search your tickets quickly from the search bar. Broader search across projects, sprints, members, and comments is on the way.

---

## Notifications

Rai keeps you informed through **in-app notifications and email** for the events that matter — when someone assigns you a ticket, when your invite is accepted, when your subscription is about to expire, and more.

You control optional alerts like sprint-start notifications per sprint.

---

## Inviting your team

Invite teammates by **email**, choosing their role at the time of invite.

- Invite links are valid for **7 days** — long enough for someone away for the weekend, short enough to stay secure.
- Each link is **single-use** — once someone joins through it, that link stops working. This keeps a clean record of who invited whom.
- Invite the same person twice and the newer invite automatically replaces the older one — handy if you picked the wrong role the first time.

---

## Billing & free trial

Start with a **30-day free trial — no credit card required.** We want you to actually use Rai before deciding, so there's no card upfront and no traps.

If your subscription lapses, your organization switches to **read-only** rather than locking you out:

- You keep full **read access** — browse all your projects, tickets, sprints, and comments. Nothing is lost.
- **New changes are paused** until billing is sorted.

Admins see a "Reactivate" option right in the banner; other members are pointed to their admin. This gives you time to fix billing without losing sight of work in progress.

---

## Sign-in & security

- **Sign-in options:** email + password, Google SSO, and Microsoft SSO.
- **Email verification** is required before using the app — every organization is created by someone who genuinely owns their email address.
- **Secure by design:** sign-in, password resets, and account security are handled by **AWS Cognito**, a trusted, industry-standard identity service — not a home-grown system. All traffic runs over HTTPS.

---

## Getting help

Need a hand? Reach our support team at **support@rai.novetum.com**. We read every message.

---

_This guide reflects Rai as it works today. We're shipping improvements continuously — see the Release Notes for what's new._
