import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useAuth } from '../lib/AuthContext';

import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import TasksScreen from '../screens/TasksScreen';
import AddTaskScreen from '../screens/AddTaskScreen';
import CalendarScreen from '../screens/CalendarScreen';
import CompanionScreen from '../screens/CompanionScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TaskDetailsScreen from '../screens/TaskDetailsScreen';
import EditTaskScreen from '../screens/EditTaskScreen';
import MiloPlanScreen from '../screens/MiloPlanScreen';
import MiloSmartPlanScreen from '../screens/MiloSmartPlanScreen';
import MiloChatScreen from '../screens/MiloChatScreen';
import MiloChatHistoryScreen from '../screens/MiloChatHistoryScreen';
import FocusSessionScreen from '../screens/FocusSessionScreen';
import TodayPlanScreen from '../screens/TodayPlanScreen';
import ReminderCenterScreen from '../screens/ReminderCenterScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import IntegrationCenterScreen from '../screens/IntegrationCenterScreen';

const ONBOARDING_STORAGE_KEY = '@focusmate/onboarding_completed';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function EmptyTabScreen() {
  return null;
}

function CenterAddButton() {
  const navigation = useNavigation<any>();
  const { theme: appTheme, isDark } = useFocusMateTheme();
  const centerButtonColors = isDark
    ? (['#08B991', '#008069', '#005C4B'] as const)
    : (['#48CE6F', '#2F9B4A', '#207638'] as const);
  const centerButtonRimColor = isDark ? '#20362D' : '#DCEEDD';
  const centerButtonShadowColor = isDark
    ? 'rgba(0, 0, 0, 0.62)'
    : 'rgba(46, 125, 75, 0.28)';

  const handlePress = () => {
    const parentNavigation = navigation.getParent?.();

    if (parentNavigation) {
      parentNavigation.navigate('AddTask');
      return;
    }

    navigation.navigate('AddTask');
  };

  return (
    <View style={styles.centerButtonSlot}>
      <TouchableOpacity
        activeOpacity={0.88}
        style={[
          styles.centerButton,
          {
            borderColor: centerButtonRimColor,
            shadowColor: centerButtonShadowColor,
          },
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Create planner item"
      >
        <LinearGradient
          pointerEvents="none"
          colors={centerButtonColors}
          start={{ x: 0.25, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={styles.centerButtonGradient}
        />
        <MaterialCommunityIcons
          name="plus"
          size={32}
          color={appTheme.colors.white}
        />
      </TouchableOpacity>
    </View>
  );
}

function TabBarIcon({
  name,
  color,
  focused,
  size = 24,
}: {
  name: MaterialIconName;
  color: string;
  focused: boolean;
  size?: number;
}) {
  const { theme: appTheme, isDark } = useFocusMateTheme();

  return (
    <View
      style={[
        styles.tabIconWrap,
        focused && {
          backgroundColor: appTheme.colors.primarySoft,
          borderColor: isDark ? '#2A584B' : '#CFE8D1',
          shadowOpacity: isDark ? 0.2 : 0.12,
          elevation: 2,
        },
      ]}
    >
      <MaterialCommunityIcons name={name} size={size} color={color} />
    </View>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { theme: appTheme, isDark } = useFocusMateTheme();
  const tabBarHeight = 68 + insets.bottom;
  const tabBarSurface = isDark ? appTheme.colors.surface : '#EEF8EE';
  const tabBarTopBorder = isDark ? '#2B4237' : '#BFD8C0';
  const tabBarCapColor = isDark ? '#243A31' : '#BFD8C0';

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarShowLabel: true,
        tabBarActiveTintColor: appTheme.colors.primary,
        tabBarInactiveTintColor: appTheme.colors.subtleText,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '900',
          marginTop: 1,
        },
        tabBarItemStyle: {
          paddingTop: 9,
        },
        tabBarBackground: () => (
          <View
            pointerEvents="none"
            style={[
              styles.tabBarBackground,
              { backgroundColor: tabBarSurface },
            ]}
          >
            <View
              style={[
                styles.tabBarTopCap,
                { backgroundColor: tabBarCapColor },
              ]}
            />
          </View>
        ),
        sceneStyle: {
          backgroundColor: appTheme.colors.background,
        },
        tabBarStyle: {
          left: 0,
          right: 0,
          bottom: 0,
          height: tabBarHeight,
          borderRadius: 0,
          borderTopWidth: isDark ? 1 : 1.5,
          borderColor: tabBarTopBorder,
          borderTopColor: tabBarTopBorder,
          backgroundColor: tabBarSurface,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 6),
          shadowColor: isDark ? '#000000' : '#24462A',
          shadowOffset: {
            width: 0,
            height: -9,
          },
          shadowOpacity: isDark ? 0.34 : 0.16,
          shadowRadius: 20,
          elevation: 20,
        },
        headerStyle: {
          backgroundColor: appTheme.colors.background,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '900',
          color: appTheme.colors.text,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name="home-variant"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          title: 'Calendar',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name="calendar-month"
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tab.Screen
        name="AddCenter"
        component={EmptyTabScreen}
        options={{
          title: '',
          tabBarLabel: '',
          tabBarButton: () => <CenterAddButton />,
        }}
      />

      <Tab.Screen
        name="Companion"
        component={CompanionScreen}
        options={{
          title: 'Milo',
          tabBarLabel: 'Companion',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="target" color={color} focused={focused} />
          ),
        }}
      />

      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name="account-circle"
              color={color}
              focused={focused}
              size={25}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const { theme: appTheme, isDark } = useFocusMateTheme();

  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    loadOnboardingStatus();
  }, []);

  const loadOnboardingStatus = async () => {
    try {
      const storedStatus = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
      setHasCompletedOnboarding(storedStatus === 'true');
    } catch (error) {
      console.log('Failed to load onboarding status:', error);
    } finally {
      setIsCheckingOnboarding(false);
    }
  };

  const handleFinishOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      setHasCompletedOnboarding(true);
    } catch (error) {
      console.log('Failed to save onboarding status:', error);
      setHasCompletedOnboarding(true);
    }
  };

  const navigationTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      dark: isDark,
      colors: {
        ...(isDark ? DarkTheme : DefaultTheme).colors,
        primary: appTheme.colors.primary,
        background: appTheme.colors.background,
        card: appTheme.colors.surface,
        text: appTheme.colors.text,
        border: appTheme.colors.border,
        notification: appTheme.colors.danger,
      },
    }),
    [appTheme, isDark]
  );

  if (isLoadingAuth || isCheckingOnboarding) {
    return null;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: appTheme.colors.background,
          },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '900',
            color: appTheme.colors.text,
          },
          headerTintColor: appTheme.colors.text,
          contentStyle: {
            backgroundColor: appTheme.colors.background,
          },
        }}
      >
        {!hasCompletedOnboarding ? (
          <RootStack.Screen
            name="Onboarding"
            options={{ headerShown: false }}
          >
            {() => <OnboardingScreen onFinish={handleFinishOnboarding} />}
          </RootStack.Screen>
        ) : !isAuthenticated ? (
          <>
            <RootStack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />

            <RootStack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          <>
            <RootStack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />

            <RootStack.Screen
              name="Tasks"
              component={TasksScreen}
              options={{ title: 'My Tasks' }}
            />

            <RootStack.Screen
              name="AddTask"
              component={AddTaskScreen}
              options={{
                title: 'Create Planner Item',
                presentation: 'modal',
              }}
            />

            <RootStack.Screen
              name="TaskDetails"
              component={TaskDetailsScreen}
              options={{ headerShown: false }}
            />

            <RootStack.Screen
              name="EditTask"
              component={EditTaskScreen}
              options={{
                title: 'Edit Planner Item',
                presentation: 'modal',
              }}
            />

            <RootStack.Screen
              name="MiloPlan"
              component={MiloPlanScreen}
              options={{ title: 'Milo Smart Plan' }}
            />

            <RootStack.Screen
              name="MiloSmartPlan"
              component={MiloSmartPlanScreen}
              options={{ title: 'Plan Prep' }}
            />

            <RootStack.Screen
              name="MiloChat"
              component={MiloChatScreen}
              options={{ headerShown: false }}
            />

            <RootStack.Screen
              name="MiloChatHistory"
              component={MiloChatHistoryScreen}
              options={{ title: 'Old messages' }}
            />

            <RootStack.Screen
              name="FocusSession"
              component={FocusSessionScreen}
              options={{ title: 'Milo Focus Mode' }}
            />

            <RootStack.Screen
              name="TodayPlan"
              component={TodayPlanScreen}
              options={{ title: "Today's Plan" }}
            />

            <RootStack.Screen
              name="ReminderCenter"
              component={ReminderCenterScreen}
              options={{ headerShown: false }}
            />

            <RootStack.Screen
              name="Analytics"
              component={AnalyticsScreen}
              options={{ title: 'Analytics' }}
            />

            <RootStack.Screen
              name="IntegrationCenter"
              component={IntegrationCenterScreen}
              options={{ title: 'AI & Backend Plan' }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBarBackground: {
    ...StyleSheet.absoluteFillObject,
    top: -2,
  },
  tabBarTopCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  tabIconWrap: {
    width: 36,
    height: 30,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0,
    shadowRadius: 8,
    elevation: 0,
  },
  centerButtonSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -17,
  },
  centerButton: {
    width: 70,
    height: 70,
    borderRadius: 39,
    backgroundColor: theme.colors.primary,
    borderWidth: 6,
    borderColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 14,
    overflow: 'hidden',
  },
  centerButtonGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
  },
});
