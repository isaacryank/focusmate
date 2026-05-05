export type RootStackParamList = {
    Onboarding: undefined;
    Login: undefined;
    Register: undefined;
    MainTabs: undefined;
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
    FocusSession: undefined;
    TodayPlan: undefined;
    ReminderCenter: undefined;
    Analytics: undefined;
    IntegrationCenter: undefined;
  };
  
  export type MainTabParamList = {
    Home: undefined;
    Calendar: undefined;
    AddCenter: undefined;
    Companion: undefined;
    Settings: undefined;
  };