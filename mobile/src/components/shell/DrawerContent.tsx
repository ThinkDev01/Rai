import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, Plus, Building2, Check } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, Avatar, Divider, withAlpha } from '@/components/ui/primitives';
import { RoleChip, SubscriptionChip } from '@/components/ui/chips';
import { useAuthStore } from '@/store/authStore';
import { useSwitchOrg } from '@/api/orgs';
import { orgColor } from '@/lib/colors';
import { ROLE_LABEL } from '@/lib/permissions';
import { confirm } from '@/lib/confirm';

export function DrawerContent(props: DrawerContentComponentProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { navigation } = props;
  const user = useAuthStore(s => s.user);
  const memberships = useAuthStore(s => s.memberships);
  const currentOrgId = useAuthStore(s => s.currentOrgId);
  const signOut = useAuthStore(s => s.signOut);
  const switchOrg = useSwitchOrg();

  const current = memberships.find(m => m.org_id === currentOrgId);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surfaceRaised, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + t.spacing[4] }}>
        {/* User identity */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], padding: t.spacing[4] }}>
          <Avatar name={user?.name ?? user?.email ?? '?'} id={user?.id} size={40} />
          <View style={{ flex: 1 }}>
            <Txt weight="semibold" numberOfLines={1}>
              {user?.name ?? 'You'}
            </Txt>
            <Txt variant="subtle" size={t.fontSize.xs} numberOfLines={1}>
              {user?.email}
            </Txt>
          </View>
        </View>
        <Divider />

        {/* Org switcher */}
        <View style={{ padding: t.spacing[3], gap: t.spacing[1] }}>
          <Txt variant="subtle" size={t.fontSize.xxs} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Organization
          </Txt>
          {memberships.map(m => {
            const active = m.org_id === currentOrgId;
            return (
              <Pressable
                key={m.org_id}
                onPress={() => {
                  if (!active) switchOrg(m);
                  navigation.closeDrawer();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing[2],
                  padding: t.spacing[2],
                  borderRadius: t.radius.md,
                  backgroundColor: active ? withAlpha(t.colors.primary, 0.1) : 'transparent',
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: orgColor(m.org_slug),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Building2 size={15} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight={active ? 'semibold' : 'regular'} numberOfLines={1}>
                    {m.org_name}
                  </Txt>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <RoleChip role={m.role} size="sm" />
                    <SubscriptionChip status={m.subscription_status} size="sm" />
                  </View>
                </View>
                {active ? <Check size={16} color={t.colors.primary} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              navigation.closeDrawer();
              (navigation as any).navigate('CreateOrg');
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], padding: t.spacing[2] }}
          >
            <Plus size={18} color={t.colors.primary} />
            <Txt variant="link">Create organization</Txt>
          </Pressable>
        </View>
        <Divider />

        {current ? (
          <Txt variant="placeholder" size={t.fontSize.xxs} style={{ paddingHorizontal: t.spacing[4], paddingTop: t.spacing[2] }}>
            {current.role_label || ROLE_LABEL[current.role]} · {current.org_name}
          </Txt>
        ) : null}

        {/* Sign out */}
        <Pressable
          onPress={async () => {
            const ok = await confirm({ title: 'Sign out?', confirmLabel: 'Sign out', destructive: true });
            if (ok) signOut();
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], padding: t.spacing[4], marginTop: t.spacing[2] }}
        >
          <LogOut size={20} color={t.colors.danger} />
          <Txt color={t.colors.danger} weight="medium">
            Sign out
          </Txt>
        </Pressable>
      </ScrollView>
    </View>
  );
}
