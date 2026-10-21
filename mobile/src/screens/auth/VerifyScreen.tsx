import React, { useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthLayout } from './AuthLayout';
import { TextField } from '@/components/ui/Input';
import { Button, Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { confirmSignUp, resendSignUpCode } from '@/lib/cognito';
import { emailHasAt } from '@/lib/text';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Verify'>;

export function VerifyScreen({ navigation, route }: Props) {
  const t = useTheme();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!emailHasAt(email)) return setError('Enter a valid email address');
    if (code.trim().length < 4) return setError('Enter the code from your email');
    setBusy(true);
    try {
      await confirmSignUp(email.trim(), code.trim());
      toast.success('Email verified', 'You can now sign in');
      navigation.navigate('Login', { email: email.trim(), invite: route.params?.invite });
    } catch (e: any) {
      if (e?.name === 'CodeMismatchException') setError('Incorrect code. Try again.');
      else if (e?.name === 'ExpiredCodeException') setError('Invalid or expired code. Try again, or request a new one.');
      else if (e?.name === 'LimitExceededException') setError('Too many attempts. Try again in a few minutes.');
      else if (e?.name === 'NotAuthorizedException') setError('This account is already verified. Please sign in.');
      else setError(e?.message ?? 'Could not verify email.');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (!emailHasAt(email)) return setError('Enter a valid email address first');
    setResending(true);
    try {
      await resendSignUpCode(email.trim());
      toast.success('Code sent', 'Check your email');
    } catch (e: any) {
      setError(e?.message ?? 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout title="Verify email" subtitle="Enter the code we sent to your email">
      <TextField
        label="Email"
        required
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextField
        label="Verification code"
        required
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
      />
      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
      <View style={{ gap: t.spacing[2] }}>
        <Button title="Verify email" fullWidth loading={busy} onPress={onSubmit} />
        <Button title="Resend code" variant="ghost" fullWidth loading={resending} onPress={onResend} />
      </View>
    </AuthLayout>
  );
}
