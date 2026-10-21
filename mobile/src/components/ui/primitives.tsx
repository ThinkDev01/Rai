import React from 'react';
import {
  Text,
  TextProps,
  View,
  ViewProps,
  Pressable,
  PressableProps,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';
import { memberColor, initialsOf } from '@/lib/colors';
import { PROJECT_ICON_MAP } from '@/lib/projectIcons';

// ── Themed Text ────────────────────────────────────────────────────────────────
type TxtVariant = 'body' | 'subtle' | 'placeholder' | 'heading' | 'title' | 'caption' | 'link';
interface TxtProps extends TextProps {
  variant?: TxtVariant;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  size?: number;
  color?: string;
}
export function Txt({ variant = 'body', weight, size, color, style, ...rest }: TxtProps) {
  const t = useTheme();
  const map: Record<TxtVariant, TextStyle> = {
    body: { color: t.colors.text, fontSize: t.fontSize.sm },
    subtle: { color: t.colors.textSubtle, fontSize: t.fontSize.sm },
    placeholder: { color: t.colors.textPlaceholder, fontSize: t.fontSize.sm },
    caption: { color: t.colors.textSubtle, fontSize: t.fontSize.xs },
    heading: { color: t.colors.text, fontSize: t.fontSize.lg, fontWeight: '600' },
    title: { color: t.colors.text, fontSize: t.fontSize.xl, fontWeight: '700' },
    link: { color: t.colors.textLink, fontSize: t.fontSize.sm },
  };
  return (
    <Text
      style={[
        map[variant],
        weight ? { fontWeight: t.fontWeight[weight] } : null,
        size ? { fontSize: size } : null,
        color ? { color } : null,
        style,
      ]}
      {...rest}
    />
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────────
interface CardProps extends ViewProps {
  raised?: boolean;
  padded?: boolean;
}
export function Card({ raised = true, padded = true, style, ...rest }: CardProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: raised ? t.colors.surfaceRaised : t.colors.surface,
          borderRadius: t.radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.colors.border,
          padding: padded ? t.spacing[4] : 0,
        },
        raised ? t.elevation.sm : null,
        style,
      ]}
      {...rest}
    />
  );
}

// ── Button ─────────────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'ghost';
type BtnSize = 'sm' | 'md' | 'lg';
interface BtnProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth,
  leftIcon,
  disabled,
  style,
  ...rest
}: BtnProps) {
  const t = useTheme();
  const heights: Record<BtnSize, number> = { sm: 32, md: 40, lg: 48 };
  const pad: Record<BtnSize, number> = { sm: t.spacing[3], md: t.spacing[4], lg: t.spacing[5] };
  const fs: Record<BtnSize, number> = { sm: t.fontSize.xs, md: t.fontSize.sm, lg: t.fontSize.base };

  const bg: Record<BtnVariant, string> = {
    primary: t.colors.primary,
    secondary: t.colors.surfaceRaised,
    subtle: t.colors.surfaceSunken,
    danger: t.colors.danger,
    ghost: 'transparent',
  };
  const fg: Record<BtnVariant, string> = {
    primary: t.colors.primaryText,
    secondary: t.colors.text,
    subtle: t.colors.text,
    danger: '#FFFFFF',
    ghost: t.colors.primary,
  };
  const border: Record<BtnVariant, string | undefined> = {
    primary: undefined,
    secondary: t.colors.border,
    subtle: undefined,
    danger: undefined,
    ghost: undefined,
  };

  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: heights[size],
          paddingHorizontal: pad[size],
          borderRadius: t.radius.md,
          backgroundColor: bg[variant],
          borderWidth: border[variant] ? StyleSheet.hairlineWidth : 0,
          borderColor: border[variant],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing[2],
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg[variant]} />
      ) : (
        <>
          {leftIcon}
          <Text style={{ color: fg[variant], fontSize: fs[size], fontWeight: '600' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ── Chip / Badge ─────────────────────────────────────────────────────────────────
interface ChipProps {
  label: string;
  color?: string;
  bg?: string;
  solid?: boolean;
  outline?: boolean;
  size?: 'sm' | 'md';
  uppercase?: boolean;
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}
export function Chip({
  label,
  color,
  bg,
  solid,
  outline,
  size = 'md',
  uppercase,
  leading,
  style,
}: ChipProps) {
  const t = useTheme();
  const fg = solid ? '#FFFFFF' : color ?? t.colors.textSubtle;
  const background = solid ? color ?? t.colors.primary : bg ?? 'transparent';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          borderRadius: t.radius.sm,
          paddingHorizontal: size === 'sm' ? 5 : 7,
          paddingVertical: size === 'sm' ? 2 : 3,
          backgroundColor: background,
          borderWidth: outline ? StyleSheet.hairlineWidth : 0,
          borderColor: color ? withAlpha(color, 0.4) : t.colors.border,
        },
        style,
      ]}
    >
      {leading}
      <Text
        style={{
          color: fg,
          fontSize: size === 'sm' ? t.fontSize.xxs : t.fontSize.xs,
          fontWeight: '600',
          textTransform: uppercase ? 'uppercase' : 'none',
          letterSpacing: uppercase ? 0.3 : 0,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────────
interface AvatarProps {
  name: string;
  id?: string;
  initials?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}
export function Avatar({ name, id, initials, size = 28, style }: AvatarProps) {
  const bg = memberColor(id ?? name);
  const text = (initials ?? initialsOf(name)).slice(0, 2);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

// ── Colored key square (project/sprint identity) ─────────────────────────────────
export function KeySquare({
  keyText,
  color,
  size = 28,
  avatarType,
  avatarValue,
}: {
  keyText: string;
  color: string;
  size?: number;
  avatarType?: 'initials' | 'icon';
  avatarValue?: string | null;
}) {
  const iconDef = avatarType === 'icon' && avatarValue ? PROJECT_ICON_MAP.get(avatarValue) : null;
  const radius = Math.round(size * 0.22);

  if (iconDef) {
    const { Icon, gradient } = iconDef;
    return (
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon size={Math.round(size * 0.52)} color="#fff" strokeWidth={2} />
      </LinearGradient>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.32, fontWeight: '700' }}>
        {keyText.slice(0, 3).toUpperCase()}
      </Text>
    </View>
  );
}

// ── Divider ─────────────────────────────────────────────────────────────────────────
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }, style]} />
  );
}

/** Add alpha to a hex color (#RRGGBB → rgba). */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
