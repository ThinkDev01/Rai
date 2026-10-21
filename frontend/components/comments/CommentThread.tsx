'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Send, CornerDownRight, Pencil, Trash2, Check, ChevronDown, ArrowUpRight,
} from '@/lib/icons';
import { MentionTextarea } from '@/components/ui/MentionTextarea';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { AttachmentList } from '@/components/attachments/AttachmentList';
import { PersistedAttachmentList } from '@/components/attachments/PersistedAttachmentList';
import { useAttachments } from '@/hooks/useAttachments';
import { COMMENT_ATTACHMENT_LIMITS, hasInvalid } from '@/lib/uploads';
import { confirmModal } from '@/lib/confirmModal';
import { formatDateTime } from '@/lib/dates';
import { memberColor } from '@/lib/project.utils';
import { useAddComment, useEditComment, useDeleteComment } from '@/hooks/useComments';
import { useDeleteAttachment } from '@/hooks/useTickets';
import type { Attachment, Comment, Member } from '@/types/api.types';

// Shared comment thread — the single source of truth for the threaded
// (single-level, Jira-style) comment UI. Rendered by BOTH the full ticket
// page and the single-click TicketPanel so the two surfaces never drift
// (we previously had divergent copies + a "must update both" note on the
// delete logic). It owns its own compose / reply / edit state and the
// add/edit/delete mutations; the host only passes data + identity.
//
// Behavior is identical on both surfaces — reply, edit (author-only) and
// delete all work in the panel now. The only `variant` difference is the
// overflow affordance: the full page expands inline ("Show N earlier"),
// the panel links out to the full page (keeps the peek focused on recent
// activity).

const COMMENT_INITIAL_VISIBLE = 10;  // roots shown before the overflow gate
const REPLY_INITIAL_VISIBLE   = 2;   // replies shown per thread before "show more"

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? (parts[0]?.[0] ?? '?').toUpperCase()
    : ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

interface CommentThreadProps {
  comments: Comment[];
  members: Member[];
  /** Routing for the add/edit/delete mutations (cache key uses ticketKey). */
  projectId: string;
  ticketId: string;
  ticketKey: string;
  /** Permission inputs — mirror the backend deleteCommentHandler rule. */
  reporterId: string;
  assigneeId?: string | null;
  currentUserId?: string;
  currentUserName?: string | null;
  currentUserEmail?: string;
  /** Org role of the caller (owner/admin get moderation delete). */
  orgRole?: string | null;
  variant?: 'full' | 'panel';
  /** Panel variant: where the overflow link points (full ticket page). */
  fullPageHref?: string;
  /** Full variant: start expanded (e.g. arriving via ?expand=comments). */
  initialShowAll?: boolean;
}

