import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, RefreshControl, StatusBar, Keyboard, Platform, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Disable the keyboard-height bottom padding (e.g. centered auth screens). */
  keyboardAware?: boolean;
}

export function Screen({
  children,
  scroll,
  padded = true,
  refreshing,
  onRefresh,
  edges,
  contentStyle,
  style,
  keyboardAware = true,
}: ScreenProps) {
  const t = useTheme();
  const pad = padded ? { padding: t.spacing[4] } : undefined;
  const scrollRef = useRef<ScrollView | null>(null);

  // Android RN 0.81+ runs edge-to-edge, so the soft keyboard OVERLAYS content
  // instead of resizing the window. Track its height and add it to the scroll
  // content's bottom padding so inputs near the bottom can be scrolled above
  // the keyboard. (iOS gets the same treatment for consistency.)
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (!scroll || !keyboardAware) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, e => setKbHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scroll, keyboardAware]);

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={[pad, { paddingBottom: t.spacing[10] + kbHeight }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: t.colors.surface }, style]}>
      <StatusBar barStyle={t.dark ? 'light-content' : 'dark-content'} backgroundColor={t.colors.surface} />
      {body}
    </SafeAreaView>
  );
}
