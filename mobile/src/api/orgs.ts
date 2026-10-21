import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { changePassword as cognitoChangePassword, refreshTokens, getIdToken } from '@/lib/cognito';
import { ENV } from '@/config/env';
import type { Membership, OrgRole } from '@/types/auth.types';

const useOrgId = () => useAuthStore(s => s.currentOrgId);

export interface DomainPeerOrg {
  id: string;
  name: string;
  discoverable: boolean;
}

export function useDomainPeers(email: string | null) {
  return useQuery({
    queryKey: qk.domainPeers(email),
    enabled: !!email,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      // Backend wraps the list: data = { orgs: [...] }. Return the array.
      const data = await unwrap<{ orgs: DomainPeerOrg[] }>(api.get('/orgs/discover-by-domain'));
      return data.orgs ?? [];
    },
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  const hydrate = useAuthStore(s => s.hydrate);
  const setCurrentOrg = useAuthStore(s => s.setCurrentOrg);
  return useMutation({
    // Backend returns { org, mustRefreshToken }.
    mutationFn: (payload: { name: string; slug: string }) =>
      unwrap<{ org: { id: string; slug: string }; mustRefreshToken: boolean }>(api.post('/orgs', payload)),
    onSuccess: async data => {
      // Cognito current_org_id was set server-side — refresh the token so the
      // next /me reflects it, then re-hydrate and switch to the new org.
      try {
        if (data.mustRefreshToken) await refreshTokens();
      } catch {
        /* best-effort */
      }
      await hydrate();
      setCurrentOrg(data.org.id);
      qc.clear();
      toast.success('Organization created');
    },
    onError: e => toast.error(extractApiError(e, 'Could not create organization')),
  });
}

export function useUpdateOrgName(orgId: string) {
  const hydrate = useAuthStore(s => s.hydrate);
  return useMutation({
    mutationFn: (name: string) => unwrap<unknown>(api.patch(`/orgs/${orgId}`, { name })),
    onSuccess: async () => {
      await hydrate();
      toast.success('Organization updated');
    },
    onError: e => toast.error(extractApiError(e, 'Could not update organization')),
  });
}

export function usePatchProfileName() {
  const updateName = useAuthStore(s => s.updateName);
  return useMutation({
    mutationFn: (name: string) => unwrap<unknown>(api.patch('/me', { name })),
    onSuccess: (_d, name) => {
      updateName(name);
      toast.success('Profile updated');
    },
    onError: e => toast.error(extractApiError(e, 'Could not update profile')),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      cognitoChangePassword(current, next),
    onSuccess: () => toast.success('Password changed'),
    onError: e => toast.error(extractApiError(e, 'Could not change password')),
  });
}

export function useToggleOrgDiscoverable() {
  const qc = useQueryClient();
  const refresh = useAuthStore(s => s.refreshMemberships);
  return useMutation({
    mutationFn: ({ orgId, discoverable }: { orgId: string; discoverable: boolean }) =>
      unwrap<unknown>(api.patch(`/orgs/${orgId}`, { discoverable })),
    onSuccess: (_d, { discoverable }) => {
      qc.invalidateQueries({ queryKey: ['domain-peers'] });
      refresh();
      toast.success(discoverable ? 'Visible in your email domain' : 'Hidden from your email domain');
    },
    onError: e => toast.error(extractApiError(e, 'Could not update setting')),
  });
}

export function useTransferOwnership() {
  const qc = useQueryClient();
  const hydrate = useAuthStore(s => s.hydrate);
  return useMutation({
    mutationFn: ({ orgId, recipientId, otpCode }: { orgId: string; recipientId: string; otpCode: string }) =>
      unwrap<unknown>(api.post(`/orgs/${orgId}/transfer-ownership`, { recipientId, otpCode })),
    onSuccess: async () => {
      await hydrate();
      qc.clear();
      toast.success('Ownership transferred');
    },
    onError: e => toast.error(extractApiError(e, 'Could not transfer ownership')),
  });
}

export function useLeaveOrg() {
  const qc = useQueryClient();
  const hydrate = useAuthStore(s => s.hydrate);
  return useMutation({
    mutationFn: (orgId: string) => unwrap<unknown>(api.post(`/orgs/${orgId}/leave`, {})),
    onSuccess: async () => {
      await hydrate();
      qc.clear();
    },
    onError: e => toast.error(extractApiError(e, 'Could not leave organization')),
  });
}

export function useDeleteOrg() {
  const qc = useQueryClient();
  const hydrate = useAuthStore(s => s.hydrate);
  return useMutation({
    mutationFn: ({ orgId, otpCode }: { orgId: string; otpCode: string }) =>
      unwrap<unknown>(api.delete(`/orgs/${orgId}`, { data: { otpCode } })),
    onSuccess: async () => {
      await hydrate();
      qc.clear();
      toast.success('Organization deleted');
    },
    onError: e => toast.error(extractApiError(e, 'Could not delete organization')),
  });
}

const EXPORT_MIME: Record<'json' | 'xlsx', string> = {
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function useExportOrg(orgId: string) {
  return useMutation({
    mutationFn: async (format: 'json' | 'xlsx') => {
      const { Platform } = await import('react-native');
      const RNBlobUtil = (await import('react-native-blob-util')).default;
      const token = await getIdToken();
      const url = `${ENV.API_URL}/orgs/${orgId}/export?format=${format}`;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `rai-export-${stamp}.${format}`;

      if (Platform.OS === 'android') {
        // Register with Android DownloadManager — file appears in Downloads
        // folder and Chrome's download history, just like a browser download.
        const res = await RNBlobUtil.config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: filename,
            description: 'Rai data export',
            mime: EXPORT_MIME[format],
            path: `${RNBlobUtil.fs.dirs.DownloadDir}/${filename}`,
          },
        }).fetch('GET', url, headers);

        if (res.info().status >= 400) {
          let msg = `Export failed (${res.info().status})`;
          try { const j = JSON.parse(await res.text()); msg = j.error ?? msg; } catch { /* noop */ }
          throw new Error(msg);
        }
        return { path: null, platform: 'android' as const };
      }

      // iOS — save to Documents then present the system share/save sheet.
      const path = `${RNBlobUtil.fs.dirs.DocumentDir}/${filename}`;
      const res = await RNBlobUtil.config({ path, overwrite: true })
        .fetch('GET', url, headers);

      if (res.info().status >= 400) {
        await RNBlobUtil.fs.unlink(path).catch(() => {});
        let msg = `Export failed (${res.info().status})`;
        try { const j = JSON.parse(await res.text()); msg = j.error ?? msg; } catch { /* noop */ }
        throw new Error(msg);
      }
      return { path, platform: 'ios' as const };
    },
    onSuccess: async ({ path, platform }) => {
      if (platform === 'ios' && path) {
        const RNBlobUtil = (await import('react-native-blob-util')).default;
        await RNBlobUtil.ios.presentOptionsMenu(path);
      }
      // Android: DownloadManager shows its own notification — nothing extra needed.
    },
    onError: e => toast.error(extractApiError(e, 'Could not export data')),
  });
}

