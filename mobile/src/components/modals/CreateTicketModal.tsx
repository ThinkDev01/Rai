import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ModalSheet } from './ModalSheet';
import { TextField } from '@/components/ui/Input';
import { Button, Txt } from '@/components/ui/primitives';
import { Picker, type PickerOption } from '@/components/ui/Picker';
import { TypeIcon, PriorityIcon, StatusDot } from '@/components/ui/chips';
import { useTheme } from '@/theme/ThemeProvider';
import { useCreateTicket } from '@/api/tickets';
import { useAuthStore } from '@/store/authStore';
import { capitalizeFirst } from '@/lib/text';
import { TYPE_META, PRIORITY_META, STATUS_META, TICKET_TYPES, PRIORITIES, STATUSES } from '@/lib/ticketMeta';
import { isLiveSprint } from '@/lib/sprintUtils';
import type { Project, TicketType, Priority, TicketStatus } from '@/types/api.types';

export function CreateTicketModal({
  project,
  initialStatus,
  initialParentKey,
  initialSprintId,
  onClose,
}: {
  project: Project;
  initialStatus?: TicketStatus;
  initialParentKey?: string;
  /** Pre-select a sprint (per-section "Add ticket"); '' = backlog. */
  initialSprintId?: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const userId = useAuthStore(s => s.user?.id);
  const createTicket = useCreateTicket(project.id);

  const activeSprint = project.sprints.find(s => s.status === 'active' && isLiveSprint(s));
  const firstPlanned = project.sprints.find(s => s.status === 'planned' && isLiveSprint(s));

  const [title, setTitle] = useState('');
  const [type, setType] = useState<TicketType>('task');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TicketStatus>(initialStatus ?? 'todo');
  const [assigneeId, setAssigneeId] = useState<string>(
    project.members.some(m => m.id === userId) ? userId! : '',
  );
  const [sprintId, setSprintId] = useState<string>(initialSprintId ?? activeSprint?.id ?? firstPlanned?.id ?? '');
  const [parentKey, setParentKey] = useState<string>(initialParentKey ?? '');
  const [description, setDescription] = useState('');
  // type-specific fields
  const [storyPoints, setStoryPoints] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [environment, setEnvironment] = useState('');
  const [epicName, setEpicName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const typeOpts: PickerOption<TicketType>[] = TICKET_TYPES.map(v => ({
    value: v,
    label: TYPE_META[v].label,
    leading: <TypeIcon type={v} />,
  }));
  const prioOpts: PickerOption<Priority>[] = PRIORITIES.map(v => ({
    value: v,
    label: PRIORITY_META[v].label,
    leading: <PriorityIcon priority={v} />,
  }));
  const statusOpts: PickerOption<TicketStatus>[] = STATUSES.map(v => ({
    value: v,
    label: STATUS_META[v].label,
    leading: <StatusDot status={v} />,
  }));
  const assigneeOpts: PickerOption<string>[] = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...project.members.map(m => ({ value: m.id, label: m.name })),
    ],
    [project.members],
  );
  const sprintOpts: PickerOption<string>[] = useMemo(
    () => [
      { value: '', label: 'Backlog' },
      ...project.sprints.filter(isLiveSprint).map(s => ({ value: s.id, label: s.name })),
    ],
    [project.sprints],
  );
  const allTickets = useMemo(
    () => [...project.backlog, ...project.sprints.flatMap(s => s.tickets)],
    [project],
  );
  const parentOpts: PickerOption<string>[] = useMemo(
    () => [
      { value: '', label: 'No parent' },
      ...allTickets.map(tk => ({ value: tk.key, label: `${tk.key} — ${tk.title}`, leading: <TypeIcon type={tk.type} /> })),
    ],
    [allTickets],
  );

  function onSubmit() {
    setError(null);
    if (title.trim().length < 2) return setError('Title must be at least 2 characters');
    const sp = storyPoints.trim() ? parseInt(storyPoints.trim(), 10) : undefined;
    if (storyPoints.trim() && (isNaN(sp!) || sp! < 0)) return setError('Story points must be a positive number');
    createTicket.mutate(
      {
        title: title.trim(),
        type,
        priority,
        status,
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        sprintId: sprintId || undefined,
        parentKey: parentKey || undefined,
        ...(type === 'story' && {
          story_points: sp,
          acceptance_criteria: acceptanceCriteria.trim() || undefined,
        }),
        ...(type === 'bug' && {
          steps_to_reproduce: stepsToReproduce.trim() || undefined,
          environment: environment.trim() || undefined,
        }),
        ...(type === 'epic' && {
          epic_name: epicName.trim() || undefined,
        }),
      },
      { onSuccess: onClose },
    );
  }

  const Label = ({ children }: { children: string }) => (
    <Txt variant="subtle" weight="medium" size={t.fontSize.xs} style={{ marginBottom: 4 }}>
      {children}
    </Txt>
  );

  return (
    <ModalSheet
      title="Create ticket"
      onClose={onClose}
      footer={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button title="Create" loading={createTicket.isPending} onPress={onSubmit} />
        </>
      }
    >
      <TextField label="Title" required value={title} onChangeText={v => setTitle(capitalizeFirst(v))} placeholder="Short summary" />
      <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
        <View style={{ flex: 1 }}>
          <Label>Type</Label>
          <Picker value={type} options={typeOpts} onChange={setType} title="Type" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Priority</Label>
          <Picker value={priority} options={prioOpts} onChange={setPriority} title="Priority" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
        <View style={{ flex: 1 }}>
          <Label>Status</Label>
          <Picker value={status} options={statusOpts} onChange={setStatus} title="Status" />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Assignee</Label>
          <Picker value={assigneeId} options={assigneeOpts} onChange={setAssigneeId} title="Assignee" searchable placeholder="Unassigned" />
        </View>
      </View>
      <View>
        <Label>Sprint</Label>
        <Picker value={sprintId} options={sprintOpts} onChange={setSprintId} title="Sprint" placeholder="Backlog" />
      </View>
      {allTickets.length > 0 ? (
        <View>
          <Label>Parent ticket</Label>
          <Picker value={parentKey} options={parentOpts} onChange={setParentKey} title="Parent ticket" searchable placeholder="No parent" />
        </View>
      ) : null}
      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />

      {type === 'story' ? (
        <>
          <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
            <View style={{ width: 100 }}>
              <Label>Story points</Label>
              <TextField value={storyPoints} onChangeText={setStoryPoints} placeholder="0" keyboardType="number-pad" />
            </View>
          </View>
          <TextField label="Acceptance criteria" value={acceptanceCriteria} onChangeText={setAcceptanceCriteria} placeholder="Given / When / Then…" multiline />
        </>
      ) : null}

      {type === 'bug' ? (
        <>
          <TextField label="Steps to reproduce" value={stepsToReproduce} onChangeText={setStepsToReproduce} placeholder="1. Open… 2. Tap… 3. See…" multiline />
          <TextField label="Environment" value={environment} onChangeText={setEnvironment} placeholder="e.g. iOS 17, Android 14, Chrome 124" />
        </>
      ) : null}

      {type === 'epic' ? (
        <TextField label="Epic name" value={epicName} onChangeText={setEpicName} placeholder="Short label for this epic" />
      ) : null}

      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
    </ModalSheet>
  );
}
