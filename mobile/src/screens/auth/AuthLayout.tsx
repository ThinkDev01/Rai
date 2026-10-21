import React from 'react';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card, Txt } from '@/components/ui/primitives';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/theme/ThemeProvider';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Screen scroll padded keyboardAware={false} contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: t.spacing[5] }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'center', marginBottom: t.spacing[4] }}>
          <Logo size={40} />
        </View>
        <Card style={{ gap: t.spacing[4] }}>
          <View style={{ gap: t.spacing[1] }}>
            <Txt variant="title">{title}</Txt>
            {subtitle ? <Txt variant="subtle">{subtitle}</Txt> : null}
          </View>
          {children}
        </Card>
        {footer ? <View style={{ alignItems: 'center', marginTop: t.spacing[4] }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
