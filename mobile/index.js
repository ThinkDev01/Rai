/**
 * @format
 */

// gesture-handler MUST be the first import (before anything else) per its docs.
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { setBackgroundMessageHandler } from './src/lib/fcm';

// Must be registered at the module level (outside React) so Firebase can
// wake the app in background/quit state to handle incoming notifications.
try { setBackgroundMessageHandler(); } catch (_) {}

AppRegistry.registerComponent(appName, () => App);
