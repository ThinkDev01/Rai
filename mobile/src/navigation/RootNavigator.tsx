import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/store/authStore';
import { setUnauthorizedHandler } from '@/lib/api';
import { completeFederatedSignIn } from '@/lib/cognito';
import { toast } from '@/lib/toast';
import { getFcmToken, onForegroundMessage, onNotificationOpenedApp, getInitialNotification, setupNotificationChannel, displayForegroundNotification } from '@/lib/fcm';
import { navigateFromLink } from '@/lib/notificationNav';
import { useRegisterDeviceToken, useUnregisterDeviceToken } from '@/api/notifications';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { WelcomeScreen } from '@/screens/WelcomeScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const t = useTheme();
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isHydrating = useAuthStore(s => s.isHydrating);
  const hydrateAttempted = useAuthStore(s => s.hydrateAttempted);
  const memberships = useAuthStore(s => s.memberships);
  const hydrate = useAuthStore(s => s.hydrate);
  const signOut = useAuthStore(s => s.signOut);
  const registerToken = useRegisterDeviceToken();
  const unregisterToken = useUnregisterDeviceToken();
  const fcmTokenRef = useRef<string | null>(null);

  function navFromLink(link: string | null | undefined) {
    if (!navRef.isReady()) return;
    if (link) {
      navigateFromLink(link, navRef);
    } else {
      navRef.navigate('App', { screen: 'Notifications' } as any);
    }
  }

  // Set up Android notification channel once on mount.
  useEffect(() => { setupNotificationChannel(); }, []);

  // Bootstrap: attempt hydrate from stored tokens on first mount.
  useEffect(() => {
    hydrate();
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [hydrate, signOut]);

  // Register FCM token when authenticated, unregister on sign-out.
  useEffect(() => {
    if (!isAuthenticated) {
      if (fcmTokenRef.current) {
        unregisterToken.mutate(fcmTokenRef.current);
        fcmTokenRef.current = null;
      }
      return;
    }
    getFcmToken().then(token => {
      if (token) {
        fcmTokenRef.current = token;
        registerToken.mutate(token);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Foreground: display a real system heads-up notification via notifee.
  useEffect(() => {
    const unsub = onForegroundMessage(message => {
      const title = message.notification?.title ?? 'New notification';
      const body  = message.notification?.body;
      const data  = message.data as Record<string, string> | undefined;
      displayForegroundNotification(title, body, data);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background: app was in background and user tapped a notification.
  useEffect(() => {
    const unsub = onNotificationOpenedApp(message => {
      const link = (message.data?.link as string) ?? null;
      navFromLink(link);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold-start: app was quit and user tapped a notification.
  useEffect(() => {
    getInitialNotification().then(message => {
      if (!message) return;
      const link = (message.data?.link as string) ?? null;
      navFromLink(link);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Federated OAuth deep-link callback: the Hosted UI redirects back to the
  // app scheme with ?code=&state=. Exchange it for tokens, then hydrate.
  useEffect(() => {
    function parseQuery(url: string): Record<string, string> {
      const qs = url.split('?')[1] ?? '';
      const out: Record<string, string> = {};
      for (const pair of qs.split('&')) {
        if (!pair) continue;
        const [k, v = ''] = pair.split('=');
        out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      }
      return out;
    }
    async function handleUrl(url: string | null) {
      if (!url || url.indexOf('code=') === -1) return;
      try {
        const params = parseQuery(url);
        if (params.error) throw new Error(params.error_description || params.error);
        const code = params.code;
        if (!code) return;
        await completeFederatedSignIn(code, params.state ?? null);
        await hydrate();
      } catch (e: any) {
        toast.error(e?.message ?? 'Sign-in failed');
      }
    }
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', e => handleUrl(e.url));
    return () => sub.remove();
  }, [hydrate]);

  const navTheme = t.dark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: t.colors.surface, card: t.colors.surfaceRaised, text: t.colors.text, border: t.colors.border, primary: t.colors.primary } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: t.colors.surface, card: t.colors.surfaceRaised, text: t.colors.text, border: t.colors.border, primary: t.colors.primary } };

  // First-load splash while we resolve stored session.
  if (!hydrateAttempted || (isHydrating && !isAuthenticated)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.surface }}>
        <ActivityIndicator color={t.colors.primary} size="large" />
      </View>
    );
  }

  const needsWelcome = isAuthenticated && memberships.length === 0;

  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : needsWelcome ? (
          // No-org state ONLY. When the first org is created, memberships
          // become non-empty, this branch drops out, and the navigator falls
          // through to App (Dashboard) automatically — no manual navigation.
          // "Create another org" for existing users is a separate CreateOrg
          // screen inside the App stack, so Welcome never lingers as a valid
          // route once the user has an org.
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
        ) : (
          <Stack.Screen name="App" component={AppNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
