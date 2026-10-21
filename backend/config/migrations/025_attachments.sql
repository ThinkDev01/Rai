-- Attachments (scheme D).
--
-- User-uploaded files for tickets and comments, uploaded to S3 via presigned
-- PUT and linked to an entity here. Design:
--   * `key` is stable from presign — orgs/{orgId}/attachments/{uuidv7}.{ext}
--     (no entity id in the path; this row IS the linkage). The object is never
--     moved after upload.
--   * `status='pending'` rows are inserted at presign time (uploader picked
--     files but the entity doesn't exist yet). Once the entity create request
--     arrives with the keys, the rows flip to 'confirmed' and get the entity
--     FK + uploader stamp.
--   * A confirmed row must point at exactly one entity; pending rows point at
--     neither. Orphaned pending rows older than 24h are swept by the
--     attachment-cleanup job (deletes the S3 object + row).

CREATE TABLE IF NOT EXISTS attachments (
  id           UUID         PRIMARY KEY,
  org_id       UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ticket_id    BIGINT       REFERENCES tickets(id)   ON DELETE CASCADE,
  comment_id   BIGINT       REFERENCES comments(id)  ON DELETE CASCADE,
  uploader_id  UUID         NOT NULL REFERENCES users(id),
  name         TEXT         NOT NULL,
  mime_type    TEXT         NOT NULL,
  size         BIGINT       NOT NULL,
  key          TEXT         NOT NULL UNIQUE,
  status       TEXT         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'confirmed')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  -- One entity max; must have one when confirmed, none when pending.
  CONSTRAINT ck_attachments_single_entity CHECK (ticket_id IS NULL OR comment_id IS NULL),
  CONSTRAINT ck_attachments_status_entity CHECK (
    (status = 'confirmed' AND (ticket_id IS NOT NULL OR comment_id IS NOT NULL))
    OR
    (status = 'pending'   AND ticket_id IS NULL AND comment_id IS NULL)
  )
);

CREATE INDEX idx_attachments_org_id      ON attachments(org_id);
CREATE INDEX idx_attachments_ticket_id   ON attachments(ticket_id)  WHERE ticket_id  IS NOT NULL;
CREATE INDEX idx_attachments_comment_id  ON attachments(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_attachments_pending_old ON attachments(created_at) WHERE status = 'pending';
