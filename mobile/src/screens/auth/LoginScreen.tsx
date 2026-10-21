import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthLayout } from './AuthLayout';
import { TextField } from '@/components/ui/Input';
import { Button, Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { signIn, startFederatedSignIn } from '@/lib/cognito';
import { useAuthStore, popHydrateError } from '@/store/authStore';
import { isLooseEmail } from '@/lib/text';
import { isCognitoConfigured, isFederationConfigured } from '@/config/env';
import { Divider } from '@/components/ui/primitives';
import { GoogleIcon, MicrosoftIcon } from '@/components/BrandIcons';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation, route }: Props) {
  const t = useTheme();
  const hydrate = useAuthStore(s => s.hydrate);
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!isLooseEmail(email)) return setError('Enter a valid email address');
    if (!password) return setError('Password is required');
    if (!isCognitoConfigured) {
      return setError('Cognito is not configured. Set values in src/config/env.ts.');
    }
    setBusy(true);
    try {
      const res = await signIn(email.trim(), password);
      if (!res.isSignedIn) {
        if (res.nextStep === 'CONFIRM_SIGN_UP') {
          navigation.navigate('Verify', { email: email.trim(), invite: route.params?.invite });
        } else if (res.nextStep === 'RESET_REQUIRED') {
          navigation.navigate('ForgotPassword', { email: email.trim() });
        } else {
          setError('Additional verification required to sign in.');
        }
        return;
      }
      await hydrate();
      // hydrate() never throws — check auth state explicitly
      if (!useAuthStore.getState().isAuthenticated) {
        const detail = popHydrateError();
        setError(detail ? `Could not load your account: ${detail}` : 'Could not load your account. Check your connection and try again.');
        return;
      }
    } catch (e: any) {
      const name = e?.name ?? '';
      if (name === 'UserNotConfirmedException') {
        navigation.navigate('Verify', { email: email.trim(), invite: route.params?.invite });
      } else if (name === 'PasswordResetRequiredException') {
        navigation.navigate('ForgotPassword', { email: email.trim() });
      } else if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
        setError('Invalid email or password');
      } else if (/timeout|timed out/i.test(e?.message ?? '')) {
        setError('Cognito did not respond. Check your connection and try again.');
      } else {
        setError(e?.message ?? 'Could not sign in.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to Rai"
      footer={
        <Pressable onPress={() => navigation.navigate('Register', { invite: route.params?.invite })}>
          <Txt variant="subtle">
            New to Rai? <Txt variant="link" weight="semibold">Create an account</Txt>
          </Txt>
        </Pressable>
      }
    >
      <TextField
        label="Email"
        required
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@company.com"
      />
      <TextField
        label="Password"
        required
        secure
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        onSubmitEditing={onSubmit}
      />
      <Pressable onPress={() => navigation.navigate('ForgotPassword', { email })} style={{ alignSelf: 'flex-end' }}>
        <Txt variant="link" size={t.fontSize.xs}>
          Forgot password?
        </Txt>
      </Pressable>
      {error ? (
        <Txt color={t.colors.danger} size={t.fontSize.xs}>
          {error}
        </Txt>
      ) : null}
      <Button title="Sign in" fullWidth loading={busy} onPress={onSubmit} />

      {isFederationConfigured ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], marginVertical: t.spacing[1] }}>
            <Divider style={{ flex: 1 }} />
            <Txt variant="placeholder" size={t.fontSize.xs}>
              Or continue with
            </Txt>
            <Divider style={{ flex: 1 }} />
          </View>
          <View style={{ gap: t.spacing[2] }}>
            <Button
              title="Continue with Google"
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={<GoogleIcon size={18} />}
              onPress={() => startFederatedSignIn('Google').catch(e => setError(e?.message ?? 'Could not start sign-in'))}
            />
            <Button
              title="Continue with Microsoft"
              variant="secondary"
              size="lg"
              fullWidth
              leftIcon={<MicrosoftIcon size={18} />}
              onPress={() => startFederatedSignIn('Microsoft').catch(e => setError(e?.message ?? 'Could not start sign-in'))}
            />
          </View>
        </>
      ) : null}
    </AuthLayout>
  );
}
