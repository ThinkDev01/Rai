import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { ApiResponse } from '@/types/api.types';

export interface DomainPeerOrg {
  id:           string;
  name:         string;
  discoverable: boolean;
}

interface DiscoverResponse {
  orgs: DomainPeerOrg[];
}

/**
 * Orgs whose owners share the signed-in user's email domain. Used for the
 * "an org with your email domain already exists" soft warning at the
 * /welcome create-org form + a dashboard banner for admins/owners.
 *
 * Backend skips public-email domains (gmail/outlook/etc.) and returns []
 * for those - so the hook may return an empty list even when the user
 * theoretically has many "peers" sharing their consumer email host.
 *
 * Returns only `{ id, name }`. Member count, owner email, slug are NOT
 * exposed to avoid leaking org details across companies.
 *
 * `emailOverride` is an optional fallback for callers that don't have the
 * zustand auth store hydrated yet (notably /welcome, which uses its own raw
 * useQuery(['me']) and never calls authStore.hydrate). Pass the email
 * directly from your own /me response in that case.
 */
// Owner-only: toggle the `discoverable` flag on an org. When OFF, the org
// stops appearing in other users' domain-peer banners + Settings peer list.
// Owner still sees + can re-enable from their own Settings.
//
// On success we sync two state surfaces from the AUTHORITATIVE source (DB),
// not from local guesses:
//   1. ['domain-peers']        - invalidated so the peer list response refetches
//   2. zustand `memberships`   - refreshMemberships() refetches /me silently
//      (without flipping isHydrating) so the Current-org row reads the real
//      DB value, not an optimistic patch. Silent = no transient shell.
export function useToggleOrgDiscoverable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, discoverable }: { orgId: string; discoverable: boolean }) => {
      const res = await api.patch<ApiResponse<unknown>>(`/orgs/${orgId}`, { discoverable });
      if (!res.data.success) throw new Error(res.data.error || 'Failed to update discoverability');
    },
    onSuccess: async (_data, { discoverable }) => {
      qc.invalidateQueries({ queryKey: ['domain-peers'] });
      await useAuthStore.getState().refreshMemberships();
      toast.success(discoverable
        ? 'Visible to people in your email domain'
        : 'Hidden from people in your email domain'
      );
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? 'Failed to update discoverability')
        : err instanceof Error ? err.message : 'Failed to update discoverability';
      toast.error(msg);
    },
  });
}

export function useDomainPeers(emailOverride?: string | null) {
  // Keyed by the caller's email so different users in the same browser see
  // distinct lists, and a switch of sessions invalidates the cache. Override
  // wins so /welcome's pre-hydrate render gets a working key.
  const storeEmail = useAuthStore(s => s.user?.email ?? null);
  const email      = emailOverride ?? storeEmail;

  return useQuery({
    queryKey: ['domain-peers', email],
    queryFn: async () => {
      const res = await api.get<ApiResponse<DiscoverResponse>>('/orgs/discover-by-domain');
      if (!res.data.success) return [];
      return res.data.data.orgs;
    },
    enabled:  Boolean(email),
    staleTime: 5 * 60 * 1000,  // 5 min - this changes rarely; avoid hammering on every render
    retry:    false,
  });
}
