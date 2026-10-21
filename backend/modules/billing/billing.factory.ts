// The one place that builds the active BillingProvider. Same pattern as
// auth.factory.
//
// Razorpay is the ONLY billing provider — the exact same flow runs in local
// (Razorpay test-mode keys) and in staging/prod. There is NO silent fallback:
// "subscribe" must always open a real Razorpay checkout, never fake an instant
// activation. Missing keys are caught at boot by validateEnv() (config/env.ts);
// the throw here is a backstop if that guard is ever bypassed. Tests inject a
// deterministic stub provider via setBillingProvider() instead of hitting the
// network.

import type { BillingProvider } from './billing.provider';
import { RazorpayBillingProvider } from './providers/razorpay.provider';

let instance: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (instance) return instance;
  // RazorpayBillingProvider's constructor throws if KEY_ID/KEY_SECRET are absent.
  instance = new RazorpayBillingProvider();
  return instance;
}

/** Test seam — inject a mock/stub provider (or null to rebuild from env). */
export function setBillingProvider(provider: BillingProvider | null): void {
  instance = provider;
}
