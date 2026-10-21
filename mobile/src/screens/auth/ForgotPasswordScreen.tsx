import React, { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthLayout } from './AuthLayout';
import { TextField } from '@/components/ui/Input';
import { Button, Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { forgotPassword } from '@/lib/cognito';
import { emailHasAt } from '@/lib/text';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation, route }: Props) {
  const t = useTheme();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!emailHasAt(email)) return setError('Enter a valid email address');
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      toast.success('Reset code sent', 'Check your email');
      navigation.navigate('ResetPassword', { email: email.trim() });
    } catch (e: any) {
      if (e?.name === 'UserNotFoundException') setError('No account with that email');
      else if (e?.name === 'LimitExceededException') setError('Too many attempts. Try again later.');
      else setError(e?.message ?? 'Could not send reset code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="We'll email you a reset code"
      footer={<Txt variant="link" onPress={() => navigation.navigate('Login', {})}>Back to sign in</Txt>}
    >
      <TextField
        label="Email"
        required
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@company.com"
      />
      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
      <Button title="Send reset code" fullWidth loading={busy} onPress={onSubmit} />
    </AuthLayout>
  );
}
