import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse, BurndownData, SprintReportData, VelocityPoint } from '@/types/api.types';

// Reports are tenant-scoped - keys carry the active orgId per standards.md §3.
type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';

export function useBurndown(projectId: string, sprintId: string | undefined) {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: ['org', orgSlug(orgId), 'reports', 'burndown', projectId, sprintId],
    queryFn: () =>
      api.get<ApiResponse<BurndownData>>(`/projects/${projectId}/reports/burndown?sprintId=${sprintId}`)
        .then(r => r.data.data),
    enabled: !!projectId && !!sprintId && Boolean(orgId),
  });
}

export function useSprintReport(projectId: string, sprintId: string | undefined) {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: ['org', orgSlug(orgId), 'reports', 'sprint-report', projectId, sprintId],
    queryFn: () =>
      api.get<ApiResponse<SprintReportData>>(`/projects/${projectId}/reports/sprint-report?sprintId=${sprintId}`)
        .then(r => r.data.data),
    enabled: !!projectId && !!sprintId && Boolean(orgId),
  });
}

export function useVelocity(projectId: string) {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: ['org', orgSlug(orgId), 'reports', 'velocity', projectId],
    queryFn: () =>
      api.get<ApiResponse<VelocityPoint[]>>(`/projects/${projectId}/reports/velocity`)
        .then(r => r.data.data),
    enabled: !!projectId && Boolean(orgId),
  });
}
