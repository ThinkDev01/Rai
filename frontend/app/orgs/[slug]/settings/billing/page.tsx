'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth.store';
import { useCurrentSlug, orgRoute } from '@/lib/routes';
import { formatDate } from '@/lib/dates';
import { openCheckout, formatCents, formatInr, type RazorpayPaymentResponse } from '@/lib/razorpay';
import { CreditCard, Check, CheckCircle2, AlertTriangle, RefreshCw, Users, Calendar, Loader2, Download } from '@/lib/icons';
import { BILLING } from '@/content/billing';
import {
  useBilling, useInvoices, useSubscribe, useConfirmPayment, useCancelSubscription, billingError,
} from '@/hooks/useBilling';
import { OtpConfirm } from '@/components/ui/OtpConfirm';
import type { BillingMode, BillingSummary } from '@/types/billing.types';

type GateStatus = BillingSummary['gate_status'];

// Pill colour keyed by the access-truth gate (see BILLING.gate). trial/active =
// has access; suspended/cancelled = read-only.
const GATE_PILL: Record<GateStatus, string> = {
  trial:     'border-info/40 bg-info/10 text-info',
  active:    'border-success/40 bg-success/10 text-success',
  suspended: 'border-warning/40 bg-warning/10 text-warning',
  cancelled: 'border-warning/40 bg-warning/10 text-warning',
};

