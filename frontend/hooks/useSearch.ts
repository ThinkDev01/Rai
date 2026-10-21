import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse, SearchResult } from '@/types/api.types';

// Search is tenant-scoped (backend filters by req.context.org_id) - key
// carries the active orgId per standards.md §3 so an org switch can't hand
// back the previous org's hits.
type OrgIdArg = string | null | undefined;
const orgSlug = (orgId: OrgIdArg) => orgId ?? 'none';

export function useSearch(q: string) {
  const orgId = useAuthStore(s => s.user?.currentOrgId ?? null);
  return useQuery({
    queryKey: ['org', orgSlug(orgId), 'search', q],
    queryFn: () =>
      api.get<ApiResponse<SearchResult[]>>('/search', { params: { q } }).then(r => r.data.data),
    enabled: q.trim().length >= 2 && Boolean(orgId),
    staleTime: 0,
    placeholderData: [],
  });
}