export interface DeletedOrg {
  id: string;
  name: string;
  slug: string;
  deletedAt: string;
  restoreDeadline: string;
  subscriptionDaysLeft: number | null;
}

export function useDeletedOrgs() {
  return useQuery({
    queryKey: ['orgs', 'deleted'],
    staleTime: 60_000,
    queryFn: () => unwrap<DeletedOrg[]>(api.get('/orgs/deleted')),
  });
}

export function useRestoreOrg() {
  const qc = useQueryClient();
  const hydrate = useAuthStore(s => s.hydrate);
  return useMutation({
    mutationFn: (orgId: string) => unwrap<unknown>(api.post(`/orgs/${orgId}/restore`, {})),
    onSuccess: async () => {
      await hydrate();
      qc.clear();
      qc.invalidateQueries({ queryKey: ['orgs', 'deleted'] });
      toast.success('Organization restored');
    },
    onError: e => toast.error(extractApiError(e, 'Could not restore organization')),
  });
}

/** Switch active org (client-side; backend switch-org optional for token claim). */
export function useSwitchOrg() {
  const setCurrentOrg = useAuthStore(s => s.setCurrentOrg);
  const qc = useQueryClient();
  return (membership: Membership) => {
    setCurrentOrg(membership.org_id);
    qc.clear();
  };
}

export type { OrgRole };
