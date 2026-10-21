import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { projectKeys } from '@/hooks/useProjects';
import type { ApiResponse, Sprint, CreateSprintPayload, UpdateSprintPayload } from '@/types/api.types';

// Per standards.md §3 - invalidations also carry the orgId prefix so the
// active org's cache is the only one touched. `my-work` is org-scoped too.
type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';

function sprintError(err: unknown, fallback: string): string {
  return axios.isAxiosError(err)
    ? (err.response?.data?.error ?? fallback)
    : fallback;
}

export function useCreateSprint(projectId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (payload: CreateSprintPayload) =>
      api.post<ApiResponse<Sprint>>(`/projects/${projectId}/sprints`, payload).then(r => r.data.data),
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success(`Sprint "${sprint.name}" created`);
    },
    onError: (err) => toast.error(sprintError(err, 'Failed to create sprint')),
  });
}

export function useUpdateSprint(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: (payload: UpdateSprintPayload) =>
      api.patch<ApiResponse<Sprint>>(`/projects/${projectId}/sprints/${sprintId}`, payload).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success('Sprint updated');
    },
    onError: (err) => toast.error(sprintError(err, 'Failed to update sprint')),
  });
}

export function useStartSprint(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: () =>
      api.patch<ApiResponse<Sprint>>(`/projects/${projectId}/sprints/${sprintId}`, { status: 'active' }).then(r => r.data.data),
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard summaries reflect active-sprint-name; keep them current.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success(`${sprint.name} started`);
    },
    onError: (err) => toast.error(sprintError(err, 'Failed to start sprint')),
  });
}

export function useCompleteSprint(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: () =>
      api.patch<ApiResponse<Sprint>>(`/projects/${projectId}/sprints/${sprintId}`, { status: 'completed' }).then(r => r.data.data),
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard summaries reflect active-sprint-name; keep them current.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success(`${sprint.name} completed`);
    },
    onError: (err) => toast.error(sprintError(err, 'Failed to complete sprint')),
  });
}

export function useDeleteSprint(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/sprints/${sprintId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      // Dashboard summaries reflect active-sprint-name; keep them current.
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      qc.invalidateQueries({ queryKey: ['org', orgSlug(orgId), 'my-work'] });
      toast.success('Sprint deleted');
    },
    onError: (err) => toast.error(sprintError(err, 'Failed to delete sprint')),
  });
}

// Archive / unarchive a sprint. Per rbac.md §Sprint actions:
//   - Archive sprint (manual)  → owner / admin / PM-in / PM-on-public
//   - Unarchive sprint          → same set
// Backend rejects archiving an active sprint (must complete first); unarchive
// is unrestricted.
export function useArchiveSprint(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: () =>
      api.patch<ApiResponse<Sprint>>(`/projects/${projectId}/sprints/${sprintId}`, { archived: true }).then(r => r.data.data),
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success(`${sprint.name} archived`);
    },
    onError: (err) => toast.error(sprintError(err, 'Failed to archive sprint')),
  });
}

export function useUnarchiveSprint(projectId: string, sprintId: string) {
  const qc = useQueryClient();
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useMutation({
    mutationFn: () =>
      api.patch<ApiResponse<Sprint>>(`/projects/${projectId}/sprints/${sprintId}`, { archived: false }).then(r => r.data.data),
    onSuccess: (sprint) => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(orgId, projectId) });
      qc.invalidateQueries({ queryKey: projectKeys.all(orgId) });
      toast.success(`${sprint.name} unarchived`);
    },
    onError: (err) => toast.error(sprintError(err, 'Failed to unarchive sprint')),
  });
}
