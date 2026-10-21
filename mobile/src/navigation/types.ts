import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: { email?: string; invite?: string } | undefined;
  Register: { invite?: string } | undefined;
  Verify: { email?: string; invite?: string } | undefined;
  ForgotPassword: { email?: string } | undefined;
  ResetPassword: { email?: string } | undefined;
  InviteAccept: { token: string };
};

export type ProjectTabsParamList = {
  Overview: { projectId: string };
  Board: { projectId: string };
  Backlog: { projectId: string };
  Sprints: { projectId: string };
  Reports: { projectId: string };
  ProjectSettings: { projectId: string };
};

export type DrawerParamList = {
  Tabs: NavigatorScreenParams<MainTabsParamList> | undefined;
};

export type AppStackParamList = {
  Shell: NavigatorScreenParams<DrawerParamList> | undefined;
  Project: { projectId: string; screen?: keyof ProjectTabsParamList };
  SprintDetail: { projectId: string; sprintId: string };
  Archive: { projectId: string };
  TicketDetail: { projectId: string; ticketKey: string; expandComments?: boolean };
  Team: undefined;
  Settings: undefined;
  Notifications: undefined;
  Search: undefined;
  Admin: undefined;
  /** Create-another-org for users who already belong to org(s). */
  CreateOrg: { create?: boolean } | undefined;
  SubscriptionPlans: undefined;
};

export type MainTabsParamList = {
  Dashboard: undefined;
  MyWork: undefined;
  Projects: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  /** `create: true` forces the create-org form directly (for users who already
   *  belong to orgs and tapped "Create another organization"). */
  Welcome: { create?: boolean } | undefined;
  App: NavigatorScreenParams<AppStackParamList> | undefined;
};
