import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { MainTabs } from './MainTabs';
import { DrawerContent } from '@/components/shell/DrawerContent';
import { SubscriptionBanner } from '@/components/billing/SubscriptionBanner';
import { ProjectNavigator } from './ProjectNavigator';
import { TicketDetailScreen } from '@/screens/project/TicketDetailScreen';
import { SprintDetailScreen } from '@/screens/project/SprintDetailScreen';
import { ArchiveScreen } from '@/screens/project/ArchiveScreen';
import { TeamScreen } from '@/screens/TeamScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { AdminScreen } from '@/screens/AdminScreen';
import { WelcomeScreen } from '@/screens/WelcomeScreen';
import { SubscriptionPlansScreen } from '@/screens/SubscriptionPlansScreen';
import type { AppStackParamList, DrawerParamList } from './types';

const Drawer = createDrawerNavigator<DrawerParamList>();
const Stack = createNativeStackNavigator<AppStackParamList>();

function Shell() {
  return (
    <View style={{ flex: 1 }}>
      <SubscriptionBanner />
      <Drawer.Navigator
        drawerContent={props => <DrawerContent {...props} />}
        screenOptions={{ headerShown: false, drawerType: 'front' }}
      >
        <Drawer.Screen name="Tabs" component={MainTabs} />
      </Drawer.Navigator>
    </View>
  );
}

export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Shell" component={Shell} />
      <Stack.Screen name="Project" component={ProjectNavigator} />
      <Stack.Screen name="TicketDetail">
        {({ route }) => <TicketDetailScreen projectId={route.params.projectId} ticketKey={route.params.ticketKey} />}
      </Stack.Screen>
      <Stack.Screen name="SprintDetail">
        {({ route }) => <SprintDetailScreen projectId={route.params.projectId} sprintId={route.params.sprintId} />}
      </Stack.Screen>
      <Stack.Screen name="Archive">
        {({ route }) => <ArchiveScreen projectId={route.params.projectId} />}
      </Stack.Screen>
      <Stack.Screen name="Team" component={TeamScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Admin" component={AdminScreen} />
      <Stack.Screen name="CreateOrg" component={WelcomeScreen} initialParams={{ create: true }} />
      <Stack.Screen name="SubscriptionPlans" component={SubscriptionPlansScreen} />
    </Stack.Navigator>
  );
}
