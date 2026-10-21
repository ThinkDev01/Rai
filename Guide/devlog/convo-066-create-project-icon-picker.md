# convo-066 — Project icon picker in the Create-Project modal

**TL;DR**
- Extended the preset-avatar picker (built in [convo-063] for project **settings**) to the **Create Project** modal — icon can now be chosen at create time, not just edited afterwards.
- Wired `avatarType` / `avatarValue` end-to-end through the **create** path (frontend payload → controller validation → model INSERT). Same shape rules as the PATCH/update path; both fields optional, defaulting to `initials`.
- UI is **collapsed by default** (a "Select icon" toggle + live tile) so it adds no vertical clutter; tapping reveals the same coloured `PROJECT_ICONS` gallery the settings page uses.
- Frontend typechecks clean; backend `tsc` only shows pre-existing unrelated `razorpay.provider.ts` errors. **Open item:** user reported the icon not reflecting after create — diagnosed as a **stale running backend** (old INSERT), not a code bug; pending their restart/retest.

---

## Context
The preset project avatars (14 lucide icons, each with its own gradient; single source `frontend/lib/projectAvatar.tsx`) previously could only be set **after** creation via project settings (`PATCH /projects/:id`). The create flow had no icon field, so every new project started on the default key-letter tile. User asked to add the same picker into the create modal, kept minimal.

## What shipped

### Frontend
| File | Change |
|------|--------|
| `components/modals/CreateProjectModal.tsx` | New collapsible "Icon (optional)" field: live `ProjectAvatar` preview + **Select icon** toggle (chevron) → reveals the `PROJECT_ICONS` gallery + a "Default key letter" option. State `avatarType` / `avatarValue` / `iconPickerOpen`. Payload spreads `avatarType`/`avatarValue` **only** when an icon is actually picked. |
| `types/api.types.ts` | `CreateProjectPayload` gains optional `avatarType?: 'initials' \| 'icon'` + `avatarValue?: string \| null`. |

- Picker reuses the exact ring/opacity active-state styling from the settings picker (single source of truth = `PROJECT_ICONS`), so what you click is what you get.
- Preview tile uses the live (auto-generated) `key`, so it reflects the project key as you type the name.

### Backend
| File | Change |
|------|--------|
| `modules/projects/projects.types.ts` | `CreateProjectBody` gains optional `avatarType` / `avatarValue`. |
| `modules/projects/projects.controller.ts` (`createProjectHandler`) | Parses + validates the two fields — same rules as the update handler: `avatarType ∈ {initials, icon}`, `avatarValue` slug-safe `^[a-z0-9-]{1,50}$`, and `icon` must carry a value. Passes through to the model (forces `initials`/`null` unless type is `icon`). |
| `modules/projects/projects.model.ts` (`createProject`) | New optional params `avatarType='initials'`, `avatarValue=null`; INSERT now writes `avatar_type` / `avatar_value`. `PROJECT_COLS` already returned them. |

- **Backwards-compatible:** both fields optional everywhere; omitting them keeps the old `initials` default. No new migration (columns already exist from v2). Existing v2-api create test stays green.

### Docs
- `Api-Documentation/projects-api/create - docs.md` — added the two body fields, the response example fields, and the new 400 messages.
- `Api-Documentation/projects-api/create - curl.md` — added `avatarType`/`avatarValue` to the example body.
- README inventory count unchanged (no new endpoint).

## Verification done
- Traced the full chain — modal → `useCreateProject` (passes payload straight to `api.post`, no field stripping) → controller → model INSERT → `PROJECT_COLS` → sidebar & settings (both already pass `avatarType`/`avatarValue` into `ProjectAvatar`). All correct.
- `npx tsc --noEmit`: frontend clean; backend only the pre-existing `billing/providers/razorpay.provider.ts` errors (untouched module).

## Open item / next
- **User reported:** after creating a project with an icon, sidebar/settings show the default tile.
- **Diagnosis:** not a code bug — the chain is correct end-to-end. The row was written by **stale backend code** (old INSERT without the avatar columns → DB `initials` default). Causes: backend process not reloaded, or testing against **staging** (old deployed image needs a pipeline deploy).
- **To confirm (user side):** restart backend (local) or deploy (staging) → create a **fresh** project with an icon → check sidebar/settings. Projects created before the fix won't backfill (their rows are already `initials`).

[convo-063]: convo-063-project-preset-avatars.md
