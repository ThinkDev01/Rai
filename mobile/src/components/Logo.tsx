import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Circle } from 'react-native-svg';
import { Txt } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';

/** Rai mark — blue rounded capsule + circle "dot". */
export function LogoMark({ size = 32, color }: { size?: number; color?: string }) {
  const t = useTheme();
  const blue = color ?? t.colors.primary;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {/* capsule (left) */}
      <Rect x={6} y={9} width={13} height={26} rx={6.5} fill={blue} />
      {/* circle dot (upper right) */}
      <Circle cx={30} cy={14} r={6.5} fill={blue} />
    </Svg>
  );
}

/** Logo + wordmark. */
export function Logo({ size = 32, showWordmark = true, color }: { size?: number; showWordmark?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[2] }}>
      <LogoMark size={size} color={color} />
      {showWordmark ? (
        <Txt weight="bold" size={size * 0.7} color={color ?? t.colors.text}>
          rai
        </Txt>
      ) : null}
    </View>
  );
}
