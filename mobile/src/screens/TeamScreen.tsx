import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { UserPlus, Trash2, X, Mail } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, Avatar, Button, Divider } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/Input';
import { RoleChip } from '@/components/ui/chips';
import { Picker } from '@/components/ui/Picker';
import { Loading, ErrorState, EmptyState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamMembers, useUpdateMemberRole, useRemoveMember } from '@/api/misc';
import { usePendingInvites, useRevokeInvite } from '@/api/invites';
import { useAuthStore, useCurrentRole } from '@/store/authStore';
import { isManagerPlus, isAdminPlus, INVITE_ROLES, ROLE_LABEL } from '@/lib/permissions';
import { confirm } from '@/lib/confirm';
import { InviteMemberModal } from '@/components/modals/InviteMemberModal';
import type { Member, UserRole } from '@/types/api.types';
import type { OrgRole } from '@/types/auth.types';

type SortKey = 'default' | 'name' | 'role' | 'joined_new' | 'joined_old';
const ROLE_RANK: Record<UserRole, number> = { owner: 0, admin: 1, project_manager: 2, user: 3 };

function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms)) return '';
  if (ms <= 0) return 'expired';
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'expires in less than a day';
  return `expires in ${days} day${days === 1 ? '' : 's'}`;
}

export function TeamScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const userId = useAuthStore(s => s.user?.id);
  const role = useCurrentRole();
  const membersQ = useTeamMembers();
  const invitesQ = usePendingInvites();
  const revoke = useRevokeInvite();

  const [filter, setFilter] = useState<'all' | UserRole>('all');
  const [sort, setSort] = useState<SortKey>('default');
  const [showInvite, setShowInvite] = useState(false);

  const canManageInvites = isManagerPlus(role); // owner/admin/PM see + send invites
  const isOwnerOrAdmin = isAdminPlus(role); // role + label edits, removes

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, owner: 0, admin: 0, project_manager: 0, user: 0 };
    for (const m of membersQ.data ?? []) {
      c.all++;
      c[m.role_type]++;
    }
    return c;
  }, [membersQ.data]);

  const members = useMemo(() => {
    let list = membersQ.data ?? [];
    if (filter !== 'all') list = list.filter(m => m.role_type === filter);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'role':
          return ROLE_RANK[a.role_type] - ROLE_RANK[b.role_type] || a.name.localeCompare(b.name);
        case 'joined_new':
          return (b.joinedAt ?? '').localeCompare(a.joinedAt ?? '');
        case 'joined_old':
          return (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '');
        default: // owner first, then joined asc
          return ROLE_RANK[a.role_type] - ROLE_RANK[b.role_type] || (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '');
      }
    });
    return sorted;
  }, [membersQ.data, filter, sort]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Team"
        subtitle={membersQ.data ? `${membersQ.data.length} member${membersQ.data.length === 1 ? '' : 's'}` : undefined}
        onBack={() => nav.goBack()}
        showThemeToggle={false}
        right={canManageInvites ? <Pressable onPress={() => setShowInvite(true)} hitSlop={8} style={{ padding: 6 }}><UserPlus size={20} color={t.colors.primary} /></Pressable> : undefined}
      />
      <Screen scroll refreshing={membersQ.isRefetching} onRefresh={membersQ.refetch}>
        {membersQ.isError ? (
          <ErrorState message="Failed to load team members" onRetry={membersQ.refetch} />
        ) : membersQ.isLoading ? (
          <Loading />
        ) : (
          <View style={{ gap: t.spacing[4] }}>
            {/* Pending invites */}
            {canManageInvites && (invitesQ.data ?? []).length > 0 ? (
              <View style={{ gap: t.spacing[2] }}>
                <Txt variant="heading">Pending invites · {(invitesQ.data ?? []).length}</Txt>
                {(invitesQ.data ?? []).map(inv => (
                  <Card key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                      <Mail size={15} color={t.colors.textSubtle} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt size={t.fontSize.sm} weight="medium" numberOfLines={1}>{inv.invited_email}</Txt>
                      <Txt variant="placeholder" size={t.fontSize.xxs} numberOfLines={1}>
                        {inv.invited_by_name ? `Invited by ${inv.invited_by_name} · ` : ''}{expiresIn(inv.expires_at)}
                      </Txt>
                    </View>
                    <RoleChip role={inv.role} size="sm" />
                    <Pressable onPress={async () => { if (await confirm({ title: 'Cancel invite?', description: `${inv.invited_email} will no longer be able to accept. You can always invite them again.`, destructive: true, confirmLabel: 'Cancel invite', cancelLabel: 'Keep' })) revoke.mutate(inv.id); }} hitSlop={8}>
                      <X size={16} color={t.colors.danger} />
                    </Pressable>
                  </Card>
                ))}
              </View>
            ) : null}

            {/* Filter + sort */}
            <View style={{ gap: t.spacing[2] }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2] }}>
                {(['all', 'owner', 'admin', 'project_manager', 'user'] as const).map(r => (
                  <Pressable key={r} onPress={() => setFilter(r)} style={{ paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1.5], borderRadius: t.radius.full, backgroundColor: filter === r ? t.colors.primary : t.colors.surfaceSunken }}>
                    <Txt size={t.fontSize.xs} weight="medium" color={filter === r ? t.colors.primaryText : t.colors.textSubtle}>
                      {(r === 'all' ? 'All' : r === 'project_manager' ? 'PM' : ROLE_LABEL[r])} {counts[r] ?? 0}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ width: 200 }}>
                <Picker
                  value={sort}
                  options={[
                    { value: 'default', label: 'Default (owner first)' },
                    { value: 'name', label: 'Name (A→Z)' },
                    { value: 'role', label: 'Role' },
                    { value: 'joined_new', label: 'Joined (newest)' },
                    { value: 'joined_old', label: 'Joined (oldest)' },
                  ]}
                  onChange={v => setSort(v as SortKey)}
                  title="Sort"
                  triggerStyle={{ minHeight: 32 }}
                />
              </View>
            </View>

            {/* Members */}
            {members.length === 0 ? (
              <EmptyState title="No members" description={filter === 'all' ? 'No members yet.' : `No ${filter === 'project_manager' ? 'project manager' : filter} members.`} />
            ) : (
              members.map(m => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isSelf={m.id === userId}
                  isOwnerOrAdmin={isOwnerOrAdmin}
                />
              ))
            )}
          </View>
        )}
      </Screen>
      {showInvite ? <InviteMemberModal onClose={() => setShowInvite(false)} /> : null}
    </View>
  );
}

