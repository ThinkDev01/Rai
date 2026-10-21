import React, { useEffect, useState } from 'react';
import { Modal, View, Pressable } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt, Button, withAlpha } from '@/components/ui/primitives';
import { registerConfirm, type ConfirmOptions } from '@/lib/confirm';

/**
 * Global host for the themed confirm dialog. Mount once near the app root.
 * `confirm(opts)` resolves through this component instead of the OS Alert,
 * so every confirmation matches the app's design system.
 */
export function ConfirmHost() {
  const t = useTheme();
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  useEffect(() => {
    registerConfirm(opts => new Promise<boolean>(resolve => setState({ opts, resolve })));
    return () => registerConfirm(null);
  }, []);

  if (!state) return null;
  const { opts, resolve } = state;
  const close = (v: boolean) => {
    resolve(v);
    setState(null);
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => close(false)}>
      <Pressable
        onPress={() => close(false)}
        style={{ flex: 1, backgroundColor: t.colors.backdrop, alignItems: 'center', justifyContent: 'center', padding: t.spacing[6] }}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 400,
            backgroundColor: t.colors.surfaceRaised,
            borderRadius: t.radius.lg,
            borderWidth: 1,
            borderColor: opts.destructive ? withAlpha(t.colors.danger, 0.4) : t.colors.border,
            padding: t.spacing[5],
            gap: t.spacing[4],
            ...t.elevation.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing[3] }}>
            {opts.destructive ? (
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: withAlpha(t.colors.danger, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={18} color={t.colors.danger} />
              </View>
            ) : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="heading" color={opts.destructive ? t.colors.danger : t.colors.text}>
                {opts.title}
              </Txt>
              {opts.description ? (
                <Txt variant="subtle" size={t.fontSize.sm}>
                  {opts.description}
                </Txt>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing[2] }}>
            <Button title={opts.cancelLabel ?? 'Cancel'} variant="secondary" onPress={() => close(false)} />
            <Button title={opts.confirmLabel ?? 'Confirm'} variant={opts.destructive ? 'danger' : 'primary'} onPress={() => close(true)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
