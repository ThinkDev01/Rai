import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Layers, CheckCircle2, Clock, Archive, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Card, Txt, Avatar, Button, withAlpha } from '@/components/ui/primitives';
import { SprintPill, RoleChip } from '@/components/ui/chips';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Loading, ErrorState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { sprintProgress, sortSprints, isLiveSprint } from '@/lib/sprintUtils';
import { formatDate } from '@/lib/dates';
import type { Sprint, SprintStatus } from '@/types/api.types';

const HISTORY_INITIAL = 10;
const HISTORY_BATCH = 10;

export function OverviewScreen({ projectId }: { projectId: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { data: project, isLoading, isError, refetch, isRefetching } = useProject(projectId);
  const [historyVisible, setHistoryVisible] = useState(HISTORY_INITIAL);

  const allTickets = useMemo(() => (project ? [...project.backlog, ...project.sprints.flatMap(s => s.tickets)] : []), [project]);

  if (isLoading) return <Loading label="Loading…" />;
  if (isError || !project) return <ErrorState message="Failed to load project" onRetry={refetch} />;

  const active = project.sprints.find(s => s.status === 'active' && isLiveSprint(s));
  const history = sortSprints(project.sprints.filter(isLiveSprint));
  const visibleHistory = history.slice(0, historyVisible);
  const remaining = history.length - visibleHistory.length;

  const totalTickets = allTickets.length;
  const doneTickets = allTickets.filter(tk => tk.status === 'done').length;
  const completion = totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 0;
  const completedSprints = history.filter(s => s.status === 'completed').length;
  const hasPlanned = project.sprints.some(s => s.status === 'planned' && isLiveSprint(s));

  const statusIcon = (status: SprintStatus) =>
    status === 'completed' ? <CheckCircle2 size={15} color={t.colors.info} /> : status === 'active' ? <Layers size={15} color={t.colors.success} /> : <Clock size={15} color={t.colors.textPlaceholder} />;

  return (
    <Screen scroll refreshing={isRefetching} onRefresh={refetch}>
      <View style={{ gap: t.spacing[4] }}>
        {/* Archived banner */}
        {project.archived ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], borderRadius: t.radius.md, borderWidth: 1, borderColor: withAlpha(t.colors.warning, 0.4), backgroundColor: withAlpha(t.colors.warning, 0.1), padding: t.spacing[3] }}>
            <Archive size={15} color={t.colors.warning} />
            <Txt variant="subtle" size={t.fontSize.xs} style={{ flex: 1 }}>This project is archived and read-only.</Txt>
          </View>
        ) : null}

        {project.description ? <Txt variant="subtle" size={t.fontSize.sm}>{project.description}</Txt> : null}

        {/* Stat cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[3] }}>
          <StatCard label="Total tickets" value={totalTickets} sub={`${doneTickets} completed`} />
          <StatCard label="Completion" value={`${completion}%`} sub={`${doneTickets}/${totalTickets} done`} />
          <StatCard label="Members" value={project.memberCount} sub="" />
          <StatCard label="Sprints" value={history.length} sub={`${completedSprints} completed`} />
        </View>

        {/* Active sprint */}
        {active ? (
          (() => {
            const p = sprintProgress(active.tickets);
            return (
              <Pressable onPress={() => nav.navigate('SprintDetail', { projectId, sprintId: active.id })}>
                <Card style={{ gap: t.spacing[3] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                    <Txt variant="heading" style={{ flex: 1 }} numberOfLines={1}>{active.name}</Txt>
                    <SprintPill sprint={active} />
                    <Txt size={t.fontSize.xl} weight="bold" color={t.colors.primary}>{p.pct}%</Txt>
                  </View>
                  <ProgressBar value={p.pct} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {(['todo', 'in_progress', 'in_review', 'done'] as const).map(s => (
                      <View key={s} style={{ alignItems: 'center' }}>
                        <Txt weight="bold">{p.counts[s] ?? 0}</Txt>
                        <Txt variant="subtle" size={t.fontSize.xxs}>
                          {s === 'in_progress' ? 'In Progress' : s === 'in_review' ? 'In Review' : s === 'todo' ? 'To Do' : 'Done'}
                        </Txt>
                      </View>
                    ))}
                  </View>
                </Card>
              </Pressable>
            );
          })()
        ) : (
          <Card style={{ gap: t.spacing[2] }}>
            <Txt weight="semibold">No sprint is active</Txt>
            <Txt variant="subtle" size={t.fontSize.xs}>
              {hasPlanned ? 'Start one from the Sprints tab.' : 'Create a sprint and add tickets from the Backlog.'}
            </Txt>
            <Button title={hasPlanned ? 'Go to Sprints' : 'Go to Backlog'} size="sm" variant="secondary" onPress={() => nav.navigate('Project', { projectId, screen: hasPlanned ? 'Sprints' : 'Backlog' })} />
          </Card>
        )}

        {/* Sprint history */}
        <View style={{ gap: t.spacing[2] }}>
          <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Sprint history · {history.length}
          </Txt>
          {history.length === 0 ? (
            <Card><Txt variant="subtle">No sprints yet.</Txt></Card>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: t.spacing[3] }}>
              {visibleHistory.map((s: Sprint) => {
                const p = sprintProgress(s.tickets);
                return (
                  <Pressable key={s.id} onPress={() => nav.navigate('SprintDetail', { projectId, sprintId: s.id })} style={{ paddingVertical: t.spacing[3], gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                      {statusIcon(s.status)}
                      <Txt weight="medium" style={{ flex: 1 }} numberOfLines={1}>{s.name}</Txt>
                      <SprintPill sprint={s} size="sm" />
                      <Txt variant="subtle" size={t.fontSize.xs}>{p.done}/{p.total}</Txt>
                    </View>
                    <ProgressBar value={p.pct} height={4} />
                    <Txt variant="placeholder" size={t.fontSize.xxs}>{formatDate(s.startDate)} → {formatDate(s.endDate)}</Txt>
                  </Pressable>
                );
              })}
              {remaining > 0 || historyVisible > HISTORY_INITIAL ? (
                <View style={{ flexDirection: 'row', gap: t.spacing[3], paddingVertical: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border }}>
                  {remaining > 0 ? (
                    <Pressable onPress={() => setHistoryVisible(v => v + HISTORY_BATCH)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <ChevronDown size={12} color={t.colors.textPlaceholder} />
                      <Txt variant="placeholder" size={t.fontSize.xs}>Show {Math.min(HISTORY_BATCH, remaining)} more ({remaining} left)</Txt>
                    </Pressable>
                  ) : null}
                  {historyVisible > HISTORY_INITIAL ? (
                    <Pressable onPress={() => setHistoryVisible(HISTORY_INITIAL)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <ChevronUp size={12} color={t.colors.textPlaceholder} />
                      <Txt variant="placeholder" size={t.fontSize.xs}>Show less</Txt>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Card>
          )}
        </View>

        {/* Members */}
        <View style={{ gap: t.spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="heading">Members ({project.members.length})</Txt>
            {!project.archived ? <Button title="Manage members" size="sm" variant="secondary" onPress={() => nav.navigate('Project', { projectId, screen: 'ProjectSettings' })} /> : null}
          </View>
          <Card padded={false} style={{ paddingHorizontal: t.spacing[3] }}>
            {project.members.map((m, i) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingVertical: t.spacing[2.5], borderTopWidth: i > 0 ? 1 : 0, borderTopColor: t.colors.borderSubtle }}>
                <Avatar name={m.name} id={m.id} size={28} />
                <View style={{ flex: 1 }}>
                  <Txt size={t.fontSize.sm} weight="medium" numberOfLines={1}>{m.name}</Txt>
                  {m.role_name ? <Txt variant="placeholder" size={t.fontSize.xxs}>{m.role_name}</Txt> : null}
                </View>
                <RoleChip role={m.role_type} size="sm" />
              </View>
            ))}
          </Card>
        </View>
      </View>
    </Screen>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  const t = useTheme();
  return (
    <Card style={{ flexGrow: 1, minWidth: '45%', gap: 2 }}>
      <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Txt>
      <Txt size={t.fontSize['2xl']} weight="bold">{value}</Txt>
      {sub ? <Txt variant="placeholder" size={t.fontSize.xxs}>{sub}</Txt> : null}
    </Card>
  );
}
