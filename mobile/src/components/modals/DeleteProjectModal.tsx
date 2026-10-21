import React from 'react';
import { OtpModal } from './OtpModal';

/** OTP-gated project delete. onConfirm receives the OTP code; caller passes it to useDeleteProject. */
export function DeleteProjectModal({
  projectId,
  projectName,
  isPending,
  onConfirm,
  onClose,
}: {
  projectId: string;
  projectName: string;
  isPending: boolean;
  onConfirm: (otpCode: string) => void;
  onClose: () => void;
}) {
  return (
    <OtpModal
      title="Delete project"
      description={`This permanently deletes "${projectName}" and all its sprints, tickets, and comments. It cannot be undone.`}
      action="delete_project"
      targetId={projectId}
      confirmLabel="Delete project"
      isPending={isPending}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
