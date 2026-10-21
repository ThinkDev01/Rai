import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronDown, ChevronRight, Plus, MoveRight } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Card, Txt, Button } from '@/components/ui/primitives';
import { SprintPill } from '@/components/ui/chips';
import { Picker } from '@/components/ui/Picker';
import { TicketRow } from '@/components/TicketRow';
import { Loading, ErrorState } from '@/components/ui/states';
import { ProjectFilterBar, ticketMatchesFilters, EMPTY_FILTERS, type ProjectFilters } from '@/components/shell/ProjectFilterBar';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { useStartSprint, useCompleteSprint } from '@/api/sprints';
import { useUpdateTicket } from '@/api/tickets';
import { useCurrentRole, useAuthStore } from '@/store/authStore';
import { canCreateTicketInProject, isManagerPlus } from '@/lib/permissions';
import { sortSprints, isLiveSprint, sprintProgress } from '@/lib/sprintUtils';
import { CreateTicketModal } from '@/components/modals/CreateTicketModal';
import type { Project, Sprint, Ticket } from '@/types/api.types';

export function BacklogScreen({ projectId }: { projectId: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { data: project, isLoading, isError, refetch, isRefetching } = useProject(projectId);
  const role = useCurrentRole();
  const userId = useAuthStore(s => s.user?.id) ?? '';
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_FILTERS);
  // create context: { sprintId } | 'backlog' | null
  const [createCtx, setCreateCtx] = useState<{ sprintId: string } | null>(null);

  // Default the assignee filter to the logged-in user once, if they're a
  // project member (matches the web ProjectSubNav default-to-me behavior).
  const didInitFilter = useRef(false);
  useEffect(() => {
    if (didInitFilter.current || !project || !userId) return;
    didInitFilter.current = true;
    if (project.members.some(m => m.id === userId)) {
      setFilters(f => ({ ...f, assignees: [userId] }));
    }
  }, [project, userId]);

  if (isLoading) return <Loading label="Loading backlog…" />;
  if (isError || !project) return <ErrorState message="Failed to load backlog" onRetry={refetch} />;

  const canManage = isManagerPlus(role);
  const canCreate = canCreateTicketInProject(project, userId, role) && !project.archived;
  const sprints = sortSprints(project.sprints.filter(isLiveSprint));
  const liveSprints = project.sprints.filter(isLiveSprint);
  const totalCount = project.backlog.length + sprints.reduce((n, s) => n + s.tickets.length, 0);

  const applyFilter = (items: Ticket[]) => items.filter(tk => ticketMatchesFilters(tk, filters));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing[4], paddingTop: t.spacing[3], gap: t.spacing[2] }}>
        <Txt variant="heading" style={{ flex: 1 }}>
          Backlog <Txt variant="placeholder" size={t.fontSize.sm}>· {totalCount} tickets · {sprints.length} sprints</Txt>
        </Txt>
        {canCreate ? <Button title="Create" size="sm" leftIcon={<Plus size={14} color="#fff" />} onPress={() => setCreateCtx({ sprintId: '' })} /> : null}
      </View>
      <View style={{ borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
        <ProjectFilterBar members={project.members} currentUserId={userId} value={filters} onChange={setFilters} />
      </View>

      <Screen scroll refreshing={isRefetching} onRefresh={refetch}>
        <View style={{ gap: t.spacing[3] }}>
          {sprints.map(s => {
            const collapsedState = collapsed[s.id] ?? s.status !== 'active';
            const prog = sprintProgress(s.tickets);
            const shown = applyFilter(s.tickets);
            return (
              <Card key={s.id} padded={false} style={{ overflow: 'hidden' }}>
                <Pressable onPress={() => setCollapsed(c => ({ ...c, [s.id]: !collapsedState }))} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], padding: t.spacing[3] }}>
                  {collapsedState ? <ChevronRight size={16} color={t.colors.textSubtle} /> : <ChevronDown size={16} color={t.colors.textSubtle} />}
                  <Txt weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                    {s.name}
                  </Txt>
                  <SprintPill sprint={s} size="sm" />
                  <Txt variant="subtle" size={t.fontSize.xs}>
                    {prog.done}/{prog.total}
                  </Txt>
                </Pressable>
                {!collapsedState ? (
                  <View style={{ paddingHorizontal: t.spacing[3], paddingBottom: t.spacing[2] }}>
                    {shown.length === 0 ? (
                      <Txt variant="placeholder" size={t.fontSize.xs} style={{ padding: t.spacing[3] }}>
                        {s.tickets.length === 0 ? 'No tickets in this sprint' : 'No tickets match the current filters'}
                      </Txt>
                    ) : (
                      shown.map(tk => <TicketRow key={tk.id} ticket={tk} onPress={() => nav.navigate('TicketDetail', { projectId, ticketKey: tk.key })} />)
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingTop: t.spacing[2], flexWrap: 'wrap' }}>
                      {canManage && s.status === 'planned' ? <StartBtn projectId={projectId} sprintId={s.id} /> : null}
                      {canManage && s.status === 'active' ? <CompleteBtn projectId={projectId} sprintId={s.id} /> : null}
                      {canCreate ? (
                        <Pressable onPress={() => setCreateCtx({ sprintId: s.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Plus size={14} color={t.colors.primary} />
                          <Txt variant="link" size={t.fontSize.xs}>Add ticket</Txt>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}

          {/* Backlog section */}
          {(() => {
            const collapsedState = collapsed['__backlog'] ?? false;
            const shown = applyFilter(project.backlog);
            return (
              <Card padded={false} style={{ overflow: 'hidden' }}>
                <Pressable onPress={() => setCollapsed(c => ({ ...c, __backlog: !collapsedState }))} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], padding: t.spacing[3] }}>
                  {collapsedState ? <ChevronRight size={16} color={t.colors.textSubtle} /> : <ChevronDown size={16} color={t.colors.textSubtle} />}
                  <Txt weight="semibold" style={{ flex: 1 }}>
                    Backlog
                  </Txt>
                  <Txt variant="subtle" size={t.fontSize.xs}>
                    {project.backlog.length}
                  </Txt>
                  {canCreate ? (
                    <Pressable onPress={() => setCreateCtx({ sprintId: '' })} hitSlop={8}>
                      <Plus size={18} color={t.colors.primary} />
                    </Pressable>
                  ) : null}
                </Pressable>
                {!collapsedState ? (
                  <View style={{ paddingHorizontal: t.spacing[3], paddingBottom: t.spacing[2] }}>
                    {shown.length === 0 ? (
                      <Txt variant="placeholder" size={t.fontSize.xs} style={{ padding: t.spacing[3] }}>
                        {project.backlog.length === 0 ? 'No backlog tickets' : 'No tickets match the current filters'}
                      </Txt>
                    ) : (
                      shown.map(tk => (
                        <BacklogRow key={tk.id} projectId={projectId} ticket={tk} liveSprints={liveSprints} canManage={canManage} onPress={() => nav.navigate('TicketDetail', { projectId, ticketKey: tk.key })} />
                      ))
                    )}
                  </View>
                ) : null}
              </Card>
            );
          })()}
        </View>
      </Screen>

      {createCtx ? <CreateTicketModal project={project as Project} initialSprintId={createCtx.sprintId} onClose={() => setCreateCtx(null)} /> : null}
    </View>
  );
}

function BacklogRow({ projectId, ticket, liveSprints, canManage, onPress }: { projectId: string; ticket: Ticket; liveSprints: Sprint[]; canManage: boolean; onPress: () => void }) {
  const t = useTheme();
  const update = useUpdateTicket(projectId, ticket.id, ticket.key);
  return (
    <View>
      <TicketRow ticket={ticket} onPress={onPress} />
      {canManage && liveSprints.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 30, paddingBottom: t.spacing[2] }}>
          <MoveRight size={11} color={t.colors.textPlaceholder} />
          <View style={{ minWidth: 120 }}>
            <Picker
              value={ticket.sprintId ?? ''}
              options={[{ value: '', label: 'Backlog' }, ...liveSprints.map(s => ({ value: s.id, label: s.name }))]}
              onChange={v => update.mutate({ sprintId: v || null })}
              title="Move to sprint"
              triggerStyle={{ minHeight: 26, borderColor: 'transparent', backgroundColor: 'transparent', paddingHorizontal: 0 }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StartBtn({ projectId, sprintId }: { projectId: string; sprintId: string }) {
  const m = useStartSprint(projectId, sprintId);
  return <Button title="Start sprint" size="sm" loading={m.isPending} onPress={() => m.mutate()} />;
}
function CompleteBtn({ projectId, sprintId }: { projectId: string; sprintId: string }) {
  const m = useCompleteSprint(projectId, sprintId);
  return <Button title="Complete sprint" size="sm" variant="secondary" loading={m.isPending} onPress={() => m.mutate()} />;
}
