/**
 * Rai Mobile — root component.
 * Provider order: GestureHandlerRoot → SafeArea → QueryClient → Theme → Navigation.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { queryClient } from '@/lib/queryClient';
import { RootNavigator } from '@/navigation/RootNavigator';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ConfirmHost } from '@/components/ui/ConfirmHost';
import { toastConfig } from '@/components/ui/toastConfig';

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            {/* Catches render-time crashes anywhere in the navigation tree and
                shows a recoverable fallback instead of a white screen. */}
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
            {/* In-app themed confirm dialog host (replaces OS Alert). */}
            <ConfirmHost />
            {/* Themed toasts. */}
            <Toast config={toastConfig} topOffset={56} />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
