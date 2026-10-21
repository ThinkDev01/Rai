import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { projectKeys } from '@/hooks/useProjects';
import type { ApiResponse, Comment, AttachmentInput } from '@/types/api.types';

// Orgid-prefixed invalidation keys per standards.md §3.
type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';
const ticketKey = (orgId: OrgIdArg, projectId: string, key: string) =>
  ['org', orgSlug(orgId), 'projects', projectId, 'tickets', key] as const;

function commentError(err: unknown, fallback: string): string {
  return axios.isAxiosError(err)
    ? (err.response?.data?.error ?? fallback)
    : fallback;
}

/** Payload for the add-comment mutation. `parentCommentId` is optional —
 *  pass it when the user clicks Reply on an existing root comment; omit
 *  for top-level comments. The backend rejects replies of replies, so
 *  callers should always pass the ROOT comment's id when threading deeper
 *  visually (e.g. a "reply to a reply" UI affordance still posts against
 *  the root). */
export interface AddCommentPayload {
  content: string;
  parentCommentId?: string;
  /** User ids explicitly picked from the @-dropdown. Notifications route on
   *  these (id-bound); a typed-but-unselected `@name` notifies nobody. */
  mentions?: string[];
  /** Files already PUT to S3 (presigned flow); linked to the comment in the
   *  same request. Optional — omitted when none were picked. */
  attachments?: AttachmentInput[];
}

// ticketKey is used to invalidate the single-ticket query (which carries real comments)
export function useAddComment(projectId: string, ticketId: string, ticketKeyArg: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (payload: AddCommentPayload) =>
      api.post<ApiResponse<Comment>>(
        `/projects/${projectId}/tickets/${ticketId}/comments`,
        payload,
      ).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKey(orgId, projectId, ticketKeyArg) });
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard summaries don't carry comment count yet, but keeping list
      // invalidation centralized here makes future fields painless.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
    },
    onError: (err) => toast.error(commentError(err, 'Failed to add comment')),
  });
}

/** Payload for the edit-comment mutation. Content-only — threading and
 *  authorship are immutable. Author-only is enforced by the backend. */
export interface EditCommentPayload {
  commentId: string;
  content: string;
  /** Same contract as AddCommentPayload.mentions. A selected id whose name
   *  wasn't already in the pre-edit body is treated as a new mention. */
  mentions?: string[];
  /** Files already PUT to S3; replaces the comment's attachment set on save.
   *  Optional — omit to leave attachments untouched. */
  attachments?: AttachmentInput[];
}

export function useEditComment(projectId: string, ticketId: string, ticketKeyArg: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: ({ commentId, content, mentions, attachments }: EditCommentPayload) =>
      api.patch<ApiResponse<Comment>>(
        `/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`,
        { content, mentions, attachments },
      ).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKey(orgId, projectId, ticketKeyArg) });
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success('Comment updated');
    },
    onError: (err) => toast.error(commentError(err, 'Failed to update comment')),
  });
}

export function useDeleteComment(projectId: string, ticketId: string, ticketKeyArg: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKey(orgId, projectId, ticketKeyArg) });
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard summaries don't carry comment count yet, but keeping list
      // invalidation centralized here makes future fields painless.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success('Comment deleted');
    },
    onError: (err) => toast.error(commentError(err, 'Failed to delete comment')),
  });
}
