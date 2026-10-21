import React from 'react';
import { View, Pressable } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, Avatar } from '@/components/ui/primitives';
import { TypeIcon, PriorityIcon, StatusChip } from '@/components/ui/chips';
import type { TicketType, Priority, TicketStatus, Member } from '@/types/api.types';

export interface TicketRowData {
  key: string;
  title: string;
  type: TicketType;
  priority: Priority;
  status: TicketStatus;
  assignee?: Member | null;
  assigneeName?: string | null;
}

export function TicketRow({ ticket, onPress }: { ticket: TicketRowData; onPress?: () => void }) {
  const t = useTheme();
  const name = ticket.assignee?.name ?? ticket.assigneeName ?? null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing[2],
        paddingVertical: t.spacing[2.5],
        paddingHorizontal: t.spacing[1],
        backgroundColor: pressed ? t.colors.surfaceSunken : 'transparent',
        borderRadius: t.radius.sm,
      })}
    >
      <TypeIcon type={ticket.type} />
      <PriorityIcon priority={ticket.priority} />
      <Txt size={t.fontSize.xs} weight="semibold" color={t.colors.textSubtle} style={{ width: 64 }} numberOfLines={1}>
        {ticket.key}
      </Txt>
      <Txt style={{ flex: 1 }} numberOfLines={1}>
        {ticket.title}
      </Txt>
      <StatusChip status={ticket.status} size="sm" />
      {name ? <Avatar name={name} id={ticket.assignee?.id ?? name} size={22} /> : (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: t.colors.textPlaceholder,
          }}
        />
      )}
    </Pressable>
  );
}
