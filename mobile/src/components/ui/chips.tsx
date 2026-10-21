import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Chip, Txt, withAlpha } from './primitives';
import { TYPE_META, PRIORITY_META, STATUS_META, SUBSCRIPTION_META } from '@/lib/ticketMeta';
import { ROLE_CHIP_STYLE, ROLE_LABEL } from '@/lib/permissions';
import { sprintDisplayStatus } from '@/lib/sprintUtils';
import type { TicketType, Priority, TicketStatus, UserRole, Sprint } from '@/types/api.types';
import type { SubscriptionStatus } from '@/types/auth.types';

export function TypeIcon({ type, size = 14 }: { type: TicketType; size?: number }) {
  const t = useTheme();
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const color = t.colors[meta.colorKey];
  return (
    <View
      style={{
        width: size + 8,
        height: size + 8,
        borderRadius: 4,
        backgroundColor: withAlpha(color, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size} color={color} />
    </View>
  );
}

export function TypeChip({ type }: { type: TicketType }) {
  const t = useTheme();
  const meta = TYPE_META[type];
  const color = t.colors[meta.colorKey];
  const Icon = meta.icon;
  return (
    <Chip label={meta.label} color={color} bg={withAlpha(color, 0.12)} leading={<Icon size={12} color={color} />} />
  );
}

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const t = useTheme();
  const meta = PRIORITY_META[priority];
  const Icon = meta.icon;
  return <Icon size={size} color={t.colors[meta.colorKey]} />;
}

export function StatusChip({ status, size = 'md' }: { status: TicketStatus; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const meta = STATUS_META[status];
  return (
    <Chip
      label={meta.label}
      color={t.colors[meta.colorKey]}
      bg={t.colors[meta.subtleKey]}
      outline
      size={size}
    />
  );
}

export function StatusDot({ status, size = 8 }: { status: TicketStatus; size?: number }) {
  const t = useTheme();
  const meta = STATUS_META[status];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.colors[meta.dotKey] }} />
  );
}

export function RoleChip({ role, size = 'md' }: { role: UserRole; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const style = ROLE_CHIP_STYLE[role];
  const color = t.colors[style.bgKey];
  return (
    <Chip
      label={ROLE_LABEL[role]}
      uppercase
      size={size}
      solid={style.solid}
      color={style.solid ? color : t.colors.textSubtle}
      bg={style.solid ? color : t.colors.surfaceSunken}
    />
  );
}

export function SubscriptionChip({ status, size = 'md' }: { status: SubscriptionStatus; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const meta = SUBSCRIPTION_META[status] ?? { label: status, colorKey: 'textSubtle' as const };
  const color = t.colors[meta.colorKey];
  return <Chip label={meta.label} uppercase size={size} color={color} bg={withAlpha(color, 0.12)} outline />;
}

export function SprintPill({ sprint, size = 'md' }: { sprint: Pick<Sprint, 'status' | 'archivedAt'>; size?: 'sm' | 'md' }) {
  const t = useTheme();
  const { label, colorKey } = sprintDisplayStatus(sprint);
  const color = t.colors[colorKey];
  return <Chip label={label} uppercase size={size} color={color} bg={withAlpha(color, 0.12)} outline />;
}

/** Small labeled stat used on dashboard / overview. */
export function StatBlock({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Txt size={t.fontSize['2xl']} weight="bold" color={color}>
        {value}
      </Txt>
      <Txt variant="subtle" size={t.fontSize.xs}>
        {label}
      </Txt>
    </View>
  );
}