function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function BillingPage() {
  const slug        = useCurrentSlug();
  const user        = useAuthStore(s => s.user);
  const memberships = useAuthStore(s => s.memberships);
  const refreshMemberships = useAuthStore(s => s.refreshMemberships);
  const membership  = memberships.find(m => m.org_slug === slug) ?? null;
  const canManage   = membership?.role === 'owner' || membership?.role === 'admin';

  const { data: billing, isLoading, isError } = useBilling(slug);
  const { data: invoices = [] } = useInvoices(slug, canManage);
  const subscribe   = useSubscribe(slug);
  const confirm     = useConfirmPayment(slug);
  const cancelSub   = useCancelSubscription(slug);

  const [showCancel, setShowCancel]   = useState(false);
  const [otpCode, setOtpCode]         = useState('');
  const [busyMode, setBusyMode]       = useState<BillingMode | null>(null);

  if (!canManage) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-3xl">
        <div className="rounded-lg border border-border bg-surface-raised p-6 text-center">
          <AlertTriangle size={20} className="mx-auto mb-2 text-warning" />
          <p className="text-sm text-text">Only owners and admins can manage billing.</p>
          {slug && (
            <Link href={orgRoute(slug, '/settings')} className="mt-3 inline-block text-sm text-text-link hover:underline">
              Back to settings
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-3xl flex items-center gap-2 text-text-subtle">
        <Loader2 size={16} className="animate-spin" /> Loading billing…
      </div>
    );
  }
  if (isError || !billing) {
    return <div className="px-4 sm:px-8 py-6 max-w-3xl text-sm text-danger">{BILLING.errors.load}</div>;
  }

  const price       = formatInr(billing.price_per_seat_inr, billing.currency);
  const amount      = formatInr(billing.amount_due_inr, billing.currency);
  // Drive the UI off the access-truth GATE, not the raw provider status — so a
  // subscription cancelled while trial/paid time still remains shows the
  // "scheduled cancellation" view (access until X + reactivate), never a false
  // "read-only". Matches the backend gate (gateForSubscription) + the banner.
  const isTrial     = billing.gate_status === 'trial';
  const isActive    = billing.gate_status === 'active';
  const isReadOnly  = billing.gate_status === 'suspended' || billing.gate_status === 'cancelled';
  // Active but NOT auto-renewing (cancelled, or a one-time period) → access ends
  // at the boundary. NOT gated on billing_mode: a one-time/seed-created active sub
  // also "ends on X", so it must still show a state + Reactivate, never a blank
  // Manage box. `wasCanceled` only picks the wording (cancelled vs simply not
  // renewing). The healthy "Renews on" path is auto_renew && recurring.
  const isRenewing  = isActive && billing.auto_renew && billing.billing_mode === 'recurring';
  const isEnding    = isActive && !isRenewing; // cancelled OR one-time OR auto-renew off
  const wasCanceled = Boolean(billing.canceled_at);
  const orgName     = membership?.org_name ?? 'Organization';
  // Still inside the free-trial window: the first charge is deferred to trial
  // end (Netflix model). Drives the trial-range + "first charge" copy in the
  // manage box once the user has subscribed during the trial.
  // "In trial" = trial still running AND no paid period extends past the trial end
  // (i.e. the first charge hasn't been taken). The second clause guards legacy/
  // mixed rows that carry both a trial_ends_at and a later current_period_end —
  // without it the box shows contradictory "trial ends X" + "first charge on Y".
  const periodPastTrial = Boolean(billing.current_period_end && billing.trial_ends_at)
    && new Date(billing.current_period_end!).getTime() > new Date(billing.trial_ends_at!).getTime();
  const inTrial     = Boolean(billing.trial_ends_at) && daysUntil(billing.trial_ends_at) > 0 && !periodPastTrial;
  // The charge boundary: the paid-period end once set, else (during a deferred
  // trial sub) the trial end. Keeps the manage note populated even when a
  // re-subscribe left current_period_end null until the first charge confirms.
  const chargeBoundary = billing.current_period_end ?? billing.trial_ends_at;

  // Subscribe / reactivate — always opens the Razorpay checkout (no instant
  // activation; the org goes active only after a confirmed payment).
  async function handleSubscribe(mode: BillingMode) {
    setBusyMode(mode);
    try {
      const checkout = await subscribe.mutateAsync(mode);

      if (!checkout.razorpayKeyId) {
        toast.error(BILLING.errors.subscribe);
        return;
      }

      const opened = await openCheckout({
        keyId: checkout.razorpayKeyId,
        orgName,
        subscriptionId: checkout.subscriptionId,
        orderId: checkout.orderId,
        amountCents: checkout.amountCents,
        currency: checkout.currency,
        email: user?.email ?? null,
        onSuccess: (resp: RazorpayPaymentResponse) => {
          confirm.mutate(
            { subscriptionId: resp.razorpay_subscription_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature },
            {
              onSuccess: () => { toast.success('Payment received — subscription active.'); void refreshMemberships(); },
              onError:   (err) => toast.error(billingError(err, BILLING.errors.confirm)),
            },
          );
        },
        onDismiss: () => toast.warning(BILLING.errors.checkoutDismissed),
      });
      if (!opened) toast.error(BILLING.errors.subscribe);
    } catch (err) {
      toast.error(billingError(err, BILLING.errors.subscribe));
    } finally {
      setBusyMode(null);
    }
  }

  function handleCancel() {
    cancelSub.mutate(
      { code: otpCode },
      {
        onSuccess: () => {
          toast.success(BILLING.cancel.success);
          setShowCancel(false);
          setOtpCode('');
          void refreshMemberships();
        },
        onError: (err) => toast.error(billingError(err, BILLING.errors.cancel)),
      },
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">{BILLING.title}</h1>
        <p className="text-sm text-text-subtle">{BILLING.subtitle}</p>
      </div>

      {!billing.provider_live && (
        <div className="flex items-start gap-2 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs text-info">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="text-text">{BILLING.dev.noProvider}</span>
        </div>
      )}

      {/* Status + plan summary */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <CreditCard size={16} className="text-text-subtle" />
          <h2 className="text-sm font-semibold text-text">{billing.plan_name} plan</h2>
          <span className={`ml-auto inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${GATE_PILL[billing.gate_status]}`}>
            {BILLING.gate[billing.gate_status]}
          </span>
        </div>

        <dl className="divide-y divide-border">
          <Row icon={<Users size={14} />} label={BILLING.seats.label}>
            <span className="text-text">{BILLING.seats.breakdown(billing.active_seats, price)}</span>
          </Row>
          <Row icon={<CreditCard size={14} />} label={BILLING.amount.dueNow}>
            <span className="font-medium text-text">{BILLING.amount.perMonth(amount)}</span>
          </Row>
          {isTrial && (
            <Row icon={<Calendar size={14} />} label="Trial">
              <div className="text-text">
                {billing.trial_ends_at ? (
                  <>
                    {billing.trial_started_at && (
                      <p className="text-text">{BILLING.trial.window(formatDate(billing.trial_started_at), formatDate(billing.trial_ends_at))}</p>
                    )}
                    <p className="text-xs text-text-subtle">{BILLING.trial.daysLeft(daysUntil(billing.trial_ends_at))}</p>
                  </>
                ) : (
                  BILLING.status.trialing
                )}
              </div>
            </Row>
          )}
          {billing.current_period_end && (isActive || isReadOnly) && (
            <Row icon={<Calendar size={14} />} label={isActive && billing.auto_renew ? 'Renews on' : 'Access until'}>
              <span className="text-text">{formatDate(billing.current_period_end)}</span>
            </Row>
          )}
          {isActive && billing.billing_mode === 'recurring' && (
            <Row icon={<RefreshCw size={14} />} label={BILLING.mode.label}>
              <span className="text-text">{billing.auto_renew ? BILLING.mode.autoRenewOn : BILLING.mode.autoRenewOff}</span>
            </Row>
          )}
        </dl>
        <p className="border-t border-border px-5 py-2 text-xs text-text-subtle">{BILLING.seats.note}</p>
      </section>

      {/* Subscribe / reactivate (trial or read-only) */}
      {(isTrial || isReadOnly) && (
        <section className="space-y-3 rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-text">{BILLING.choose.title}</h2>
          {/* Subscribed-then-cancelled within the trial: reassure no charge was
              taken and the trial continues, instead of the bare first-time copy. */}
          {isTrial && billing.canceled_at && billing.trial_ends_at && (
            <p className="flex items-start gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-text">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-info" />
              <span>{BILLING.choose.canceledInTrial(formatDate(billing.trial_ends_at))}</span>
            </p>
          )}
          <div className="grid gap-3">
            <ChoiceCard
              title={BILLING.mode.recurring}
              blurb={BILLING.choose.recurring}
              cta={isReadOnly ? BILLING.actions.reactivate : BILLING.actions.subscribeRecurring}
              busy={busyMode === 'recurring'}
              disabled={busyMode !== null}
              onClick={() => handleSubscribe('recurring')}
            />
          </div>
        </section>
      )}

      {/* Manage (active) */}
      {isActive && (
        <section className="space-y-4 rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-text">{BILLING.actions.manage}</h2>

          {isEnding ? (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                <AlertTriangle size={15} className="text-warning" /> {wasCanceled ? BILLING.canceled.heading : BILLING.canceled.notRenewing}
              </p>
              <p className="text-xs text-text-subtle">
                {BILLING.canceled.body(billing.current_period_end ? formatDate(billing.current_period_end) : 'the end of the period')}
              </p>
              {billing.billing_mode === 'one_time' && (
                <p className="rounded border border-info/40 bg-info/10 px-2.5 py-1.5 text-xs text-text">
                  {BILLING.canceled.oneTimeRetired}
                </p>
              )}
              {/* Resuming auto-renew can't just flip a flag — a cancelled Razorpay
                  subscription can't be un-cancelled, so we open a fresh checkout
                  (new mandate). `subscribe` starts the new charge at the current
                  period end, so there's no gap or double-bill. */}
              <button
                type="button"
                disabled={busyMode !== null}
                onClick={() => handleSubscribe('recurring')}
                className="mt-1 inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {busyMode === 'recurring' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {BILLING.actions.reactivate}
              </button>
            </div>
          ) : (
          <>
          {!showCancel && billing.billing_mode === 'recurring' && chargeBoundary && (
            <div className="space-y-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-subtle">
              {inTrial && billing.trial_started_at && billing.trial_ends_at && (
                <p className="flex items-center gap-1.5 text-text">
                  <Calendar size={12} className="shrink-0 text-info" />
                  <span className="font-medium">{BILLING.trial.window(formatDate(billing.trial_started_at), formatDate(billing.trial_ends_at))}</span>
                  {' · '}{BILLING.trial.daysLeft(daysUntil(billing.trial_ends_at))}
                </p>
              )}
              <p>
                <span className="font-medium text-text">
                  {inTrial
                    ? BILLING.manage.firstCharge(amount, formatDate(chargeBoundary))
                    : `${BILLING.manage.renewsOn(formatDate(chargeBoundary))} · ${BILLING.manage.nextCharge(amount)}`}
                </span>
              </p>
              {inTrial && <p className="text-text-placeholder">{BILLING.trial.noChargeYet}</p>}
            </div>
          )}
          {!showCancel ? (
            <button
              type="button"
              onClick={() => setShowCancel(true)}
              className="text-sm font-medium text-danger hover:underline"
            >
              {BILLING.actions.cancel}
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border border-danger/40 bg-danger/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
                <div>
                  <p className="text-sm font-semibold text-text">{BILLING.cancel.title}</p>
                  <p className="mt-0.5 text-xs text-text-subtle">{BILLING.cancel.explain}</p>
                </div>
              </div>
              <p className="text-xs text-text-subtle">{BILLING.cancel.otpPrompt}</p>
              {membership && (
                <OtpConfirm
                  action="cancel_subscription"
                  targetId={membership.org_id}
                  code={otpCode}
                  onCodeChange={setOtpCode}
                  disabled={cancelSub.isPending}
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={otpCode.length !== 6 || cancelSub.isPending}
                  onClick={handleCancel}
                  className="rounded bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelSub.isPending ? 'Canceling…' : BILLING.cancel.confirm}
                </button>
                <button
                  type="button"
                  disabled={cancelSub.isPending}
                  onClick={() => { setShowCancel(false); setOtpCode(''); }}
                  className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-60"
                >
                  Keep subscription
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </section>
      )}

      {/* Invoices & receipts — only meaningful with a real provider (Razorpay
          auto-generates a downloadable invoice per charge). */}
      {billing.provider_live && (
        <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text">{BILLING.invoices.title}</h2>
            <p className="text-xs text-text-subtle">{BILLING.invoices.subtitle}</p>
          </div>
          {/* Pending subscription charge note — shown when auto-renew is active
              but no subscription invoice exists yet (first charge deferred to
              period end when switching from one_time mid-period). */}
          {billing.auto_renew && billing.billing_mode === 'recurring' &&
           billing.current_period_end && !invoices.some(inv => inv.type === 'subscription') && (
            <div className="flex items-start gap-2 border-b border-border px-5 py-3">
              <Calendar size={13} className="mt-0.5 shrink-0 text-info" />
              <p className="text-xs text-text-subtle">
                Auto-renew is active. Your first subscription charge is scheduled for{' '}
                <span className="font-medium text-text">{formatDate(billing.current_period_end)}</span>.
                The subscription invoice will appear here once payment is processed.
              </p>
            </div>
          )}
          {invoices.length === 0 ? (
            <p className="px-5 py-4 text-sm text-text-subtle">{BILLING.invoices.empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {invoices.map(inv => (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-text">{inv.date ? formatDate(inv.date) : '—'}</p>
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        inv.type === 'subscription'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface-sunken text-text-subtle'
                      }`}>
                        {inv.type === 'subscription' ? 'Subscription' : 'One-time'}
                      </span>
                    </div>
                    <p className="text-xs capitalize text-text-placeholder">{inv.status}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-text">{formatCents(inv.amountCents, inv.currency)}</span>
                    {inv.downloadUrl ? (
                      <a
                        href={inv.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Download size={13} />
                        {BILLING.invoices.download}
                      </a>
                    ) : (
                      <span className="text-xs text-text-placeholder">—</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {slug && (
        <Link href={orgRoute(slug, '/settings')} className="inline-flex items-center gap-1 text-sm text-text-link hover:underline">
          Back to settings
        </Link>
      )}
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="flex items-center gap-2 text-sm text-text-subtle">
        <span className="text-text-placeholder">{icon}</span>
        {label}
      </dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

function ChoiceCard({
  title, blurb, cta, busy, disabled, onClick,
}: {
  title: string; blurb: string; cta: string; busy: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-text">
        <CheckCircle2 size={14} className="text-primary" /> {title}
      </p>
      <p className="mt-1 flex-1 text-xs text-text-subtle">{blurb}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {busy ? 'Starting…' : cta}
      </button>
    </div>
  );
}
