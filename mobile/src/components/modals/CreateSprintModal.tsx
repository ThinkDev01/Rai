import React, { useState } from 'react';
import { View } from 'react-native';
import { ModalSheet } from './ModalSheet';
import { TextField } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Button, Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { useCreateSprint } from '@/api/sprints';
import { capitalizeFirst } from '@/lib/text';
import { computeDefaultSprintName } from '@/lib/sprintUtils';

export function CreateSprintModal({
  projectId,
  projectKey,
  existingNames = [],
  onClose,
}: {
  projectId: string;
  projectKey: string;
  existingNames?: string[];
  onClose: () => void;
}) {
  const t = useTheme();
  const createSprint = useCreateSprint(projectId);
  const [name, setName] = useState(computeDefaultSprintName(projectKey, existingNames));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    setError(null);
    if (!name.trim()) return setError('Sprint name is required');
    createSprint.mutate(
      { name: name.trim(), startDate: startDate || undefined, endDate: endDate || undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <ModalSheet
      title="Create sprint"
      onClose={onClose}
      footer={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button title="Create" loading={createSprint.isPending} onPress={onSubmit} />
        </>
      }
    >
      <TextField label="Sprint name" required value={name} onChangeText={v => setName(capitalizeFirst(v))} />
      <View style={{ flexDirection: 'row', gap: t.spacing[3] }}>
        <View style={{ flex: 1 }}>
          <DatePicker label="Start date" value={startDate} onChange={setStartDate} max={endDate || undefined} />
        </View>
        <View style={{ flex: 1 }}>
          <DatePicker label="End date" value={endDate} onChange={setEndDate} min={startDate || undefined} />
        </View>
      </View>
      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
    </ModalSheet>
  );
}
