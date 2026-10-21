import React from 'react';
import { Modal, View, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/components/ui/primitives';

/** Bottom-sheet modal shell used by all create/edit modals. */
export function ModalSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={{ flex: 1, backgroundColor: t.colors.backdrop }} onPress={onClose} />
        <View
          style={{
            backgroundColor: t.colors.surfaceOverlay,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            maxHeight: '90%',
            paddingBottom: insets.bottom + t.spacing[2],
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: t.spacing[4],
              borderBottomWidth: 1,
              borderBottomColor: t.colors.border,
            }}
          >
            <Txt variant="heading">{title}</Txt>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={22} color={t.colors.textSubtle} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: t.spacing[4], gap: t.spacing[4] }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: t.spacing[2],
                padding: t.spacing[4],
                borderTopWidth: 1,
                borderTopColor: t.colors.border,
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
