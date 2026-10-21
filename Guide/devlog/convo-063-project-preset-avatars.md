# convo-063 — Project preset avatars (Jira-style icon gallery)

**TL;DR**
- Shipped **preset icon avatars for projects** — DB-backed, **no S3**, fully cross-device. Default stays the key-letter colour tile; users can now pick from a 28-icon lucide gallery in project settings.
- Org + user avatars (and custom image upload) are **deferred to v3** — "coming soon" everywhere.
- Code + docs done, typecheck clean both ends. **Next: user tests tomorrow** (run migration on backend boot, pick an icon in a project's settings, confirm it renders across sidebar/index/identity + survives a reload).

---

## The discussion

Started from a v3-scoping question: profile/display pictures for **users, projects, orgs** were parked for v3. We unpacked what avatars actually need:

- **Three render levels:** preset/template · generated initials · custom upload.
- **Only custom upload needs object storage (S3).** Templates + initials store a tiny string, render client-side → zero storage.
- **How Jira does it:** projects get a preset avatar gallery (grid of built-in icons) + optional upload; gallery picks reference a shared icon id (no per-project storage), only uploads hit storage. Users = initials/Gravatar default; orgs/sites = logo upload.

### Decision (locked)

| Entity | v2 (now) | v3 (later) |
|---|---|---|
| **Project** | Default key-letter tile **+ preset icon gallery** | custom upload |
| **Org** | Initials/colour only · "coming soon" | upload |
| **User** | Initials/colour only · "coming soon" | upload (or ignore) |

- **Projects never get custom upload** in the user's stated plan — preset gallery is the v2 end state for projects.
- **Colour stays derived from the project key** (existing `projectColor`) — no colour column, no colour picker. The picker only chooses the *glyph*.
- **Cross-device** because the choice lives in the DB (an id string), not S3 or local storage.
- v3-ready: when uploads land, it's just a new `avatarType` rendering an `<img>` — no call-site changes.

---

## What was built

### Backend
- **Migration `016_project_avatar.sql`** — adds to `projects`:
  - `avatar_type` `VARCHAR(10)` NOT NULL DEFAULT `'initials'`, CHECK in (`initials`, `icon`)
  - `avatar_value` `VARCHAR(50)` nullable (lucide icon id when type=`icon`)
- **`projects.types.ts`** — `ProjectRow` + `ProjectResponse` + `ProjectSummaryResponse` + `UpdateProjectBody` carry the two fields; both mappers (`toProjectSummary`, `buildProjectResponse`) populate them.
- **`projects.model.ts`** — both column lists (`PROJECT_COLS` / `PROJECT_COLS_PREFIXED`) include the columns; `updateProject` whitelists `avatar_type` / `avatar_value`. New projects inherit the DB default (no createProject change).
- **`projects.controller.ts`** — validates `avatarType` ∈ {initials, icon}; `avatarValue` is slug-safe (`^[a-z0-9-]{1,50}$`) or null; **`icon` requires a value**. Written as a **pair** (initials clears the id). Archived-project guard extended so avatar edits are also frozen while archived.
- **My Work projection** (`users.model.ts` + `users.controller.ts`) — `shapeMyWorkItem`'s project sub-object now returns the avatar fields too, so the wire matches the extended `ProjectSummary` type (icon allowlist intentionally **not** duplicated on the backend — gallery can grow without a migration).

### Frontend
- **`lib/projectAvatar.tsx`** — single source of truth for the gallery: `PROJECT_ICONS` (28 lucide icons, stable ids — never rename) for the picker + `PROJECT_ICON_MAP` for O(1) lookup. Add an icon = one row here + a re-export from `lib/icons`.
- **`lib/icons.ts`** — added gallery icons (Star, Flag, Heart, Package, Compass, Briefcase, Code2, Lightbulb, Wrench, Cpu, Database, Cloud, Flame, Trophy, Gem) + re-exported the `LucideIcon` type so the map stays library-agnostic.
- **`components/ui/ProjectAvatar.tsx`** — the **one render site** for every project tile (xs/sm/md/lg). Colour from `projectColor(key)`; glyph = key letter (default) or the gallery icon. Unknown/removed icon id falls back to the letter (never blank).
- Wired in everywhere a project tile shows: **projects index** (list + grid — removed the local `ProjectKeySquare`), **sidebar** global project list + project-sidebar identity, and **project settings**.
- **Settings picker** — in the existing General edit→save flow: a live-preview `ProjectAvatar` + a grid of "Default (key letter)" + 28 icon buttons; selection rides the existing Save/Cancel + `hasChanges` logic; payload sends the `{avatarType, avatarValue}` pair.
- **Types** (`api.types.ts`) — `Project`, `ProjectSummary`, `UpdateProjectPayload` carry the fields.

### Docs (same response)
- `backend/guide - db.md` — projects-table columns + Migrations-in-order (added the missing **015 user_pins** row while there, plus **016**).
- `backend/Api-Documentation/projects-api/update - docs.md` + `update - curl.md` — new body fields, response keys, 400 messages, and set-icon / reset-to-default curl examples.
- `frontend/guide - frontend.md` — ProjectAvatar + projectAvatar gallery note in Key UI.

---

## State at close
- **Typecheck:** clean both ends (backend + frontend).
- **Migration:** runs automatically on next backend boot (or `npm run migrate`).
- **Known unrelated:** a pre-existing `EpicTag` error in `board/page.tsx` (tickets domain, untouched) flickered mid-typecheck; final runs were clean. Flag only if it resurfaces — it's uncommitted work unrelated to this feature.

## Next (user testing tomorrow)
1. Boot backend → confirm migration 016 applies.
2. Open a project → Settings → Edit → pick an icon → Save.
3. Confirm it renders in: sidebar project list, project-sidebar identity, projects index (list + grid), settings.
4. Reload / different device → confirm it persists (DB-backed).
5. Reset to "Default" → confirm it clears back to the key letter.
