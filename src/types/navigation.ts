import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
    Onboarding: undefined;
    Login: undefined;
    Register: undefined;
    MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
    Tasks: undefined;
    AddTask: undefined;
    TaskDetails: {
      taskId: string;
    };
    EditTask: {
      taskId: string;
    };
    MiloPlan: {
      taskId: string;
    };
    MiloSmartPlan: {
      taskId: string;
    };
    MiloChat: { sessionId?: string } | undefined;
    MiloChatHistory: undefined;
    FocusSession: { taskId?: string } | undefined;
    TodayPlan: undefined;
    ReminderCenter: undefined;
    Analytics: undefined;
    IntegrationCenter: undefined;
  };
  
  export type MainTabParamList = {
    Home: undefined;
    Calendar: undefined;
    AddCenter: undefined;
    Companion:
      | {
          openResourceFinder?: boolean;
          openResourceFinderForTaskId?: string;
        }
      | undefined;
    Settings: undefined;
  };
