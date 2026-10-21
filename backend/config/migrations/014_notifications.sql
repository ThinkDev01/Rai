-- v2 Phase 3 — Notifications subsystem.
-- Two tables:
--   notifications             → per-user in-app history (the bell/inbox feed). One row
--                               per dispatched notification regardless of channel mix,
--                               per dev-notifications.md ("write one row for history").
--   notification_preferences  → per-user, per-type, per-channel opt-out. Default is
--                               enabled; a row with enabled=false means the user opted
--                               out of that channel for that type. v2 UI toggles email
--                               only (in-app inbox is always on). System-critical types
--                               ignore prefs and always email (enforced in the service).

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL     PRIMARY KEY,
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nullable: most notifications are org-scoped (drives the deep-link slug), but the
  -- column stays nullable so non-org events can still write a history row.
  org_id      UUID          REFERENCES organizations(id) ON DELETE CASCADE,
  type        TEXT          NOT NULL,
  -- Rendered in-app summary line (template.inappText). Stored so the feed needs no
  -- re-render and old rows survive template changes.
  title       TEXT          NOT NULL,
  -- Relative path within the org (e.g. /projects/1/tickets/2). Frontend prefixes
  -- /orgs/<slug> using the joined org_slug. Null = non-navigable notice.
  link        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Feed query: newest-first per user.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, id DESC);

-- Unread badge count: partial index keeps it cheap as history grows.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id           UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT    NOT NULL,
  channel           TEXT    NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, notification_type, channel)
);
