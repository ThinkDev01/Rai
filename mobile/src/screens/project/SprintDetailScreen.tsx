import React, { useEffect, useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Target,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  List,
  Pencil,
  Play,
  CheckCheck,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, Button, Avatar, withAlpha } from '@/components/ui/primitives';
import { SprintPill, StatusDot } from '@/components/ui/chips';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TicketRow } from '@/components/TicketRow';
import { ModalSheet } from '@/components/modals/ModalSheet';
import { TextField } from '@/components/ui/Input';
import { Loading, ErrorState } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { useUpdateSprint, useStartSprint, useCompleteSprint, useDeleteSprint, useArchiveSprint } from '@/api/sprints';
import { useCurrentRole } from '@/store/authStore';
import { isManagerPlus, isAdminPlus } from '@/lib/permissions';
import { confirm } from '@/lib/confirm';
import { sprintProgress } from '@/lib/sprintUtils';
import { formatDate } from '@/lib/dates';
import { MESSAGES } from '@/lib/messages';

const TICKETS_INITIAL = 25;
const TICKETS_BATCH = 25;

export function SprintDetailScreen({ projectId, sprintId }: { projectId: string; sprintId: string }) {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { data: project, isLoading, isError, refetch } = useProject(projectId);
  const role = useCurrentRole();
  const update = useUpdateSprint(projectId, sprintId);
  const start = useStartSprint(projectId, sprintId);
  const complete = useCompleteSprint(projectId, sprintId);
  const del = useDeleteSprint(projectId, sprintId);
  const archive = useArchiveSprint(projectId, sprintId);

  const sprint = project?.sprints.find(s => s.id === sprintId);

  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [ticketsVisible, setTicketsVisible] = useState(TICKETS_INITIAL);

  useEffect(() => {
    if (sprint) {
      setGoal(sprint.goal ?? '');
      setNotes(sprint.notes ?? '');
    }
  }, [sprint?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <Screen><Loading label="Loading sprint…" /></Screen>;
  if (isError || !project) return <Screen><ErrorState message="Failed to load sprint" onRetry={refetch} /></Screen>;
  if (!sprint)
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Sprint" onBack={() => nav.goBack()} showThemeToggle={false} />
        <Screen><ErrorState message="Sprint not found — it may have been deleted." /></Screen>
      </View>
    );

  const isPlanned = sprint.status === 'planned';
  const isActive = sprint.status === 'active';
  const isCompleted = sprint.status === 'completed';
  const isArchived = Boolean(sprint.archivedAt);
  const canManage = isManagerPlus(role);
  const isAdminTier = isAdminPlus(role);
  const canEdit = !isCompleted && !isArchived && canManage;
  const hasActiveSprint = project.sprints.some(s => s.status === 'active');

  const p = sprintProgress(sprint.tickets);
  const done = p.done;
  const total = p.total;
  const visibleTickets = sprint.tickets.slice(0, ticketsVisible);
  const remaining = sprint.tickets.length - visibleTickets.length;
  const expandedPastInitial = ticketsVisible > TICKETS_INITIAL;

  function saveGoal() {
    update.mutate(
      { goal: draftGoal, notes: draftNotes },
      {
        onSuccess: () => {
          setGoal(draftGoal);
          setNotes(draftNotes);
          setEditing(false);
        },
      },
    );
  }
  function submitRename() {
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === sprint!.name) return setRenameOpen(false);
    update.mutate({ name: trimmed }, { onSuccess: () => setRenameOpen(false) });
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={sprint.name} subtitle={project.name} onBack={() => nav.goBack()} showThemeToggle={false} />
      <Screen scroll refreshing={false} onRefresh={refetch}>
        <View style={{ gap: t.spacing[4] }}>
          {/* Archived banner */}
          {isArchived ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], borderRadius: t.radius.md, borderWidth: 1, borderColor: withAlpha(t.colors.textPlaceholder, 0.4), backgroundColor: t.colors.surfaceSunken, padding: t.spacing[3] }}>
              <Archive size={15} color={t.colors.textSubtle} />
              <Txt variant="subtle" size={t.fontSize.xs} style={{ flex: 1 }}>
                This sprint is archived and read-only. Unarchive it below to edit.
              </Txt>
            </View>
          ) : null}

          {/* Header */}
          <View style={{ gap: t.spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
              <Txt variant="title" style={{ flexShrink: 1 }} numberOfLines={2}>
                {sprint.name}
              </Txt>
              <SprintPill sprint={sprint} />
              {canEdit ? (
                <Pressable onPress={() => { setRenameDraft(sprint.name); setRenameOpen(true); }} hitSlop={8} style={{ padding: 4 }}>
                  <Pencil size={14} color={t.colors.textPlaceholder} />
                </Pressable>
              ) : null}
            </View>
            <Txt variant="placeholder" size={t.fontSize.xs}>
              {formatDate(sprint.startDate)} → {formatDate(sprint.endDate)}
            </Txt>
            {/* Actions */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing[2] }}>
              {isCompleted ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} color={t.colors.success} />
                  <Txt size={t.fontSize.xs} color={t.colors.success}>Sprint completed</Txt>
                </View>
              ) : null}
              {canManage && isPlanned && !hasActiveSprint ? (
                <Button title="Start sprint" size="sm" variant="secondary" loading={start.isPending} leftIcon={<Play size={12} color={t.colors.success} />} onPress={() => start.mutate()} />
              ) : null}
              {canManage && isActive && !editing ? (
                <Button title="Complete sprint" size="sm" variant="secondary" loading={complete.isPending} leftIcon={<CheckCheck size={12} color={t.colors.primary} />} onPress={() => complete.mutate()} />
              ) : null}
              {canEdit && !editing ? (
                <Button title="Edit" size="sm" variant="secondary" leftIcon={<Pencil size={12} color={t.colors.text} />} onPress={() => { setDraftGoal(goal); setDraftNotes(notes); setEditing(true); }} />
              ) : null}
              {canEdit && editing ? (
                <>
                  <Button title="Cancel" size="sm" variant="secondary" disabled={update.isPending} onPress={() => setEditing(false)} />
                  <Button title="Save" size="sm" loading={update.isPending} onPress={saveGoal} />
                </>
              ) : null}
            </View>
          </View>

          {/* Goal */}
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], padding: t.spacing[4], borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
              <Target size={14} color={t.colors.primary} />
              <Txt weight="semibold">Sprint Goal</Txt>
            </View>
            <View style={{ padding: t.spacing[4] }}>
              {editing ? (
                <TextInput
                  value={draftGoal}
                  onChangeText={setDraftGoal}
                  multiline
                  placeholder="What is this sprint trying to achieve?"
                  placeholderTextColor={t.colors.textPlaceholder}
                  style={{ minHeight: 70, fontSize: t.fontSize.sm, color: t.colors.text, borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radius.md, padding: t.spacing[3], textAlignVertical: 'top' }}
                />
              ) : goal ? (
                <Txt size={t.fontSize.sm}>{goal}</Txt>
              ) : (
                <Txt variant="placeholder" size={t.fontSize.sm} style={{ fontStyle: 'italic' }}>
                  {canEdit ? 'No goal set — tap Edit to add one.' : 'No goal was set for this sprint.'}
                </Txt>
              )}
            </View>
          </Card>

          {/* Notes */}
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], padding: t.spacing[4], borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
              <FileText size={14} color={t.colors.textSubtle} />
              <Txt weight="semibold">Notes</Txt>
            </View>
            <View style={{ padding: t.spacing[4] }}>
              {editing ? (
                <TextInput
                  value={draftNotes}
                  onChangeText={setDraftNotes}
                  multiline
                  placeholder="Retrospective notes, blockers, team observations…"
                  placeholderTextColor={t.colors.textPlaceholder}
                  style={{ minHeight: 100, fontSize: t.fontSize.sm, color: t.colors.text, borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radius.md, padding: t.spacing[3], textAlignVertical: 'top' }}
                />
              ) : notes ? (
                <Txt size={t.fontSize.sm}>{notes}</Txt>
              ) : (
                <Txt variant="placeholder" size={t.fontSize.sm} style={{ fontStyle: 'italic' }}>
                  {canEdit ? 'No notes — tap Edit to add.' : 'No notes for this sprint.'}
                </Txt>
              )}
            </View>
          </Card>

          {/* Tickets */}
          {isCompleted ? (
            <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
              <Pressable onPress={() => nav.navigate('Project', { projectId, screen: 'Backlog' })} style={{ flex: 1 }}>
                <Card style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <List size={14} color={t.colors.textSubtle} />
                      <Txt weight="semibold" size={t.fontSize.xs}>Backlogged</Txt>
                    </View>
                    <ArrowUpRight size={13} color={t.colors.textPlaceholder} />
                  </View>
                  <Txt size={t.fontSize['3xl']} weight="bold">{sprint.tickets.filter(tk => tk.status !== 'done').length}</Txt>
                  <Txt variant="placeholder" size={t.fontSize.xxs}>Incomplete tickets returned to backlog</Txt>
                </Card>
              </Pressable>
              <Pressable onPress={() => nav.navigate('Archive', { projectId })} style={{ flex: 1 }}>
                <Card style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Archive size={14} color={t.colors.success} />
                      <Txt weight="semibold" size={t.fontSize.xs}>Archived</Txt>
                    </View>
                    <ArrowUpRight size={13} color={t.colors.textPlaceholder} />
                  </View>
                  <Txt size={t.fontSize['3xl']} weight="bold" color={t.colors.success}>{done}</Txt>
                  <Txt variant="placeholder" size={t.fontSize.xxs}>Completed tickets archived with this sprint</Txt>
                </Card>
              </Pressable>
            </View>
          ) : (
            <Card padded={false}>
              <View style={{ padding: t.spacing[4], borderBottomWidth: 1, borderBottomColor: t.colors.border }}>
                <Txt weight="semibold">Tickets ({total})</Txt>
              </View>
              {total === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: t.spacing[8] }}>
                  <Txt weight="semibold">{MESSAGES.sprint.noTickets.title}</Txt>
                  <Txt variant="placeholder" size={t.fontSize.xs}>{MESSAGES.sprint.noTickets.description}</Txt>
                </View>
              ) : (
                <View style={{ paddingHorizontal: t.spacing[3] }}>
                  {visibleTickets.map(tk => (
                    <TicketRow key={tk.id} ticket={tk} onPress={() => nav.navigate('TicketDetail', { projectId, ticketKey: tk.key })} />
                  ))}
                  {remaining > 0 || expandedPastInitial ? (
                    <View style={{ flexDirection: 'row', gap: t.spacing[3], paddingVertical: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border }}>
                      {remaining > 0 ? (
                        <Pressable onPress={() => setTicketsVisible(v => v + TICKETS_BATCH)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <ChevronDown size={12} color={t.colors.textPlaceholder} />
                          <Txt variant="placeholder" size={t.fontSize.xs}>Show {Math.min(TICKETS_BATCH, remaining)} more ({remaining} left)</Txt>
                        </Pressable>
                      ) : null}
                      {expandedPastInitial ? (
                        <Pressable onPress={() => setTicketsVisible(TICKETS_INITIAL)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <ChevronUp size={12} color={t.colors.textPlaceholder} />
                          <Txt variant="placeholder" size={t.fontSize.xs}>Show less</Txt>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )}
            </Card>
          )}

          {/* Progress */}
          <Card style={{ gap: t.spacing[2] }}>
            <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Progress
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <Txt size={t.fontSize['3xl']} weight="bold">{p.pct}%</Txt>
              <Txt variant="placeholder" size={t.fontSize.sm}>{done}/{total} done</Txt>
            </View>
            <ProgressBar value={p.pct} color={isCompleted ? t.colors.success : t.colors.primary} />
          </Card>

          {/* By status */}
          <Card style={{ gap: t.spacing[2] }}>
            <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              By Status
            </Txt>
            {(['todo', 'in_progress', 'in_review', 'done'] as const).map(s => (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
                <StatusDot status={s} />
                <Txt variant="subtle" size={t.fontSize.sm} style={{ flex: 1 }}>
                  {s === 'todo' ? 'To Do' : s === 'in_progress' ? 'In Progress' : s === 'in_review' ? 'In Review' : 'Done'}
                </Txt>
                <Txt weight="semibold" size={t.fontSize.sm}>{p.counts[s] ?? 0}</Txt>
              </View>
            ))}
          </Card>

          {/* Details */}
          <Card style={{ gap: t.spacing[3] }}>
            <Txt size={t.fontSize.xxs} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Details
            </Txt>
            <Detail label="Start" value={formatDate(sprint.startDate)} />
            <Detail label="End" value={formatDate(sprint.endDate)} />
            <Detail label="Project" value={project.name} />
          </Card>

          {/* Actions */}
          {canManage ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing[2], borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.spacing[4] }}>
              {isArchived ? (
                <Button title="Unarchive sprint" size="sm" variant="secondary" loading={archive.isPending} leftIcon={<ArchiveRestore size={13} color={t.colors.success} />} onPress={async () => { if (await confirm({ title: 'Unarchive sprint?', description: 'Move this sprint back to the active list?', confirmLabel: 'Unarchive' })) archive.mutate(false); }} />
              ) : (
                <Button title="Archive sprint" size="sm" variant="secondary" disabled={isActive} loading={archive.isPending} leftIcon={<Archive size={13} color={t.colors.warning} />} onPress={async () => { if (await confirm({ title: 'Archive sprint?', description: 'Move this sprint to the Archive page?', confirmLabel: 'Archive' })) archive.mutate(true); }} />
              )}
              {isAdminTier && !isCompleted ? (
                <Button title="Delete sprint" size="sm" variant="danger" loading={del.isPending} leftIcon={<Trash2 size={13} color="#fff" />} onPress={async () => { if (await confirm({ title: 'Delete sprint?', description: 'Tickets will return to the backlog.', destructive: true, confirmLabel: 'Delete' })) del.mutate(undefined, { onSuccess: () => nav.navigate('Project', { projectId, screen: 'Backlog' }) }); }} />
              ) : null}
            </View>
          ) : null}
        </View>
      </Screen>

      {renameOpen ? (
        <ModalSheet
          title="Rename sprint"
          onClose={() => setRenameOpen(false)}
          footer={
            <>
              <Button title="Cancel" variant="secondary" disabled={update.isPending} onPress={() => setRenameOpen(false)} />
              <Button title="Rename sprint" loading={update.isPending} disabled={!renameDraft.trim() || renameDraft.trim() === sprint.name} onPress={submitRename} />
            </>
          }
        >
          <View style={{ borderRadius: t.radius.md, borderWidth: 1, borderColor: withAlpha(t.colors.warning, 0.4), backgroundColor: withAlpha(t.colors.warning, 0.05), padding: t.spacing[3] }}>
            <Txt variant="subtle" size={t.fontSize.xs}>
              The new name appears in reports, search, and any links that reference this sprint. Tickets keep their existing keys.
            </Txt>
          </View>
          <TextField label="New sprint name" value={renameDraft} onChangeText={setRenameDraft} placeholder={sprint.name} autoFocus />
        </ModalSheet>
      ) : null}
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View>
      <Txt size={9} weight="semibold" color={t.colors.textPlaceholder} style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </Txt>
      <Txt size={t.fontSize.sm}>{value}</Txt>
    </View>
  );
}
