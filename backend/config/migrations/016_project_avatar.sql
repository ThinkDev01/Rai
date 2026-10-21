-- v2 — Project preset avatars (Jira-style icon gallery).
-- Projects can show either their key's first letter (default) or a preset icon
-- picked from a fixed gallery. NO file upload in v2 — custom image uploads
-- (and org/user avatars) are deferred to v3, which is exactly why we store an
-- icon *id* string, not a URL: zero object storage, fully cross-device.
--   * avatar_type  — 'initials' (default) renders the key letter on a colour
--                    tile; 'icon' renders the gallery icon named by avatar_value.
--   * avatar_value — lucide icon id (e.g. 'rocket') when type='icon'; NULL for
--                    'initials'. The id→component map lives on the frontend
--                    (lib/projectAvatar), so the gallery can grow without a
--                    migration.
-- The tile background colour stays derived from the project key (projectColor)
-- — no colour column needed.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS avatar_type  VARCHAR(10) NOT NULL DEFAULT 'initials'
    CHECK (avatar_type IN ('initials', 'icon')),
  ADD COLUMN IF NOT EXISTS avatar_value VARCHAR(50);
