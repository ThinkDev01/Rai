import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { ClipboardList, Pin } from 'lucide-react-native';
import { TopBar } from '@/components/shell/TopBar';
import { Screen } from '@/components/ui/Screen';
import { Card, Txt, Chip } from '@/components/ui/primitives';
import { TypeIcon, PriorityIcon, StatusChip } from '@/components/ui/chips';
import { ErrorState, EmptyState, SkeletonRow } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useMyWork, useToggleTicketPin } from '@/api/misc';
import { projectColor } from '@/lib/colors';
import { formatDate } from '@/lib/dates';
import { STATUS_META } from '@/lib/ticketMeta';
import { MESSAGES } from '@/lib/messages';
import type { MyWorkItem, TicketStatus } from '@/types/api.types';

type StatusFilter = 'all' | TicketStatus;
type GroupBy = 'project' | 'status' | 'sprint';

export function MyWorkScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { data, isLoading, isError, refetch, isRefetching } = useMyWork();
  const { mutate: togglePin } = useToggleTicketPin();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('project');

  const items = useMemo(() => {
    let list = data ?? [];
    if (filter !== 'all') list = list.filter(i => i.ticket.status === filter);
    list = [...list].sort((a, b) => {
      if (a.ticket.isPinned !== b.ticket.isPinned) return a.ticket.isPinned ? -1 : 1;
      return 0;
    });
    return list;
  }, [data, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; sub?: string; items: MyWorkItem[] }>();
    for (const i of items) {
      let keyId = '';
      let label = '';
      let sub: string | undefined;
      if (groupBy === 'project') {
        keyId = i.project.id;
        label = `${i.project.key} · ${i.project.name}`;
      } else if (groupBy === 'status') {
        keyId = i.ticket.status;
        label = STATUS_META[i.ticket.status].label;
      } else {
        keyId = i.sprint?.id ?? 'backlog';
        label = i.sprint?.name ?? 'Backlog';
        sub = i.sprint ? `${formatDate(i.sprint.startDate)} → ${formatDate(i.sprint.endDate)}` : undefined;
      }
      if (!map.has(keyId)) map.set(keyId, { label, sub, items: [] });
      map.get(keyId)!.items.push(i);
    }
    return Array.from(map.values());
  }, [items, groupBy]);

  const Pill = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1.5], borderRadius: t.radius.full, backgroundColor: active ? t.colors.primary : t.colors.surfaceSunken }}>
      <Txt size={t.fontSize.xs} weight="medium" color={active ? t.colors.primaryText : t.colors.textSubtle}>
        {label}
      </Txt>
    </Pressable>
  );

  const total = (data ?? []).length;
  const active = (data ?? []).filter(i => i.ticket.status !== 'done').length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="My Work"
        subtitle={`${total} tickets total · ${active} active`}
        onMenu={() => nav.dispatch(DrawerActions.openDrawer())}
        onSearch={() => nav.navigate('Search')}
      />
      <View style={{ padding: t.spacing[4], paddingBottom: t.spacing[2], gap: t.spacing[2], backgroundColor: t.colors.surface }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2] }}>
          <Pill label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          {(['todo', 'in_progress', 'in_review', 'done'] as TicketStatus[]).map(s => (
            <Pill key={s} label={STATUS_META[s].label} active={filter === s} onPress={() => setFilter(s)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
          <Txt size={9} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Group by
          </Txt>
          <Pill label="Project" active={groupBy === 'project'} onPress={() => setGroupBy('project')} />
          <Pill label="Status" active={groupBy === 'status'} onPress={() => setGroupBy('status')} />
          <Pill label="Sprint" active={groupBy === 'sprint'} onPress={() => setGroupBy('sprint')} />
        </View>
      </View>

      <Screen scroll refreshing={isRefetching} onRefresh={refetch}>
        {isError ? (
          <ErrorState message="Failed to load your work" onRetry={refetch} />
        ) : isLoading ? (
          <Card padded={false} style={{ paddingHorizontal: t.spacing[3] }}>
            {[1, 2, 3, 4].map(i => (
              <SkeletonRow key={i} />
            ))}
          </Card>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={26} color={t.colors.textPlaceholder} />}
            title={filter === 'all' ? MESSAGES.myWork.noTickets.title : MESSAGES.myWork.noResults.title}
            description={filter === 'all' ? MESSAGES.myWork.noTickets.description : MESSAGES.myWork.noResults.description}
          />
        ) : (
          <View style={{ gap: t.spacing[4] }}>
            {groups.map(g => (
              <View key={g.label} style={{ gap: t.spacing[1] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                  <Txt variant="subtle" weight="semibold" size={t.fontSize.xs} style={{ textTransform: 'uppercase', letterSpacing: 0.3, flex: 1 }} numberOfLines={1}>
                    {g.label}
                    {g.sub ? <Txt variant="placeholder" size={t.fontSize.xxs}>{'  '}{g.sub}</Txt> : null}
                  </Txt>
                  <View style={{ backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.full, paddingHorizontal: 8, paddingVertical: 1 }}>
                    <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} weight="medium">{g.items.length}</Txt>
                  </View>
                </View>
                <Card padded={false} style={{ paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1] }}>
                  {g.items.map(i => (
                    <MyWorkRow key={i.ticket.id} item={i} showProject={groupBy !== 'project'} onPress={() => nav.navigate('TicketDetail', { projectId: i.ticket.projectId, ticketKey: i.ticket.key })} onTogglePin={() => togglePin({ id: i.ticket.id, pinned: !!i.ticket.isPinned })} />
                  ))}
                </Card>
              </View>
            ))}
          </View>
        )}
      </Screen>
    </View>
  );
}

function MyWorkRow({ item, showProject, onPress, onTogglePin }: { item: MyWorkItem; showProject: boolean; onPress: () => void; onTogglePin: () => void }) {
  const t = useTheme();
  const { ticket, project, sprint } = item;
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingVertical: t.spacing[2.5] }}>
      <PriorityIcon priority={ticket.priority} size={13} />
      <TypeIcon type={ticket.type} size={12} />
      <Txt size={t.fontSize.xs} weight="semibold" color={t.colors.textSubtle} style={{ width: 60 }} numberOfLines={1}>
        {ticket.key}
      </Txt>
      <Txt style={{ flex: 1 }} numberOfLines={1}>
        {ticket.title}
      </Txt>
      {showProject ? (
        <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: projectColor(project.key), alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={8} weight="bold" color="#fff">{project.key[0]}</Txt>
        </View>
      ) : null}
      {sprint?.status === 'active' ? <Chip label="Active" color={t.colors.success} bg={t.colors.successSubtle} size="sm" outline /> : null}
      <StatusChip status={ticket.status} size="sm" />
      <Pressable onPress={onTogglePin} hitSlop={8}>
        <Pin size={13} color={ticket.isPinned ? t.colors.primary : t.colors.textPlaceholder} fill={ticket.isPinned ? t.colors.primary : 'none'} />
      </Pressable>
    </Pressable>
  );
}
