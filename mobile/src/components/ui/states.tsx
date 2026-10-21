import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Animated, StyleProp, ViewStyle } from 'react-native';
import { AlertTriangle, FileQuestion, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, Button } from './primitives';

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing[6], gap: t.spacing[3] }}>
      <ActivityIndicator color={t.colors.primary} />
      {label ? <Txt variant="subtle">{label}</Txt> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  ctaLabel,
  onCta,
  icon,
}: {
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  icon?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: t.spacing[8], gap: t.spacing[2] }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: t.colors.border,
          backgroundColor: t.colors.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: t.spacing[2],
        }}
      >
        {icon ?? <FileQuestion size={26} color={t.colors.textPlaceholder} />}
      </View>
      <Txt variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {description ? (
        <Txt variant="subtle" style={{ textAlign: 'center' }}>
          {description}
        </Txt>
      ) : null}
      {ctaLabel && onCta ? <Button title={ctaLabel} onPress={onCta} style={{ marginTop: t.spacing[2], alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function ErrorState({
  message = 'Something went wrong',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: t.spacing[6], gap: t.spacing[3] }}>
      <AlertTriangle size={40} color={t.colors.danger} />
      <Txt variant="subtle" style={{ textAlign: 'center' }}>
        {message}
      </Txt>
      {onRetry ? (
        <Button
          title="Try again"
          variant="secondary"
          onPress={onRetry}
          leftIcon={<RefreshCw size={16} color={t.colors.text} />}
          style={{ alignSelf: 'center' }}
        />
      ) : null}
    </View>
  );
}

export function Skeleton({ width, height = 14, radius = 6, style }: { width?: number | string; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: t.colors.surfaceSunken, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonRow() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing[3], paddingVertical: t.spacing[3] }}>
      <Skeleton width={20} height={20} radius={10} />
      <Skeleton width={60} height={14} />
      <Skeleton width={'40%'} height={14} />
      <View style={{ flex: 1 }} />
      <Skeleton width={56} height={18} radius={9} />
    </View>
  );
}

export function SkeletonCard() {
  const t = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.colors.border,
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.surfaceRaised,
        padding: t.spacing[4],
        gap: t.spacing[2],
      }}
    >
      <Skeleton width={'30%'} height={12} />
      <Skeleton width={64} height={28} />
      <Skeleton width={'50%'} height={12} />
    </View>
  );
}
