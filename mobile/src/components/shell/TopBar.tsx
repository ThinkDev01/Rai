import React from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, Search, Sun, Moon, ChevronLeft, Bell } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/components/ui/primitives';
import { useUnreadCount } from '@/api/notifications';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenu?: () => void;
  onBack?: () => void;
  onSearch?: () => void;
  showThemeToggle?: boolean;
  showBell?: boolean;
  right?: React.ReactNode;
}

export function TopBar({ title, subtitle, onMenu, onBack, onSearch, showThemeToggle = true, showBell = false, right }: TopBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const unread = useUnreadCount();
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: t.colors.surfaceRaised,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing[2],
          paddingHorizontal: t.spacing[3],
          height: 52,
        }}
      >
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={{ padding: 4 }}>
            <ChevronLeft size={24} color={t.colors.text} />
          </Pressable>
        ) : onMenu ? (
          <Pressable onPress={onMenu} hitSlop={8} style={{ padding: 4 }}>
            <Menu size={22} color={t.colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Txt weight="bold" size={t.fontSize.lg} numberOfLines={1}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="subtle" size={t.fontSize.xs} numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {right}
        {onSearch ? (
          <Pressable onPress={onSearch} hitSlop={8} style={{ padding: 6 }}>
            <Search size={20} color={t.colors.text} />
          </Pressable>
        ) : null}
        {showBell ? (
          <Pressable onPress={() => nav.navigate('Notifications')} hitSlop={8} style={{ padding: 6 }}>
            <View>
              <Bell size={20} color={t.colors.text} />
              {unread > 0 ? (
                <View style={{
                  position: 'absolute', top: -3, right: -3,
                  minWidth: 16, height: 16, borderRadius: 8,
                  backgroundColor: t.colors.danger,
                  alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 3,
                }}>
                  <Txt style={{ color: '#fff', fontSize: 9, fontWeight: '700', lineHeight: 12 }}>
                    {unread > 99 ? '99+' : String(unread)}
                  </Txt>
                </View>
              ) : null}
            </View>
          </Pressable>
        ) : null}
        {showThemeToggle ? (
          <Pressable onPress={t.toggle} hitSlop={8} style={{ padding: 6 }}>
            {t.dark ? <Sun size={20} color={t.colors.text} /> : <Moon size={20} color={t.colors.text} />}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
