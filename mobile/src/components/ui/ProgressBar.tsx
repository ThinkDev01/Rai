import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function ProgressBar({
  value,
  height = 6,
  color,
}: {
  value: number; // 0–100
  height?: number;
  color?: string;
}) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.colors.surfaceSunken, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color ?? t.colors.success, borderRadius: height / 2 }} />
    </View>
  );
}
