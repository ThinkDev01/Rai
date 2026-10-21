import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, ClipboardList, FolderKanban, MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { MyWorkScreen } from '@/screens/MyWorkScreen';
import { ProjectsScreen } from '@/screens/ProjectsScreen';
import { MoreScreen } from '@/screens/MoreScreen';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.textSubtle,
        tabBarStyle: {
          backgroundColor: t.colors.surfaceRaised,
          borderTopColor: t.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tab.Screen
        name="MyWork"
        component={MyWorkScreen}
        options={{ title: 'My Work', tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{ tabBarIcon: ({ color, size }) => <FolderKanban color={color} size={size} /> }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}
