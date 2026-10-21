-- Soft-delete support for comment threads.
--
-- Background: comments.parent_comment_id uses ON DELETE SET NULL (migration
-- 010), so hard-deleting a root comment promotes all of its replies to roots —
-- the replies survive, but the "this was a reply to X" link is lost and the
-- thread reads as unrelated top-level comments. For a busy ticket that's
-- confusing: the replies are still clearly in-conversation.
--
-- Instead, deleting a root comment that HAS replies now soft-deletes it: the
-- row is kept (so replies keep their parent_comment_id and stay nested) but
-- marked with deleted_at and its content blanked. The API/UI renders a
-- "This comment was deleted" placeholder where the comment used to be, with
-- the replies still threaded beneath it.
--
-- Schema move:
--   comments.deleted_at  TIMESTAMPTZ  NULL
--     - NULL     → comment is live
--     - non-NULL → comment was soft-deleted (content blanked, replies remain)
--
-- Reply comments and root comments WITHOUT replies are still hard-deleted
-- (nothing depends on them). The soft-delete decision lives in the API layer
-- (deleteComment in tickets.model.ts) — the column is just the marker.

ALTER TABLE comments
  ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Reply targets / edit lookups must be able to tell a live comment from a
-- deleted one cheaply; a partial index keeps deleted rows out of the common
-- "find comment by id" path while still letting the delete path find them.
CREATE INDEX idx_comments_deleted_at
  ON comments(deleted_at)
  WHERE deleted_at IS NOT NULL;
