import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card, Button, Txt, withAlpha } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/Input';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/theme/ThemeProvider';
import { useCreateOrg, useDomainPeers, useDeletedOrgs, useRestoreOrg } from '@/api/orgs';
import { useAuthStore } from '@/store/authStore';
import { generateOrgSlug, ORG_SLUG_RE } from '@/lib/text';
import { formatDate } from '@/lib/dates';

// Loosely typed so the same screen serves both the root "Welcome" (no-org) and
// the app-stack "CreateOrg" (create-another) routes.
interface Props {
  navigation: any;
  route: { params?: { create?: boolean } };
}

export function WelcomeScreen({ navigation, route }: Props) {
  const t = useTheme();
  const memberships = useAuthStore(s => s.memberships);
  const email = useAuthStore(s => s.user?.email ?? null);
  const createOrg = useCreateOrg();
  const { data: peers = [] } = useDomainPeers(email);
  const { data: deletedOrgs = [] } = useDeletedOrgs();
  const restoreOrg = useRestoreOrg();

  const hasOrgs = memberships.length > 0;
  // `create: true` → user already has orgs and intentionally wants another:
  // jump straight to the form, with a Back to return where they were.
  const forceCreate = route.params?.create === true;
  const canGoBack = navigation.canGoBack();

  const unknownPeers = useMemo(() => {
    const myIds = new Set(memberships.map(m => m.org_id));
    return peers.filter(p => !myIds.has(p.id));
  }, [peers, memberships]);

  // Start on the form when forcing create; otherwise (no orgs) show the prompt.
  const [showForm, setShowForm] = useState(forceCreate);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(generateOrgSlug(v));
  }

  function onSubmit() {
    setError(null);
    const n = name.trim();
    if (n.length < 2 || n.length > 100) return setError('Org name must be 2–100 characters');
    if (!ORG_SLUG_RE.test(slug)) return setError('Lowercase letters, numbers, hyphens. Start with a letter. 2–50 chars.');
    createOrg.mutate(
      { name: n, slug },
      {
        // For the create-another flow, return to the app (now on the new org).
        // For the no-org flow, RootNavigator switches to the app automatically
        // once memberships become non-empty.
        onSuccess: () => {
          if (forceCreate && canGoBack) navigation.goBack();
        },
      },
    );
  }

  // Back-out of the create-another flow without creating.
  function onBack() {
    if (forceCreate) {
      if (canGoBack) navigation.goBack();
    } else {
      setShowForm(false);
    }
  }

  const PeerWarning = () =>
    unknownPeers.length > 0 ? (
      <View style={{ borderRadius: t.radius.md, borderWidth: 1, borderColor: withAlpha(t.colors.warning, 0.4), backgroundColor: withAlpha(t.colors.warning, 0.1), padding: t.spacing[3], gap: 4 }}>
        <Txt weight="semibold" color={t.colors.warning} size={t.fontSize.sm}>
          An organization with your email domain already exists
        </Txt>
        <Txt size={t.fontSize.xs}>{unknownPeers.map(p => p.name).join(', ')}</Txt>
        <Txt variant="placeholder" size={t.fontSize.xs}>
          Ask an admin there for an invite if it's your team's workspace. Otherwise continue below.
        </Txt>
      </View>
    ) : null;

  return (
    <Screen scroll contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: t.spacing[5] }}>
      <View style={{ alignItems: 'center' }}>
        <Logo size={40} />
      </View>

      {/* Domain-peer warning only matters when the user has no orgs yet. */}
      {!hasOrgs ? <PeerWarning /> : null}

      {!showForm && !hasOrgs ? (
        // Empty-state prompt — ONLY for users with zero organizations.
        <Card style={{ gap: t.spacing[3] }}>
          <Txt variant="title">Welcome to Rai</Txt>
          <Txt variant="subtle">You're not part of any organization yet.</Txt>
          <View style={{ gap: 4 }}>
            {unknownPeers.length === 0 ? (
              <Txt variant="subtle" size={t.fontSize.xs}>• Waiting for an invite? Ask a teammate to invite your email.</Txt>
            ) : null}
            <Txt variant="subtle" size={t.fontSize.xs}>• Starting fresh? Create your own organization.</Txt>
          </View>
          <Button title="Create an organization" fullWidth onPress={() => setShowForm(true)} />
          <Txt variant="link" size={t.fontSize.xs} style={{ textAlign: 'center' }} onPress={() => useAuthStore.getState().signOut()}>
            Sign out
          </Txt>
        </Card>
      ) : (
        // Create form — shown directly when forcing create (user has orgs) or
        // after tapping "Create an organization" from the empty-state prompt.
        <Card style={{ gap: t.spacing[4] }}>
          <View>
            <Txt variant="title">Create organization</Txt>
            <Txt variant="subtle" size={t.fontSize.xs}>
              {hasOrgs ? "A separate org you'll own. You can switch between orgs anytime." : "You'll be the owner. You can rename or transfer later."}
            </Txt>
          </View>
          <TextField label="Organization name" required value={name} onChangeText={onName} placeholder="Acme Inc" maxLength={100} />
          <TextField
            label="Identifier (slug)"
            required
            autoCapitalize="none"
            value={slug}
            onChangeText={v => {
              setSlugTouched(true);
              setSlug(v.toLowerCase());
            }}
            hint="Lowercase letters, numbers, hyphens. Used in your workspace address."
            placeholder="acme"
          />
          {error ? (
            <Txt color={t.colors.danger} size={t.fontSize.xs}>
              {error}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', gap: t.spacing[2] }}>
            {forceCreate || hasOrgs ? <Button title="Cancel" variant="secondary" onPress={onBack} /> : <Button title="Back" variant="secondary" onPress={onBack} />}
            <Button title="Create" loading={createOrg.isPending} onPress={onSubmit} style={{ flex: 1 }} fullWidth />
          </View>
        </Card>
      )}
      {deletedOrgs.length > 0 ? (
        <Card style={{ gap: t.spacing[3] }}>
          <Txt variant="heading">Recently deleted</Txt>
          <Txt variant="subtle" size={t.fontSize.xs}>
            These organizations were deleted within the last 30 days. Restore to regain full access.
          </Txt>
          {deletedOrgs.map((org, i) => (
            <View key={org.id}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: t.spacing[1] }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing[2] }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="semibold" numberOfLines={1}>{org.name}</Txt>
                  <Txt variant="placeholder" size={t.fontSize.xxs}>
                    @{org.slug} · restore by {formatDate(org.restoreDeadline)}
                    {org.subscriptionDaysLeft != null ? ` · ${org.subscriptionDaysLeft}d subscription left` : ''}
                  </Txt>
                </View>
                <Button
                  title="Restore"
                  size="sm"
                  variant="secondary"
                  loading={restoreOrg.isPending}
                  onPress={() => restoreOrg.mutate(org.id)}
                />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
