import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import { UserX, X, Search } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, Avatar, withAlpha } from '@/components/ui/primitives';
import { TypeIcon } from '@/components/ui/chips';
import { TYPE_META, TICKET_TYPES } from '@/lib/ticketMeta';
import type { Member, Ticket, TicketType } from '@/types/api.types';

export const UNASSIGNED = '_unassigned';

export interface ProjectFilters {
  type: 'all' | TicketType;
  assignees: string[]; // member ids + UNASSIGNED; empty = no assignee filter
}

export const EMPTY_FILTERS: ProjectFilters = { type: 'all', assignees: [] };

/** Apply filters to a ticket (web board/backlog visibleColumns logic). */
export function ticketMatchesFilters(ticket: Pick<Ticket, 'type' | 'assignee'>, f: ProjectFilters): boolean {
  if (f.type !== 'all' && ticket.type !== f.type) return false;
  if (f.assignees.length > 0) {
    const key = ticket.assignee?.id ?? UNASSIGNED;
    if (!f.assignees.includes(key)) return false;
  }
  return true;
}

/**
 * Type + assignee filter bar — mobile equivalent of web components/shell/ProjectSubNav.
 * Type chips (All/Epic/Story/Task/Bug) + assignee chips (Unassigned + members,
 * current user pinned first) with a searchable "+N more" sheet, and Clear.
 */
export function ProjectFilterBar({
  members,
  currentUserId,
  value,
  onChange,
}: {
  members: Member[];
  currentUserId?: string;
  value: ProjectFilters;
  onChange: (f: ProjectFilters) => void;
}) {
  const t = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState('');

  // Current user pinned first.
  const ordered = useMemo(() => {
    const self = members.filter(m => m.id === currentUserId);
    const rest = members.filter(m => m.id !== currentUserId);
    return [...self, ...rest];
  }, [members, currentUserId]);

  const visibleChips = ordered.slice(0, 4);
  const overflow = ordered.slice(4);

  const hasFilters = value.type !== 'all' || value.assignees.length > 0;

  function toggleAssignee(id: string) {
    const set = new Set(value.assignees);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, assignees: Array.from(set) });
  }

  const TypeChip = ({ type }: { type: 'all' | TicketType }) => {
    const active = value.type === type;
    const label = type === 'all' ? 'All types' : TYPE_META[type].label;
    const color = type === 'all' ? t.colors.primary : t.colors[TYPE_META[type].colorKey];
    return (
      <Pressable
        onPress={() => onChange({ ...value, type })}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: t.spacing[2.5],
          paddingVertical: t.spacing[1],
          borderRadius: t.radius.full,
          backgroundColor: active ? color : t.colors.surfaceSunken,
        }}
      >
        {type !== 'all' ? (
          React.createElement(TYPE_META[type].icon, { size: 11, color: active ? '#fff' : color })
        ) : null}
        <Txt size={t.fontSize.xs} weight="medium" color={active ? '#fff' : t.colors.textSubtle}>
          {label}
        </Txt>
      </Pressable>
    );
  };

  const AssigneeChip = ({ member }: { member: Member }) => {
    const active = value.assignees.includes(member.id);
    return (
      <Pressable
        onPress={() => toggleAssignee(member.id)}
        style={{ borderRadius: t.radius.full, borderWidth: 2, borderColor: active ? t.colors.primary : 'transparent' }}
      >
        <Avatar name={member.name} id={member.id} size={28} />
      </Pressable>
    );
  };

  return (
    <View style={{ gap: t.spacing[2], paddingVertical: t.spacing[2] }}>
      {/* Assignee row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2], alignItems: 'center', paddingHorizontal: t.spacing[1] }}>
        <Pressable
          onPress={() => toggleAssignee(UNASSIGNED)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: value.assignees.includes(UNASSIGNED) ? 2 : 1,
            borderColor: value.assignees.includes(UNASSIGNED) ? t.colors.primary : t.colors.border,
            backgroundColor: t.colors.surface,
          }}
        >
          <UserX size={14} color={t.colors.textSubtle} />
        </Pressable>
        {visibleChips.map(m => (
          <AssigneeChip key={m.id} member={m} />
        ))}
        {overflow.length > 0 ? (
          <Pressable
            onPress={() => setMoreOpen(true)}
            style={{ height: 28, paddingHorizontal: t.spacing[2], borderRadius: 14, backgroundColor: t.colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}
          >
            <Txt size={t.fontSize.xs} weight="medium" color={t.colors.textSubtle}>
              +{overflow.length}
            </Txt>
          </Pressable>
        ) : null}
        {hasFilters ? (
          <Pressable onPress={() => onChange(EMPTY_FILTERS)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 28, paddingHorizontal: t.spacing[2], borderRadius: 14, borderWidth: 1, borderColor: withAlpha(t.colors.danger, 0.5), backgroundColor: t.colors.dangerSubtle }}>
            <X size={11} color={t.colors.danger} />
            <Txt size={t.fontSize.xxs} weight="medium" color={t.colors.danger}>
              Clear
            </Txt>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Type row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2], paddingHorizontal: t.spacing[1] }}>
        <TypeChip type="all" />
        {TICKET_TYPES.map(ty => (
          <TypeChip key={ty} type={ty} />
        ))}
      </ScrollView>

      {/* "+N more" assignee picker sheet */}
      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: t.colors.backdrop, justifyContent: 'flex-end' }} onPress={() => setMoreOpen(false)}>
          <Pressable style={{ backgroundColor: t.colors.surfaceOverlay, borderTopLeftRadius: t.radius.xl, borderTopRightRadius: t.radius.xl, maxHeight: '70%', paddingBottom: t.spacing[6] }} onPress={e => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], margin: t.spacing[4], paddingHorizontal: t.spacing[3], height: 40, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface }}>
              <Search size={16} color={t.colors.textSubtle} />
              <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search members…" placeholderTextColor={t.colors.textPlaceholder} style={{ flex: 1, color: t.colors.text, fontSize: t.fontSize.sm }} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {ordered
                .filter(m => !q.trim() || m.name.toLowerCase().includes(q.toLowerCase()))
                .map(m => {
                  const active = value.assignees.includes(m.id);
                  return (
                    <Pressable key={m.id} onPress={() => toggleAssignee(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], paddingHorizontal: t.spacing[4], paddingVertical: t.spacing[2.5], backgroundColor: active ? t.colors.primarySubtle : 'transparent' }}>
                      <Avatar name={m.name} id={m.id} size={30} />
                      <View style={{ flex: 1 }}>
                        <Txt weight={active ? 'semibold' : 'regular'}>{m.name}{m.id === currentUserId ? ' (you)' : ''}</Txt>
                        {m.role_name ? <Txt variant="placeholder" size={t.fontSize.xxs}>{m.role_name}</Txt> : null}
                      </View>
                    </Pressable>
                  );
                })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
