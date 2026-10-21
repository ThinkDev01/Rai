import axios from 'axios';
import { getIdToken } from '@/lib/cognito';
import { ENV } from '@/config/env';

/**
 * Axios instance — ported from web lib/api.ts.
 *
 * Web derived X-Org-Id from the URL slug. On mobile there's no URL, so the
 * active org id is held in module scope and set by the org-context layer
 * (setActiveOrgId). Backend prefers this header, falls back to the JWT claim.
 *
 * 401 handling: web hard-redirected to /auth/login. On mobile we surface a
 * global "session expired" signal that the navigation root listens to (set via
 * onUnauthorized) and clears auth → routes to Login.
 */

let activeOrgId: string | null = null;
export function setActiveOrgId(orgId: string | null) {
  activeOrgId = orgId;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

const api = axios.create({
  baseURL: ENV.API_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async config => {
  const token = await getIdToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  if (activeOrgId) {
    config.headers.set('X-Org-Id', activeOrgId);
  }
  return config;
});

let handling401 = false;
let lastSubscriptionToastAt = 0;

api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401 && !handling401) {
      handling401 = true;
      try {
        onUnauthorized?.();
      } finally {
        setTimeout(() => { handling401 = false; }, 1000);
      }
    }

    // Write-gate: subscription expired. Throttle toasts to 3s to avoid stacking.
    if (
      error.response?.status === 403 &&
      error.response?.data?.error === 'SUBSCRIPTION_EXPIRED'
    ) {
      const now = Date.now();
      if (now - lastSubscriptionToastAt > 3000) {
        lastSubscriptionToastAt = now;
        // Lazy import to avoid circular dependency (toast → api → toast).
        const { toast } = await import('@/lib/toast');
        toast.error("Can't save — your subscription has ended. Renew to continue editing.");
      }
      // Refresh memberships so the drawer chip and banner update.
      const { useAuthStore } = await import('@/store/authStore');
      void useAuthStore.getState().refreshMemberships();
    }

    return Promise.reject(error);
  },
);

/** Unwrap the standard { success, data, error } envelope, throwing on failure. */
export async function unwrap<T>(p: Promise<{ data: { success: boolean; data: T; error?: string } }>): Promise<T> {
  const res = await p;
  if (!res.data.success) {
    throw new Error(res.data.error || 'Request failed');
  }
  return res.data.data;
}

export default api;
