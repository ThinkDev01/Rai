import React from 'react';
import { View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, withAlpha } from '@/components/ui/primitives';
import { useCurrentMembership, useCurrentRole } from '@/store/authStore';

// Renders a sticky warning banner when the org subscription is suspended or
// cancelled. Owner sees "Renew" → SubscriptionPlans. Others see "contact owner".
// Renders nothing when status is trial or active.
export function SubscriptionBanner() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const membership = useCurrentMembership();
  const role = useCurrentRole();

  if (!membership) return null;
  const { subscription_status } = membership;
  if (subscription_status !== 'suspended' && subscription_status !== 'cancelled') return null;

  const isOwner = role === 'owner';
  const isSuspended = subscription_status === 'suspended';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing[2],
        paddingHorizontal: t.spacing[4],
        paddingVertical: t.spacing[2],
        backgroundColor: withAlpha(t.colors.warning, 0.12),
        borderBottomWidth: 1,
        borderBottomColor: withAlpha(t.colors.warning, 0.3),
      }}
    >
      <AlertTriangle size={14} color={t.colors.warning} style={{ flexShrink: 0 }} />
      <Txt size={t.fontSize.xs} style={{ flex: 1 }} numberOfLines={2}>
        {isSuspended
          ? 'Your subscription has expired. The org is now read-only.'
          : 'Subscription cancelled. Access ends at the period end.'}
        {!isOwner ? ' Contact your owner to renew.' : ''}
      </Txt>
      {isOwner ? (
        <Pressable
          onPress={() => nav.navigate('SubscriptionPlans')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: t.spacing[2],
            paddingVertical: t.spacing[1],
            borderRadius: t.radius.sm,
            backgroundColor: t.colors.warning,
          }}
        >
          <Txt size={t.fontSize.xxs} weight="semibold" color="#000">
            Renew
          </Txt>
          <ArrowRight size={11} color="#000" />
        </Pressable>
      ) : null}
    </View>
  );
}
