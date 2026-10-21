'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { Mail, Users, UserPlus, Clock, Trash2, X, ChevronDown } from '@/lib/icons';
import { useAuthStore } from '@/store/auth.store';
import { useTeamMembers, useUpdateMemberRole, useDeleteMember } from '@/hooks/useTeam';
import api from '@/lib/api';
import { logger } from '@/lib/logger';
import { PageError } from '@/components/ui/PageError';
import { InviteMemberModal } from '@/components/modals/InviteMemberModal';
import { confirmModal } from '@/lib/confirmModal';
import { roleChipClass } from '@/lib/role.utils';
import type { ApiResponse, Member } from '@/types/api.types';

// Unified Team page - combines what was previously split across two pages:
//   - Old /team       → member list (view-only)
//   - Old /admin      → role + remove controls (owner/admin only)
// One page now, admin controls render inline when the caller has the role.
// Industry-standard pattern (Slack "People" / Linear "Members" / GitHub
// "Org People"). The duplicate /admin route 301s to /team; sidebar drops
// the "Admin" link since this page covers everything.
//
// Permission gates here mirror the backend (orgs.controller.ts):
//   - Self-edit label  → any role (no role-type change)
//   - Edit others      → owner / admin only, non-owner targets
//   - Remove others    → owner / admin only, non-owner targets
//   - Invite members   → owner / admin / PM (rbac.md §Org-level actions)
//   - View members     → any org member

type AssignableRole = 'admin' | 'project_manager' | 'user';
type AnyRole        = 'owner' | AssignableRole;
const ROLE_TYPES: AssignableRole[] = ['admin', 'project_manager', 'user'];
const ROLE_TYPE_LABEL: Record<AnyRole, string> = {
  owner:           'Owner',
  admin:           'Admin',
  project_manager: 'Project Manager',
  user:            'User',
};

interface PendingInvite {
  id:               string;
  invited_email:    string;
  role:             AssignableRole;
  invited_by_name:  string | null;
  invited_by_email: string;
  expires_at:       string;
  created_at:       string;
}

// Member sort + filter typing. Kept at module scope so the option arrays
// don't rebuild every render.
type RoleFilter = 'all' | 'owner' | 'admin' | 'project_manager' | 'user';
type MemberSort = 'default' | 'name' | 'role' | 'joinedNewest' | 'joinedOldest';

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all',             label: 'All'     },
  { value: 'owner',           label: 'Owner'   },
  { value: 'admin',           label: 'Admin'   },
  { value: 'project_manager', label: 'PM'      },
  { value: 'user',            label: 'User'    },
];

const SORT_LABEL: Record<MemberSort, string> = {
  default:      'Default (owner first)',
  name:         'Name (A→Z)',
  role:         'Role',
  joinedNewest: 'Joined (newest)',
  joinedOldest: 'Joined (oldest)',
};

// Role priority for sort=role. Mirrors the backend's listMembersForOrg
// CASE expression so "Role" sort puts owner→admin→PM→user from top down.
const ROLE_RANK: Record<AnyRole, number> = {
  owner:           0,
  admin:           1,
  project_manager: 2,
  user:            3,
};

