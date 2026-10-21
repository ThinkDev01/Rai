# Why Rai Works The Way It Does

Plain-language explanations for the decisions behind how Rai behaves. Written for everyone — not just engineers.

For each topic: what's in **v2 (today)** and what's **coming in v3** where relevant. These choices reflect what we picked for v2's launch. They're not set in stone — we revisit based on customer feedback.

---

## Roles & permissions

### Why four role types (owner, admin, project manager, user)?

Most teams need someone in charge of billing, someone in charge of projects, and regular members. Splitting these gives a clear chain of responsibility:

- **Owner** — the founding member of your organization. Pays the bills. Has the only ability to delete the organization or transfer ownership to someone else.
- **Admin** — runs the organization day-to-day. Manages members, changes roles, sees everything.
- **Project Manager** — runs specific projects. Adds members to projects they manage, runs sprints, handles ticket flow.
- **User** — works on the tickets assigned to them.

The names can be customized to match your team's vocabulary ("Engineer," "Designer," etc.) — what matters is the permissions underneath.

### Why can't a regular user change someone else's ticket status?

If you're not working on a ticket, you don't change its status. The person doing the work owns its progress. If you spot something that needs to change, you comment on it and let them update it — or ask a project manager to step in.

Anyone in the project can still create tickets, comment, and edit titles or descriptions. Status changes and re-assignments stay with the people actually responsible — the reporter and the assignee.

### Why are project settings only visible to admins and project managers?

Project settings affect things like visibility, members, and naming. Letting every team member change them would cause chaos. Settings stay with the people running the project.

---

## Projects

### Why are some projects private and others public?

Some projects need to stay confidential (HR initiatives, executive planning, sensitive customer work). Others benefit from being visible to the whole organization (shared platforms, public roadmaps, common tooling).

- **Private project** — only people explicitly added can see it.
- **Public project** — visible to everyone in your organization. Non-members see a read-only view and can ask to be added.

### Why can other admins see my private project?

In v2, all admins (and project managers, in read-only mode) can see every project in the organization. This is intentional — admins need to oversee everything.

If you need stricter privacy where even other admins can't see, that's coming in v3. For v2, the owner is the only level with guaranteed access to everything — which makes sense since they pay the bill.

---

## Sprints

### Why can't I edit a completed sprint's dates?

Once a sprint is closed, its dates are part of the historical record. Editing them would change past reports and team velocity calculations, which messes up planning future sprints.

If you really need to fix something on a completed sprint, that ability is coming in v3 with an audit trail so changes are tracked. For v2, completed = locked.

### Why can active sprint dates still be edited?

Plans change. A sprint might need to be extended because of a holiday, shortened because work finished early, or re-dated entirely. As long as the sprint isn't closed, admins and project managers can adjust both start and end dates.

### Why doesn't completing a sprint archive it automatically?

Closing a sprint and archiving it are different actions. You close sprints frequently as part of normal team flow — that just marks them as "done." Completed sprints stay in your sprint list with a "Completed" tag, sorted at the end, so you can still see and reference them.

**Archive** is a separate, deliberate action — you choose to archive a sprint (or a whole project) when you're really done with it and want it out of the active list. Archived items move to a dedicated archive section, retrievable by admins or project managers if you change your mind.

You'll archive a project once, at its very end. You'll close sprints all the time. Keeping these as distinct actions prevents the noise of "every completed sprint vanishes to archive."

### Will my sprint start automatically on the planned date?

Yes. Once you've set the sprint's start date, it auto-starts on that day — no manual click required. No need to remember to log in at the right moment.

A scheduled background job checks **once an hour**, so the sprint goes active (and everyone on the project gets a notification) within the hour after its start date arrives — not necessarily the exact stroke of midnight. Dates are read in IST.

*(Planned refinement: choosing a specific notification time — e.g. "alert at 9 AM on start day" — is on the roadmap.)*

### Can I delete a project, sprint, or ticket?

Yes, but each level has different rules to prevent accidents and match how much damage a deletion does:

- **Projects** — **only admins and the org owner** can delete. Project managers cannot delete projects, even those they manage. Reason: deleting a project removes all its sprints, tickets, and comments permanently, so the responsibility sits at the org level. Confirmation requires typing the project's name to prevent fat-finger mistakes (the same pattern GitHub uses for repo deletion). Project managers can still **archive** a project (reversible).
- **Sprints** — admins and project managers can delete. Simple yes/no confirmation.
- **Tickets** — admins and project managers can delete (not regular users or assignees). Simple yes/no confirmation. The normal way to mark a ticket as "this is finished" is to set its status to Done; deletion is for cleaning up mistakes or duplicates.

