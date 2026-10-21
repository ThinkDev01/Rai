import { useMutation } from '@tanstack/react-query';
import api, { unwrap } from '@/lib/api';
import { extractApiError } from '@/lib/errors';
import { toast } from '@/lib/toast';

export type OtpAction = 'delete_org' | 'transfer_ownership' | 'delete_project' | 'cancel_subscription';

export function useRequestOtp() {
  return useMutation({
    mutationFn: ({ action, targetId }: { action: OtpAction; targetId: string }) =>
      unwrap<{ message: string }>(api.post('/otp/request', { action, targetId })),
    onSuccess: () => toast.success('Verification code sent to your email'),
    onError: e => toast.error(extractApiError(e, 'Could not send verification code')),
  });
}
