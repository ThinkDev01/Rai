# Rai v2 — RBAC Guide

Tables for "who can do what" in v2. Full reasoning lives in `v2-decisions.md` (Q5, Q6, Q14, Q15, RF-12) and the RBAC-pass devlog.

Locked during the post-rapid-fire RBAC pass (May 2026). The remaining smaller permission decisions (project delete, project archive, ticket delete) were finalized during the v1 functional-issue walk-through and are now reflected in the tables below — see footnotes ³ (project delete = owner/admin only), ⁵ (ticket delete = PM-in + admin), ⁷ (sprint delete confirm).

**Supersedes** the v1 3-tier RBAC doc (April 2026) — v1 had no owner tier, no project visibility distinction, no two-slot ticket model.

---

## Roles

Rai uses a 4-tier role hierarchy at the org level: **owner > admin > project_manager (PM) > user**.

| Role | Notes |
|---|---|
| **owner** | Founding / ultimate authority. Always admin too. Exactly 1 per org (DB-enforced via partial UNIQUE index `user_orgs(org_id) WHERE role = 'owner'`). |
| **admin** | Org-level admin. Full control over org, billing, members, roles, all projects. |
| **project_manager** (PM) | Project-level admin. Auto-full access on public projects; requires explicit assignment for private. |
| **user** | Regular member. Project work only — tickets, comments, descriptions. |

