import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import type { Sprint, CreateSprintPayload, UpdateSprintPayload } from '@/types/api.types';

const useOrgId = () => useAuthStore(s => s.currentOrgId);

function useSprintInvalidate(projectId: string) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.project(orgId, projectId) });
    qc.invalidateQueries({ queryKey: qk.projects(orgId) });
    qc.invalidateQueries({ queryKey: qk.myWork(orgId) });
    qc.invalidateQueries({ queryKey: qk.reports(orgId) });
  };
}

export function useCreateSprint(projectId: string) {
  const invalidate = useSprintInvalidate(projectId);
  return useMutation({
    mutationFn: (payload: CreateSprintPayload) =>
      unwrap<Sprint>(api.post(`/projects/${projectId}/sprints`, payload)),
    onSuccess: s => {
      invalidate();
      toast.success(`Sprint “${s.name}” created`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not create sprint')),
  });
}

export function useUpdateSprint(projectId: string, sprintId: string) {
  const invalidate = useSprintInvalidate(projectId);
  return useMutation({
    mutationFn: (payload: UpdateSprintPayload) =>
      unwrap<Sprint>(api.patch(`/projects/${projectId}/sprints/${sprintId}`, payload)),
    onSuccess: () => {
      invalidate();
      toast.success('Sprint updated');
    },
    onError: e => toast.error(extractApiError(e, 'Could not update sprint')),
  });
}

export function useStartSprint(projectId: string, sprintId: string) {
  const invalidate = useSprintInvalidate(projectId);
  return useMutation({
    mutationFn: () =>
      unwrap<Sprint>(api.patch(`/projects/${projectId}/sprints/${sprintId}`, { status: 'active' })),
    onSuccess: s => {
      invalidate();
      toast.success(`Sprint “${s.name}” started`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not start sprint')),
  });
}

export function useCompleteSprint(projectId: string, sprintId: string) {
  const invalidate = useSprintInvalidate(projectId);
  return useMutation({
    mutationFn: () =>
      unwrap<Sprint>(
        api.patch(`/projects/${projectId}/sprints/${sprintId}`, { status: 'completed' }),
      ),
    onSuccess: s => {
      invalidate();
      toast.success(`Sprint “${s.name}” completed`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not complete sprint')),
  });
}

export function useArchiveSprint(projectId: string, sprintId: string) {
  const invalidate = useSprintInvalidate(projectId);
  return useMutation({
    mutationFn: (archived: boolean) =>
      unwrap<Sprint>(api.patch(`/projects/${projectId}/sprints/${sprintId}`, { archived })),
    onSuccess: (s, archived) => {
      invalidate();
      toast.success(`Sprint “${s.name}” ${archived ? 'archived' : 'unarchived'}`);
    },
    onError: e => toast.error(extractApiError(e, 'Could not archive sprint')),
  });
}

export function useDeleteSprint(projectId: string, sprintId: string) {
  const invalidate = useSprintInvalidate(projectId);
  return useMutation({
    mutationFn: () => unwrap<unknown>(api.delete(`/projects/${projectId}/sprints/${sprintId}`)),
    onSuccess: () => {
      invalidate();
      toast.success('Sprint deleted');
    },
    onError: e => toast.error(extractApiError(e, 'Could not delete sprint')),
  });
}
