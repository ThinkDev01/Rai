import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, FlatList } from 'react-native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Plus, X, List, LayoutGrid, Zap, Users, Ticket as TicketIcon, Clock, Lock, Pin } from 'lucide-react-native';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, KeySquare, Chip } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/Input';
import { Picker } from '@/components/ui/Picker';
import { ErrorState, EmptyState, SkeletonCard } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProjects, useToggleProjectPin } from '@/api/projects';
import { useCurrentRole } from '@/store/authStore';
import { isManagerPlus } from '@/lib/permissions';
import { projectColor } from '@/lib/colors';
import { formatDate } from '@/lib/dates';
import { CreateProjectModal } from '@/components/modals/CreateProjectModal';
import type { ProjectSummary } from '@/types/api.types';

type SortKey = 'newest' | 'active' | 'name';
type StatusFilter = 'all' | 'active' | 'archived';
type VisFilter = 'any' | 'public' | 'private';

export function ProjectsScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const role = useCurrentRole();
  const canCreate = isManagerPlus(role);
  const { data, isLoading, isError, refetch, isRefetching } = useProjects();

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [vis, setVis] = useState<VisFilter>('any');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [showCreate, setShowCreate] = useState(false);
  const { mutate: togglePin } = useToggleProjectPin();

  const counts = useMemo(() => {
    const all = data ?? [];
    return { all: all.length, active: all.filter(p => !p.archived).length, archived: all.filter(p => p.archived).length };
  }, [data]);

  const filtered = useMemo(() => {
    let list = [...(data ?? [])];
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(n) || p.key.toLowerCase().includes(n));
    }
    if (status === 'active') list = list.filter(p => !p.archived);
    if (status === 'archived') list = list.filter(p => p.archived);
    if (vis !== 'any') list = list.filter(p => p.visibility === vis);
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'active') return (b.lastActive || '').localeCompare(a.lastActive || '');
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    return list;
  }, [data, q, sort, status, vis]);

  const FilterChip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[1.5], borderRadius: t.radius.full, backgroundColor: active ? t.colors.primary : t.colors.surfaceSunken }}>
      <Txt size={t.fontSize.xs} weight="medium" color={active ? t.colors.primaryText : t.colors.textSubtle}>
        {label}
      </Txt>
    </Pressable>
  );

  const renderRow = ({ item: p }: { item: ProjectSummary }) => (
    <Pressable onPress={() => nav.navigate('Project', { projectId: p.id, screen: 'Board' })}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], marginBottom: t.spacing[3] }}>
        <KeySquare keyText={p.key} color={projectColor(p.key)} size={38} avatarType={p.avatarType} avatarValue={p.avatarValue} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
            <Txt weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</Txt>
            {p.archived ? <Chip label="Archived" color={t.colors.textSubtle} bg={t.colors.surfaceSunken} size="sm" /> : null}
            {p.visibility === 'private' ? <Chip label="Private" color={t.colors.textSubtle} bg={t.colors.surfaceSunken} size="sm" leading={<Lock size={9} color={t.colors.textSubtle} />} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], marginTop: 2, flexWrap: 'wrap' }}>
            {p.activeSprintName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Zap size={10} color={t.colors.success} />
                <Txt variant="placeholder" size={t.fontSize.xxs} numberOfLines={1}>{p.activeSprintName}</Txt>
              </View>
            ) : null}
            <Stat icon={<TicketIcon size={10} color={t.colors.textPlaceholder} />} value={p.ticketCount} />
            <Stat icon={<Users size={10} color={t.colors.textPlaceholder} />} value={p.memberCount} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Clock size={10} color={t.colors.textPlaceholder} />
              <Txt variant="placeholder" size={t.fontSize.xxs}>{formatDate(p.lastActive)}</Txt>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => togglePin({ id: p.id, pinned: !!p.isPinned })}
          hitSlop={8}
          style={{ padding: 6 }}
        >
          <Pin size={16} color={p.isPinned ? t.colors.primary : t.colors.textPlaceholder} fill={p.isPinned ? t.colors.primary : 'none'} />
        </Pressable>
      </Card>
    </Pressable>
  );

  const renderGrid = ({ item: p }: { item: ProjectSummary }) => (
    <Pressable onPress={() => nav.navigate('Project', { projectId: p.id, screen: 'Board' })} style={{ flex: 1, margin: t.spacing[1.5], maxWidth: '48%' }}>
      <Card style={{ gap: t.spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
          <KeySquare keyText={p.key} color={projectColor(p.key)} size={32} avatarType={p.avatarType} avatarValue={p.avatarValue} />
          <View style={{ flex: 1 }}>
            <Txt weight="semibold" numberOfLines={1}>{p.name}</Txt>
            <Txt variant="placeholder" size={t.fontSize.xxs}>{p.key}</Txt>
          </View>
          <Pressable onPress={() => togglePin({ id: p.id, pinned: !!p.isPinned })} hitSlop={8}>
            <Pin size={14} color={p.isPinned ? t.colors.primary : t.colors.textPlaceholder} fill={p.isPinned ? t.colors.primary : 'none'} />
          </Pressable>
        </View>
        {p.description ? <Txt variant="subtle" size={t.fontSize.xxs} numberOfLines={2}>{p.description}</Txt> : null}
        <Txt variant="placeholder" size={t.fontSize.xxs}>
          {p.activeSprintName ? `⚡ ${p.activeSprintName}` : 'No active sprint'}
        </Txt>
        <View style={{ flexDirection: 'row', gap: t.spacing[3], paddingTop: t.spacing[1], borderTopWidth: 1, borderTopColor: t.colors.borderSubtle }}>
          <Stat icon={<TicketIcon size={10} color={t.colors.textPlaceholder} />} value={p.ticketCount} />
          <Stat icon={<Users size={10} color={t.colors.textPlaceholder} />} value={p.memberCount} />
        </View>
      </Card>
    </Pressable>
  );

  return (
    <View style={{ flex: 1 }}>
      <TopBar
        title="Projects"
        subtitle={data ? `${data.length} total` : undefined}
        onMenu={() => nav.dispatch(DrawerActions.openDrawer())}
        onSearch={() => nav.navigate('Search')}
        right={canCreate ? <Pressable onPress={() => setShowCreate(true)} hitSlop={8} style={{ padding: 6 }}><Plus size={22} color={t.colors.primary} /></Pressable> : undefined}
      />
      <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
        <View style={{ padding: t.spacing[4], paddingBottom: t.spacing[2], gap: t.spacing[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
            <View style={{ flex: 1 }}>
              <TextField placeholder="Search projects…" value={q} onChangeText={setQ} autoCapitalize="none" />
            </View>
            {q ? (
              <Pressable onPress={() => setQ('')} hitSlop={8} style={{ padding: 6 }}>
                <X size={18} color={t.colors.textSubtle} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setView(v => (v === 'list' ? 'grid' : 'list'))} hitSlop={8} style={{ padding: 6 }}>
              {view === 'list' ? <LayoutGrid size={18} color={t.colors.textSubtle} /> : <List size={18} color={t.colors.textSubtle} />}
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2], alignItems: 'center' }}>
            <FilterChip label={`All ${counts.all}`} active={status === 'all'} onPress={() => setStatus('all')} />
            <FilterChip label={`Active ${counts.active}`} active={status === 'active'} onPress={() => setStatus('active')} />
            <FilterChip label={`Archived ${counts.archived}`} active={status === 'archived'} onPress={() => setStatus('archived')} />
            <View style={{ width: 1, height: 20, backgroundColor: t.colors.border }} />
            <View style={{ width: 150 }}>
              <Picker value={vis} options={[{ value: 'any', label: 'Any visibility' }, { value: 'public', label: 'Public only' }, { value: 'private', label: 'Private only' }]} onChange={v => setVis(v as VisFilter)} title="Visibility" triggerStyle={{ minHeight: 30 }} />
            </View>
            <View style={{ width: 150 }}>
              <Picker value={sort} options={[{ value: 'newest', label: 'Newest first' }, { value: 'active', label: 'Last activity' }, { value: 'name', label: 'Name (A→Z)' }]} onChange={v => setSort(v as SortKey)} title="Sort" triggerStyle={{ minHeight: 30 }} />
            </View>
          </ScrollView>
        </View>

        {isError ? (
          <ErrorState message="Failed to load projects" onRetry={refetch} />
        ) : isLoading ? (
          <View style={{ padding: t.spacing[4], gap: t.spacing[3] }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q ? `No matches for “${q}”` : status !== 'all' || vis !== 'any' ? 'No projects match these filters' : 'No projects yet'}
            description={q || status !== 'all' || vis !== 'any' ? 'Try clearing the search or filters.' : canCreate ? 'Create your first project to start tracking work.' : 'Ask an admin or project manager to create a project.'}
            ctaLabel={canCreate && !q ? 'Create project' : undefined}
            onCta={() => setShowCreate(true)}
          />
        ) : (
          <FlatList
            key={view}
            data={filtered}
            keyExtractor={p => p.id}
            renderItem={view === 'list' ? renderRow : renderGrid}
            numColumns={view === 'grid' ? 2 : 1}
            columnWrapperStyle={view === 'grid' ? { paddingHorizontal: t.spacing[2.5] } : undefined}
            contentContainerStyle={{ paddingHorizontal: view === 'list' ? t.spacing[4] : t.spacing[1.5], paddingBottom: t.spacing[10] }}
            refreshing={isRefetching}
            onRefresh={refetch}
          />
        )}
      </View>
      {showCreate ? <CreateProjectModal onClose={() => setShowCreate(false)} /> : null}
    </View>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: string | number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {icon}
      <Txt variant="placeholder" size={t.fontSize.xxs}>{value}</Txt>
    </View>
  );
}
