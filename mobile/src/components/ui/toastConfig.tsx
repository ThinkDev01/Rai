import React from 'react';
import { View, Pressable } from 'react-native';
import { CheckCircle2, AlertCircle, Info, Bell } from 'lucide-react-native';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/components/ui/primitives';
import type { ThemeColors } from '@/theme/tokens';

function ToastCard({ text1, text2, accent, icon }: { text1?: string; text2?: string; accent: keyof ThemeColors; icon: React.ReactNode }) {
  const t = useTheme();
  const color = t.colors[accent];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing[3],
        width: '92%',
        backgroundColor: t.colors.surfaceRaised,
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderColor: t.colors.border,
        borderLeftWidth: 4,
        borderLeftColor: color,
        paddingHorizontal: t.spacing[3],
        paddingVertical: t.spacing[3],
        ...t.elevation.md,
      }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        {text1 ? (
          <Txt weight="semibold" size={t.fontSize.sm} numberOfLines={2}>
            {text1}
          </Txt>
        ) : null}
        {text2 ? (
          <Txt variant="subtle" size={t.fontSize.xs} numberOfLines={2}>
            {text2}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function SuccessToast(p: ToastConfigParams<unknown>) {
  return <ToastCard text1={p.text1} text2={p.text2} accent="success" icon={<IconWrap color="success" Comp={CheckCircle2} />} />;
}
function ErrorToast(p: ToastConfigParams<unknown>) {
  return <ToastCard text1={p.text1} text2={p.text2} accent="danger" icon={<IconWrap color="danger" Comp={AlertCircle} />} />;
}
function InfoToast(p: ToastConfigParams<unknown>) {
  return <ToastCard text1={p.text1} text2={p.text2} accent="info" icon={<IconWrap color="info" Comp={Info} />} />;
}

function IconWrap({ color, Comp }: { color: keyof ThemeColors; Comp: any }) {
  const t = useTheme();
  return <Comp size={20} color={t.colors[color]} />;
}

function NotificationToast(p: ToastConfigParams<unknown>) {
  const t = useTheme();
  return (
    <Pressable onPress={p.onPress} style={{ width: '92%' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing[3],
          backgroundColor: t.colors.surfaceRaised,
          borderRadius: t.radius.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          borderLeftWidth: 4,
          borderLeftColor: t.colors.primary,
          paddingHorizontal: t.spacing[3],
          paddingVertical: t.spacing[3],
          ...t.elevation.md,
        }}
      >
        <View style={{
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: t.colors.primary + '20',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Bell size={16} color={t.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          {p.text1 ? (
            <Txt weight="semibold" size={t.fontSize.sm} numberOfLines={1}>
              {p.text1}
            </Txt>
          ) : null}
          {p.text2 ? (
            <Txt variant="subtle" size={t.fontSize.xs} numberOfLines={2} style={{ marginTop: 1 }}>
              {p.text2}
            </Txt>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const toastConfig: ToastConfig = {
  success: SuccessToast,
  error: ErrorToast,
  info: InfoToast,
  notification: NotificationToast,
};
