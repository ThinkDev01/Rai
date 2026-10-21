import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Archive, ArchiveRestore, Clock } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, Button, Avatar, KeySquare } from '@/components/ui/primitives';
import { TypeIcon, StatusDot } from '@/components/ui/chips';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Loading, ErrorState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { useArchiveSprint } from '@/api/sprints';
import { useCurrentRole } from '@/store/authStore';
import { isManagerPlus } from '@/lib/permissions';
import { sprintProgress } from '@/lib/sprintUtils';
import { projectColor } from '@/lib/colors';
import { formatDate } from '@/lib/dates';
import { MESSAGES } from '@/lib/messages';
import type { Sprint } from '@/types/api.types';

export function ArchiveScreen({ projectId }: { projectId: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { data: project, isLoading, isError, refetch, isRefetching } = useProject(projectId);
  const role = useCurrentRole();
  const canManage = isManagerPlus(role);

  if (isLoading) return <Screen><Loading label="Loading archive…" /></Screen>;
  if (isError || !project) return <Screen><ErrorState message="Failed to load project" onRetry={refetch} /></Screen>;

  const archived = project.sprints.filter(s => s.archivedAt !== null);
  const totalTickets = archived.reduce((sum, s) => sum + s.tickets.length, 0);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Archive" subtitle={project.name} onBack={() => nav.goBack()} showThemeToggle={false} />
      <Screen scroll refreshing={isRefetching} onRefresh={refetch}>
        <View style={{ gap: t.spacing[4] }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3] }}>
            <KeySquare keyText={project.key} color={projectColor(project.key)} size={40} avatarType={project.avatarType} avatarValue={project.avatarValue} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                <Archive size={14} color={t.colors.textPlaceholder} />
                <Txt variant="heading">Archive</Txt>
                <View style={{ backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder}>
                    {archived.length} sprint{archived.length === 1 ? '' : 's'}
                  </Txt>
                </View>
              </View>
              <Txt variant="placeholder" size={t.fontSize.xs} style={{ marginTop: 2 }}>
                {totalTickets} ticket{totalTickets === 1 ? '' : 's'} archived ·{' '}
                <Txt variant="link" size={t.fontSize.xs} onPress={() => nav.navigate('Project', { projectId, screen: 'Sprints' })}>
                  Active sprints →
                </Txt>
              </Txt>
            </View>
          </View>

          {archived.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: t.spacing[10], borderStyle: 'dashed', gap: t.spacing[2] }}>
              <Archive size={28} color={t.colors.border} />
              <Txt weight="medium">{MESSAGES.archive.noCompletedSprints.title}</Txt>
              <Txt variant="placeholder" size={t.fontSize.xs} style={{ textAlign: 'center', maxWidth: 260 }}>
                {MESSAGES.archive.noCompletedSprints.description}
              </Txt>
              <Button title="View active sprints →" size="sm" variant="secondary" onPress={() => nav.navigate('Project', { projectId, screen: 'Sprints' })} style={{ marginTop: t.spacing[1] }} />
            </Card>
          ) : (
            <View style={{ gap: t.spacing[3] }}>
              {archived.map(s => (
                <ArchivedSprintCard key={s.id} projectId={projectId} sprint={s} canManage={canManage} />
              ))}
            </View>
          )}
        </View>
      </Screen>
    </View>
  );
}

