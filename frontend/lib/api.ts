import axios from 'axios';
import { toast } from 'sonner';
import { getIdToken, signOut } from '@/lib/cognito-client';
import { useAuthStore } from '@/store/auth.store';
import { ENV, logEnvSummary } from '@/lib/env';
import { BILLING } from '@/content/billing';
import { logger } from '@/lib/logger';

// One masked snapshot of the baked NEXT_PUBLIC_* config (client only).
logEnvSummary();

// Redact secrets before a request body ever reaches a log line. Golden rule:
// never log passwords or tokens. Shallow copy + mask known-sensitive keys
// (case-insensitive); deeper fields are left as-is since our bodies are flat.
const SENSITIVE_KEYS = /pass(word)?|token|secret|otp|code|authorization/i;
function redactBody(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_KEYS.test(key)) out[key] = '***';
  }
  return out;
}

// Resolve the API base URL at module load. NEXT_PUBLIC_BACKEND_URL is baked at
// build time so it'd ship as `http://localhost:4000/api/v1` for a normal
// dev build. That breaks mobile-LAN testing: the phone tries `localhost`,
// which is the phone itself, not the dev laptop. So when we're running in
// a browser AND the user reached the app over a non-localhost host (LAN
// IP, Ngrok tunnel), swap the host portion of the env URL for the current
// page's host. The /api/v1 path stays. No config edit needed per tester.
function resolveApiBaseUrl(): string {
  const fromEnv = ENV.API_URL;
  if (typeof window === 'undefined') return fromEnv;
  const pageHost = window.location.hostname;
  if (pageHost === 'localhost' || pageHost === '127.0.0.1') return fromEnv;
  try {
    const url = new URL(fromEnv);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.hostname = pageHost;
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    // fromEnv isn't a valid URL - fall back to as-is.
  }
  return fromEnv;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
  timeout: 10_000,  // hard cap - every backend call gets a bounded wait
  headers: { 'Content-Type': 'application/json' },
});

// Attach Cognito ID token + URL-derived X-Org-Id header on every authenticated
// request.
//
// Why X-Org-Id from URL: the v2 URL-driven org model puts the slug in the
// path (/orgs/[slug]/...). Backend used to read currentOrgId from the JWT
// claim (Cognito custom:current_org_id), but with tab-local org switches the
// claim is stale - two tabs in two different orgs would both pin to whichever
// claim Cognito has. The header derived from URL slug is the authoritative
// per-tab context; backend prefers header, falls back to JWT claim if absent.
api.interceptors.request.use(async (config) => {
  if (typeof window === 'undefined') return config;
  const token = await getIdToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  // Derive X-Org-Id from current URL slug. If we're not on an /orgs/[slug]/...
  // route (auth, welcome, invite, root), omit the header - backend falls back
  // to JWT claim, which is correct for those flows.
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/orgs\/([^/]+)(?:\/|$)/);
  if (match) {
    const slug = decodeURIComponent(match[1]!);
    const m = useAuthStore.getState().memberships.find(m => m.org_slug === slug);
    if (m) {
      config.headers.set('X-Org-Id', m.org_id);
    }
  }
  // One-liner "we're hitting the API" trace — confirms request timing at a
  // glance. Method + path in the message; full URL + org context in the object.
  // Body/params live in the Network tab, so we keep this lean. Dev-only on the
  // client (logger.info gate). React Query dedupes fetches, so no double-log
  // under StrictMode.
  const method = (config.method ?? 'get').toUpperCase();
  logger.info(`API → ${method} ${config.url ?? ''}`, '', {
    url: `${config.baseURL ?? ''}${config.url ?? ''}`,
    orgId: config.headers.get('X-Org-Id') ?? undefined,
    // GET/DELETE carry no body; only attach it when there's something to show.
    // Secrets are masked first (see redactBody).
    ...(config.data !== undefined ? { body: redactBody(config.data) } : {}),
  });
  return config;
});

// Circuit breaker against redirect loops. Once we redirect to /auth/login from
// the interceptor, no further redirects fire from the same page load - even if
// many parallel requests 401 at once. The full page reload that window.location
// triggers resets this flag back to false naturally.
let redirectingToLogin = false;

// Throttle the read-only toast so a burst of blocked writes doesn't stack
// toasts. The sticky banner (org shell) is the persistent surface; this toast
// is just the immediate "that save didn't go through" feedback (RF-10).
let lastSubscriptionToastAt = 0;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Read-only write-gate: backend returns 403 with the SUBSCRIPTION_EXPIRED
    // code when the org is suspended/cancelled and the request is a write. Show
    // a bounded toast and refresh memberships so the banner appears — NO
    // redirect (per the redirect-loop ban). Reads are never gated, so this only
    // fires on a blocked mutation.
    if (
      error.response?.status === 403 &&
      error.response?.data?.error === 'SUBSCRIPTION_EXPIRED' &&
      typeof window !== 'undefined'
    ) {
      const now = Date.now();
      if (now - lastSubscriptionToastAt > 3000) {
        lastSubscriptionToastAt = now;
        toast.error(BILLING.banner.expiredToast);
        // Silent membership refresh so the sticky banner shows promptly.
        try { void useAuthStore.getState().hydrate(); } catch { /* best-effort */ }
      }
      return Promise.reject(error);
    }

    if (error.response?.status !== 401 || typeof window === 'undefined') {
      return Promise.reject(error);
    }
    // Auth pages handle their own errors; don't bounce away from /auth/login.
    if (window.location.pathname.startsWith('/auth/')) {
      return Promise.reject(error);
    }
    if (redirectingToLogin) {
      return Promise.reject(error);
    }
    redirectingToLogin = true;
    try { await signOut(); } catch { /* best-effort */ }
    window.location.href = '/auth/login';
    return Promise.reject(error);
  },
);

export default api;
