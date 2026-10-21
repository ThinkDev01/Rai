import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { ModalSheet } from './ModalSheet';
import { TextField } from '@/components/ui/Input';
import { Button, Txt, withAlpha } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { useRequestOtp, type OtpAction } from '@/api/otp';

/**
 * Two-step OTP confirmation modal.
 * Step 1 — request: shows description + "Send code" button.
 * Step 2 — verify: shows code input + confirm button.
 * onConfirm receives the entered code; caller passes it to the destructive action.
 */
export function OtpModal({
  title,
  description,
  action,
  targetId,
  confirmLabel,
  onConfirm,
  onClose,
  isPending,
}: {
  title: string;
  description: string;
  action: OtpAction;
  targetId: string;
  confirmLabel: string;
  onConfirm: (otpCode: string) => void;
  onClose: () => void;
  isPending?: boolean;
}) {
  const t = useTheme();
  const requestOtp = useRequestOtp();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCode('');
    setError(null);
  }, [step]);

  function handleSend() {
    requestOtp.mutate({ action, targetId }, { onSuccess: () => setStep('verify') });
  }

  function handleConfirm() {
    setError(null);
    if (code.trim().length !== 6) return setError('Enter the 6-digit code from your email');
    onConfirm(code.trim());
  }

  return (
    <ModalSheet
      title={title}
      onClose={onClose}
      footer={
        step === 'request' ? (
          <>
            <Button title="Cancel" variant="secondary" onPress={onClose} />
            <Button title="Send code" loading={requestOtp.isPending} onPress={handleSend} />
          </>
        ) : (
          <>
            <Button title="← Back" variant="ghost" onPress={() => setStep('request')} disabled={isPending} />
            <Button title={confirmLabel} variant="danger" loading={isPending} disabled={code.trim().length !== 6} onPress={handleConfirm} />
          </>
        )
      }
    >
      <View style={{ flexDirection: 'row', gap: t.spacing[2], borderRadius: t.radius.md, borderWidth: 1, borderColor: withAlpha(t.colors.danger, 0.3), backgroundColor: withAlpha(t.colors.danger, 0.06), padding: t.spacing[3] }}>
        <ShieldCheck size={16} color={t.colors.danger} />
        <Txt size={t.fontSize.xs} variant="subtle" style={{ flex: 1 }}>
          {description}
        </Txt>
      </View>

      {step === 'request' ? (
        <Txt size={t.fontSize.xs} variant="subtle">
          A 6-digit verification code will be sent to your email. Enter it on the next step to confirm.
        </Txt>
      ) : (
        <>
          <TextField
            label="Verification code"
            value={code}
            onChangeText={v => { setCode(v); setError(null); }}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button title={requestOtp.isPending ? 'Sending…' : 'Resend code'} size="sm" variant="ghost" loading={requestOtp.isPending} onPress={handleSend} />
          </View>
          {error ? <Txt color={t.colors.danger} size={t.fontSize.xs}>{error}</Txt> : null}
        </>
      )}
    </ModalSheet>
  );
}
