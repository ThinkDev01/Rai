import React, { useCallback } from 'react';
import { View, FlatList, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  BellOff,
  CheckCheck,
  Ticket,
  Layers,
  FolderOpen,
  Users,
  CreditCard,
  MessageSquare,
  UserCheck,
  Bell,
  Settings2,
} from 'lucide-react-native';
import { TopBar } from '@/components/shell/TopBar';
import { Txt, withAlpha } from '@/components/ui/primitives';
import { Button } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  type AppNotification,
} from '@/api/notifications';
import { navigateFromLink } from '@/lib/notificationNav';
import { timeAgo } from '@/lib/dates';

// ── Type → icon + accent colour ──────────────────────────────────────────────

type IconSpec = { Icon: any; color: string };

function getIconSpec(type: string, colors: any): IconSpec {
  if (type.startsWith('ticket_comment')) return { Icon: MessageSquare, color: colors.info };
  if (type.startsWith('ticket'))         return { Icon: Ticket,         color: colors.primary };
  if (type.startsWith('sprint'))         return { Icon: Layers,         color: '#8b5cf6' };
  if (type.startsWith('project'))        return { Icon: FolderOpen,     color: colors.success };
  if (type === 'invite_accepted')        return { Icon: UserCheck,      color: colors.success };
  if (type.startsWith('org'))            return { Icon: Users,          color: colors.warning };
  if (type.startsWith('trial') || type.startsWith('subscription'))
                                         return { Icon: CreditCard,     color: colors.danger };
  return { Icon: Bell, color: colors.primary };
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotifItem({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: (item: AppNotification) => void;
}) {
  const t = useTheme();
  const isUnread = !item.read_at;
  const { Icon, color } = getIconSpec(item.type, t.colors);

  return (
    <Pressable
      onPress={() => onPress(item)}
      android_ripple={{ color: withAlpha(t.colors.primary, 0.08) }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.spacing[3],
        paddingHorizontal: t.spacing[4],
        paddingVertical: t.spacing[3],
        backgroundColor: isUnread
          ? withAlpha(t.colors.primary, 0.04)
          : pressed ? t.colors.surfaceSunken : 'transparent',
      })}
    >
      {/* Left accent strip for unread */}
      <View style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        backgroundColor: isUnread ? t.colors.primary : 'transparent',
        borderRadius: 2,
      }} />

      {/* Icon circle */}
      <View style={{
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: withAlpha(color, 0.12),
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={18} color={color} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt
          weight={isUnread ? 'semibold' : 'regular'}
          size={t.fontSize.sm}
          numberOfLines={3}
          style={{ lineHeight: 20 }}
        >
          {item.title}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2], marginTop: 2 }}>
          {item.org_name ? (
            <>
              <Txt variant="subtle" size={t.fontSize.xxs} numberOfLines={1} style={{ flexShrink: 1 }}>
                {item.org_name}
              </Txt>
              <Txt variant="placeholder" size={t.fontSize.xxs}>·</Txt>
            </>
          ) : null}
          <Txt variant="placeholder" size={t.fontSize.xxs}>
            {timeAgo(item.created_at)}
          </Txt>
        </View>
      </View>

      {/* Unread dot */}
      {isUnread ? (
        <View style={{
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: t.colors.primary,
          marginTop: 6, flexShrink: 0,
        }} />
      ) : null}
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { data: notificationsRaw, isLoading, isError, refetch, isFetching } = useNotifications();
  const notifications = Array.isArray(notificationsRaw) ? notificationsRaw : [];
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const unreadCount = notifications.filter(n => !n.read_at).length;

  const handlePress = useCallback((item: AppNotification) => {
    if (!item.read_at) markRead.mutate(item.id);
    if (item.link) navigateFromLink(item.link, nav);
  }, [markRead, nav]);

  const ListHeader = (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: t.spacing[4], paddingTop: t.spacing[3], paddingBottom: t.spacing[2],
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
        <Txt weight="semibold" size={t.fontSize.base}>All notifications</Txt>
        {unreadCount > 0 ? (
          <View style={{
            paddingHorizontal: t.spacing[2], paddingVertical: 2,
            backgroundColor: t.colors.primary, borderRadius: 10,
            minWidth: 20, alignItems: 'center',
          }}>
            <Txt style={{ color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 16 }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Txt>
          </View>
        ) : null}
      </View>
      {unreadCount > 0 ? (
        <Button
          title="Mark all read"
          size="sm"
          variant="ghost"
          loading={markAllRead.isPending}
          leftIcon={<CheckCheck size={13} color={t.colors.primary} />}
          onPress={() => markAllRead.mutate()}
        />
      ) : null}
    </View>
  );

  const ListEmpty = (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: t.spacing[3] }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: t.colors.surfaceSunken,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <BellOff size={28} color={t.colors.textPlaceholder} />
      </View>
      <Txt weight="semibold" size={t.fontSize.base} style={{ textAlign: 'center' }}>
        You're all caught up
      </Txt>
      <Txt variant="subtle" size={t.fontSize.sm} style={{ textAlign: 'center', maxWidth: 240 }}>
        New notifications from tickets, sprints and projects will appear here.
      </Txt>
    </View>
  );

  const Separator = () => (
    <View style={{ height: 1, backgroundColor: t.colors.border, marginLeft: t.spacing[4] + 38 + t.spacing[3] }} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <TopBar
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        onBack={() => nav.goBack()}
        showThemeToggle={false}
        right={
          <Pressable
            onPress={() => nav.navigate('Settings')}
            hitSlop={8}
            style={{ padding: 6 }}
          >
            <Settings2 size={20} color={t.colors.textSubtle} />
          </Pressable>
        }
      />
      {isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing[3] }}>
          <Txt variant="subtle">Could not load notifications</Txt>
          <Button title="Retry" size="sm" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : (
        <FlatList
          data={isLoading ? [] : notifications}
          keyExtractor={n => String(n.id)}
          renderItem={({ item }) => <NotifItem item={item} onPress={handlePress} />}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={isLoading ? null : ListHeader}
          ListEmptyComponent={isLoading ? null : ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={t.colors.primary}
              colors={[t.colors.primary]}
            />
          }
          ListFooterComponent={
            notifications.length > 0 ? (
              <Pressable
                onPress={() => nav.navigate('Settings')}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: t.spacing[2], paddingVertical: t.spacing[5],
                }}
              >
                <Settings2 size={13} color={t.colors.textPlaceholder} />
                <Txt variant="placeholder" size={t.fontSize.xs}>Notification settings</Txt>
              </Pressable>
            ) : null
          }
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + t.spacing[6],
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
