import { ENV } from '@/config/env';

export const BILLING_BASE_URL = `https://${ENV.WEB_HOST}`;

export function billingUrl(orgSlug: string, planId?: string): string {
  const billingPath = `/orgs/${orgSlug}/settings/billing${planId ? `?plan=${planId}` : ''}`;
  return `${BILLING_BASE_URL}/auth/login?redirect=${encodeURIComponent(billingPath)}`;
}
