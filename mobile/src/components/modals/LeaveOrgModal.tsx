import React from 'react';
import { View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { ModalSheet } from './ModalSheet';
import { Button, Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { useLeaveOrg } from '@/api/orgs';

export function LeaveOrgModal({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const t = useTheme();
  const leave = useLeaveOrg();
  return (
    <ModalSheet
      title={`Leave ${orgName}?`}
      onClose={onClose}
      footer={
        <>
          <Button title="Cancel" variant="secondary" disabled={leave.isPending} onPress={onClose} />
          <Button
            title="Leave organization"
            variant="danger"
            loading={leave.isPending}
            onPress={() => leave.mutate(orgId, { onSuccess: onClose })}
          />
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
        <AlertTriangle size={16} color={t.colors.warning} />
        <Txt variant="subtle" size={t.fontSize.xs} style={{ flex: 1 }}>
          You will lose access to all its projects, tickets, and discussions. An admin can re-invite you later.
        </Txt>
      </View>
    </ModalSheet>
  );
}
