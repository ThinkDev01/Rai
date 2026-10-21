import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '@/components/ui/Screen';
import { Card, Button, Txt } from '@/components/ui/primitives';
import { Logo } from '@/components/Logo';
import { Loading } from '@/components/ui/states';
import { RoleChip } from '@/components/ui/chips';
import { useTheme } from '@/theme/ThemeProvider';
import { fetchInvitePreview, useAcceptInvite, type InvitePreview } from '@/api/invites';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/lib/errors';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'InviteAccept'>;

const TERMINAL_COPY: Record<string, string> = {
  used: 'This invite has already been used.',
  revoked: 'This invite has been revoked.',
  expired: 'This invite has expired.',
};

export function InviteAcceptScreen({ navigation, route }: Props) {
  const t = useTheme();
  const token = route.params.token;
  const user = useAuthStore(s => s.user);
  const isAuthed = useAuthStore(s => s.isAuthenticated);
  const accept = useAcceptInvite();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInvitePreview(token)
      .then(p => alive && setPreview(p))
      .catch(e => alive && setError(extractApiError(e, 'Could not load invite')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  const back = () => navigation.navigate('Login', {});

  if (loading) return <Screen><Loading label="Loading invite…" /></Screen>;

  const terminal = preview && preview.state !== 'pending';
  // Authed but store still hydrating the user record.
  const hydrating = isAuthed && !user;
  const emailMismatch = isAuthed && user && preview && user.email?.toLowerCase() !== preview.invited_email.toLowerCase();
  const emailMatches = isAuthed && user && preview && !emailMismatch;

  return (
    <Screen scroll contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: t.spacing[5] }}>
      <View style={{ alignItems: 'center' }}>
        <Logo size={40} />
      </View>
      <Card style={{ gap: t.spacing[4] }}>
        {error ? (
          <>
            <Txt variant="title">Invite unavailable</Txt>
            <Txt variant="subtle">{error}</Txt>
            <Button title="Back to sign in" variant="secondary" onPress={back} />
          </>
        ) : terminal ? (
          <>
            <Txt variant="title">Invite no longer valid</Txt>
            <Txt variant="subtle">{TERMINAL_COPY[preview!.state] ?? 'This invitation is no longer valid.'}</Txt>
            <Button title="Back to sign in" variant="secondary" onPress={back} />
          </>
        ) : preview ? (
          <>
            <Txt variant="title">You've been invited to {preview.org_name}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
              <Txt variant="subtle">Role:</Txt>
              <RoleChip role={preview.role} />
            </View>
            <View style={{ borderRadius: t.radius.md, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface, padding: t.spacing[3] }}>
              <Txt variant="subtle" size={t.fontSize.xs}>
                Invited address: <Txt weight="semibold" color={t.colors.text}>{preview.invited_email}</Txt>
              </Txt>
            </View>

            {hydrating ? (
              <Txt variant="subtle">Checking your account…</Txt>
            ) : !isAuthed ? (
              <View style={{ gap: t.spacing[2] }}>
                <Button title="Sign in to accept" fullWidth onPress={() => navigation.navigate('Login', { email: preview.invited_email, invite: token })} />
                <Button title="Create an account" variant="ghost" fullWidth onPress={() => navigation.navigate('Register', { invite: token })} />
              </View>
            ) : emailMismatch ? (
              <View style={{ gap: t.spacing[2] }}>
                <Txt color={t.colors.warning} size={t.fontSize.xs}>
                  You're signed in as <Txt weight="semibold">{user?.email}</Txt>, but this invite is for <Txt weight="semibold">{preview.invited_email}</Txt>. Sign out and back in with the invited email to accept.
                </Txt>
                <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                  <Button title="Cancel" variant="secondary" onPress={back} />
                  <Button title="Sign out & switch" style={{ flex: 1 }} fullWidth onPress={() => useAuthStore.getState().signOut()} />
                </View>
              </View>
            ) : emailMatches ? (
              <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
                <Button title="Cancel" variant="secondary" onPress={back} />
                <Button title="Accept invitation" style={{ flex: 1 }} fullWidth loading={accept.isPending} onPress={() => accept.mutate(token)} />
              </View>
            ) : null}
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
