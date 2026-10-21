import { Platform } from 'react-native';

// Lazy-load messaging so a missing native module doesn't crash at import time.
function getMessaging() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/messaging');
    return (mod.default ?? mod) as typeof import('@react-native-firebase/messaging').default;
  } catch {
    return null;
  }
}

function getNotifee() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@notifee/react-native');
    return (mod.default ?? mod) as typeof import('@notifee/react-native').default;
  } catch {
    return null;
  }
}

export type FcmMessage = import('@react-native-firebase/messaging').FirebaseMessagingTypes.RemoteMessage;

// Channel ID used for all Rai notifications.
const CHANNEL_ID = 'rai_default';

/** Create the Android notification channel (idempotent — safe to call on every launch). */
export async function setupNotificationChannel(): Promise<void> {
  try {
    const notifee = getNotifee();
    if (!notifee || Platform.OS !== 'android') return;
    const { AndroidImportance } = require('@notifee/react-native');
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Rai Notifications',
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: 'default',
    });
  } catch {
    // Non-fatal
  }
}

/** Request notification permission (iOS prompts; Android 13+ prompts). */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const messaging = getMessaging();
    if (!messaging) return false;
    if (Platform.OS === 'ios') {
      const status = await messaging().requestPermission();
      return (
        status === messaging.AuthorizationStatus.AUTHORIZED ||
        status === messaging.AuthorizationStatus.PROVISIONAL
      );
    }
    const status = await messaging().requestPermission();
    return status === messaging.AuthorizationStatus.AUTHORIZED;
  } catch {
    return false;
  }
}

/** Returns the FCM registration token, or null if permission not granted. */
export async function getFcmToken(): Promise<string | null> {
  try {
    const messaging = getMessaging();
    if (!messaging) {
      console.warn('[FCM] Native module not available — push notifications disabled');
      return null;
    }
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn('[FCM] Notification permission denied');
      return null;
    }
    const token = await messaging().getToken();
    console.log('[FCM] Token obtained:', token ? token.slice(0, 20) + '…' : 'null');
    return token;
  } catch (e) {
    console.warn('[FCM] getToken failed:', e);
    return null;
  }
}

/**
 * Display a foreground notification using notifee so it appears as a real
 * system heads-up banner (not a toast).
 */
export async function displayForegroundNotification(
  title: string,
  body: string | undefined,
  data?: Record<string, string>,
): Promise<void> {
  try {
    const notifee = getNotifee();
    if (!notifee) return;
    await notifee.displayNotification({
      title,
      body: body ?? '',
      data,
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: 'default' },
        importance: 4, // IMPORTANCE_HIGH
        // Round app logo shown as the large icon on the right
        largeIcon: '@mipmap/ic_launcher_round',
        // Monochrome small icon shown in the status bar
        smallIcon: 'ic_launcher',
        circularLargeIcon: true,
      },
      ios: {
        sound: 'default',
        foregroundPresentationOptions: {
          alert: true,
          badge: true,
          sound: true,
          banner: true,
          list: true,
        },
      },
    });
  } catch (e) {
    console.warn('[FCM] displayForegroundNotification failed:', e);
  }
}

/** Listen for foreground FCM messages. Returns unsubscribe fn. */
export function onForegroundMessage(
  handler: (message: FcmMessage) => void,
): () => void {
  try {
    const messaging = getMessaging();
    if (!messaging) return () => {};
    return messaging().onMessage(async message => {
      handler(message);
    });
  } catch {
    return () => {};
  }
}

/** Called once when app is opened from a background/quit notification tap. */
export async function getInitialNotification(): Promise<FcmMessage | null> {
  try {
    const messaging = getMessaging();
    if (!messaging) return null;
    return messaging().getInitialNotification();
  } catch {
    return null;
  }
}

/** Listen for notification taps while app is in background. Returns unsubscribe fn. */
export function onNotificationOpenedApp(
  handler: (message: FcmMessage) => void,
): () => void {
  try {
    const messaging = getMessaging();
    if (!messaging) return () => {};
    return messaging().onNotificationOpenedApp(handler);
  } catch {
    return () => {};
  }
}

/** Must be registered outside React (in index.js) for background/quit messages. */
export function setBackgroundMessageHandler(): void {
  try {
    const messaging = getMessaging();
    if (!messaging) return;
    messaging().setBackgroundMessageHandler(async _message => {});
  } catch {
    // Native module not yet available — skip.
  }
}
