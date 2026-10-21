import React, { useState } from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './primitives';

interface FieldProps extends TextInputProps {
  label?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  secure?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  required,
  error,
  hint,
  secure,
  containerStyle,
  multiline,
  style,
  ...rest
}: FieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);

  return (
    <View style={[{ gap: t.spacing[1.5] }, containerStyle]}>
      {label ? (
        <Txt variant="subtle" weight="medium" size={t.fontSize.xs}>
          {label}
          {required ? <Txt color={t.colors.danger}> *</Txt> : null}
        </Txt>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.colors.surfaceRaised,
          borderRadius: t.radius.md,
          borderWidth: 1,
          borderColor: error
            ? t.colors.danger
            : focused
            ? t.colors.borderFocus
            : t.colors.border,
          paddingHorizontal: t.spacing[3],
          minHeight: multiline ? 80 : 44,
        }}
      >
        <TextInput
          style={[
            {
              flex: 1,
              color: t.colors.text,
              fontSize: t.fontSize.sm,
              paddingVertical: multiline ? t.spacing[2] : 0,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            style,
          ]}
          placeholderTextColor={t.colors.textPlaceholder}
          secureTextEntry={hidden}
          multiline={multiline}
          onFocus={e => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {secure ? (
          <Pressable onPress={() => setHidden(h => !h)} hitSlop={8}>
            {hidden ? (
              <Eye size={18} color={t.colors.textSubtle} />
            ) : (
              <EyeOff size={18} color={t.colors.textSubtle} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Txt size={t.fontSize.xs} color={t.colors.danger}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="placeholder" size={t.fontSize.xs}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export const inputHairline = StyleSheet.hairlineWidth;