function ArchivedSprintCard({ projectId, sprint, canManage }: { projectId: string; sprint: Sprint; canManage: boolean }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const unarchive = useArchiveSprint(projectId, sprint.id);
  const [confirming, setConfirming] = useState(false);

  const tickets = sprint.tickets ?? [];
  const total = tickets.length;
  const p = sprintProgress(tickets);
  const pct = total > 0 ? p.pct : 100;
  const preview = tickets.slice(0, 5);
  const remaining = total - preview.length;

  const counts = [
    { label: 'To Do', count: p.counts.todo ?? 0, color: t.colors.textSubtle },
    { label: 'Progress', count: p.counts.in_progress ?? 0, color: t.colors.warning },
    { label: 'Review', count: p.counts.in_review ?? 0, color: t.colors.info },
    { label: 'Done', count: p.counts.done ?? 0, color: t.colors.success },
  ];

  return (
    <Card style={{ gap: t.spacing[3] }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing[2] }}>
        <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('SprintDetail', { projectId, sprintId: sprint.id })}>
          <Txt weight="semibold" numberOfLines={1}>{sprint.name}</Txt>
          {sprint.goal ? <Txt variant="placeholder" size={t.fontSize.xs} numberOfLines={1} style={{ marginTop: 2 }}>{sprint.goal}</Txt> : null}
        </Pressable>
        <View style={{ backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>Archived</Txt>
        </View>
      </View>

      {/* Dates */}
      {sprint.startDate || sprint.endDate ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Clock size={11} color={t.colors.textPlaceholder} />
          <Txt variant="placeholder" size={t.fontSize.xxs}>
            {sprint.startDate ? formatDate(sprint.startDate) : '?'} → {sprint.endDate ? formatDate(sprint.endDate) : '?'}
          </Txt>
        </View>
      ) : null}

      {/* Status count strip */}
      <View style={{ flexDirection: 'row', gap: t.spacing[1.5] }}>
        {counts.map(c => (
          <View key={c.label} style={{ flex: 1, alignItems: 'center', backgroundColor: t.colors.surface, borderRadius: t.radius.md, paddingVertical: t.spacing[1.5] }}>
            <Txt size={t.fontSize.base} weight="bold" color={c.color}>{c.count}</Txt>
            <Txt size={9} color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>{c.label}</Txt>
          </View>
        ))}
      </View>

      {/* Ticket preview */}
      {preview.length > 0 ? (
        <View style={{ gap: 2 }}>
          {preview.map(tk => (
            <Pressable key={tk.id} onPress={() => nav.navigate('TicketDetail', { projectId, ticketKey: tk.key })} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], paddingVertical: 3, paddingHorizontal: 4 }}>
              <TypeIcon type={tk.type} size={11} />
              <Txt size={t.fontSize.xxs} color={t.colors.textPlaceholder} style={{ width: 56 }} numberOfLines={1}>{tk.key}</Txt>
              <Txt size={t.fontSize.xs} style={{ flex: 1 }} numberOfLines={1}>{tk.title}</Txt>
              <StatusDot status={tk.status} size={6} />
              {tk.assignee ? <Avatar name={tk.assignee.name} id={tk.assignee.id} size={16} /> : <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: t.colors.textPlaceholder }} />}
            </Pressable>
          ))}
          {remaining > 0 ? <Txt variant="placeholder" size={t.fontSize.xxs} style={{ paddingHorizontal: 4, paddingTop: 2 }}>+ {remaining} more ticket{remaining === 1 ? '' : 's'}</Txt> : null}
        </View>
      ) : (
        <Txt variant="placeholder" size={t.fontSize.xxs} style={{ textAlign: 'center', fontStyle: 'italic', backgroundColor: t.colors.surface, borderRadius: t.radius.sm, paddingVertical: t.spacing[2] }}>
          No tickets in this sprint.
        </Txt>
      )}

      {/* Progress + unarchive footer */}
      <View style={{ gap: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[2] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt variant="placeholder" size={t.fontSize.xxs}>{total} ticket{total === 1 ? '' : 's'}</Txt>
          <Txt variant="placeholder" size={t.fontSize.xxs}>{pct}% complete</Txt>
        </View>
        <ProgressBar value={pct} height={4} />
        {canManage ? (
          !confirming ? (
            <Button title="Unarchive" size="sm" variant="secondary" leftIcon={<ArchiveRestore size={12} color={t.colors.success} />} fullWidth onPress={() => setConfirming(true)} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
              <Txt variant="subtle" size={t.fontSize.xs} style={{ flex: 1 }}>Move sprint back to live?</Txt>
              <Button title="Confirm" size="sm" loading={unarchive.isPending} onPress={() => unarchive.mutate(false, { onSuccess: () => setConfirming(false) })} />
              <Button title="Cancel" size="sm" variant="secondary" onPress={() => setConfirming(false)} />
            </View>
          )
        ) : null}
      </View>
    </Card>
  );
}