export function CommentThread({
  comments,
  members,
  projectId,
  ticketId,
  ticketKey,
  reporterId,
  assigneeId,
  currentUserId,
  currentUserName,
  currentUserEmail,
  orgRole,
  variant = 'full',
  fullPageHref,
  initialShowAll = false,
}: CommentThreadProps) {
  const [commentText,      setCommentText]      = useState('');
  const [replyingToId,     setReplyingToId]     = useState<string | null>(null);
  const [replyText,        setReplyText]        = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText,         setEditText]         = useState('');
  // Explicitly-selected @-mention ids per composer (id-bound — see MentionTextarea).
  // Notifications route on these; typed-but-unselected @names notify nobody.
  const [commentMentions,  setCommentMentions]  = useState<string[]>([]);
  const [replyMentions,    setReplyMentions]    = useState<string[]>([]);
  const [editMentions,     setEditMentions]     = useState<string[]>([]);
  // Pre-bound mention for the reply composer (the author being replied to),
  // so the "@Author " pre-fill notifies without forcing a manual re-pick.
  const [replyInit,        setReplyInit]        = useState<{ id: string; name: string }[]>([]);
  const [expandedReplyRoots, setExpandedReplyRoots] = useState<Set<string>>(new Set());
  const [showAllComments,    setShowAllComments]    = useState(initialShowAll);

  const { mutate: addComment,  isPending: isCommenting }     = useAddComment(projectId, ticketId, ticketKey);
  const { mutate: editComment, isPending: isEditingComment } = useEditComment(projectId, ticketId, ticketKey);
  const { mutate: deleteComment }                            = useDeleteComment(projectId, ticketId, ticketKey);
  // Deleting an existing comment attachment (edit mode) — the author is the
  // uploader, so the backend's can-delete gate passes for them.
  const { mutate: deleteAttachment } = useDeleteAttachment(projectId);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  // Pending attachments per composer. Optional; invalid files red-mark and
  // block that composer's submit until removed/replaced.
  // Dedupe is scoped to the SAME entity: a new/reply comment only dedupes
  // within its own picks; the edit composer also compares against the files
  // already attached to the comment being edited (name OR content match →
  // skipped). A file may legitimately repeat between the TICKET and its
  // comments — cross-entity repeats are allowed, duplicates within the same
  // entity are not.
  const editingComment = comments.find(c => c.id === editingCommentId);
  const commentAttachments = useAttachments(COMMENT_ATTACHMENT_LIMITS);
  const replyAttachments   = useAttachments(COMMENT_ATTACHMENT_LIMITS);
  const editAttachments    = useAttachments(COMMENT_ATTACHMENT_LIMITS, editingComment?.attachments ?? []);
  const commentBlocked = hasInvalid(commentAttachments.pending);
  const replyBlocked   = hasInvalid(replyAttachments.pending);
  const editBlocked    = hasInvalid(editAttachments.pending);

  const userInitials = computeInitials(currentUserName?.trim() || currentUserEmail || '');
  // Stable reference across renders (not just recomputed every render) so
  // MarkdownRenderer's React.memo can actually skip re-parsing comments that
  // haven't changed — e.g. typing in the new-comment box re-renders this
  // whole component on every keystroke, and without a stable `memberNames`
  // reference every already-posted comment would re-parse its Markdown too.
  const memberNames  = useMemo(() => members.map(m => m.name), [members]);

  async function submitComment() {
    const trimmed = commentText.trim();
    if (!trimmed && commentAttachments.pending.length === 0) return;
    const uploaded = await commentAttachments.upload('comment', null);
    if (uploaded === null) return;
    addComment(
      {
        content: trimmed,
        mentions: commentMentions,
        attachments: uploaded.length > 0 ? uploaded : undefined,
      },
      { onSuccess: () => { setCommentText(''); setCommentMentions([]); commentAttachments.clear(); } },
    );
  }

  // Reply: a "reply to a reply" still posts against the ROOT (single-level
  // threading) but pre-fills "@AuthorName " so it reads as directed at the
  // sub-thread participant (YouTube/Reddit pattern). The author is pre-bound as
  // a selected mention so that pre-fill actually notifies them.
  function startReply(rootId: string, mention?: { id: string; name: string }) {
    cancelEdit();
    setReplyingToId(rootId);
    setReplyText(mention ? `@${mention.name} ` : '');
    setReplyInit(mention ? [mention] : []);
    setReplyMentions(mention ? [mention.id] : []);
  }
  function cancelReply() {
    setReplyingToId(null);
    setReplyText('');
    setReplyInit([]);
    setReplyMentions([]);
    replyAttachments.clear();
  }
  async function submitReply() {
    const trimmed = replyText.trim();
    if ((!trimmed && replyAttachments.pending.length === 0) || !replyingToId) return;
    const uploaded = await replyAttachments.upload('comment', null);
    if (uploaded === null) return;
    addComment(
      {
        content: trimmed,
        parentCommentId: replyingToId,
        mentions: replyMentions,
        attachments: uploaded.length > 0 ? uploaded : undefined,
      },
      { onSuccess: () => cancelReply() },
    );
  }

  // Edit is author-only (the button only renders for the author; backend
  // re-checks). Opening edit closes any open reply composer. Existing @names in
  // the body start unbound — to notify on edit the user re-picks from the list.
  function startEdit(commentId: string, currentContent: string) {
    cancelReply();
    setEditingCommentId(commentId);
    setEditText(currentContent);
    setEditMentions([]);
  }
  function cancelEdit() {
    setEditingCommentId(null);
    setEditText('');
    setEditMentions([]);
    editAttachments.clear();
  }
  async function submitEdit(hasExistingAttachments: boolean) {
    const trimmed = editText.trim();
    if ((!trimmed && editAttachments.pending.length === 0 && !hasExistingAttachments) || !editingCommentId) return;
    const uploaded = await editAttachments.upload('comment', editingCommentId);
    if (uploaded === null) return;
    editComment(
      {
        commentId: editingCommentId,
        content: trimmed,
        mentions: editMentions,
        attachments: uploaded.length > 0 ? uploaded : undefined,
      },
      { onSuccess: () => cancelEdit() },
    );
  }

  async function handleDeleteComment(commentId: string, authorName: string) {
    const ok = await confirmModal({
      title:        'Delete this comment?',
      description:  `This will permanently remove the comment from ${authorName}. Replies to it stay visible in the thread. You can't undo this.`,
      confirmLabel: 'Delete comment',
      cancelLabel:  'Keep comment',
      variant:      'danger',
    });
    if (ok) deleteComment(commentId);
  }

  // Delete an attachment on a comment being edited. Confirm first (removes the
  // S3 object + row). The delete affordance only exists in edit mode — the
  // read-only comment display shows no delete icon.
  async function handleDeleteCommentAttachment(a: Attachment) {
    if (deletingAttachmentId) return;
    const ok = await confirmModal({
      title:        'Delete attachment',
      description:  `Permanently delete "${a.name}" from this comment? This cannot be undone.`,
      confirmLabel: 'Yes, delete',
      cancelLabel:  'No',
      variant:      'danger',
    });
    if (!ok) return;
    setDeletingAttachmentId(a.id);
    deleteAttachment(a.id, {
      onSettled: () => setDeletingAttachmentId(null),
    });
  }

  function toggleRepliesExpanded(rootId: string) {
    setExpandedReplyRoots(prev => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  // ── Tree build ────────────────────────────────────────────────────────────
  // Roots newest-first (latest activity on top); replies oldest-first within a
  // thread (conversation reads chronologically). Orphan replies (root deleted,
  // ON DELETE SET NULL) fall back to root rendering so nothing vanishes.
  const byNewestFirst = (a: Comment, b: Comment) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const byOldestFirst = (a: Comment, b: Comment) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

  const idSet = new Set(comments.map(c => c.id));
  // Roots whose soft-deleted marker hides the thread — no replying into a
  // deleted root's thread (the backend rejects it too).
  const deletedIds = new Set(comments.filter(c => c.deletedAt).map(c => c.id));
  const roots = comments
    .filter(c => c.parentCommentId === null || !idSet.has(c.parentCommentId))
    .sort(byNewestFirst);
  const repliesByRoot = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentCommentId !== null && idSet.has(c.parentCommentId)) {
      const arr = repliesByRoot.get(c.parentCommentId) ?? [];
      arr.push(c);
      repliesByRoot.set(c.parentCommentId, arr);
    }
  }
  for (const arr of repliesByRoot.values()) arr.sort(byOldestFirst);

  // Overflow gate. Full: collapse older roots behind an inline "Show N
  // earlier" pill. Panel: always cap and link out to the full page.
  const overflowActive = variant === 'panel' || !showAllComments;
  const hiddenRootCount = overflowActive
    ? Math.max(0, roots.length - COMMENT_INITIAL_VISIBLE)
    : 0;
  const visibleRoots = hiddenRootCount > 0 ? roots.slice(0, COMMENT_INITIAL_VISIBLE) : roots;

  // Delete eligibility — mirrors backend deleteCommentHandler: comment author
  // OR ticket reporter OR ticket assignee OR org owner/admin. PMs are not
  // blanket-elevated. UX hint only; backend is the source of truth.
  const isOrgAdmin       = orgRole === 'owner' || orgRole === 'admin';
  const isTicketReporter = !!currentUserId && currentUserId === reporterId;
  const isTicketAssignee = !!currentUserId && !!assigneeId && currentUserId === assigneeId;
  function canDeleteCommentFor(authorId: string): boolean {
    if (isOrgAdmin) return true;
    if (currentUserId && currentUserId === authorId) return true;
    if (isTicketReporter) return true;
    if (isTicketAssignee) return true;
    return false;
  }

  // Render one comment card (root or reply). `replyContext` carries the root
  // id + author name so a Reply click on a child posts against the root,
  // pre-filled with the child author's @-mention.
  function renderCommentBody(
    comment: Comment,
    isReply: boolean,
    replyContext: { rootId: string; mention: { id: string; name: string } },
  ) {
    const canDelete = canDeleteCommentFor(comment.author.id);
    const isReplyingToThis = replyingToId === replyContext.rootId;
    const isAuthor = !!currentUserId && currentUserId === comment.author.id;
    const isEditingThis = editingCommentId === comment.id;

    // Soft-deleted comment (a root whose replies kept the thread alive) —
    // content is blanked by the backend. Render a clear "deleted" placeholder
    // so the conversation still reads as a thread, with no author / actions.
    if (comment.deletedAt) {
      return (
        <div className="flex gap-3">
          <div
            className={`mt-0.5 flex flex-shrink-0 items-center justify-center rounded-full border border-border bg-surface-sunken text-text-placeholder ${isReply ? 'h-6 w-6' : 'h-7 w-7'}`}
          >
            <Trash2 size={isReply ? 11 : 13} />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-dashed border-border-subtle bg-surface px-3.5 py-2.5">
            <p className="text-xs font-medium text-text-placeholder">
              This comment was deleted
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-placeholder/70">
              The original comment is gone, but its replies are kept in this
              thread.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="group/comment flex gap-3">
        <div
          style={{ backgroundColor: memberColor(comment.author.id) }}
          className={`mt-1 flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white ${
            isReply ? 'h-6 w-6 text-[9px]' : 'h-7 w-7 text-[10px]'
          }`}
        >
          {comment.author.initials}
        </div>
        <div className={`min-w-0 flex-1 rounded-lg border border-border bg-surface-raised ${isReply ? 'px-3.5 py-2.5' : 'px-4 py-3'}`}>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text">{comment.author.name}</span>
            <span className="text-xs text-text-placeholder">{formatDateTime(comment.createdAt)}</span>
            {comment.editedAt && (
              <span
                className="text-xs italic text-text-placeholder"
                title={`Edited ${formatDateTime(comment.editedAt)}`}
              >
                · edited {formatDateTime(comment.editedAt)}
              </span>
            )}
          </div>
          {isEditingThis ? (
            // Inline edit form — swaps the body in place (mirrors the reply
            // composer). Cmd+Enter submits.
            <div>
              <div className="overflow-visible rounded-lg border border-border bg-surface-raised transition-colors focus-within:border-primary">
                <MentionTextarea
                  value={editText}
                  onChange={setEditText}
                  onSubmit={() => submitEdit((comment.attachments?.length ?? 0) > 0)}
                  onMentionsChange={setEditMentions}
                  members={members}
                  rows={2}
                  disabled={isEditingComment || editAttachments.isUploading}
                  autoFocus
                  placeholder="Edit your comment…"
                  className="w-full resize-none bg-transparent px-3 py-2 text-sm text-text outline-none placeholder:text-text-placeholder leading-relaxed"
                  onPaste={editAttachments.handlePaste}
                />
                <AttachmentList
                  pending={editAttachments.pending}
                  limits={COMMENT_ATTACHMENT_LIMITS}
                  onAdd={editAttachments.addFiles}
                  onRemove={editAttachments.remove}
                  disabled={isEditingComment || editAttachments.isUploading || deletingAttachmentId !== null}
                  compact
                  className="border-t border-border-subtle px-3 py-2"
                />
              </div>
              {/* Existing attachments — removable while editing (delete icon
                  only exists in edit mode; the read-only display below has
                  none). */}
              {comment.attachments && comment.attachments.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-placeholder">
                    Existing
                  </p>
                  <PersistedAttachmentList
                    attachments={comment.attachments}
                    variant="inline"
                    onDelete={handleDeleteCommentAttachment}
                    deletingId={deletingAttachmentId}
                  />
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => submitEdit((comment.attachments?.length ?? 0) > 0)}
                  disabled={isEditingComment || editAttachments.isUploading || editBlocked || (!editText.trim() && editAttachments.pending.length === 0 && (comment.attachments?.length ?? 0) === 0)}
                  className="flex items-center gap-1.5 rounded bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  <Check size={11} />
                  {editAttachments.isUploading ? 'Uploading…' : isEditingComment ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded border border-border px-3 py-1 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <MarkdownRenderer content={comment.content} memberNames={memberNames} />

              {/* Persisted comment attachments — preview/download via presigned URL */}
              {comment.attachments && comment.attachments.length > 0 && (
                <div className="mt-2.5">
                  <PersistedAttachmentList attachments={comment.attachments} variant="inline" />
                </div>
              )}

              {/* Action row — Reply + Edit (author-only) + Delete-with-confirm. */}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
                {!deletedIds.has(replyContext.rootId) && (
                  <button
                    type="button"
                    onClick={() =>
                      isReplyingToThis
                        ? cancelReply()
                        : startReply(replyContext.rootId, isReply ? replyContext.mention : undefined)
                    }
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-primary"
                  >
                    <CornerDownRight size={11} />
                    {isReplyingToThis ? 'Cancel reply' : 'Reply'}
                  </button>
                )}

                {isAuthor && (
                  <button
                    type="button"
                    onClick={() => startEdit(comment.id, comment.content)}
                    className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-primary"
                    title="Edit comment"
                  >
                    <Pencil size={11} />
                    Edit
                  </button>
                )}

                {canDelete && (
                  <button
                    onClick={() => handleDeleteComment(comment.id, comment.author.name)}
                    className={`${isAuthor ? '' : 'ml-auto'} flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-danger/10 hover:text-danger`}
                    title="Delete comment"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* New-comment composer — sits at the TOP so the caller never scrolls
          past existing comments to add one. */}
      <div className="mb-5 flex gap-3">
        <div
          style={{ backgroundColor: memberColor(currentUserId ?? '') }}
          className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        >
          {userInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="overflow-visible rounded-lg border border-border bg-surface-raised transition-colors focus-within:border-primary">
            <MentionTextarea
              value={commentText}
              onChange={setCommentText}
              onSubmit={submitComment}
              onMentionsChange={setCommentMentions}
              members={members}
              rows={3}
              autoResize
              maxRows={10}
              disabled={isCommenting || commentAttachments.isUploading}
              placeholder="Add a comment… type @ to mention someone (Cmd+Enter to post)"
              className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-placeholder leading-relaxed"
              onPaste={commentAttachments.handlePaste}
            />
            <AttachmentList
              pending={commentAttachments.pending}
              limits={COMMENT_ATTACHMENT_LIMITS}
              onAdd={commentAttachments.addFiles}
              onRemove={commentAttachments.remove}
              disabled={isCommenting || commentAttachments.isUploading}
              compact
              className="border-t border-border-subtle px-3 py-2"
            />
          </div>
          {(commentText.trim() || commentAttachments.pending.length > 0) && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={submitComment}
                disabled={isCommenting || commentAttachments.isUploading || commentBlocked}
                className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                <Send size={11} />
                {commentAttachments.isUploading ? 'Uploading…' : isCommenting ? 'Posting…' : 'Post comment'}
              </button>
              <button
                onClick={() => setCommentText('')}
                className="rounded border border-border px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Threaded list */}
      {comments.length > 0 && (
        <div className="flex flex-col gap-6">
          {visibleRoots.map(root => {
            const replies = repliesByRoot.get(root.id) ?? [];
            const isReplying = replyingToId === root.id;
            const repliesExpanded = expandedReplyRoots.has(root.id);
            const hiddenReplyCount = !repliesExpanded
              ? Math.max(0, replies.length - REPLY_INITIAL_VISIBLE)
              : 0;
            const visibleReplies = hiddenReplyCount > 0
              ? replies.slice(0, REPLY_INITIAL_VISIBLE)
              : replies;
            return (
              <div key={root.id} className="flex flex-col gap-3">
                {renderCommentBody(root, false, { rootId: root.id, mention: { id: root.author.id, name: root.author.name } })}

                {/* Replies — indented under the root with a left rail. */}
                {replies.length > 0 && (
                  <div className="ml-5 flex flex-col gap-3 border-l-2 border-border-subtle pl-4">
                    {visibleReplies.map(reply => (
                      <div key={reply.id}>
                        {renderCommentBody(reply, true, { rootId: root.id, mention: { id: reply.author.id, name: reply.author.name } })}
                      </div>
                    ))}

                    {(hiddenReplyCount > 0 || repliesExpanded) && replies.length > REPLY_INITIAL_VISIBLE && (
                      <button
                        type="button"
                        onClick={() => toggleRepliesExpanded(root.id)}
                        className="self-start inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-text-placeholder transition-colors hover:bg-surface hover:text-primary"
                      >
                        <CornerDownRight size={11} />
                        {repliesExpanded
                          ? `Hide ${replies.length - REPLY_INITIAL_VISIBLE} ${replies.length - REPLY_INITIAL_VISIBLE === 1 ? 'reply' : 'replies'}`
                          : `Show ${hiddenReplyCount} more ${hiddenReplyCount === 1 ? 'reply' : 'replies'}`}
                      </button>
                    )}
                  </div>
                )}

                {/* Inline reply composer — appears under this root when Reply
                    is clicked on the root or any of its replies. */}
                {isReplying && (
                  <div className="ml-5 flex gap-3 border-l-2 border-primary/40 pl-4">
                    <div
                      style={{ backgroundColor: memberColor(currentUserId ?? '') }}
                      className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    >
                      {userInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="overflow-visible rounded-lg border border-border bg-surface-raised transition-colors focus-within:border-primary">
                        <MentionTextarea
                          value={replyText}
                          onChange={setReplyText}
                          onSubmit={submitReply}
                          onMentionsChange={setReplyMentions}
                          initialMentions={replyInit}
                          members={members}
                          rows={2}
                          disabled={isCommenting || replyAttachments.isUploading}
                          autoFocus
                          placeholder="Reply in this thread…"
                          className="w-full resize-none bg-transparent px-3 py-2 text-sm text-text outline-none placeholder:text-text-placeholder leading-relaxed"
                          onPaste={replyAttachments.handlePaste}
                        />
                        <AttachmentList
                          pending={replyAttachments.pending}
                          limits={COMMENT_ATTACHMENT_LIMITS}
                          onAdd={replyAttachments.addFiles}
                          onRemove={replyAttachments.remove}
                          disabled={isCommenting || replyAttachments.isUploading}
                          compact
                          className="border-t border-border-subtle px-3 py-2"
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={submitReply}
                          disabled={isCommenting || replyAttachments.isUploading || replyBlocked || (!replyText.trim() && replyAttachments.pending.length === 0)}
                          className="flex items-center gap-1.5 rounded bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                        >
                          <Send size={11} />
                          {replyAttachments.isUploading ? 'Uploading…' : isCommenting ? 'Posting…' : 'Post reply'}
                        </button>
                        <button
                          onClick={cancelReply}
                          className="rounded border border-border px-3 py-1 text-xs font-medium text-text-subtle transition-colors hover:bg-surface"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Overflow affordance. Full page expands inline; panel links out. */}
          {hiddenRootCount > 0 && variant === 'full' && (
            <button
              type="button"
              onClick={() => setShowAllComments(true)}
              className="self-center inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-primary"
            >
              <ChevronDown size={12} />
              Show {hiddenRootCount} earlier {hiddenRootCount === 1 ? 'comment' : 'comments'}
            </button>
          )}
          {hiddenRootCount > 0 && variant === 'panel' && fullPageHref && (
            <Link
              href={fullPageHref}
              className="group/cta flex items-center justify-center gap-1.5 self-center rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-primary"
            >
              View all {roots.length} comments on full page
              <ArrowUpRight size={12} className="transition-transform group-hover/cta:translate-x-0.5" />
            </Link>
          )}
        </div>
      )}
    </>
  );
}
