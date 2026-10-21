# convo-072 — Mobile Repo Clone + AI-Ready API Key Plan + Priority Stack

**TL;DR**
- Cloned `Rai-Mobile` into `rai/mobile` — RN app files sit directly in that folder (nested git repo inside the `rai` checkout).
- Discussed **agent-AI-ready APIs**. **Headline:** the proposed "Cognito access token + random key" composite is the wrong shape — it inherits the 1-hour expiry and forces hourly rotation, which kills the feature. A PAT must be a **standalone random secret**. `upgrades.md` already said exactly this in its pinned ⭐ block.
- Dumped a **full backlog** — 3 bugs, 1 email-format bug, mobile-responsiveness, and 6 new features. Several already existed in `upgrades.md`; one is a **direct reversal** of a parked plan.
- **Priority stack locked:** (1) agent-ready, (2) the two board/comment bugs, (3) media + markdown revamp. Everything else queued.
- **Next:** nothing built yet. Revisit agent-ready in detail; `upgrades.md` + a 13-item task list now carry the backlog.

---

## 1. Mobile repo clone

**Done.** `git clone https://github.com/Novetum-private-limited/Rai-Mobile.git mobile` inside the `rai` root.

- Path: `rai/mobile` — contains `App.tsx`, `index.js`, `src/`, `android/`, `ios/`, `__tests__/`, and RN config files directly (no extra nesting).
- HEAD: `6db8e87` ("done build.gradle"). History: `6db8e87` → `3b516f9` (Add React Native mobile app implementation) → `994eede` (Initial commit).
- **Note:** a **separate git repo nested inside the `rai` checkout**. The parent sees `mobile/` as untracked. Adding `mobile/` to `rai/.gitignore` would avoid an accidental gitlink commit — **not done, open item.**
- **Deps not installed** — no `npm install` yet.

---

## 2. Agent-ready APIs — the discussion

### Where we are today
Locally, an agent given a Cognito token **plus access to the Rai repo** finds endpoints and calls them successfully. That works only because it can *read the source*. A third-party agent, given just our URL + a key, cannot.

### The proposal (as pitched)
- API-key section in Settings.
- Key = **Cognito access token + a per-user random key**, joined in the backend, shown to the user.
- Random key stored in an `ai-api-key` table.
- Access token expires hourly → v1 lets the user **regenerate the key every hour**.
- Any agent + key + website URL → full API access.

### Verdict — drop the composite ⭐

**Problem:** embedding the access token inherits its 1-hour expiry. "Rotate your key every hour" makes it unusable for an unattended agent — it defeats the feature's entire purpose.

**Fix:** the key **is** just a random secret, mapping to a user row in our DB. No token inside it, nothing to expire.

- Format `rai_pat_<32 random bytes>` — shown **once** at creation.
- Store only `sha256(key)` — never plaintext.
- Table: `user_id`, `org_id`, `label`, `key_hash`, `last_used_at`, `revoked_at`.
- Never expires; user revokes/rotates on their own terms.

### ⚠ Our own docs already locked this
`upgrades.md` opens with a pinned **"⭐ MOST IMPORTANT — Agent-ready access (PATs + MCP)"** block that already says: *don't hand users raw Cognito JWTs (1h expiry, ID token isn't for API auth); do issue revocable scoped PATs (`rai_pat_…`), GitHub/Stripe model; endgame is a thin MCP server.* The pitched composite **contradicted our own written decision** — worth knowing before the detailed session. That block has now been extended with the design details below rather than duplicated.

---

## 3. Where it plugs in

`middleware/authMiddleware.ts` already normalizes every auth path down to `req.user` (`AuthUser`). **That's the clean insertion point** — branch at the top:

- Token starts with `rai_pat_` → hash → look up row → build the same `AuthUser` → `next()`.
- Otherwise → existing Cognito `verifyAccessToken` path, untouched.

Downstream (`requireOrgContext`, `requireOrgRole`, RBAC) keeps working unchanged. That's the whole backend lift.

---

## 4. Org selection — the real design trap

**Problem:** `currentOrgId` lives on the user, changed via a switch endpoint — server-side session state. Two agents working concurrently would stomp each other's org.

**v1 fix:** **scope each key to one org at creation.** One key per org; the agent "asks which org" by asking which key. Simplest and safest.
**Later:** an `X-Org-Id` header per request → stateless.

---

## 5. CORS — mostly a non-issue

Agents call **server-to-server**: no browser, no preflight, no CORS involvement. It matters only if the agent runs in a browser — and we should **explicitly reject PATs from browser origins**, since a key in frontend JS is a leaked key.

(Current `app.ts` CORS: env-driven `CORS_ORIGIN` allowlist + dev-only ngrok/LAN regex. No change needed.)

---

## 6. Auth is only half — discovery is the other half

The local agent works because it can read the repo. A stranger's agent can't.

- **Serve `/openapi.json`** generated from `backend/Api-Documentation/` → any agent learns every endpoint, param, and response shape without repo access.
- **Longer term: the MCP server** already named as the endgame in `upgrades.md`. The real unlock.