Role labels (`owner`, `admin`, `project_manager`, `user`) are internal IDs. Orgs can rename the display labels per their convention (v1's `role_name` column pattern carries over).

---

## Org-level actions

| Action | Owner | Admin | PM | User |
|---|:-:|:-:|:-:|:-:|
| View org settings | ✓ | ✓ | – | – |
| Edit org settings | ✓ | ✓ | – | – |
| Manage billing | ✓ | ✓ | – | – |
| Invite members (Q6) | ✓ | ✓ | ✓ | – |
| Revoke pending invites (RF-12) | ✓ | ✓ | ✓ | – |
| Remove a member from the org | ✓ | ✓ | – | – |
| Change another user's role | ✓ | ✓ | – | – |
| Demote self to user | – ¹ | ✓ | – | – |
| Demote another admin | ✓ | ✓ | – | – |
| Transfer ownership | ✓ | – | – | – |
| Delete the org (self-serve hard delete) | ✓ | – | – | – |
| Self-leave the org | – ² | ✓ | ✓ | ✓ |

¹ Owner must transfer ownership first (becomes admin), then demote as admin.
² Owner must transfer ownership first; then leaves via the normal admin/user path.

---

## Project visibility

| Project state | Admin | PM-in | PM-not-in | User-in | User-not-in |
|---|:-:|:-:|:-:|:-:|:-:|
| **Private** | full | full | read-only + "contact admin to be added" toast | full per role | invisible |
| **Public** | full | full | **full (membership irrelevant)** | full per role | read-only + "contact PM to be added" toast |

Key asymmetry: **PMs on public projects have full access without being formal members.** Same model as admins.

---

## Project actions

| Action | Owner | Admin | PM-in | PM-not-in (priv) | PM-not-in (pub) | User-in | User-not-in |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Create a project | ✓ | ✓ | ✓ | n/a | n/a | – | – |
| View project settings | ✓ | ✓ | ✓ | read-only | ✓ | read-only | invisible (priv) / read-only (pub) |
| Edit project settings | ✓ | ✓ | ✓ | – | ✓ | – | – |
| Toggle visibility (private↔public) | ✓ | ✓ | ✓ | – | ✓ | – | – |
| Add / remove project members | ✓ | ✓ | ✓ | – | ✓ | – | – |
| Archive a project | ✓ | ✓ | ✓ | – | ✓ | – | – |
| Unarchive a project | ✓ | ✓ | ✓ | – | ✓ | – | – |
| Delete a project | ✓ | ✓ | – ³ | – | – ³ | – | – |
| View project | ✓ | ✓ | ✓ | read-only | ✓ | ✓ | invisible (priv) / read-only (pub) |

³ Project delete is gated to **admin + owner ONLY** — PMs cannot delete projects, even those they manage. Reason: project deletion is permanent and removes all tickets/sprints/comments inside it; the responsibility sits at the org level, not project level. Requires typed-slug confirmation gate (industry standard for destructive actions; same pattern GitHub uses for repo deletion). PMs can still **archive** (reversible) — that's the project-level destructive-but-recoverable action available to them.

### Sprint actions (within a project)

Sprints live inside projects, so sprint-level permissions follow the project-level rules above (admin override, PM-in / PM-on-public, etc.).

| Action | Owner | Admin | PM-in / PM-on-public | PM-not-in-private | User |
|---|:-:|:-:|:-:|:-:|:-:|
| Create sprint | ✓ | ✓ | ✓ | – | – |
| Edit sprint name / goal | ✓ | ✓ | ✓ | – | – |
| Edit sprint dates (not-started or active) | ✓ | ✓ | ✓ | – | – |
| Edit sprint dates (completed sprint) | – ⁶ | – ⁶ | – ⁶ | – | – |
| Start sprint (manual; auto-start also fires on date) | ✓ | ✓ | ✓ | – | – |
| Close (complete) sprint | ✓ | ✓ | ✓ | – | – |
| Archive sprint (manual) | ✓ | ✓ | ✓ | – | – |
| Unarchive sprint | ✓ | ✓ | ✓ | – | – |
| Delete sprint | ✓ | ✓ | ✓ ⁷ | – | – |

⁶ Completed sprints lock dates as part of historical record. Editing completed sprints comes in v3 (likely with audit trail).
⁷ Sprint delete requires confirmation dialog (yes/no, no typed slug — sprints are less destructive than projects).

### Sprint lifecycle states

`planned` → `active` → `completed` (default end state) → `archived` (only if manually archived).

- Completion ≠ archive. Completed sprints stay in the regular sprint list with a "Completed" tag, sorted at the end. Only manual archive moves them to the archive section. Locked at v1 fix item 17.
- Auto-start fires via a scheduled job on the planned start date (no manual click needed); manual start also available. Opt-in user notification (configurable at sprint creation or via in-app notification icon).

---

## Ticket actions

Each ticket has **two mutable slots** — `reporter_id` and `assignee_id` — and **one immutable audit field**: `created_by`.

**Operational rights** = current reporter + current assignee + PM-in-project + admin.
**Content rights** = any project member.

| Action | Reporter (current) | Assignee (current) | PM-in-project | Admin | Other project member | Non-project member |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Create ticket | n/a | n/a | ✓ | ✓ | ✓ | – |
| View ticket | ✓ ⁴ | ✓ ⁴ | ✓ ⁴ | ✓ | ✓ ⁴ | ⁴ |
| Change status | ✓ | ✓ | ✓ | ✓ | – | – |
| Change reporter | ✓ | ✓ | ✓ | ✓ | – | – |
| Change assignee | ✓ | ✓ | ✓ | ✓ | – | – |
| Edit title | ✓ | ✓ | ✓ | ✓ | – | – |
| Edit description | ✓ | ✓ | ✓ | ✓ | – | – |
| Comment | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Edit own comment | ⁶ | ⁶ | ⁶ | ⁶ | ⁶ | – |
| Delete comment | ✓ ⁷ | ✓ ⁷ | ⁷ | ✓ | ⁷ | – |
| Delete ticket | – ⁵ | – ⁵ | ✓ ⁵ | ✓ | – | – |

⁴ Subject to project visibility (see Project visibility table above).
⁵ Ticket delete is gated to PM-in-project + admin only — reporter/assignee cannot delete tickets. Closing a ticket (status = `done`) is the normal user-level path for "this is finished"; deletion removes the ticket from records and is reserved for cleanup of mistakes or duplicates. Confirmation dialog (yes/no) required.
⁶ Comment **edit is author-only** — only the person who wrote the comment may edit it, regardless of their ticket role. Admins moderate by **deleting**, not silently rewriting someone's words. Editing is content-only (threading + authorship immutable); an "edited &lt;time&gt;" label renders after any edit. (Backend: `PATCH …/comments/:commentId`, author-checked.)
⁷ Comment delete eligibility = comment **author** (any role) OR ticket **reporter** OR ticket **assignee** OR org **owner/admin**. So a caller who *is* the reporter/assignee can delete any comment on that ticket; a PM-in-project or other member can delete only their own. PMs are not blanket-elevated for comment deletion.

### Orphan ticket exception

When **both `reporter_id` and `assignee_id` are NULL**, the operational-rights gate becomes empty. Any project member can **claim** the ticket → they become **both reporter and assignee** in a single action. Once claimed, normal rules resume.

Common path: creator steps out of reporter slot + assignee is empty → ticket goes orphan → any teammate picks it up and takes full ownership.

---

## Invariants

- **Owner ⊇ admin.** Everywhere admin can act, owner can act. Owner is "admin with three extras": delete org, transfer ownership, ultimate visibility (v3 strict-private mode also bypassed).
- **Admin override** (Q5): admin can override anything a PM does in any project, regardless of project membership.
- **At-least-one-admin per org** is structurally guaranteed by the owner tier — owner can't leave or demote without transferring first, so the org always has an owner, who is always admin.
- **JWT-only tenant scoping** (`dev-standards.md` §2): `org_id` is resolved from the JWT by middleware. URL slugs are display-only and cross-checked against the JWT.
- **No raw provider SDK outside `CognitoAuthService`** (`dev-standards.md` §8, RF-16): all auth provider calls go through the `AuthService` interface.

---

## Schema implications

- `user_orgs.role` enum extended to 4 values: `owner`, `admin`, `project_manager`, `user`.
- Partial UNIQUE index: `CREATE UNIQUE INDEX one_owner_per_org ON user_orgs (org_id) WHERE role = 'owner';`
- `tickets.created_by BIGINT NOT NULL REFERENCES users(id)` — new immutable audit field.
- `tickets.reporter_id` becomes nullable (was NOT NULL in v1). FK changed to `ON DELETE SET NULL`.
- `tickets.assignee_id` unchanged (already nullable + `ON DELETE SET NULL` in v1).

---

## v3 deferred RBAC items

Parked in `upgrades.md`:

- **OTP / 2FA verification for ownership transfer** — ✅ **Done in v2.** *Was:* single confirmation dialog. *Now:* gated by a single-use **email OTP** (own custom flow, `otp` module — not a Cognito MFA challenge, no enrolled second factor required). Same gate also covers org delete + project delete. The Cognito-MFA-everywhere version stays parked in `upgrades.md`.
- **Strict private-project visibility** — v2 lets all admins see all private projects; v3 restricts to creator-admin + assigned PMs + members + owner.
- **Per-project role override** (PM at org level acting as regular user in one specific project) — not in v2.

---

## Related docs

- `v2-decisions.md` Q5 — original 3-tier role model + admin/PM/user framing (revised by the RBAC pass to 4-tier with owner added).
- `v2-decisions.md` Q6 + RF-12 — invite + member-management permissions.
- `v2-decisions.md` Q14 — org deletion permissions.
- `v2-decisions.md` Q15 — last admin leaves rules (structurally subsumed by the owner tier).
- `dev-standards.md` §2 — JWT-only tenant scoping.
- `dev-standards.md` §8 — AuthService normalization + no-raw-provider-SDK rule.
- `upgrades.md` — v3 RBAC deferrals.
