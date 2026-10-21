import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import api from '@/lib/api';
import type { ApiResponse } from '@/types/api.types';
import type { BillingSummary, CheckoutResult, BillingMode, Invoice } from '@/types/billing.types';

// X-Org-Id is attached automatically by the api interceptor from the URL slug,
// so these calls don't thread orgId. Keyed by slug so switching orgs refetches.

/**
 * Razorpay drives the final state via an async webhook (subscription
 * activated/cancelled) that lands a beat AFTER our mutation returns. So after any
 * billing action we refetch twice: once now (the optimistic/local truth) and once
 * after a short settle window, so the post-webhook truth reflects on the page on
 * its own — no manual refresh, no stale "read-only"/"pending" lingering.
 */
const BILLING_SETTLE_MS = 2500;
function settleBilling(qc: ReturnType<typeof useQueryClient>, slug: string | null): void {
  const key = { queryKey: ['billing', slug] };
  void qc.invalidateQueries(key);
  setTimeout(() => { void qc.invalidateQueries(key); }, BILLING_SETTLE_MS);
}

export function useBilling(slug: string | null) {
  return useQuery({
    queryKey: ['billing', slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<BillingSummary> => {
      const res = await api.get<ApiResponse<{ billing: BillingSummary }>>('/billing');
      if (!res.data.success) throw new Error(res.data.error || 'Could not load billing');
      return res.data.data.billing;
    },
  });
}

export function useInvoices(slug: string | null, enabled = true) {
  return useQuery({
    queryKey: ['billing-invoices', slug],
    enabled: Boolean(slug) && enabled,
    queryFn: async (): Promise<Invoice[]> => {
      const res = await api.get<ApiResponse<{ invoices: Invoice[] }>>('/billing/invoices');
      if (!res.data.success) throw new Error(res.data.error || 'Could not load invoices');
      return res.data.data.invoices;
    },
  });
}

export function useSubscribe(slug: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mode: BillingMode): Promise<CheckoutResult> => {
      const res = await api.post<ApiResponse<{ checkout: CheckoutResult }>>('/billing/subscribe', { mode });
      if (!res.data.success) throw new Error(res.data.error || 'Could not start subscription');
      return res.data.data.checkout;
    },
    onSuccess: () => { settleBilling(qc, slug); },
  });
}

export function useConfirmPayment(slug: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      orderId?: string; paymentId?: string; signature?: string; subscriptionId?: string;
    }): Promise<BillingSummary> => {
      const res = await api.post<ApiResponse<{ billing: BillingSummary }>>('/billing/confirm', vars);
      if (!res.data.success) throw new Error(res.data.error || 'Payment could not be verified');
      return res.data.data.billing;
    },
    onSuccess: () => { settleBilling(qc, slug); },
  });
}

export function useCancelSubscription(slug: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { code: string; immediate?: boolean }): Promise<BillingSummary> => {
      const res = await api.post<ApiResponse<{ billing: BillingSummary }>>('/billing/cancel', vars);
      if (!res.data.success) throw new Error(res.data.error || 'Could not cancel subscription');
      return res.data.data.billing;
    },
    onSuccess: () => { settleBilling(qc, slug); },
  });
}

/** Pull the backend's verbatim error off an axios error (matches otpError). */
export function billingError(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? (err.response?.data?.error ?? fallback) : fallback;
}