**Also raised (undecided):** rate-limit **per key** (`rateLimiter.ts` is IP-based today — one runaway agent shouldn't hammer us); **audit log** (`last_used_at` + routes hit, wanted the first time a key leaks); **scopes** (read-only vs write, so a user can hand an agent a safe key).

---

## 7. Backlog dump — with what our docs already said

The user dumped bugs + features. **Cross-checking against `upgrades.md` surfaced three things worth flagging.**

### ⚠ A. Direct reversal — board default assignee
The user wants the board to **default to all tickets from all users** ("default logged-in user selection is annoying").

`upgrades.md` had a parked entry — **"Default-to-me filter on ticket-listing pages"** (surfaced 2026-05-29, stress-test walkthrough) — speccing the **exact opposite**: `assigneeFilter = [currentUser.id]` on first visit, argued from a 100-ticket/50-member overwhelm case.

**Resolved:** entry marked **⚠ REVERSED (2026-07-17)**, kept as history per the keep-history rule. The pill + localStorage persistence survive; only the **default flips `'me'` → `'all'`**. Reports/My Work guidance was already correct and is unaffected.

### B. Already specced, now promoted
- **Attachments** — `upgrades.md` "Attachments on tickets / comments (Jira parity)" (flagged 2026-06-09, parked v3 as *not launch-critical*) already carries the full spec: S3 + presigned upload, `attachments` table, virus-scan hook, type/size caps, signed download URLs, dropzone + inline previews. **Now promoted to must-ship.** Not re-specced — status updated in place.
- **Profile pics** — "Custom DP / logo / avatar for orgs and projects" (cut from v2 on 2026-06-08) already carries S3 + CloudFront + Lambda-resize + nullable `*_url` columns with deterministic-color fallback. **Re-raised, stays queued** below the must-ships.
- **Insight:** attachments and profile pics **share the S3 + presigned-upload subsystem**. Build the storage layer once. The old "too heavy a subsystem" objection to profile pics largely dissolves once attachments land.

### C. Cognito email background
The logo complaint has context: `upgrades.md` records that branded HTML from `frontend/content/emails/` was **already pasted into the Cognito User Pool message templates in v2**. So either that paste never landed or the logo URL isn't reachable from the mail client — check the User Pool templates first, then image hosting. (The parked *CustomMessage Lambda trigger* entry is a different, later concern.)

### D. Genuinely new — no prior entry
Markdown/textbox revamp · criticality filter · kanban empty state · customisable kanban columns · org-level reports. All five added to `upgrades.md`.

---

## 8. Priority stack (locked 2026-07-17)

User's explicit ranking — "if we can't deliver all this, these are the highest priorities":

1. **Agent-ready access** (PAT + MCP).
2. **The bug fixes** — side-panel comment scroll; board default-assignee.
3. **Media/attachments + markdown revamp** — one push; they share the composer.

Everything else queued.

---

## 9. Full backlog → task list (13 items)

**P0 — must-ship**
1. Agent-ready API access (PAT + MCP).
2. **Bug:** ticket side-panel comment section is cut off under the screen, not scrollable — comments below the fold unreachable.
3. **Bug:** board defaults to logged-in user → must show all tickets *(the reversal, § 7A)*.
4. Attachments — files + media, **especially screenshots**, on tickets/comments.
5. Revamp all textboxes → full markdown that looks good (input **and** rendered output).

**P1**
6. **Bug:** Cognito mail templates not using our logo *(§ 7C)*.
7. **Bug:** feedback mail arrives as raw JSON, not a formatted branded email.
8. Mobile responsiveness — bad on Android, **worst on iPhone**. ⚠ *Scope unclear: web-responsive vs the RN app now at `rai/mobile`. Clarify before starting.*

**P2**
9. Filter board by criticality *(ship with #3 — same filter surface)*.
10. Kanban empty state — note + direct Create Sprint modal button.
11. Profile pics + customisation for orgs and users *(shares S3 with #4)*.
12. Customisable kanban columns/stages — **bigger than it looks**: status is a fixed enum today, so this needs a workflow/statuses table, an enum migration, and a pass over every status-dependent surface.
13. Org-level reports across all projects — user's own framing: "big scope but definitely needed."

---

## Status & next steps

**Nothing implemented.** No migration, no middleware change, no product code. Docs + task list only.

**Docs updated this session:**
- `upgrades.md` — priority-stack block; PAT design details folded into the ⭐ block; Default-to-me marked reversed; attachments promoted; profile pics re-raised; 5 new entries; **new ⚠ Needs Discussion (2026-07-17) section** carrying every open point; Contents + Last-updated refreshed.
- This devlog.

**Open decisions — all parked for a dedicated session.**
Canonical list lives in `upgrades.md` § **⚠ Needs Discussion (surfaced 2026-07-17, convo-072 cross-check)** — 7 grouped items, each with Gap / Why it matters / To discuss. Not duplicated here. Summary of what's open:

1. **Agent-ready PATs** — confirm the composite is dead; org scoping (per-org vs `X-Org-Id`); scopes in v1?; OpenAPI-vs-MCP sequencing; per-key rate limit + audit log.
2. **Default-to-me reversal** — sign off the flip; decide whether the org-size case ever deserves a smarter default (both verdicts may be true at different scales).
3. **Attachments + profile pics** — same S3 subsystem, priced separately; sequence them together?
4. **Customisable kanban columns** — sized like a settings screen, priced like a schema migration; interacts with org-level reports.
5. **Org-level reports** — needs a metrics/aggregation/performance scoping pass; first cross-project read path.
6. **Mobile responsiveness** — web vs native (`rai/mobile`) unresolved.
7. **Housekeeping** — `mobile/` gitignore-vs-submodule; deps not installed.

**Next:** revisit agent-ready in detail in a later session.
