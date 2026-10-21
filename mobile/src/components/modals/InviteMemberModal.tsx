import React, { useState } from 'react';
import { View } from 'react-native';
import { ModalSheet } from './ModalSheet';
import { TextField } from '@/components/ui/Input';
import { Button, Txt } from '@/components/ui/primitives';
import { Picker } from '@/components/ui/Picker';
import { useTheme } from '@/theme/ThemeProvider';
import { useCreateInvite } from '@/api/invites';
import { isValidEmail } from '@/lib/text';
import { INVITE_ROLES } from '@/lib/permissions';
import type { OrgRole } from '@/types/auth.types';

export function InviteMemberModal({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const createInvite = useCreateInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('user');
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    setError(null);
    if (!isValidEmail(email)) return setError('Enter a valid email address');
    createInvite.mutate({ email, role }, { onSuccess: onClose });
  }

  return (
    <ModalSheet
      title="Invite member"
      onClose={onClose}
      footer={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button title="Send invite" loading={createInvite.isPending} onPress={onSubmit} />
        </>
      }
    >
      <TextField label="Email" required autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="teammate@company.com" />
      <View style={{ gap: 4 }}>
        <Txt variant="subtle" weight="medium" size={t.fontSize.xs}>
          Role
        </Txt>
        <Picker
          value={role}
          options={INVITE_ROLES.map(r => ({ value: r.value as OrgRole, label: r.label }))}
          onChange={setRole}
          title="Role"
        />
        <Txt variant="placeholder" size={t.fontSize.xxs}>
          {INVITE_ROLES.find(r => r.value === role)?.hint}
        </Txt>
      </View>
      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
    </ModalSheet>
  );
}
