# Convo 057 — Cross-tab account-swap reconciliation + Unarchive-sprint confirm

**Date:** 27 May 2026

---

## What happened

User resumed the manual UI walkthrough on the `developement` branch and hit a multi-tab cross-account bug:

1. Tab A + Tab B both logged in as user1@orgA.
2. Logout in Tab A → cross-tab logout listener fires in Tab B → Tab B lands on `/auth/login`. ✓
3. Tab A signs back in (same or different user — doesn't matter).
4. Tab B (still on `/auth/login`) signs in as **user2@orgB**. localStorage tokens are now user2's.
5. Tab A's React state still says user1+orgA, but its localStorage tokens are user2's.
6. Click any project in Tab A → API request authenticates as user2 (token-bound) but URL references orgA's resources (state-bound) → backend 404s because user2 isn't a member of orgA.

The user flagged this as "not a good design" — correct. The storage-event listener in `(app)/layout.tsx` only handled token *removal* (sign-out). The token *replace with a different sub* case was a known gap.

## What the discussion turned up

This exact case was explicitly **parked** in convo-056's followups table:

> | Storage event listener (multi-tab signin propagation) | ⏸ parked |

And the original `v2-plans.md` § "Cross-tab session sync" design (line 289) always intended the storage listener to handle **login + logout + org-switch** propagation as one mechanism:

> "`storage` event on auth-related localStorage keys. Login / logout / org-switch in one tab fires the event in all other tabs → each tab clears React Query cache and refetches. One mechanism, three problems solved."

So the fix is realizing the design that was already locked, not introducing a new pattern.

## The fix

Two small edits.

**`frontend/lib/cognito-client.ts`** — new exported helper:

```ts
export function getStoredIdTokenSub(): string | null {
  const claims = parseIdTokenClaims();
  if (!claims) return null;
  const sub = claims['sub'];
  return typeof sub === 'string' ? sub : null;
}
```

Reads the `sub` claim from whatever ID token is in localStorage right now. Returns null if no tokens / unparseable.

**`frontend/app/(app)/layout.tsx`** — storage-event listener extended to handle two reconciliation cases:

- **Case A — sign-out in another tab** (existing behavior): `stillAuthed && !stillHasTokens` → `clearAuth()` + `qc.clear()` + redirect to `/auth/login`.
- **Case B — different account signed in in another tab** (new): `stillAuthed && stillHasTokens && currentUserId && newSub !== currentUserId` → `qc.clear()` + `hydrate()`. The hydrate adopts the new identity (`/me` with the new token). The existing gate-effect re-runs on hydrate completion and routes appropriately (`/welcome` if no memberships, otherwise the `currentOrgId` watcher sees the org transition and lands the tab on `/dashboard`).

Both branches are bounded — single fire per storage event, no recursion, no redirect loop. The `currentOrgId` ref watcher and the gate-effect both terminate on stable state.

## Why this UX choice

localStorage is shared per-origin across tabs. There is no way to keep "user1 active in Tab A, user2 active in Tab B" because both tabs read the same tokens key. So the only consistent state is: **all tabs reflect whichever identity owns the current tokens**.

This matches the Gmail / Notion / Slack model — one default account across all tabs of the same origin. The alternative (forcing tab A to sign out on identity change) was rejected because:

- The user *just* signed in as user2 in Tab B with deliberate intent. Forcing Tab A to logout would lose any in-progress work and feel adversarial.
- Re-hydrating to the new identity gives both tabs a coherent view automatically.

## Files touched

- `frontend/lib/cognito-client.ts` — added `getStoredIdTokenSub()`.
- `frontend/app/(app)/layout.tsx` — extended `onStorage` handler with Case B; updated header comment block.
- `docs/v2-plans.md` — UI-pass round 3 entry added.
- `docs/devlog/convo-057-cross-tab-account-swap-fix.md` — this file.

## Verification

`tsc --noEmit` clean on the changed files. Pre-existing 6 errors in `app/(app)/projects/[id]/settings/page.tsx` (`project` possibly-undefined) are unrelated and flagged for the next UI-pass batch.

**Manual repro to verify the fix:**

1. Open two tabs, both logged in as user1@orgA.
2. In Tab A, sign out.
3. Tab B auto-redirects to `/auth/login`. ✓ (existing cross-tab logout)
4. In Tab A, sign in again (any account).
5. In Tab B, sign in as **user2@orgB**.
6. Switch focus back to Tab A — it should re-hydrate, switch to user2's identity, land on `/dashboard` for orgB.
7. Click a project in either tab — no 404.

## Related parked items still open

- Hydrate inflight dedupe singleton (convo-056) — still parked. Not needed for this fix because hydrate guards against concurrent calls via `isHydrating` and the gate-effect waits on it.
- Status-enum refactor (convo-056) — still parked.

---

## Second arc — Unarchive sprint confirm

User flagged that the "Unarchive" button on the Archive page (`/projects/[id]/archive`) was a bare-click action — no confirmation. Same gap existed on the sprint detail page (`/projects/[id]/sprints/[sprintId]`) where the Archive/Delete buttons already had inline confirm cards but Unarchive didn't.

Per `[[feedback_confirm_before_sensitive_action]]`, persistent state changes never fire from a single click. Both places now use the same inline view→confirm pattern that the existing Archive/Delete buttons already use.

**`frontend/app/(app)/projects/[id]/archive/page.tsx`** — each `ArchivedSprintCard` gets a local `confirming: boolean` state. Right-side action cluster toggles:

- Idle: `[ArchiveRestore] Unarchive` button.
- Confirming: `Move back? [Confirm] [Cancel]` row.

`onSuccess` of the mutation resets `confirming = false` so an immediate re-archive prompt isn't left dangling if the row stays mounted.

**`frontend/app/(app)/projects/[id]/sprints/[sprintId]/page.tsx`** — new `confirmUnarchive: boolean` state mirroring the existing `confirmArchive` / `confirmDelete` pattern. The bottom action row swaps the single Unarchive button for a `Move this sprint back to the active list? [Confirm unarchive] [Cancel]` row.

**Files touched (arc 2):**

- `frontend/app/(app)/projects/[id]/archive/page.tsx` — added `useState` import, `confirming` state per card, inline confirm UI.
- `frontend/app/(app)/projects/[id]/sprints/[sprintId]/page.tsx` — added `confirmUnarchive` state, wrapped Unarchive button in view→confirm UI.
- `docs/v2-plans.md` — UI-pass round 3 entry extended.
