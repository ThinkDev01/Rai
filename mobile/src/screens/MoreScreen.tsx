import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Users, Settings as SettingsIcon, Search, ChevronRight, LogOut } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/shell/TopBar';
import { Card, Txt, Avatar, Divider } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore, useCurrentMembership } from '@/store/authStore';
import { confirm } from '@/lib/confirm';

export function MoreScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const user = useAuthStore(s => s.user);
  const membership = useCurrentMembership();

  // Admin actions live inline on the Team page (web merged /admin → /team),
  // so there's no separate Admin entry here.
  const items = [
    { label: 'Team', icon: Users, go: () => nav.navigate('Team') },
    { label: 'Search', icon: Search, go: () => nav.navigate('Search') },
    { label: 'Settings', icon: SettingsIcon, go: () => nav.navigate('Settings') },
  ];

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="More" subtitle={membership?.org_name} showThemeToggle />
      <Screen scroll>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], marginBottom: t.spacing[4] }}>
          <Avatar name={user?.name ?? user?.email ?? '?'} id={user?.id} size={44} />
          <View style={{ flex: 1 }}>
            <Txt weight="semibold">{user?.name ?? 'You'}</Txt>
            <Txt variant="subtle" size={t.fontSize.xs}>{user?.email}</Txt>
          </View>
        </Card>
        <Card padded={false}>
          {items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <View key={item.label}>
                {idx > 0 ? <Divider /> : null}
                <Pressable onPress={item.go} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], padding: t.spacing[4] }}>
                  <Icon size={20} color={t.colors.textSubtle} />
                  <Txt style={{ flex: 1 }} weight="medium">{item.label}</Txt>
                  <ChevronRight size={18} color={t.colors.textPlaceholder} />
                </Pressable>
              </View>
            );
          })}
        </Card>
        <Pressable
          onPress={async () => { if (await confirm({ title: 'Sign out?', confirmLabel: 'Sign out', destructive: true })) useAuthStore.getState().signOut(); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], padding: t.spacing[4], marginTop: t.spacing[2] }}
        >
          <LogOut size={20} color={t.colors.danger} />
          <Txt color={t.colors.danger} weight="medium">Sign out</Txt>
        </Pressable>
      </Screen>
    </View>
  );
}
