'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import {
  changePassword,
  forgotPassword,
  confirmForgotPassword,
  isFederatedUser,
  federatedProvider,
} from '@/lib/cognito-client';
import { orgRoute } from '@/lib/routes';
import { enqueueToast } from '@/lib/toastQueue';
import { Eye, EyeOff, User, Lock, Building2, ArrowRightLeft, AlertTriangle, X, Palette, Sun, Moon, Plus, CreditCard, Pin, PinOff, ArchiveRestore, Download, Bell, MessageSquare, Send } from '@/lib/icons';
import Link from 'next/link';
import { useThemeStore } from '@/store/theme.store';
import { useTeamMembers, useTransferOwnership, useLeaveOrg, useDeleteOrg } from '@/hooks/useTeam';
import { useDeletedOrgs, useRestoreOrg, deletedOrgSubLabel, type DeletedOrg } from '@/hooks/useDeletedOrgs';
import { useDomainPeers, useToggleOrgDiscoverable } from '@/hooks/useDomainPeers';
import { useDismissedDomainPeers } from '@/hooks/useDismissedDomainPeers';
import { SubscriptionStatusChip } from '@/components/SubscriptionStatusChip';
import { TrialBanner } from '@/components/billing/TrialBanner';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { FEEDBACK } from '@/content/feedback';
import { OtpConfirm } from '@/components/ui/OtpConfirm';
import { roleChipClass } from '@/lib/role.utils';
import api from '@/lib/api';
import { logger } from '@/lib/logger';
import type { ApiResponse, Member } from '@/types/api.types';

// Settings page (Phase 1):
//   - Account: read-only rows for email + verified; editable Display name via
//     Edit-then-Save/Cancel flow; Change-password row that expands a form on
//     click. Password section is hidden for federated users (Google/Microsoft
//     manage their own passwords).
//   - Current organization: read-only summary
//   - Switch organization: inline switcher when 2+ memberships
// Sign-out lives in the sidebar.

const PASSWORD_MIN = 8;
const NAME_MIN     = 2;
const NAME_MAX     = 100;

