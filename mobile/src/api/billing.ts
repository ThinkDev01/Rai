import { useQuery } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import { useAuthStore } from '@/store/authStore';

export interface BillingSummary {
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  trial_ends_at: string | null;
  plan_name: string;
  price_per_seat_inr: number;
  currency: string;
  active_seats: number;
  amount_due_inr: number;
  billing_mode: 'recurring' | 'one_time';
  auto_renew: boolean;
  current_period_end: string | null;
  canceled_at: string | null;
  provider_live: boolean;
}

export interface Invoice {
  id: string;
  date: string | null;
  amountCents: number;
  currency: string;
  status: string;
  downloadUrl: string | null;
  /** Payment origin so the UI can label each row. */
  type: 'order' | 'subscription';
}

const useOrgId = () => useAuthStore(s => s.currentOrgId);

export function useBillingSummary(enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['org', orgId, 'billing-summary'],
    enabled: Boolean(orgId) && enabled,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const data = await unwrap<{ billing: BillingSummary }>(api.get('/billing'));
      return data.billing;
    },
  });
}

export function useInvoices(enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.invoices(orgId),
    enabled: Boolean(orgId) && enabled,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const data = await unwrap<{ invoices: Invoice[] }>(api.get('/billing/invoices'));
      return data.invoices ?? [];
    },
  });
}

export function formatInvoiceAmount(cents: number, currency = 'INR'): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatInvoiceDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
