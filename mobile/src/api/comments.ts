import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { Comment, AddCommentPayload, UpdateCommentPayload } from '@/types/api.types';

const useOrgId = () => useAuthStore(s => s.currentOrgId);

export function useAddComment(projectId: string, ticketId: string, ticketKey: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddCommentPayload) =>
      unwrap<Comment>(api.post(`/projects/${projectId}/tickets/${ticketId}/comments`, payload)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ticket(orgId, projectId, ticketKey) });
      qc.invalidateQueries({ queryKey: qk.project(orgId, projectId) });
    },
    onError: e => toast.error(extractApiError(e, 'Failed to add comment')),
  });
}

export function useEditComment(projectId: string, ticketId: string, ticketKey: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, payload }: { commentId: string; payload: UpdateCommentPayload }) =>
      unwrap<Comment>(
        api.patch(`/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`, payload),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ticket(orgId, projectId, ticketKey) });
    },
    onError: e => toast.error(extractApiError(e, 'Failed to edit comment')),
  });
}

export function useDeleteComment(projectId: string, ticketId: string, ticketKey: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      unwrap<unknown>(
        api.delete(`/projects/${projectId}/tickets/${ticketId}/comments/${commentId}`),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ticket(orgId, projectId, ticketKey) });
      qc.invalidateQueries({ queryKey: qk.project(orgId, projectId) });
      toast.success('Comment deleted');
    },
    onError: e => toast.error(extractApiError(e, 'Failed to delete comment')),
  });
}
