import React, { useMemo, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { ChevronDown, Check, Search } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './primitives';

export interface PickerOption<V extends string> {
  value: V;
  label: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  color?: string;
}

interface PickerProps<V extends string> {
  value: V;
  options: PickerOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  title?: string;
  triggerStyle?: StyleProp<ViewStyle>;
  accentColor?: string;
}

export function Picker<V extends string>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  searchable,
  title,
  triggerStyle,
  accentColor,
}: PickerProps<V>) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selected = options.find(o => o.value === value);
  const filtered = useMemo(() => {
    if (!searchable || !q.trim()) return options;
    const needle = q.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(needle));
  }, [options, q, searchable]);

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing[2],
            minHeight: 40,
            paddingHorizontal: t.spacing[3],
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: accentColor ?? t.colors.border,
            backgroundColor: t.colors.surfaceRaised,
            opacity: disabled ? 0.6 : 1,
          },
          triggerStyle,
        ]}
      >
        {selected?.leading}
        <Txt
          style={{ flex: 1 }}
          numberOfLines={1}
          color={accentColor ?? (selected ? t.colors.text : t.colors.textPlaceholder)}
          weight={accentColor ? 'semibold' : 'regular'}
        >
          {selected?.label ?? placeholder}
        </Txt>
        {selected?.trailing}
        {!disabled ? <ChevronDown size={16} color={t.colors.textSubtle} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: t.colors.backdrop, justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: t.colors.surfaceOverlay,
              borderTopLeftRadius: t.radius.xl,
              borderTopRightRadius: t.radius.xl,
              paddingTop: t.spacing[3],
              paddingBottom: t.spacing[6],
              maxHeight: '70%',
            }}
            onPress={e => e.stopPropagation()}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: t.colors.border,
                marginBottom: t.spacing[2],
              }}
            />
            {title ? (
              <Txt variant="heading" style={{ paddingHorizontal: t.spacing[4], marginBottom: t.spacing[2] }}>
                {title}
              </Txt>
            ) : null}
            {searchable ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing[2],
                  marginHorizontal: t.spacing[4],
                  marginBottom: t.spacing[2],
                  paddingHorizontal: t.spacing[3],
                  height: 40,
                  borderRadius: t.radius.md,
                  borderWidth: 1,
                  borderColor: t.colors.border,
                  backgroundColor: t.colors.surface,
                }}
              >
                <Search size={16} color={t.colors.textSubtle} />
                <TextInput
                  autoFocus
                  value={q}
                  onChangeText={setQ}
                  placeholder="Search…"
                  placeholderTextColor={t.colors.textPlaceholder}
                  style={{ flex: 1, color: t.colors.text, fontSize: t.fontSize.sm }}
                />
              </View>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled">
              {filtered.map(opt => {
                const isSel = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQ('');
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing[3],
                      paddingHorizontal: t.spacing[4],
                      paddingVertical: t.spacing[3],
                      backgroundColor: isSel ? t.colors.primarySubtle : 'transparent',
                    }}
                  >
                    {opt.leading}
                    <Txt style={{ flex: 1 }} color={opt.color} weight={isSel ? 'semibold' : 'regular'}>
                      {opt.label}
                    </Txt>
                    {opt.trailing}
                    {isSel ? <Check size={16} color={t.colors.primary} /> : null}
                  </Pressable>
                );
              })}
              {filtered.length === 0 ? (
                <Txt variant="subtle" style={{ padding: t.spacing[4], textAlign: 'center' }}>
                  No matches
                </Txt>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const pickerHairline = StyleSheet.hairlineWidth;