Most things are also recoverable via **archive** instead of delete. Archive moves items out of your active view but keeps them around; admins and PMs can unarchive at any time.

---

## Tickets

### Why do tickets have a "reporter" and an "assignee"?

Two different roles, both important:

- **Reporter** — the person tracking that this work needs to land. Could be the original requester, a project manager, or a team lead.
- **Assignee** — the person actually doing the work.

Both can change the ticket's status. Both can hand the ticket off to someone else if it needs to move. Other team members can comment and edit the title/description, but operational responsibility (status, re-assignment) stays with these two people.

If both slots are empty, anyone in the project can claim the ticket and become both reporter and assignee in one step — full ownership in a single action.

### Why can I create a ticket already in "Done" status?

Sometimes work happens before someone tracks it. Maybe you fixed a bug in the moment and want to log it for history. Maybe a teammate finished a task and asked you to record it. Either way, you should be able to capture the work without going through "todo → in progress → done" theater.

---

## Subscription & billing

### Why a 30-day free trial without a credit card?

We want teams to actually try Rai without commitment. Requiring a card upfront filters out people who would otherwise sign up and see if it fits. For v2, no card is needed.

Card-at-signup is on the roadmap for v3, once we have enough data to know what works for retention.

### Why does my organization stay read-only when my subscription expires?

If your card declines or you forget to renew, locking you out completely would punish you for an administrative mistake. Instead:

- You keep **read access** — browse your projects, tickets, sprints, comments. Nothing is lost.
- **New writes are blocked** until billing is fixed.

This gives you time to fix billing without losing visibility into work in progress. Admins see a "Reactivate" button right in the banner; non-admins see a message to contact their admin.

---

## Invites & sign-up

### Why are invite links valid for 7 days?

Long enough that someone on vacation or away for the weekend doesn't miss it. Short enough that a forwarded invite or an old inbox link can't be exploited indefinitely.

### Why is each invite link single-use?

Once someone joins the org through an invite, that specific link dies. If a second person needs access, they get their own invite. Keeps the audit trail clean — every membership traces back to a specific invitation.

### What happens if I invite the same email twice before they accept?

The newer invite supersedes the older one automatically. The first link stops working as soon as you send the second. Useful if you accidentally invited them as the wrong role and want to send a corrected one — the second invite quietly cancels the first.

### Why can I only invite by email (no shareable join codes)?

Email invites give us a clean audit trail — we know exactly who invited whom and when. Discord-style join codes (one shared link the whole team uses) are convenient but harder to track and easier to misuse. They're parked for v3.

---

## Sign-in & security

### What sign-in options exist?

In v2: email + password, Google SSO, Microsoft SSO. Email verification required before doing anything (creating an org, accepting an invite, etc.).

GitHub SSO and SAML / OIDC for enterprise come in v3.

### Why is email verification required before I can use the app?

Stops spam and disposable-email signups. Means every org is created by someone who actually owns the email address — which matters for security and billing.

### What about MFA / two-factor?

Coming in v3 as a per-user opt-in (TOTP first, SMS later). The auth system (AWS Cognito) already supports it — we're just not exposing the enrollment UI in v2.

---

## Switching organizations

### Why does the page take a moment when I switch organizations?

Switching organizations means refreshing your session so the system knows you're now acting in the new org. There's a brief "switching..." state while that happens, then the whole page updates atomically — sidebar, header, dashboard, all at once. No half-loaded states where the profile says one org and the content shows another.

If the switch fails for any reason (network glitch, etc.), the system stays on your current org and offers a retry. You never end up in an unclear state.

### What happens if I'm logged into multiple devices and switch orgs on one?

Other tabs in the same browser update automatically. Other devices (phone, second laptop) discover the switch the next time they make a request — there's no instant cross-device push in v2. Active cross-device session sync comes in v3.

---

## Notifications

### What notifications do I get in v2?

In-app notifications + email for the important events — someone assigned you a ticket, your invite was accepted, your subscription is about to expire, etc.

### When does mobile push come?

With the v3 mobile app. Web app users keep getting in-app + email throughout.

---

## When in doubt

These decisions reflect choices we made for v2's launch. They're not permanent. If something here isn't working for your team, tell us — that's how v3's priorities get shaped.
