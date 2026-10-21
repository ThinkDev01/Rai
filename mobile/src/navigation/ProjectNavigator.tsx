import React from 'react';
import { View } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TopBar } from '@/components/shell/TopBar';
import { useTheme } from '@/theme/ThemeProvider';
import { useProject } from '@/api/projects';
import { OverviewScreen } from '@/screens/project/OverviewScreen';
import { BoardScreen } from '@/screens/project/BoardScreen';
import { BacklogScreen } from '@/screens/project/BacklogScreen';
import { SprintsScreen } from '@/screens/project/SprintsScreen';
import { ReportsScreen } from '@/screens/project/ReportsScreen';
import { ProjectSettingsScreen } from '@/screens/project/ProjectSettingsScreen';
import type { AppStackParamList } from './types';

const Tab = createMaterialTopTabNavigator();

type Props = NativeStackScreenProps<AppStackParamList, 'Project'>;

export function ProjectNavigator({ route, navigation }: Props) {
  const t = useTheme();
  const { projectId, screen } = route.params;
  const { data: project } = useProject(projectId);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }}>
      <TopBar
        title={project?.name ?? 'Project'}
        subtitle={project ? `${project.key} · ${project.ticketCount} tickets` : undefined}
        onBack={() => navigation.goBack()}
        onSearch={() => navigation.navigate('Search')}
      />
      <Tab.Navigator
        initialRouteName={screen ?? 'Board'}
        screenOptions={{
          lazy: true,
          tabBarScrollEnabled: true,
          tabBarActiveTintColor: t.colors.primary,
          tabBarInactiveTintColor: t.colors.textSubtle,
          tabBarIndicatorStyle: { backgroundColor: t.colors.primary, height: 2 },
          tabBarStyle: { backgroundColor: t.colors.surfaceRaised, elevation: 0, shadowOpacity: 0 },
          tabBarLabelStyle: { fontSize: 13, fontWeight: '600', textTransform: 'none' },
          tabBarItemStyle: { width: 'auto', paddingHorizontal: 16 },
        }}
      >
        <Tab.Screen name="Overview" options={{ title: 'Overview' }}>
          {() => <OverviewScreen projectId={projectId} />}
        </Tab.Screen>
        <Tab.Screen name="Board" options={{ title: 'Board' }}>
          {() => <BoardScreen projectId={projectId} />}
        </Tab.Screen>
        <Tab.Screen name="Backlog" options={{ title: 'Backlog' }}>
          {() => <BacklogScreen projectId={projectId} />}
        </Tab.Screen>
        <Tab.Screen name="Sprints" options={{ title: 'Sprints' }}>
          {() => <SprintsScreen projectId={projectId} />}
        </Tab.Screen>
        <Tab.Screen name="Reports" options={{ title: 'Reports' }}>
          {() => <ReportsScreen projectId={projectId} />}
        </Tab.Screen>
        <Tab.Screen name="ProjectSettings" options={{ title: 'Settings' }}>
          {() => <ProjectSettingsScreen projectId={projectId} />}
        </Tab.Screen>
      </Tab.Navigator>
    </View>
  );
}
