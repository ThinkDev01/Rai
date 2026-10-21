import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ModalSheet } from './ModalSheet';
import { OtpModal } from './OtpModal';
import { Button, Txt } from '@/components/ui/primitives';
import { Picker } from '@/components/ui/Picker';
import { Loading } from '@/components/ui/states';
import { useTheme } from '@/theme/ThemeProvider';
import { useTeamMembers } from '@/api/misc';
import { useTransferOwnership } from '@/api/orgs';

export function TransferOwnershipModal({
  orgId,
  orgName,
  callerUserId,
  onClose,
}: {
  orgId: string;
  orgName: string;
  callerUserId: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const { data: members = [], isLoading } = useTeamMembers();
  const transfer = useTransferOwnership();
  const [recipientId, setRecipientId] = useState('');
  const [showOtp, setShowOtp] = useState(false);

  const recipients = useMemo(() => members.filter(m => m.id !== callerUserId), [members, callerUserId]);
  const recipient = recipients.find(r => r.id === recipientId) ?? null;

  if (showOtp && recipient) {
    return (
      <OtpModal
        title={`Transfer ownership of ${orgName}`}
        description={`${recipient.name} (${recipient.email}) will become the new owner. You will become an admin. This is irreversible from this screen.`}
        action="transfer_ownership"
        targetId={recipient.id}
        confirmLabel="Transfer ownership"
        isPending={transfer.isPending}
        onConfirm={otpCode => transfer.mutate({ orgId, recipientId: recipient.id, otpCode }, { onSuccess: onClose })}
        onClose={() => setShowOtp(false)}
      />
    );
  }

  return (
    <ModalSheet
      title={`Transfer ownership of ${orgName}`}
      onClose={onClose}
      footer={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button title="Continue →" variant="danger" disabled={!recipient} onPress={() => setShowOtp(true)} />
        </>
      }
    >
      <Txt size={t.fontSize.xs} variant="subtle">
        The selected member becomes the new owner with full delete and transfer rights. You become an admin.
      </Txt>

      <View style={{ gap: 4 }}>
        <Txt variant="subtle" weight="medium" size={t.fontSize.xs}>New owner</Txt>
        {isLoading ? (
          <Loading />
        ) : recipients.length === 0 ? (
          <Txt variant="placeholder" size={t.fontSize.xs}>
            You are the only member — invite someone first.
          </Txt>
        ) : (
          <Picker
            value={recipientId}
            options={recipients.map(m => ({ value: m.id, label: `${m.name} (${m.email})` }))}
            onChange={v => { setRecipientId(v); }}
            title="Select recipient"
            searchable
            placeholder="— Select recipient —"
          />
        )}
      </View>
    </ModalSheet>
  );
}
