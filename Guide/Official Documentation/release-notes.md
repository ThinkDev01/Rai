# Rai — Release Notes

What's new in Rai. Most recent release at the top.

---

## Rai 1.0 — Launch _( [release date] )_

The first public release of Rai. A lightweight, multi-tenant project and sprint management platform built for fast-moving product teams.

### Core platform

- **Organizations** — fully multi-tenant. Each organization's data is completely isolated, with a unique handle (`@your-org`) for clean disambiguation.
- **Multi-org membership** — belong to multiple organizations and switch between them instantly, with automatic sync across browser tabs.
- **Projects** — public or private, each with its own board, members, and sprints.
- **Sprints** — one active sprint per project, with auto-start on the scheduled date and optional start notifications.
- **Tickets** — task, bug, story, and epic types, with reporter/assignee ownership, priorities, status flow, and nested sub-tickets.
- **Comments** — threaded discussion with replies and @mentions on every ticket.
- **My Work** — every ticket assigned to you, across all projects, in one view.

### Roles & permissions

- **Four-tier role model** — Owner, Admin, Project Manager, and User, with customizable role names.
- **Scoped permissions** — ticket status and reassignment stay with the reporter and assignee; project settings stay with admins and PMs; project deletion is owner/admin-only with type-to-confirm.

### Accounts & security

- **Flexible sign-in** — email + password, Google SSO, and Microsoft SSO.
- **Email verification** required on signup.
- **Identity managed by AWS Cognito** — secure sign-in, password resets, and account protection. All traffic over HTTPS.

### Team & collaboration

- **Email invites** — role-assigned, single-use, valid for 7 days, with newer invites superseding older ones.
- **Notifications** — in-app and email alerts for assignments, accepted invites, billing events, and more.

### Billing

- **30-day free trial** — no credit card required.
- **Graceful expiry** — lapsed subscriptions switch to read-only instead of locking you out; admins can reactivate from an in-app banner.

### Under the hood

- Built on a modern, trusted stack: Next.js, Express + TypeScript, PostgreSQL, and AWS infrastructure (Cognito, SES, EC2) behind nginx with HTTPS.

---

_Coming soon: an in-app AI assistant, global search across everything, native mobile apps with push notifications, and more. Have feedback? Reach us at **support@rai.novetum.com**._
