import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Plus, Archive, ChevronRight } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Card, Txt, Button, Avatar } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/Input';
import { SprintPill, StatusDot, TypeIcon } from '@/components/ui/chips';
import { Picker } from '@/components/ui/Picker';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Loading, ErrorState, EmptyState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { useCurrentRole } from '@/store/authStore';
import { isManagerPlus } from '@/lib/permissions';
import { isLiveSprint, sprintProgress } from '@/lib/sprintUtils';
import { formatDate } from '@/lib/dates';
import { STATUS_META } from '@/lib/ticketMeta';
import { CreateSprintModal } from '@/components/modals/CreateSprintModal';
import type { Sprint, SprintStatus, TicketStatus } from '@/types/api.types';

type SortKey = 'active' | 'newest' | 'start' | 'name';

export function SprintsScreen({ projectId }: { projectId: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { data: project, isLoading, isError, refetch, isRefetching } = useProject(projectId);
  const role = useCurrentRole();
  const canCreate = isManagerPlus(role);
  const [filter, setFilter] = useState<'all' | SprintStatus>('all');
  const [sort, setSort] = useState<SortKey>('active');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const live = useMemo(() => (project ? project.sprints.filter(isLiveSprint) : []), [project]);
  const counts = useMemo(
    () => ({
      active: live.filter(s => s.status === 'active').length,
      planned: live.filter(s => s.status === 'planned').length,
      completed: live.filter(s => s.status === 'completed').length,
    }),
    [live],
  );

  const sprints = useMemo(() => {
    let list = [...live];
    if (filter !== 'all') list = list.filter(s => s.status === filter);
    if (q.trim()) list = list.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
    const rank: Record<SprintStatus, number> = { active: 0, planned: 1, completed: 2 };
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'newest') return (b.createdAt || '').localeCompare(a.createdAt || '');
      if (sort === 'start') return (b.startDate || '').localeCompare(a.startDate || '');
      // active first
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return (b.startDate || '').localeCompare(a.startDate || '');
    });
    return list;
  }, [live, filter, q, sort]);

  if (isLoading) return <Loading label="Loading sprints…" />;
  if (isError || !project) return <ErrorState message="Failed to load sprints" onRetry={refetch} />;

  const archivedCount = project.sprints.filter(s => s.archivedAt !== null).length;
  const hasArchived = archivedCount > 0;

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1.5], borderRadius: t.radius.full, backgroundColor: active ? t.colors.primary : t.colors.surfaceSunken }}>
      <Txt size={t.fontSize.xs} weight="medium" color={active ? t.colors.primaryText : t.colors.textSubtle}>
        {label}
      </Txt>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <View style={{ padding: t.spacing[4], paddingBottom: t.spacing[2], gap: t.spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Txt variant="heading">Sprints</Txt>
            <Txt variant="placeholder" size={t.fontSize.xs}>
              {counts.active} active · {counts.planned} planned · {counts.completed} completed
            </Txt>
          </View>
          {canCreate && !project.archived ? <Button title="New sprint" size="sm" leftIcon={<Plus size={14} color="#fff" />} onPress={() => setShowCreate(true)} /> : null}
        </View>
        <TextField placeholder="Search sprints by name…" value={q} onChangeText={setQ} autoCapitalize="none" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2] }} style={{ flex: 1 }}>
            <Chip label={`All (${live.length})`} active={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label={`Active (${counts.active})`} active={filter === 'active'} onPress={() => setFilter('active')} />
            <Chip label={`Planned (${counts.planned})`} active={filter === 'planned'} onPress={() => setFilter('planned')} />
            <Chip label={`Completed (${counts.completed})`} active={filter === 'completed'} onPress={() => setFilter('completed')} />
          </ScrollView>
          <View style={{ width: 140 }}>
            <Picker
              value={sort}
              options={[
                { value: 'active', label: 'Active first' },
                { value: 'newest', label: 'Newest' },
                { value: 'start', label: 'Start date' },
                { value: 'name', label: 'Name (A→Z)' },
              ]}
              onChange={v => setSort(v as SortKey)}
              title="Sort"
              triggerStyle={{ minHeight: 32 }}
            />
          </View>
        </View>
      </View>

      <Screen scroll refreshing={isRefetching} onRefresh={refetch}>
        {sprints.length === 0 ? (
          q || filter !== 'all' ? (
            <EmptyState title="No sprints match these filters" description="Try clearing the search or filter." />
          ) : (
            <EmptyState
              title="No sprints yet"
              description={canCreate ? 'Create your first sprint to start planning work.' : 'Ask a project manager or admin to create the first sprint.'}
              ctaLabel={canCreate ? 'Create sprint' : undefined}
              onCta={() => setShowCreate(true)}
            />
          )
        ) : (
          <View style={{ gap: t.spacing[3] }}>
            {sprints.map(s => (
              <SprintCard key={s.id} sprint={s} onPress={() => nav.navigate('SprintDetail', { projectId, sprintId: s.id })} />
            ))}
          </View>
        )}

        {/* Archive button — always shown when the project has archived sprints,
            including when there are no live sprints left to display. Styled as a
            clearly tappable bordered pill (icon + label + count + chevron) so
            users recognise it as an action rather than caption text. */}
        {hasArchived ? (
          <Pressable
            onPress={() => nav.navigate('Archive', { projectId })}
            accessibilityRole="button"
            accessibilityLabel={`View ${archivedCount} archived sprint${archivedCount === 1 ? '' : 's'}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'center',
              gap: t.spacing[2],
              paddingVertical: t.spacing[2.5],
              paddingLeft: t.spacing[4],
              paddingRight: t.spacing[3],
              marginTop: t.spacing[3],
              borderRadius: t.radius.full,
              borderWidth: 1,
              borderColor: t.colors.border,
              backgroundColor: pressed ? t.colors.surfaceSunken : t.colors.surfaceRaised,
            })}
          >
            <Archive size={15} color={t.colors.textSubtle} />
            <Txt size={t.fontSize.sm} weight="medium" color={t.colors.text}>
              View archived sprints
            </Txt>
            <View style={{ minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: t.radius.full, backgroundColor: t.colors.surfaceSunken, alignItems: 'center' }}>
              <Txt size={t.fontSize.xs} weight="semibold" color={t.colors.textSubtle}>
                {archivedCount}
              </Txt>
            </View>
            <ChevronRight size={15} color={t.colors.textPlaceholder} />
          </Pressable>
        ) : null}
      </Screen>

      {showCreate ? <CreateSprintModal projectId={projectId} projectKey={project.key} existingNames={project.sprints.map(s => s.name)} onClose={() => setShowCreate(false)} /> : null}
    </View>
  );
}

function SprintCard({ sprint, onPress }: { sprint: Sprint; onPress: () => void }) {
  const t = useTheme();
  const p = sprintProgress(sprint.tickets);
  const preview = sprint.tickets.slice(0, 5);
  const moreCount = sprint.tickets.length - preview.length;
  const breakdown: { status: TicketStatus; count: number }[] = [
    { status: 'todo', count: p.counts.todo ?? 0 },
    { status: 'in_progress', count: p.counts.in_progress ?? 0 },
    { status: 'in_review', count: p.counts.in_review ?? 0 },
    { status: 'done', count: p.counts.done ?? 0 },
  ];
  return (
    <Pressable onPress={onPress}>
      <Card style={{ gap: t.spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
          <Txt weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
            {sprint.name}
          </Txt>
          <SprintPill sprint={sprint} size="sm" />
        </View>
        {sprint.goal ? (
          <Txt variant="subtle" size={t.fontSize.xs} numberOfLines={2}>
            {sprint.goal}
          </Txt>
        ) : null}
        <Txt variant="placeholder" size={t.fontSize.xs}>
          {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
        </Txt>

        {/* Status breakdown */}
        <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
          {breakdown.map(b => (
            <View key={b.status} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <StatusDot status={b.status} size={6} />
              <Txt size={t.fontSize.xxs} color={t.colors[STATUS_META[b.status].colorKey]}>
                {b.count}
              </Txt>
            </View>
          ))}
        </View>

        {/* Ticket preview */}
        {preview.length > 0 ? (
          <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: t.colors.borderSubtle, paddingTop: t.spacing[2] }}>
            {preview.map(tk => (
              <View key={tk.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                <TypeIcon type={tk.type} size={11} />
                <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} style={{ width: 52 }} numberOfLines={1}>
                  {tk.key}
                </Txt>
                <Txt size={t.fontSize.xs} style={{ flex: 1 }} numberOfLines={1}>
                  {tk.title}
                </Txt>
                <StatusDot status={tk.status} />
                {tk.assignee ? <Avatar name={tk.assignee.name} id={tk.assignee.id} size={16} /> : null}
              </View>
            ))}
            {moreCount > 0 ? (
              <Txt variant="link" size={t.fontSize.xxs}>
                + {moreCount} more tickets
              </Txt>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.colors.borderSubtle, paddingTop: t.spacing[2] }}>
          <Txt variant="placeholder" size={t.fontSize.xxs}>
            {p.total} tickets · {p.pct}% complete
          </Txt>
        </View>
        <ProgressBar value={p.pct} height={4} />
      </Card>
    </Pressable>
  );
}
