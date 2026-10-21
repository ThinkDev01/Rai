import React from 'react';
import { OtpModal } from './OtpModal';
import { useDeleteOrg } from '@/api/orgs';

export function DeleteOrgModal({ orgId, orgName, onClose }: { orgId: string; orgName: string; onClose: () => void }) {
  const del = useDeleteOrg();

  return (
    <OtpModal
      title={`Delete ${orgName}?`}
      description={`This permanently removes every project, sprint, ticket, comment, and invite under ${orgName}. It cannot be undone.`}
      action="delete_org"
      targetId={orgId}
      confirmLabel="Delete organization"
      isPending={del.isPending}
      onConfirm={otpCode => del.mutate({ orgId, otpCode }, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
