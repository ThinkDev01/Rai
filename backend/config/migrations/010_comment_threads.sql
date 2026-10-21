-- v2 Comment threading — single-level Jira-style replies.
--
-- Background: today every comment on a ticket sits at the top level. With 25+
-- comments in flight on a busy ticket (see STRESS-1 in the stress seed), it's
-- impossible to track who replied to whom. Industry default (Jira, GitHub,
-- Linear) is single-level threading: a comment is either a root or a reply
-- to a root. Replies-of-replies are intentionally NOT supported — they
-- balloon visual nesting without adding clarity at this product scale.
--
-- Schema move:
--   comments.parent_comment_id  BIGINT  NULL
--     - NULL          → root comment
--     - non-NULL      → reply to that comment (which itself must be a root)
--
-- Depth-1 invariant is enforced at the API layer (addCommentHandler rejects
-- replies whose parent already has a parent). A DB trigger could also enforce
-- it, but at this scale the API check is sufficient and keeps the schema
-- simple for display-only callers.
--
-- FK uses ON DELETE SET NULL so deleting a root comment leaves orphaned
-- replies visible as roots — better UX than cascading the whole subtree
-- away and surprising the team that wrote the replies.

ALTER TABLE comments
  ADD COLUMN parent_comment_id BIGINT REFERENCES comments(id) ON DELETE SET NULL;

-- Partial index — most comments are roots; indexing only the replies keeps
-- the index small while still accelerating "find all replies to comment X"
-- and "find root comments only" (which can use the NULL filter directly).
CREATE INDEX idx_comments_parent_id
  ON comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;
