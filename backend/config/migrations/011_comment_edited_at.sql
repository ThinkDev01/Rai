-- v2 Comment editing — track whether (and when) a comment was edited.
--
-- Background: comments are immutable today (add + delete only). We're adding
-- author-only editing. The UI needs to render an "edited <time>" label, so we
-- need to distinguish "never edited" from "edited at T".
--
-- Why a dedicated `edited_at` column instead of reusing `updated_at`:
--   - `updated_at` defaults to NOW() on INSERT, so it equals `created_at` on a
--     fresh row — comparing the two to infer "edited" is fragile (clock skew,
--     same-statement equality) and couples display logic to insert behavior.
--   - `edited_at` is explicit: NULL = never edited, non-NULL = last edit time.
--     Reads directly into the label with zero ambiguity.
--
-- `updated_at` keeps its existing role (generic row-touch timestamp); the edit
-- path bumps both, but only `edited_at` drives the UI label.

ALTER TABLE comments
  ADD COLUMN edited_at TIMESTAMPTZ NULL;
