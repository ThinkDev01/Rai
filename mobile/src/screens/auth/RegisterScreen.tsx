import React, { useState } from 'react';
import { Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthLayout } from './AuthLayout';
import { TextField } from '@/components/ui/Input';
import { Button, Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { signUp } from '@/lib/cognito';
import { isLooseEmail } from '@/lib/text';
import { toast } from '@/lib/toast';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation, route }: Props) {
  const t = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (name.trim().length < 2) return setError(name.trim() ? 'Name must be at least 2 characters' : 'Full name is required');
    if (!email.trim()) return setError('Email is required');
    if (!isLooseEmail(email)) return setError('Enter a valid email address');
    if (!password) return setError('Password is required');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim());
      toast.success('Account created', 'Check your email for a verification code');
      navigation.navigate('Verify', { email: email.trim(), invite: route.params?.invite });
    } catch (e: any) {
      if (e?.name === 'UsernameExistsException') setError('An account with that email already exists.');
      else setError(e?.message ?? 'Could not create account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create account"
      subtitle="Start managing work with Rai"
      footer={
        <Pressable onPress={() => navigation.navigate('Login', { invite: route.params?.invite })}>
          <Txt variant="subtle">
            Already have an account? <Txt variant="link" weight="semibold">Sign in</Txt>
          </Txt>
        </Pressable>
      }
    >
      <TextField label="Full name" required value={name} onChangeText={setName} placeholder="Jane Doe" />
      <TextField
        label="Email"
        required
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="you@company.com"
      />
      <TextField label="Password" required secure value={password} onChangeText={setPassword} placeholder="At least 8 characters" />
      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
      <Button title="Create account" fullWidth loading={busy} onPress={onSubmit} />
    </AuthLayout>
  );
}