function MemberRow({ member: m, isSelf, isOwnerOrAdmin }: { member: Member; isSelf: boolean; isOwnerOrAdmin: boolean }) {
  const t = useTheme();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  // RBAC (mirrors web): role type editable only by owner/admin, not self, not an owner target.
  const canEditType = isOwnerOrAdmin && !isSelf && m.role_type !== 'owner';
  // Label editable by self, or by owner/admin for non-owner targets.
  const canEditLabel = isSelf || (isOwnerOrAdmin && m.role_type !== 'owner');
  const canRemove = isOwnerOrAdmin && !isSelf && m.role_type !== 'owner';

  const [editing, setEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState<OrgRole>(m.role_type);
  const [labelDraft, setLabelDraft] = useState(m.role_name);

  return (
    <Card style={{ gap: t.spacing[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
        <Avatar name={m.name} id={m.id} size={36} />
        <View style={{ flex: 1 }}>
          <Txt weight="medium" numberOfLines={1}>{m.name}{isSelf ? ' (you)' : ''}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Mail size={11} color={t.colors.textPlaceholder} />
            <Txt variant="placeholder" size={t.fontSize.xxs} numberOfLines={1} style={{ flex: 1 }}>{m.email}</Txt>
          </View>
        </View>
        {!editing ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            {m.role_name ? <Txt size={t.fontSize.xxs} variant="subtle" numberOfLines={1}>{m.role_name}</Txt> : null}
            <RoleChip role={m.role_type} size="sm" />
          </View>
        ) : null}
        {canRemove && !editing ? (
          <Pressable onPress={async () => { if (await confirm({ title: 'Remove from organization', description: `This will remove ${m.name} from this organization. Their tickets and history stay; their account is not deleted.`, destructive: true, confirmLabel: 'Remove' })) removeMember.mutate(m.id); }} hitSlop={8}>
            <Trash2 size={16} color={t.colors.danger} />
          </Pressable>
        ) : null}
      </View>

      {editing ? (
        <View style={{ gap: t.spacing[2] }}>
          {canEditType ? (
            <Picker
              value={roleDraft}
              options={INVITE_ROLES.map(r => ({ value: r.value as OrgRole, label: r.label }))}
              onChange={v => setRoleDraft(v)}
              title="Role"
            />
          ) : null}
          {canEditLabel ? <TextField label="Display name" value={labelDraft} onChangeText={setLabelDraft} maxLength={20} placeholder="Display name" /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
            <Button title="Cancel" size="sm" variant="secondary" onPress={() => { setEditing(false); setRoleDraft(m.role_type); setLabelDraft(m.role_name); }} />
            <Button
              title="Save"
              size="sm"
              loading={updateRole.isPending}
              onPress={() =>
                updateRole.mutate(
                  { memberId: m.id, role_type: canEditType ? roleDraft : undefined, role_name: canEditLabel ? labelDraft.trim() : undefined },
                  { onSuccess: () => setEditing(false) },
                )
              }
            />
          </View>
        </View>
      ) : canEditType || canEditLabel ? (
        <Pressable onPress={() => { setRoleDraft(m.role_type); setLabelDraft(m.role_name); setEditing(true); }} style={{ alignSelf: 'flex-start' }}>
          <Txt variant="link" size={t.fontSize.xs}>{isSelf ? 'Edit label' : 'Edit role'}</Txt>
        </Pressable>
      ) : null}
    </Card>
  );
}