export default function TeamPage() {
  const qc           = useQueryClient();
  const user         = useAuthStore(s => s.user);
  const memberships  = useAuthStore(s => s.memberships);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Sort + filter state. Default sort preserves backend ordering (owner
  // first, then by join date ASC), so the page renders identically to
  // before until the caller actively changes either control.
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [sort,       setSort]       = useState<MemberSort>('default');

  const current = memberships.find(m => m.org_id === user?.currentOrgId);
  const orgId   = current?.org_id ?? null;
  const callerRole = current?.role;
  const isOwnerOrAdmin   = callerRole === 'owner' || callerRole === 'admin';
  const canManageInvites = isOwnerOrAdmin || callerRole === 'project_manager';

  // useTeamMembers handles the org-scoped queryKey + cache invalidation; same
  // hook the Admin page used so the cache stays unified when other pages
  // mutate roles (Settings ownership transfer, this page's edits, etc.).
  const { data: members, isLoading, error, refetch } = useTeamMembers();

  // Derived list. Filter → sort. Memoized so unrelated re-renders (invite
  // modal open/close, mutation in-flight) don't re-sort the full list.
  const visibleMembers = useMemo(() => {
    if (!members) return [];
    const filtered = roleFilter === 'all'
      ? members
      : members.filter(m => m.role_type === roleFilter);
    if (sort === 'default') return filtered;
    const sorted = [...filtered];
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'role') {
      // Stable role-then-name so within each tier members read alphabetically.
      sorted.sort((a, b) => {
        const r = (ROLE_RANK[a.role_type as AnyRole] ?? 99) - (ROLE_RANK[b.role_type as AnyRole] ?? 99);
        return r !== 0 ? r : a.name.localeCompare(b.name);
      });
    } else if (sort === 'joinedNewest' || sort === 'joinedOldest') {
      const dir = sort === 'joinedNewest' ? -1 : 1;
      sorted.sort((a, b) => {
        const aT = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
        const bT = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
        return (aT - bT) * dir;
      });
    }
    return sorted;
  }, [members, roleFilter, sort]);

  // Counts shown next to each filter chip — based on the unfiltered set
  // so the chip labels report total org composition, not the filtered view.
  const roleCounts = useMemo(() => {
    const base: Record<RoleFilter, number> = {
      all: members?.length ?? 0,
      owner: 0, admin: 0, project_manager: 0, user: 0,
    };
    members?.forEach(m => { base[m.role_type as RoleFilter] = (base[m.role_type as RoleFilter] ?? 0) + 1; });
    return base;
  }, [members]);

  const pendingQuery = useQuery({
    queryKey: ['pending-invites', orgId],
    queryFn: async () => {
      logger.info('TeamPage', 'Loading pending invites for this org', { userId: user!.id, orgId });
      const res = await api.get<ApiResponse<{ invites: PendingInvite[] }>>(`/orgs/${orgId}/invites?status=pending`);
      if (!res.data.success) throw new Error(res.data.error || 'Failed to load pending invites');
      return res.data.data.invites;
    },
    enabled: Boolean(orgId) && canManageInvites,
    retry:   false,
  });

  const revoke = useMutation({
    mutationFn: async (inviteId: string) => {
      logger.info('TeamPage', 'Revoking a pending invite', { userId: user!.id, inviteId });
      try {
        const res = await api.post<ApiResponse<unknown>>(`/invites/${inviteId}/revoke`);
        if (!res.data.success) throw new Error(res.data.error || 'Failed to revoke invite');
      } catch (err) {
        throw new Error(extractAxiosError(err, 'Failed to revoke invite'));
      }
    },
    onSuccess: () => {
      toast.success('Invite cancelled');
      qc.invalidateQueries({ queryKey: ['pending-invites', orgId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Could not revoke invite');
    },
  });

  if (!user || !current || !orgId) return null;

  const currentUserId = String(user.id);

  // Two-column mode kicks in when the org is big enough that scrolling
  // through 50+ members AND a pending-invites section stacked vertically
  // becomes annoying. Pending-invites column is narrower (3/10) — it's
  // just emails + cancel buttons, doesn't need much room. Member column
  // (7/10) keeps inline-edit forms working. Below 50 members OR when the
  // caller can't manage invites, single-column stays.
  const wideLayout =
    !!members && members.length > 50 && canManageInvites;

  // Extracted so we can place them either stacked or side-by-side
  // without duplicating the rendering.
  const membersSection = isLoading ? (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-sunken" />
      ))}
    </div>
  ) : error ? (
    <PageError message="Failed to load team members" onRetry={refetch} />
  ) : members && members.length > 0 ? (
    visibleMembers.length > 0 ? (
      <section className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm divide-y divide-border">
        {visibleMembers.map(m => (
          <MemberRow
            key={m.id}
            member={m}
            currentUserId={currentUserId}
            isOwnerOrAdmin={isOwnerOrAdmin}
          />
        ))}
      </section>
    ) : (
      <p className="rounded-lg border border-dashed border-border bg-surface-raised px-4 py-6 text-center text-sm text-text-subtle">
        No {ROLE_FILTERS.find(f => f.value === roleFilter)?.label.toLowerCase()} members.
      </p>
    )
  ) : (
    <p className="rounded-lg border border-dashed border-border bg-surface-raised px-4 py-6 text-center text-sm text-text-subtle">
      No members yet.
    </p>
  );

  const pendingInvitesSection = canManageInvites && (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Clock size={14} className="text-text-subtle" />
        <h2 className="text-sm font-semibold text-text">Pending invites</h2>
        {pendingQuery.data && pendingQuery.data.length > 0 && (
          <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-placeholder">
            {pendingQuery.data.length}
          </span>
        )}
      </div>

      {pendingQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map(i => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
      ) : pendingQuery.isError ? (
        <PageError message="Failed to load pending invites" onRetry={() => pendingQuery.refetch()} />
      ) : pendingQuery.data && pendingQuery.data.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-raised shadow-sm divide-y divide-border">
          {pendingQuery.data.map(inv => (
            <PendingInviteRow
              key={inv.id}
              invite={inv}
              onRevoke={async () => {
                // Modal confirmation — see [[feedback_confirm_before_sensitive_action]].
                // The inline two-step we tried before blew up this row's
                // layout when the right column was narrow (35% / 30%).
                // A centered modal keeps the row stable and gives more
                // room to explain consequences.
                const ok = await confirmModal({
                  title:        'Revoke this invite?',
                  description:  `${inv.invited_email} won't be able to accept the email link any more. They'll see a "no longer valid" message if they try. You can always invite them again.`,
                  confirmLabel: 'Revoke invite',
                  cancelLabel:  'Keep invite',
                  variant:      'danger',
                });
                if (ok) revoke.mutate(inv.id);
              }}
              busy={revoke.isPending}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-surface-raised px-4 py-6 text-center text-sm text-text-subtle">
          No pending invites.
        </p>
      )}
    </section>
  );

  return (
    <div className={`px-4 sm:px-8 py-6 space-y-6 ${wideLayout ? 'max-w-7xl' : 'max-w-3xl'}`}>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Users size={18} className="text-text-subtle flex-shrink-0" />
          <h1 className="text-xl font-semibold text-text">Team</h1>
          {members && (
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-placeholder">
              {members.length === 1 ? '1 member' : `${members.length} members`}
            </span>
          )}
        </div>

        {canManageInvites && (
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            <UserPlus size={13} />
            <span className="hidden sm:inline">Invite member</span>
            <span className="sm:hidden">Invite</span>
          </button>
        )}
      </div>

      {/* Filter toolbar — spans the FULL page width above the grid so the
          two columns below start with content at the same baseline. Putting
          the filters inside the left (members) column pushed the member
          list down by the toolbar's height, breaking alignment with the
          pending-invites header on the right. Full-width here keeps the
          column tops flush. Hidden when there are no members to filter. */}
      {!isLoading && members && members.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-surface-raised p-0.5">
            {ROLE_FILTERS.map(f => {
              const active = roleFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setRoleFilter(f.value)}
                  className={`flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-primary-subtle text-primary'
                      : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
                  }`}
                >
                  {f.label}
                  <span className="text-text-placeholder/70">{roleCounts[f.value]}</span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as MemberSort)}
              className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-surface-raised pl-3 pr-7 text-xs font-medium text-text-subtle outline-none transition-colors hover:text-text focus:border-primary/60"
              title="Sort members"
            >
              {(Object.keys(SORT_LABEL) as MemberSort[]).map(k => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-placeholder" />
          </div>
        </div>
      )}

      {wideLayout ? (
        // 65/35 grid for large orgs (was 70/30). The pending-invites column
        // was getting too narrow at 30% — once you stack the inviter line +
        // role chip + revoke control, the email truncated to "…" with no way
        // to see who you'd invited. 35% gives the email enough room without
        // stealing meaningful width from the member list. Mobile/narrow
        // always stacks; the lg: prefix kicks in only at desktop widths.
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-20 lg:gap-8 lg:items-start">
          <div className="lg:col-span-13 min-w-0">{membersSection}</div>
          <div className="lg:col-span-7 min-w-0 lg:sticky lg:top-20">{pendingInvitesSection}</div>
        </div>
      ) : (
        <>
          {membersSection}
          {pendingInvitesSection}
        </>
      )}

      {inviteOpen && <InviteMemberModal orgId={orgId} onClose={() => setInviteOpen(false)} />}

    </div>
  );
}

// ── Member row with inline edit + remove (formerly the Admin page) ─────────

function MemberRow({ member, currentUserId, isOwnerOrAdmin }: {
  member:          Member;
  currentUserId:   string;
  isOwnerOrAdmin:  boolean;
}) {
  const initialRole: AnyRole = member.role_type as AnyRole;

  const [editingRole, setEditingRole] = useState(false);
  const [roleType,    setRoleType]    = useState<AnyRole>(initialRole);
  const [roleName,    setRoleName]    = useState(member.role_name);
  const [showDelete,  setShowDelete]  = useState(false);

  const { mutate: updateRole,   isPending: isUpdating } = useUpdateMemberRole();
  const { mutate: deleteMember, isPending: isDeleting } = useDeleteMember();

  const isSelf  = member.id === currentUserId;
  const isOwner = member.role_type === 'owner';

  // Three-way permission gate - mirrors backend exactly:
  //   canEditLabel  → self (incl. owner-self) OR any non-owner target seen by owner/admin
  //   canEditType   → owner/admin only, non-owner targets, never self
  //   canRemove     → same as canEditType
  const canEditLabel = isSelf || (isOwnerOrAdmin && !isOwner);
  const canEditType  = isOwnerOrAdmin && !isSelf && !isOwner;
  const canRemove    = isOwnerOrAdmin && !isSelf && !isOwner;

  function handleSaveRole() {
    const payload: { memberId: string; role_type?: AnyRole; role_name?: string } = {
      memberId:  member.id,
      role_name: roleName.trim(),
    };
    if (canEditType) payload.role_type = roleType;
    updateRole(payload, { onSuccess: () => setEditingRole(false) });
  }

  function handleCancelEdit() {
    setEditingRole(false);
    setRoleType(initialRole);
    setRoleName(member.role_name);
  }

  function handleDelete() {
    deleteMember(member.id, { onSuccess: () => setShowDelete(false) });
  }

  return (
    <>
      {/* Mobile-first row: stacks vertically on narrow screens, side-by-side
          on sm+. Right cluster (role chip + buttons) was previously fixed at
          280px which overflowed phones. Now responsive. */}
      <div className={`flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-${editingRole ? 'start' : 'center'} sm:gap-4 sm:px-5`}>
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-0 sm:flex-1">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white ${editingRole ? 'sm:mt-0.5' : ''}`}>
            {member.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-text">
              {member.name}
              {isSelf && <span className="ml-1.5 text-xs font-normal text-text-placeholder">(you)</span>}
            </p>
            <span className="flex items-center gap-1 text-[11px] text-text-placeholder">
              <Mail size={10} className="flex-shrink-0" />
              <span className="truncate">{member.email}</span>
            </span>
          </div>
        </div>

        {/* Right cluster - role + actions. On mobile this drops below the
            identity block and stretches full width; on sm+ it sits inline. */}
        <div className="flex w-full items-stretch justify-end gap-2 sm:w-auto sm:flex-shrink-0">
          {editingRole ? (
            <>
              <div className="flex flex-1 flex-col gap-1.5 sm:w-[180px] sm:flex-none">
                <select
                  value={roleType}
                  onChange={e => setRoleType(e.target.value as AnyRole)}
                  disabled={!canEditType}
                  title={!canEditType ? (isOwner ? 'Owner role can only be changed via ownership transfer' : 'You cannot change your own role type') : undefined}
                  className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text outline-none focus:border-primary disabled:bg-surface disabled:text-text-placeholder disabled:cursor-not-allowed"
                >
                  {canEditType ? (
                    ROLE_TYPES.map(r => (
                      <option key={r} value={r}>{ROLE_TYPE_LABEL[r]}</option>
                    ))
                  ) : (
                    <option value={roleType}>{ROLE_TYPE_LABEL[roleType]}</option>
                  )}
                </select>
                <input
                  type="text"
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                  placeholder="Display name"
                  // 20-char cap matches backend ROLE_LABEL_MAX. Keeps the
                  // org-switcher dropdown row + team table chip from
                  // blowing out their layouts.
                  maxLength={20}
                  className="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text outline-none focus:border-primary"
                />
              </div>
              <div className="flex w-[80px] flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={handleSaveRole}
                  disabled={isUpdating || !roleName.trim()}
                  className="flex-1 rounded bg-primary px-2 text-xs font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  {isUpdating ? '…' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex-1 rounded border border-border px-2 text-xs text-text-subtle transition-colors hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Role display — stacked vertically so the custom label and
                  the underlying role type each get their own line, end-
                  aligned. The previous inline layout smashed long labels
                  into the chip (e.g. "asukbdakusbdkabskdbaproject_manager")
                  with no separator, making both unreadable at a glance.
                  Stacked, the label stays primary (top, full text color)
                  and the type chip sits below as compact reference. */}
              <div className="flex flex-1 flex-col items-end justify-center gap-1 sm:w-[180px] sm:flex-none">
                <span className="max-w-full truncate text-xs font-medium text-text">
                  {member.role_name}
                </span>
                <span className={`flex-shrink-0 ${roleChipClass(member.role_type)}`}>
                  {member.role_type}
                </span>
              </div>
              {/* Buttons */}
              <div className="flex flex-shrink-0 items-center justify-end gap-1.5">
                {canEditLabel && (
                  <button
                    onClick={() => setEditingRole(true)}
                    title={isSelf && isOwner ? 'Rename your owner label (Founder, CEO, etc.)' : isSelf ? 'Rename your display label' : 'Edit role + label'}
                    className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:border-primary hover:text-primary"
                  >
                    {isSelf ? 'Edit label' : 'Edit role'}
                  </button>
                )}
                {canRemove && (
                  <button
                    onClick={() => setShowDelete(true)}
                    className="rounded border border-danger/40 bg-surface p-1.5 text-danger transition-colors hover:bg-danger-subtle"
                    title="Remove from organization"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showDelete && (
        <DeleteConfirmModal
          member={member}
          onClose={() => setShowDelete(false)}
          onConfirm={handleDelete}
          isPending={isDeleting}
        />
      )}
    </>
  );
}

// ── Delete confirmation (typed-name gate) ───────────────────────────────────

function DeleteConfirmModal({ member, onClose, onConfirm, isPending }: {
  member:    Member;
  onClose:   () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [input, setInput] = useState('');
  const confirmed = input === member.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-danger">Remove from organization</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-text-placeholder transition-colors hover:bg-surface hover:text-text"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5">
          <p className="text-sm text-text-subtle leading-relaxed">
            This will remove <strong className="text-text">{member.name}</strong> from this organization.
            Their tickets and history stay; their account is not deleted.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-subtle">
              Type <strong className="text-text">{member.name}</strong> to confirm
            </label>
            <input
              autoFocus
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={member.name}
              className="rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text outline-none transition-colors focus:border-danger"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded border border-border px-4 py-2 text-sm text-text-subtle transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!confirmed || isPending}
              className="flex items-center gap-1.5 rounded bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
            >
              <Trash2 size={13} />
              {isPending ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pending invite row ──────────────────────────────────────────────────────

function PendingInviteRow({ invite, onRevoke, busy }: {
  invite:   PendingInvite;
  onRevoke: () => void;
  busy:     boolean;
}) {
  const expiresIn = daysUntil(invite.expires_at);
  // Layout shape: avatar | identity-stack (flex-1) | trash. The role chip
  // sits BELOW the email + invited-by lines so a long email like
  // `smotoxe7424@doreact.com` + "Invited by Novetum Diptanshu …" gets the
  // full content width and doesn't truncate. Previously the chip lived in
  // the right cluster which ate ~120px of inline width — at the 35% column
  // size that left almost nothing for the email.
  //
  // Confirmation lives in a centered modal (parent caller wraps onRevoke
  // with confirmModal). Destructive row actions never inline-confirm in
  // narrow columns — see [[feedback_confirm_before_sensitive_action]].
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
      <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-placeholder">
        <Mail size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text truncate">{invite.invited_email}</p>
        <p className="text-[11px] text-text-placeholder truncate">
          Invited by {invite.invited_by_name || invite.invited_by_email} ·
          expires in {expiresIn === 0 ? 'less than a day' : `${expiresIn} day${expiresIn === 1 ? '' : 's'}`}
        </p>
        <div className="mt-1.5">
          <span className={roleChipClass(invite.role)}>
            {invite.role}
          </span>
        </div>
      </div>
      <button
        onClick={onRevoke}
        disabled={busy}
        title="Cancel this invite"
        aria-label="Cancel this invite"
        className="mt-0.5 flex-shrink-0 rounded p-1.5 text-text-placeholder transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function extractAxiosError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const body = err.response.data as { error?: string };
    if (body.error) return body.error;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