export default function SettingsPage() {
  const user        = useAuthStore(s => s.user);
  const memberships = useAuthStore(s => s.memberships);
  const router      = useRouter();
  const qc          = useQueryClient();

  const current   = memberships.find(m => m.org_id === user?.currentOrgId);
  const otherOrgs = memberships.filter(m => m.org_id !== user?.currentOrgId);

  // Federation flag: computed once on mount from the ID token. Doesn't change
  // for the lifetime of the session (one set of tokens = one provider).
  const [federated, setFederated] = useState<{ is: boolean; provider: string | null }>({
    is: false, provider: null,
  });
  const [showFeedback, setShowFeedback] = useState(false);
  useEffect(() => {
    setFederated({ is: isFederatedUser(), provider: federatedProvider() });
  }, []);

  if (!user) return null;

  return (
    <div className="px-4 sm:px-8 py-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="text-sm text-text-subtle">Account and organization preferences.</p>
      </div>

      <TrialBanner
        slug={current?.org_slug ?? null}
        canManage={current?.role === 'owner' || current?.role === 'admin'}
      />

      <GroupHeading label="You" />

      {/* Account */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={User}
          title="Account"
          description="Your personal profile information."
        />
        <div className="divide-y divide-border">
          <ReadOnlyRow label="Email" value={user.email} />
          <ReadOnlyRow label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
          <EditableNameRow user={user} qc={qc} />
        </div>
      </section>

      {/* Password - hidden for federated users */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={Lock}
          title="Password"
          description={federated.is
            ? `Managed by your sign-in provider (${federated.provider ?? 'external'}).`
            : 'Change your password or reset it via email.'}
        />
        {federated.is ? (
          <div className="px-5 py-4">
            <p className="text-xs text-text-subtle">
              You signed in with <span className="font-medium text-text">{federated.provider ?? 'an external provider'}</span>.
              Manage your password with them.
            </p>
          </div>
        ) : (
          <ChangePasswordRow userId={user.id} userEmail={user.email} />
        )}
      </section>

      {/* Appearance - light/dark theme toggle (mirrors v1 Settings section).
          Also lives in the header as a quick toggle; this gives users who
          land on Settings a discoverable place to flip it without hunting
          for the small icon in the top bar. */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={Palette}
          title="Appearance"
          description="Light or dark theme. Persists across sessions on this device."
        />
        <AppearanceRow />
      </section>

      {/* Notifications - per-user email preferences (in-app is always on).
          Account-level (not org-scoped), so it sits in the "You" group beside
          Appearance. Lives on its own page (like Billing) because it's a FIXED
          set of toggles, not a user-dependent list - opened from here. */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={Bell}
          title="Notifications"
          description="Choose which emails you receive. In-app notifications always appear in your bell."
        />
        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Email preferences</p>
            <p className="mt-0.5 text-xs text-text-subtle">
              Turn category emails on or off. In-app stays on.
            </p>
          </div>
          {current && (
            <Link
              href={orgRoute(current.org_slug, '/settings/notifications')}
              className="flex-shrink-0 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary"
            >
              Open notification settings
            </Link>
          )}
        </div>
      </section>

      <GroupHeading label="This organization" />

      {/* Current organization */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={Building2}
          title="Current organization"
          description="The org you're currently working in."
        />
        <div className="divide-y divide-border">
          {current && (current.role === 'owner' || current.role === 'admin') ? (
            <EditableOrgNameRow orgId={current.org_id} orgName={current.org_name} userId={user.id} qc={qc} />
          ) : (
            <ReadOnlyRow label="Name" value={current?.org_name ?? '-'} />
          )}
          <ReadOnlyRow label="Identifier" value={current ? `@${current.org_slug}` : '-'} />
          {current ? (
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <span className="text-text-subtle">Your role</span>
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-text">
                  {current.role_label ?? current.role}
                </span>
                {/* Underlying role-type chip - per-role color (owner=amber,
                    admin=primary, PM=green, user=gray) so it stands out from
                    the renamed display label and is distinguishable from the
                    Trial / Active subscription chips below. */}
                <span className={`flex-shrink-0 ${roleChipClass(current.role)}`}>
                  {current.role}
                </span>
              </div>
            </div>
          ) : (
            <ReadOnlyRow label="Your role" value="-" />
          )}
          {current ? (
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
              <span className="text-text-subtle">Subscription</span>
              <SubscriptionStatusChip status={current.subscription_status} />
            </div>
          ) : (
            <ReadOnlyRow label="Subscription" value="-" />
          )}
          {/* Discoverability - owner-only. Toggle controls whether other
              users in the same email domain see this org in their peer
              banner / peer list. Owner always sees their own org regardless. */}
          {current && current.role === 'owner' && (
            <DiscoverabilityRow
              orgId={current.org_id}
              orgName={current.org_name}
              discoverable={current.discoverable}
            />
          )}
        </div>
      </section>

      {/* Manage subscription. Sits right after Current organization because
          it's billing for the org you're currently in. Visible to all roles so
          they can see the trial state; the "Open billing" action is gated to
          owners/admins. */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={CreditCard}
          title="Manage subscription"
          description="Plan, seats, trial status, payment, and cancellation."
        />
        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Billing &amp; subscription</p>
            <p className="mt-0.5 text-xs text-text-subtle">
              {(current?.role === 'owner' || current?.role === 'admin')
                ? 'View your plan and seats, pay, or cancel your subscription.'
                : 'Only owners and admins can manage billing. Contact your admin to renew.'}
            </p>
          </div>
          {(current?.role === 'owner' || current?.role === 'admin') && current && (
            <Link
              href={orgRoute(current.org_slug, '/settings/billing')}
              className="flex-shrink-0 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary"
            >
              Open billing
            </Link>
          )}
        </div>
      </section>

      {/* Export your data - owner/admin only. Downloads the whole org as JSON
          or Excel. Backend gates the request too. Sits with the org it exports:
          right after the org's identity + billing, before the cross-org actions. */}
      {current && (current.role === 'owner' || current.role === 'admin') && (
        <ExportDataSection orgId={current.org_id} orgSlug={current.org_slug} />
      )}

      <GroupHeading label="Your organizations" />

      {/* Switch organization */}
      {otherOrgs.length > 0 && (
        <SwitchOrgSection
          memberships={memberships}
          otherOrgs={otherOrgs}
          userId={user.id}
          router={router}
          qc={qc}
        />
      )}

      {/* Add another organization - entry point for users who want to spin up
          a separate org alongside their existing memberships. Routes to
          /welcome?create=1&from=<current-slug>; back link there returns here.
          Placed next to Switch organization since both are "your orgs"
          actions (move between yours, or create another). */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={Plus}
          title="Add another organization"
          description="Create a separate org you'll own - useful for multiple teams, side projects, or clients."
        />
        <div className="px-5 py-3.5">
          <Link
            href={current
              ? `/welcome?create=1&from=${encodeURIComponent(current.org_slug)}`
              : '/welcome?create=1'}
            className="inline-flex items-center gap-2 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary"
          >
            <Plus size={13} />
            Create new organization
          </Link>
        </div>
      </section>

      {/* Other organizations in your email domain - always-visible reference
          for the same info shown as a dashboard banner. Dashboard banner can
          be dismissed; this section never goes away, so the info is always
          retrievable. Visible to everyone (not just admins) since it's
          purely informational - any member might want to know their company
          has other workspaces. */}
      <DomainPeersSection currentOrgId={current?.org_id ?? null} userId={user.id} />

      {/* Help & feedback — always-available contact + the feedback modal (same
          form as the 20-day dashboard nudge). Visible to everyone. */}
      <GroupHeading label="Help" />
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
        <SectionHeader
          icon={MessageSquare}
          title="Help & feedback"
          description="Questions, ideas, or issues? We read every message."
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Contact us</p>
            <p className="mt-0.5 text-xs text-text-subtle">
              Send feedback in-app, or email{' '}
              <a href="mailto:support@rai.novetum.com" className="text-text-link hover:underline">support@rai.novetum.com</a>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFeedback(true)}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover"
          >
            <Send size={13} /> Send feedback
          </button>
        </div>
        <p className="border-t border-border-subtle px-5 py-2.5 text-xs text-text-subtle">
          {FEEDBACK.settings.attachmentNote}
        </p>
      </section>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}

      <GroupHeading label="Danger & recovery" />

      {/* Recently deleted orgs (recycle bin) - owner-scoped, soft-deleted within
          the 30-day window. Sits just above the Danger zone, muted, so an owner
          with other orgs can restore without going through the create-org flow.
          Renders nothing when there's nothing to restore (the common case). */}
      <RecentlyDeletedOrgsSection />

      {/* Danger zone - owner-only: transfer ownership + delete organization */}
      {current?.role === 'owner' && (
        <DangerZone orgId={current.org_id} orgName={current.org_name} orgSlug={current.org_slug} userId={user.id} />
      )}

      {/* Leave organization - non-owners only. Owners must transfer ownership
          first per the "every org has exactly one owner" invariant. */}
      {current && current.role !== 'owner' && (
        <LeaveOrgSection orgId={current.org_id} orgName={current.org_name} orgSlug={current.org_slug} />
      )}
    </div>
  );
}

// ── Export your data ────────────────────────────────────────────────────────
//
// Owner/admin downloads the full org (Members / Projects / Sprints / Tickets /
// Comments) as JSON or Excel. Fetches the file as a blob through the authed api
// client, then triggers a browser download. Backend re-checks the owner/admin
// gate. Trust/portability signal for B2B ("can we get our data out?").

function ExportDataSection({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const [busy, setBusy] = useState<'json' | 'xlsx' | null>(null);

  async function download(format: 'json' | 'xlsx') {
    setBusy(format);
    logger.info('Settings', 'Exporting org data', { orgId, format });
    try {
      const res = await api.get(`/orgs/${orgId}/export`, {
        params: { format },
        responseType: 'blob',
        timeout: 120_000,  // exports can be large (big orgs) — override the 10s default
      });
      // Prefer the server-set filename; fall back to a sensible default.
      const cd = res.headers['content-disposition'] as string | undefined;
      const match = cd?.match(/filename="(.+?)"/);
      const filename = match?.[1] ?? `rai-export-${orgSlug}.${format}`;

      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err) {
      // Responses come back as Blobs (responseType), so a backend JSON error
      // body is a Blob too — read + parse it to surface the real message
      // instead of an opaque "failed".
      let msg = 'Could not export your data';
      let status: number | undefined;
      if (axios.isAxiosError(err)) {
        status = err.response?.status;
        if (err.code === 'ECONNABORTED') {
          msg = 'Export timed out — your organization may be very large. Try again.';
        } else if (err.response?.data instanceof Blob) {
          try {
            const parsed = JSON.parse(await err.response.data.text());
            if (parsed?.error) msg = parsed.error;
          } catch { /* non-JSON body — keep the generic message */ }
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      logger.error('Settings', 'Org data export failed', { orgId, format, status, error: msg });
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
      <SectionHeader
        icon={Download}
        title="Export your data"
        description="Download this organization's projects, sprints, tickets, comments, and members. Members' emails are included."
      />
      <div className="flex flex-wrap gap-2 px-5 py-3.5">
        <button
          type="button"
          onClick={() => download('json')}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download size={13} />
          {busy === 'json' ? 'Preparing…' : 'Export as JSON'}
        </button>
        <button
          type="button"
          onClick={() => download('xlsx')}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download size={13} />
          {busy === 'xlsx' ? 'Preparing…' : 'Export as Excel'}
        </button>
      </div>
    </section>
  );
}

// ── Recently deleted orgs (recycle bin) ─────────────────────────────────────
//
// Owner-scoped soft-deleted orgs still inside the 30-day window. Muted section
// at the bottom of Settings so an owner who has other orgs can restore without
// going through the create-org flow. Restore = confirm → hard-navigate into the
// restored org so the org layout re-hydrates cleanly. Renders nothing when
// there's nothing to restore.

function daysLeftToRestore(restoreUntil: string): number {
  return Math.max(0, Math.ceil((new Date(restoreUntil).getTime() - Date.now()) / 86_400_000));
}

function RecentlyDeletedOrgsSection() {
  const { data: deletedOrgs = [], isLoading } = useDeletedOrgs();
  const { mutate: restore, isPending }        = useRestoreOrg();
  const [confirmingId, setConfirmingId]       = useState<string | null>(null);
  const [restoringId, setRestoringId]         = useState<string | null>(null);

  if (isLoading || deletedOrgs.length === 0) return null;

  function handleRestore(org: DeletedOrg) {
    setRestoringId(org.id);
    restore(org.id, {
      onSuccess: () => {
        toast.success(`${org.name} restored`);
        window.location.assign(orgRoute(org.slug, '/dashboard'));
      },
      onSettled: () => { setRestoringId(null); setConfirmingId(null); },
    });
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
      <SectionHeader
        icon={ArchiveRestore}
        title="Recently deleted"
        description="Organizations you deleted are recoverable for 30 days, then permanently removed."
      />
      <ul className="divide-y divide-border">
        {deletedOrgs.map(org => {
          const left       = daysLeftToRestore(org.restore_until);
          const confirming = confirmingId === org.id;
          const busy       = isPending && restoringId === org.id;
          return (
            <li key={org.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {/* Muted/greyed - this is a deleted item, not a live org. */}
                  <p className="truncate text-sm font-medium text-text-subtle">{org.name}</p>
                  <p className="text-xs text-text-placeholder">
                    @{org.slug} · {left} {left === 1 ? 'day' : 'days'} left to restore
                  </p>
                  {deletedOrgSubLabel(org) && (
                    <p className="text-xs text-text-placeholder">{deletedOrgSubLabel(org)}</p>
                  )}
                </div>
                {!confirming && (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(org.id)}
                    className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
                  >
                    <ArchiveRestore size={13} />
                    Restore
                  </button>
                )}
              </div>

              {confirming && (
                <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border pt-2.5">
                  <p className="text-xs text-text-subtle">Restore this organization?</p>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={busy}
                      className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(org)}
                      disabled={busy}
                      className="rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Danger zone - ownership transfer (owner only) ───────────────────────────
//
// Single-confirmation pattern in v2: pick recipient + type their email to
// confirm + irreversible warning. MFA gate parked for v3 (docs/upgrades.md §
// "OTP / 2FA for ownership transfer"). Backend rejects calls from non-owners.

function DangerZone({ orgId, orgName, orgSlug, userId }: { orgId: string; orgName: string; orgSlug: string; userId: string }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDelete,   setShowDelete]   = useState(false);

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-danger/30 bg-surface-raised shadow-sm">
        <div className="flex items-start gap-3 border-b border-danger/20 bg-danger/5 px-5 py-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-danger/10">
            <AlertTriangle size={16} className="text-danger" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-danger">Danger zone</h2>
            <p className="mt-0.5 text-xs text-text-subtle">
              Irreversible actions for owners.
            </p>
          </div>
        </div>

        <div className="divide-y divide-danger/20">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-text">Transfer ownership</p>
              <p className="mt-0.5 text-xs text-text-subtle">
                Promote another member to owner. You will become admin. This action is atomic and irreversible from here - the new owner can transfer it back if needed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="flex-shrink-0 cursor-pointer rounded border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-subtle"
            >
              Transfer
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-text">Delete organization</p>
              <p className="mt-0.5 text-xs text-text-subtle">
                Delete <span className="font-medium text-text">{orgName}</span> and every project, sprint, ticket, and invite under it. Recoverable for 30 days from the create-organization screen, then permanently removed.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="flex-shrink-0 cursor-pointer rounded bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger/90"
            >
              Delete
            </button>
          </div>
        </div>
      </section>

      {showTransfer && (
        <TransferOwnershipModal
          orgId={orgId}
          orgName={orgName}
          callerUserId={userId}
          onClose={() => setShowTransfer(false)}
        />
      )}
      {showDelete && (
        <DeleteOrgModal
          orgId={orgId}
          orgName={orgName}
          orgSlug={orgSlug}
          onClose={() => setShowDelete(false)}
        />
      )}
    </>
  );
}

// ── Leave organization - non-owners ─────────────────────────────────────────

function LeaveOrgSection({ orgId, orgName, orgSlug }: { orgId: string; orgName: string; orgSlug: string }) {
  const [showLeave, setShowLeave] = useState(false);

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-warning/30 bg-surface-raised shadow-sm">
        <div className="flex items-start gap-3 border-b border-warning/20 bg-warning/5 px-5 py-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-warning/10">
            <AlertTriangle size={16} className="text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-warning">Leave organization</h2>
            <p className="mt-0.5 text-xs text-text-subtle">
              Remove yourself from this org. You will lose access to all its projects.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-text">Leave <span className="text-warning">{orgName}</span></p>
            <p className="mt-0.5 text-xs text-text-subtle">
              An admin can re-invite you later if needed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowLeave(true)}
            className="flex-shrink-0 cursor-pointer rounded border border-warning/40 bg-surface px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/10"
          >
            Leave
          </button>
        </div>
      </section>

      {showLeave && (
        <LeaveOrgModal
          orgId={orgId}
          orgName={orgName}
          orgSlug={orgSlug}
          onClose={() => setShowLeave(false)}
        />
      )}
    </>
  );
}

// ── Leave-org modal ─────────────────────────────────────────────────────────

function LeaveOrgModal({ orgId, orgName, orgSlug, onClose }: {
  orgId:    string;
  orgName:  string;
  orgSlug:  string;
  onClose:  () => void;
}) {
  const { mutate: leave, isPending } = useLeaveOrg();
  const router = useRouter();

  function handleConfirm() {
    leave(orgId, {
      onSuccess: () => {
        toast.success(`Left ${orgName}`);
        // Decide redirect from the NOW-fresh memberships in the auth store.
        const memberships = useAuthStore.getState().memberships;
        const user        = useAuthStore.getState().user;
        const target = memberships.find(m => m.org_slug !== orgSlug);
        if (target) {
          window.location.assign(`/orgs/${encodeURIComponent(target.org_slug)}/dashboard`);
        } else if ((user?.currentOrgId ?? null) && memberships.length === 0) {
          window.location.assign('/welcome');
        } else {
          window.location.assign('/');
        }
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <AlertTriangle size={18} className="flex-shrink-0 text-warning" />
          <div>
            <h2 className="text-sm font-semibold text-text">Leave {orgName}?</h2>
            <p className="mt-1 text-xs text-text-subtle">
              You will lose access to all its projects, tickets, and discussions. An admin can re-invite you later.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="rounded bg-warning px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-60"
          >
            {isPending ? 'Leaving…' : 'Leave organization'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete-org modal (owner only, email-OTP guard) ──────────────────────────

function DeleteOrgModal({ orgId, orgName, orgSlug, onClose }: {
  orgId:    string;
  orgName:  string;
  orgSlug:  string;
  onClose:  () => void;
}) {
  const { mutate: deleteOrg, isPending } = useDeleteOrg();
  const [code, setCode]   = useState('');
  const [error, setError] = useState('');

  function handleConfirm() {
    setError('');
    if (code.length !== 6) {
      setError('Enter the 6-digit code we emailed you');
      return;
    }
    deleteOrg({ orgId, otpCode: code }, {
      onSuccess: () => {
        toast.success(`${orgName} deleted — recoverable for 30 days`);
        const memberships = useAuthStore.getState().memberships;
        const target = memberships.find(m => m.org_slug !== orgSlug);
        if (target) {
          window.location.assign(`/orgs/${encodeURIComponent(target.org_slug)}/dashboard`);
        } else {
          window.location.assign('/welcome');
        }
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to delete organization');
      },
    });
  }

  return (
    // Not light-dismissible: OTP-gated destructive action. User alt-tabs to copy
    // the emailed code; the refocus click used to hit the backdrop and close the
    // modal mid-flow. Closes only via explicit Cancel / X.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <AlertTriangle size={18} className="flex-shrink-0 text-danger" />
          <div>
            <h2 className="text-sm font-semibold text-danger">Delete {orgName}?</h2>
            <p className="mt-1 text-xs text-text-subtle">
              This hides the organization and everything in it. You can restore it for <strong className="text-text">30 days</strong> from the create-organization screen; after that it is permanently removed.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <OtpConfirm
            action="delete_org"
            targetId={orgId}
            code={code}
            onCodeChange={c => { setCode(c); if (error) setError(''); }}
            disabled={isPending}
          />
          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending || code.length !== 6}
            className="rounded bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Deleting…' : 'Delete organization'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferOwnershipModal({
  orgId,
  orgName,
  callerUserId,
  onClose,
}: {
  orgId:        string;
  orgName:      string;
  callerUserId: string;
  onClose:      () => void;
}) {
  const { data: members, isLoading } = useTeamMembers();
  const { mutate: transfer, isPending } = useTransferOwnership();

  const [recipientId, setRecipientId] = useState<string>('');
  const [code,        setCode]        = useState<string>('');
  const [error,       setError]       = useState<string>('');

  // Recipients = every member EXCEPT the current owner (caller). Backend will
  // reject non-org-members anyway, but the picker only shows org members.
  const recipients: Member[] = (members ?? []).filter(m => m.id !== callerUserId);
  const recipient            = recipients.find(m => m.id === recipientId) ?? null;

  function handleConfirm() {
    setError('');
    if (!recipient) { setError('Pick a recipient'); return; }
    if (code.length !== 6) { setError('Enter the 6-digit code we emailed you'); return; }
    transfer({ recipientId: recipient.id, otpCode: code }, {
      onSuccess: () => onClose(),
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to transfer ownership');
      },
    });
  }

  return (
    // Not light-dismissible: OTP-gated destructive action. User alt-tabs to copy
    // the emailed code; the refocus click used to hit the backdrop and close the
    // modal mid-flow. Closes only via explicit Cancel / X.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-danger">
            <AlertTriangle size={16} />
            Transfer ownership of {orgName}
          </h2>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-text-subtle">
            <p className="font-medium text-danger">This is irreversible from this page.</p>
            <p className="mt-1">After confirming: you become an admin of <strong className="text-text">{orgName}</strong>, the recipient becomes the new owner with full delete + transfer rights. The recipient can transfer it back if needed.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-subtle">New owner</label>
            {isLoading ? (
              <div className="h-9 animate-pulse rounded border border-border bg-surface" />
            ) : recipients.length === 0 ? (
              <p className="rounded border border-border bg-surface px-3 py-2 text-xs text-text-placeholder">
                You are the only member - invite someone to this org first.
              </p>
            ) : (
              <select
                value={recipientId}
                onChange={e => { setRecipientId(e.target.value); setError(''); }}
                disabled={isPending}
                className="rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">- Select recipient -</option>
                {recipients.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email}) · {m.role_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {recipient && (
            <OtpConfirm
              action="transfer_ownership"
              targetId={orgId}
              code={code}
              onCodeChange={c => { setCode(c); if (error) setError(''); }}
              disabled={isPending}
            />
          )}

          {error && (
            <p className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="cursor-pointer rounded border border-border bg-surface px-4 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending || !recipient || code.length !== 6}
              className="flex items-center gap-1.5 rounded bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Transferring…' : 'Transfer ownership'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section primitives ──────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }: {
  icon:        React.ComponentType<{ size?: number; className?: string }>;
  title:       string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border bg-surface/50 px-5 py-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary-subtle">
        <Icon size={16} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-text-subtle">{description}</p>}
      </div>
    </div>
  );
}

// Group divider — a small muted label that clusters the cards below it
// (You / This organization / Your organizations / Danger & recovery). Sits in
// the page's space-y-6 flow, so it reads as a heading above its group and lets
// a long settings list scan as four meaningful sections instead of one column.
function GroupHeading({ label }: { label: string }) {
  return (
    <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-text-placeholder">
      {label}
    </h2>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
      <span className="text-text-subtle">{label}</span>
      <span className="truncate text-right font-medium text-text">{value}</span>
    </div>
  );
}

// ── Appearance: theme segmented control ─────────────────────────────────────
//
// Two-button segmented control instead of a single toggle so the current
// theme is always *named* on screen (better than a bare icon - users with
// device-default theme on can't always tell whether the app is dark because
// of their pref or ours). Bound to the same `useThemeStore` the header
// toggle uses, so flipping one updates the other.

function AppearanceRow() {
  const { dark, toggle } = useThemeStore();
  const options = [
    { id: 'light', label: 'Light', icon: <Sun  size={14} />, active: !dark },
    { id: 'dark',  label: 'Dark',  icon: <Moon size={14} />, active:  dark },
  ];
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="text-sm font-medium text-text">Theme</p>
        <p className="mt-0.5 text-xs text-text-placeholder">
          {dark ? 'Dark mode is on' : 'Light mode is on'}
        </p>
      </div>
      <div className="flex overflow-hidden rounded-md border border-border">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => { if (!opt.active) toggle(); }}
            aria-pressed={opt.active}
            className={`flex touch-manipulation items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors
              ${opt.active
                ? 'bg-primary text-white'
                : 'bg-surface-raised text-text-subtle hover:bg-surface hover:text-text'
              }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Editable Display name row ───────────────────────────────────────────────

function EditableNameRow({ user, qc }: {
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  qc:   ReturnType<typeof useQueryClient>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(user.name ?? '');
  const [error, setError]     = useState('');

  // Keep draft in sync when store data changes (post-hydrate, org switch, etc.)
  useEffect(() => { setDraft(user.name ?? ''); }, [user.name]);

  const mutation = useMutation({
    mutationFn: async (newName: string) => {
      logger.info('SettingsPage', 'Updating your display name', { userId: user.id });
      try {
        const res = await api.patch<ApiResponse<unknown>>('/me', { name: newName });
        if (!res.data.success) throw new Error(res.data.error || 'Failed to update profile');
        return res.data;
      } catch (err) {
        throw new Error(extractAxiosError(err, 'Failed to update profile'));
      }
    },
    onSuccess: async () => {
      logger.info('SettingsPage', 'Display name saved — refreshing your account', { userId: user.id });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await useAuthStore.getState().hydrate();
      toast.success('Profile updated');
      setEditing(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not update profile';
      logger.error('SettingsPage', 'Could not update your display name', { userId: user.id, error: msg });
      setError(msg);
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = draft.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      setError(`Name must be ${NAME_MIN}-${NAME_MAX} characters`);
      return;
    }
    if (trimmed === (user.name ?? '')) {
      setError('Nothing to save - name is unchanged');
      return;
    }
    mutation.mutate(trimmed);
  }

  function handleCancel() {
    setDraft(user.name ?? '');
    setError('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <span className="text-text-subtle">Display name</span>
        <div className="flex items-center gap-3">
          <span className="truncate text-right font-medium text-text">
            {user.name?.trim() || <span className="italic text-text-placeholder">Not set</span>}
          </span>
          <button
            type="button"
            onClick={() => { setEditing(true); setError(''); }}
            className="cursor-pointer rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="px-5 py-4 space-y-3">
      <label htmlFor="profile-name" className="block text-xs font-medium text-text-subtle">
        Display name
      </label>
      <input
        id="profile-name"
        type="text"
        autoComplete="name"
        autoFocus
        value={draft}
        onChange={e => { setDraft(e.target.value); if (error) setError(''); }}
        placeholder="Your name"
        disabled={mutation.isPending}
        // 20-char cap matches backend NAME_MAX. The HTML attribute prevents
        // typing past the limit so users hit a visible stop, not a
        // surprise 400 on save.
        maxLength={20}
        className={`h-9 w-full rounded-md border bg-surface px-3 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${error ? 'border-danger' : 'border-border'}`}
      />
      <p className="text-[10px] text-text-placeholder">{draft.length}/20</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={handleCancel}
          disabled={mutation.isPending}
          className="cursor-pointer rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="cursor-pointer rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Editable Org name row (owner + admin only) ─────────────────────────────

function EditableOrgNameRow({ orgId, orgName, userId, qc }: {
  orgId:   string;
  orgName: string;
  userId:  string;
  qc:      ReturnType<typeof useQueryClient>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(orgName);
  const [error, setError]     = useState('');

  useEffect(() => { setDraft(orgName); }, [orgName]);

  const mutation = useMutation({
    mutationFn: async (newName: string) => {
      logger.info('SettingsPage', 'Updating the organization name', { userId, orgId });
      try {
        const res = await api.patch<ApiResponse<unknown>>(`/orgs/${orgId}`, { name: newName });
        if (!res.data.success) throw new Error(res.data.error || 'Failed to update organization');
        return res.data;
      } catch (err) {
        throw new Error(extractAxiosError(err, 'Failed to update organization'));
      }
    },
    onSuccess: async () => {
      logger.info('SettingsPage', 'Organization name saved — refreshing your account', { userId, orgId });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await useAuthStore.getState().hydrate();
      toast.success('Organization updated');
      setEditing(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not update organization';
      logger.error('SettingsPage', 'Could not update the organization name', { userId, orgId, error: msg });
      setError(msg);
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = draft.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      setError('Org name must be 2-100 characters');
      return;
    }
    if (trimmed === orgName) {
      setError('Nothing to save - name is unchanged');
      return;
    }
    mutation.mutate(trimmed);
  }

  function handleCancel() {
    setDraft(orgName);
    setError('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <span className="text-text-subtle">Name</span>
        <div className="flex items-center gap-3">
          <span className="truncate text-right font-medium text-text">{orgName}</span>
          <button
            type="button"
            onClick={() => { setEditing(true); setError(''); }}
            className="cursor-pointer rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="px-5 py-4 space-y-3">
      <label htmlFor="org-name" className="block text-xs font-medium text-text-subtle">
        Organization name
      </label>
      <input
        id="org-name"
        type="text"
        autoFocus
        value={draft}
        onChange={e => { setDraft(e.target.value); if (error) setError(''); }}
        placeholder="Organization name"
        disabled={mutation.isPending}
        className={`h-9 w-full rounded-md border bg-surface px-3 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${error ? 'border-danger' : 'border-border'}`}
      />
      <p className="text-xs text-text-placeholder">
        The org identifier (@slug) stays the same - invite links and URLs are unaffected.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={handleCancel}
          disabled={mutation.isPending}
          className="cursor-pointer rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="cursor-pointer rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Change-password row ─────────────────────────────────────────────────────
//
// Three-state machine, all in-place (no navigation, no logout):
//   1. closed              - read-only row with [Change] button
//   2. open + mode='change' - current/new/confirm form with [Cancel] [Update]
//                             "Forgot your password?" link triggers mode='reset'
//   3. open + mode='reset'  - code/new/confirm form with [Cancel] [Reset]
//                             "Resend code" link + "Back to change" link
//
// Why in-place: redirecting to /auth/forgot-password from a logged-in session
// strands the user on an auth page with no Back, makes them feel signed out,
// and any "Sign in" link drops them on /auth/login instead of back to Settings.
// Industry standard (Slack, Linear, Notion) is to handle reset inline when the
// user is already authenticated.

type PasswordMode = 'change' | 'reset';

function ChangePasswordRow({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [open, setOpen]               = useState(false);
  const [mode, setMode]               = useState<PasswordMode>('change');

  // Change-mode fields
  const [currentPwd, setCurrentPwd]   = useState('');

  // Reset-mode fields
  const [code, setCode]               = useState('');
  const [codeSent, setCodeSent]       = useState(false);

  // Shared
  const [newPwd, setNewPwd]           = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]             = useState('');

  // ── Change-password mutation (Cognito ChangePassword) ──────────────────
  const changeMutation = useMutation({
    mutationFn: async (payload: { current: string; next: string }) => {
      logger.info('SettingsPage', 'Changing your password', { userId });
      await changePassword(payload.current, payload.next);
    },
    onSuccess: () => {
      logger.info('SettingsPage', 'Password changed successfully', { userId });
      toast.success('Password changed');
      closeAndReset();
    },
    onError: (err: unknown) => {
      const msg = parseCognitoPasswordError(err);
      logger.error('SettingsPage', 'Could not change your password', { userId, error: msg });
      setError(msg);
    },
  });

  // ── Forgot-password kickoff (sends email code) ──────────────────────────
  const sendCode = useMutation({
    mutationFn: async () => {
      logger.info('SettingsPage', 'Sending a password-reset code to your email', { userId, email: userEmail });
      await forgotPassword(userEmail);
    },
    onSuccess: () => {
      logger.info('SettingsPage', 'Password-reset code sent', { userId });
      setCodeSent(true);
      toast.success(`Code sent to ${userEmail}`);
    },
    onError: (err: unknown) => {
      const msg = parseCognitoForgotError(err);
      logger.error('SettingsPage', 'Could not send the password-reset code', { userId, error: msg });
      setError(msg);
    },
  });

  // ── Confirm-forgot (code + new password) ────────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: async (payload: { code: string; next: string }) => {
      logger.info('SettingsPage', 'Resetting your password with the emailed code', { userId });
      await confirmForgotPassword(userEmail, payload.code, payload.next);
    },
    onSuccess: () => {
      logger.info('SettingsPage', 'Password reset successfully', { userId });
      toast.success('Password reset. You stay signed in.');
      closeAndReset();
    },
    onError: (err: unknown) => {
      const msg = parseCognitoForgotError(err);
      logger.error('SettingsPage', 'Could not reset your password', { userId, error: msg });
      setError(msg);
    },
  });

  const busy = changeMutation.isPending || sendCode.isPending || confirmMutation.isPending;

  function closeAndReset() {
    setOpen(false);
    setMode('change');
    setCurrentPwd('');
    setCode('');
    setCodeSent(false);
    setNewPwd('');
    setConfirmPwd('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError('');
  }

  function switchToReset() {
    setMode('reset');
    setError('');
    setCurrentPwd('');
    // Don't auto-fire sendCode here - user gets a confirm step first so we
    // never send an email purely from a misclick.
  }

  function switchBackToChange() {
    setMode('change');
    setError('');
    setCode('');
    setCodeSent(false);
  }

  function handleChangeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!currentPwd) { setError('Enter your current password'); return; }
    if (newPwd.length < PASSWORD_MIN) { setError(`New password must be at least ${PASSWORD_MIN} characters`); return; }
    if (newPwd !== confirmPwd) { setError('New password and confirmation do not match'); return; }
    if (newPwd === currentPwd) { setError('New password must be different from current password'); return; }
    changeMutation.mutate({ current: currentPwd, next: newPwd });
  }

  function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!code.trim()) { setError('Enter the code we emailed you'); return; }
    if (newPwd.length < PASSWORD_MIN) { setError(`New password must be at least ${PASSWORD_MIN} characters`); return; }
    if (newPwd !== confirmPwd) { setError('New password and confirmation do not match'); return; }
    confirmMutation.mutate({ code: code.trim(), next: newPwd });
  }

  // ── Render: closed ───────────────────────────────────────────────────────
  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <div>
          <p className="text-text-subtle">Password</p>
          <p className="text-xs text-text-placeholder">••••••••</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
        >
          Change
        </button>
      </div>
    );
  }

  // ── Render: open, reset mode + confirm step (before code is sent) ───────
  if (mode === 'reset' && !codeSent && !sendCode.isPending) {
    return (
      <div className="px-5 py-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-text">Reset password via email</p>
          <p className="text-xs text-text-subtle">
            We'll send a verification code to <span className="font-medium text-text">{userEmail}</span>.
            You'll use it to set a new password - you stay signed in throughout.
          </p>
        </div>
        {error && (
          <div className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={switchBackToChange}
            disabled={busy}
            className="cursor-pointer text-xs text-text-link hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            ← Back to change password
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeAndReset}
              disabled={busy}
              className="cursor-pointer rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => sendCode.mutate()}
              disabled={busy}
              className="cursor-pointer rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send code
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: open, reset mode + code sent (or sending) ───────────────────
  if (mode === 'reset') {
    return (
      <form onSubmit={handleResetSubmit} className="px-5 py-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-text">Reset password via email</p>
          <p className="text-xs text-text-placeholder">
            {sendCode.isPending
              ? `Sending code to ${userEmail}…`
              : `We sent a code to ${userEmail}. Enter it below with your new password.`}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reset-code" className="text-xs font-medium text-text-subtle">Verification code</label>
          <input
            id="reset-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={e => { setCode(e.target.value); if (error) setError(''); }}
            placeholder="123456"
            disabled={busy}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <div className="text-right">
            <button
              type="button"
              onClick={() => sendCode.mutate()}
              disabled={busy}
              className="cursor-pointer text-xs text-text-link hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendCode.isPending ? 'Sending…' : 'Resend code'}
            </button>
          </div>
        </div>

        <PasswordField
          id="reset-new-password"
          label="New password"
          value={newPwd}
          onChange={v => { setNewPwd(v); if (error) setError(''); }}
          show={showNew}
          onToggleShow={() => setShowNew(v => !v)}
          disabled={busy}
          autoComplete="new-password"
        />
        <PasswordField
          id="reset-confirm-password"
          label="Confirm new password"
          value={confirmPwd}
          onChange={v => { setConfirmPwd(v); if (error) setError(''); }}
          show={showConfirm}
          onToggleShow={() => setShowConfirm(v => !v)}
          disabled={busy}
          autoComplete="new-password"
        />

        {error && (
          <div className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={switchBackToChange}
            disabled={busy}
            className="cursor-pointer text-xs text-text-link hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            ← Back to change password
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeAndReset}
              disabled={busy}
              className="cursor-pointer rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !code || !newPwd || !confirmPwd}
              className="cursor-pointer rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirmMutation.isPending ? 'Resetting…' : 'Reset password'}
            </button>
          </div>
        </div>
      </form>
    );
  }

  // ── Render: open, change mode (default) ──────────────────────────────────
  return (
    <form onSubmit={handleChangeSubmit} className="px-5 py-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-text">Change password</p>
        <p className="text-xs text-text-placeholder">Minimum {PASSWORD_MIN} characters.</p>
      </div>

      <div className="space-y-1.5">
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPwd}
          onChange={v => { setCurrentPwd(v); if (error) setError(''); }}
          show={showCurrent}
          onToggleShow={() => setShowCurrent(v => !v)}
          disabled={busy}
          autoComplete="current-password"
        />
        <div className="text-right">
          <button
            type="button"
            onClick={switchToReset}
            disabled={busy}
            className="cursor-pointer text-xs text-text-link hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Forgot your password?
          </button>
        </div>
      </div>
      <PasswordField
        id="new-password"
        label="New password"
        value={newPwd}
        onChange={v => { setNewPwd(v); if (error) setError(''); }}
        show={showNew}
        onToggleShow={() => setShowNew(v => !v)}
        disabled={busy}
        autoComplete="new-password"
      />
      <PasswordField
        id="confirm-password"
        label="Confirm new password"
        value={confirmPwd}
        onChange={v => { setConfirmPwd(v); if (error) setError(''); }}
        show={showConfirm}
        onToggleShow={() => setShowConfirm(v => !v)}
        disabled={busy}
        autoComplete="new-password"
      />

      {error && (
        <div className="rounded border border-danger bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={closeAndReset}
          disabled={busy}
          className="cursor-pointer rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !currentPwd || !newPwd || !confirmPwd}
          className="cursor-pointer rounded bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {changeMutation.isPending ? 'Updating…' : 'Update'}
        </button>
      </div>
    </form>
  );
}

// ── Switch organization section ─────────────────────────────────────────────

// Owner-only row in the Current organization section. Mirrors the Eye/EyeOff
// toggle in the "Other organizations" peer list, just scoped to THIS org.
// Necessary because the peer list filters out the current org - without this
// row, an owner of the current org would have no way to hide it.
function DiscoverabilityRow({ orgId, orgName, discoverable }: {
  orgId:        string;
  orgName:      string;
  discoverable: boolean;
}) {
  const { mutate: toggle, isPending } = useToggleOrgDiscoverable();
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
      <div className="min-w-0">
        <p className="text-text-subtle">Discoverability</p>
        <p className="mt-0.5 text-xs text-text-placeholder">
          {discoverable
            ? `Other users with your email domain can see ${orgName} in their domain peer list.`
            : `${orgName} is hidden from other users in your email domain.`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => toggle({ orgId, discoverable: !discoverable })}
        disabled={isPending}
        title={
          discoverable
            ? 'Hide this org from others in your email domain'
            : 'Make this org visible to others in your email domain'
        }
        className={`flex h-7 flex-shrink-0 cursor-pointer items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          discoverable
            ? 'border-primary/40 text-primary hover:bg-primary-subtle'
            : 'border-warning/40 text-warning hover:bg-warning/10'
        }`}
      >
        {discoverable ? <Eye size={13} /> : <EyeOff size={13} />}
        <span>{discoverable ? 'Visible' : 'Hidden'}</span>
      </button>
    </div>
  );
}

// Settings reference for the dashboard's domain-peer banner. Always visible
// (never dismissable) so dismissing the dashboard banner doesn't permanently
// hide the info. Renders nothing if there are no peers.
//
// Per-row controls:
//   - Pin / PinOff: dashboard banner visibility for the caller (per-user
//     localStorage). DISABLED when the caller is an OWNER of that peer org -
//     they always see their own orgs via the switcher; banner pin is moot.
//   - Eye / EyeOff: discoverability toggle - OWNER-ONLY, only rendered for
//     peer orgs the caller owns. Off → the org disappears from OTHER users'
//     domain-peer banners + Settings lists. The owner still sees it here.
function DomainPeersSection({ currentOrgId, userId }: { currentOrgId: string | null; userId: string }) {
  const { data: peerOrgs = [] } = useDomainPeers();
  const { dismissed, dismiss, undismiss } = useDismissedDomainPeers(userId);
  const memberships = useAuthStore(s => s.memberships);
  const { mutate: toggleDiscoverable, isPending: toggling } = useToggleOrgDiscoverable();

  const filtered = peerOrgs.filter(p => p.id !== currentOrgId);
  if (filtered.length === 0) return null;

  // Quick lookup: which peer orgs does the caller own?
  const ownedPeerIds = new Set(
    memberships.filter(m => m.role === 'owner').map(m => m.org_id),
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
      <SectionHeader
        icon={Building2}
        title="Other organizations in your email domain"
        description="Workspaces sharing your email domain. Pin one to keep it on the dashboard, hide to remove from your dashboard banner. Owners see an extra toggle to make their org invisible to others in the domain."
      />
      <ul className="divide-y divide-border">
        {filtered.map(p => {
          const isDismissed = dismissed.includes(p.id);
          const isOwnedByMe = ownedPeerIds.has(p.id);
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex items-center gap-2">
                <span className="truncate text-text">{p.name}</span>
                {isOwnedByMe && (
                  <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-text-placeholder">
                    yours
                  </span>
                )}
                {isOwnedByMe && !p.discoverable && (
                  <span className="flex-shrink-0 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-warning">
                    hidden
                  </span>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {/* Pin / PinOff - per-user banner control. Disabled for
                    orgs you own (your own orgs aren't shown in the banner
                    anyway). */}
                <button
                  type="button"
                  onClick={() => !isOwnedByMe && (isDismissed ? undismiss(p.id) : dismiss([p.id]))}
                  disabled={isOwnedByMe}
                  title={
                    isOwnedByMe
                      ? "You own this org - it's not shown in your dashboard banner anyway"
                      : isDismissed
                      ? 'Pin to dashboard banner'
                      : 'Hide from dashboard banner'
                  }
                  className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isOwnedByMe
                      ? 'text-text-placeholder'
                      : isDismissed
                      ? 'text-text-placeholder hover:bg-surface hover:text-primary'
                      : 'text-primary hover:bg-primary-subtle'
                  }`}
                >
                  {isDismissed ? <PinOff size={14} /> : <Pin size={14} />}
                </button>

                {/* Eye / EyeOff - owner-only org visibility toggle. */}
                {isOwnedByMe && (
                  <button
                    type="button"
                    onClick={() => toggleDiscoverable({ orgId: p.id, discoverable: !p.discoverable })}
                    disabled={toggling}
                    title={
                      p.discoverable
                        ? 'Hide this org from others in your email domain'
                        : 'Make this org visible to others in your email domain'
                    }
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      p.discoverable
                        ? 'text-primary hover:bg-primary-subtle'
                        : 'text-warning hover:bg-warning/10'
                    }`}
                  >
                    {p.discoverable ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SwitchOrgSection({ memberships, otherOrgs, userId, router }: {
  memberships: ReturnType<typeof useAuthStore.getState>['memberships'];
  otherOrgs:   ReturnType<typeof useAuthStore.getState>['memberships'];
  userId:      string;
  router:      ReturnType<typeof useRouter>;
  qc:          ReturnType<typeof useQueryClient>;
}) {
  // Org switch = FULL PAGE RELOAD via window.location.assign. Matches the
  // Header switcher pattern. Failsafe against cache/zustand timing races
  // that surfaced with router.push. Toast queued via sessionStorage so it
  // survives the reload.
  function handleSwitch(targetOrgId: string) {
    const target = memberships.find(m => m.org_id === targetOrgId);
    if (!target) {
      logger.warn('SettingsPage', 'Tried to switch to an org you no longer belong to — ignoring', { userId, targetOrgId });
      return;
    }
    logger.info('SettingsPage', 'Switching organization (full page reload)', { userId, toOrgId: target.org_id, toSlug: target.org_slug });
    enqueueToast({ kind: 'success', message: `Switched to ${target.org_name}` });
    window.location.assign(orgRoute(target.org_slug, '/dashboard'));
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm">
      <SectionHeader
        icon={ArrowRightLeft}
        title="Switch organization"
        description={`You belong to ${memberships.length} organizations.`}
      />
      <div className="divide-y divide-border">
        {otherOrgs.map(m => (
          <div key={m.org_id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{m.org_name}</p>
              <p className="truncate text-xs text-text-placeholder">@{m.org_slug}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-text-subtle">
                <span>{m.role_label ?? m.role}</span>
                <span className={roleChipClass(m.role, 'sm')}>
                  {m.role}
                </span>
                <SubscriptionStatusChip status={m.subscription_status} size="xs" />
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSwitch(m.org_id)}
              className="flex-shrink-0 cursor-pointer rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary hover:text-primary"
            >
              Switch
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Reusable password field ─────────────────────────────────────────────────

function PasswordField({
  id, label, value, onChange, show, onToggleShow, disabled, autoComplete,
}: {
  id:           string;
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  show:         boolean;
  onToggleShow: () => void;
  disabled?:    boolean;
  autoComplete: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-text-subtle">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="••••••••"
          disabled={disabled}
          className="h-9 w-full rounded-md border border-border bg-surface px-3 pr-10 text-sm text-text outline-none transition-colors placeholder:text-text-placeholder focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-text-placeholder transition-colors hover:text-text-subtle"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

// ── Error helpers ──────────────────────────────────────────────────────────

function extractAxiosError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const body = err.response.data as { error?: string };
    if (body.error) return body.error;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function parseCognitoPasswordError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotAuthorizedException')    return 'Current password is incorrect';
    if (err.name === 'InvalidPasswordException')  return err.message || 'New password does not meet the policy';
    if (err.name === 'LimitExceededException')    return 'Too many attempts - try again in a few minutes';
    if (err.name === 'InvalidParameterException') return err.message || 'Invalid password format';
    return err.message || 'Could not change password';
  }
  return 'Could not change password';
}

function parseCognitoForgotError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'CodeMismatchException')     return 'Incorrect code. Try again.';
    if (err.name === 'ExpiredCodeException')      return 'Code expired. Click "Resend code" for a new one.';
    if (err.name === 'InvalidPasswordException')  return err.message || 'New password does not meet the policy';
    if (err.name === 'LimitExceededException')    return 'Too many attempts - try again in a few minutes';
    if (err.name === 'UserNotFoundException')     return 'No account found for this email';
    if (err.name === 'InvalidParameterException') return err.message || 'Invalid request';
    return err.message || 'Could not reset password';
  }
  return 'Could not reset password';
}
