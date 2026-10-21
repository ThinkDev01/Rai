import React, { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthLayout } from './AuthLayout';
import { TextField } from '@/components/ui/Input';
import { Button, Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { confirmForgotPassword } from '@/lib/cognito';
import { emailHasAt } from '@/lib/text';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ navigation, route }: Props) {
  const t = useTheme();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!emailHasAt(email)) return setError('Enter a valid email address');
    if (code.trim().length < 4) return setError('Enter the code from your email');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    try {
      await confirmForgotPassword(email.trim(), code.trim(), password);
      toast.success('Password reset', 'You can now sign in');
      navigation.navigate('Login', { email: email.trim() });
    } catch (e: any) {
      if (e?.name === 'CodeMismatchException') setError('Incorrect code. Try again.');
      else if (e?.name === 'ExpiredCodeException') setError('Invalid or expired code. Try again, or request a new one.');
      else if (e?.name === 'LimitExceededException') setError('Too many attempts. Try again later.');
      else if (e?.name === 'InvalidPasswordException') setError(e?.message ?? 'Password does not meet requirements.');
      else setError(e?.message ?? 'Could not reset password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Enter the code and your new password"
      footer={<Txt variant="link" onPress={() => navigation.navigate('Login', {})}>Back to sign in</Txt>}
    >
      <TextField label="Email" required autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField label="Reset code" required keyboardType="number-pad" value={code} onChangeText={setCode} placeholder="123456" />
      <TextField label="New password" required secure value={password} onChangeText={setPassword} placeholder="At least 8 characters" />
      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
      <Button title="Reset password" fullWidth loading={busy} onPress={onSubmit} />
    </AuthLayout>
  );
}
