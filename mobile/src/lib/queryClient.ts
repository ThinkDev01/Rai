import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Query-key factory. Scopes every key by the active org id (mobile equivalent
 * of the web's `['org', orgSlug, ...]` convention). Pass the current org id.
 */
export const qk = {
  projects: (orgId: string | null) => ['org', orgId, 'projects'] as const,
  project: (orgId: string | null, id: string) => ['org', orgId, 'projects', id] as const,
  ticket: (orgId: string | null, projectId: string, key: string) =>
    ['org', orgId, 'projects', projectId, 'tickets', key] as const,
  myWork: (orgId: string | null) => ['org', orgId, 'my-work'] as const,
  team: (orgId: string | null) => ['org', orgId, 'team'] as const,
  pendingInvites: (orgId: string | null) => ['org', orgId, 'pending-invites'] as const,
  search: (orgId: string | null, q: string) => ['org', orgId, 'search', q] as const,
  userTickets: (orgId: string | null, userId: string) =>
    ['org', orgId, 'users', userId, 'tickets'] as const,
  /** Prefix covering all report queries (burndown / sprint-report / velocity). */
  reports: (orgId: string | null) => ['org', orgId, 'reports'] as const,
  burndown: (orgId: string | null, projectId: string, sprintId: string) =>
    ['org', orgId, 'reports', 'burndown', projectId, sprintId] as const,
  sprintReport: (orgId: string | null, projectId: string, sprintId: string) =>
    ['org', orgId, 'reports', 'sprint-report', projectId, sprintId] as const,
  velocity: (orgId: string | null, projectId: string) =>
    ['org', orgId, 'reports', 'velocity', projectId] as const,
  domainPeers: (email: string | null) => ['domain-peers', email] as const,
  invoices: (orgId: string | null) => ['org', orgId, 'billing-invoices'] as const,
};
