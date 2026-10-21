/**
 * App-wide error boundary. Without this, ANY exception thrown during a screen's
 * render unmounts the entire React tree — in a release build that's a frozen
 * white screen. This catches it, shows a themed recovery screen, and lets the
 * user retry (which re-mounts the subtree) without killing the process.
 *
 * It's a class component because React error boundaries must be class-based
 * (getDerivedStateFromError / componentDidCatch have no hook equivalent). The
 * fallback UI is a separate functional component so it can read the theme.
 */
import React from 'react';
import { View, ScrollView } from 'react-native';
import { Txt, Button } from '@/components/ui/primitives';
import { useTheme } from '@/theme/ThemeProvider';

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.spacing[6],
        gap: t.spacing[4],
      }}
    >
      <Txt variant="title" style={{ textAlign: 'center' }}>
        Something went wrong
      </Txt>
      <Txt variant="subtle" size={t.fontSize.sm} style={{ textAlign: 'center' }}>
        The app hit an unexpected error. Your data is safe — tap below to try again.
      </Txt>

      {__DEV__ && error ? (
        <ScrollView
          style={{ maxHeight: 180, alignSelf: 'stretch', backgroundColor: t.colors.surfaceSunken, borderRadius: t.radius.md }}
          contentContainerStyle={{ padding: t.spacing[3] }}
        >
          <Txt size={t.fontSize.xs} color={t.colors.danger}>
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </Txt>
        </ScrollView>
      ) : null}

      <Button title="Try again" onPress={onReset} />
    </View>
  );
}

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface in dev; wire to a crash reporter (Sentry/Crashlytics) here later.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}
