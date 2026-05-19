import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList, MainTabParamList } from '../types/navigation';
import { theme } from '../theme';
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
import FocusSessionScreen from '../screens/FocusSessionScreen';
import TodayPlanScreen from '../screens/TodayPlanScreen';
import ReminderCenterScreen from '../screens/ReminderCenterScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import IntegrationCenterScreen from '../screens/IntegrationCenterScreen';

const ONBOARDING_STORAGE_KEY = '@focusmate/onboarding_completed';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function EmptyTabScreen() {
  return null;
}

function CenterAddButton() {
  const navigation = useNavigation<any>();

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
        style={styles.centerButton}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Create planner item"
      >
        <MaterialCommunityIcons name="plus" size={32} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.primaryDark,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '900',
          marginTop: 1,
        },
        tabBarItemStyle: {
          paddingTop: 8,
        },
        tabBarStyle: {
          left: 18,
          right: 18,
          bottom: 8,
          height: 74,
          borderRadius: 90,
          borderTopWidth: 0,
          backgroundColor: theme.colors.surface,
          paddingTop: 2,
          paddingBottom: 2,
          ...theme.shadow,
        },
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '900',
          color: theme.colors.text,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="home-variant"
              size={24}
              color={color}
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
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="calendar-month"
              size={24}
              color={color}
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
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="target" size={24} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="account-circle"
              size={25}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoadingAuth } = useAuth();

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

  if (isLoadingAuth || isCheckingOnboarding) {
    return null;
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '900',
            color: theme.colors.text,
          },
          contentStyle: {
            backgroundColor: theme.colors.background,
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
              options={{ title: 'Reminder Center' }}
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
  centerButtonSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -15,
  },
  centerButton: {
    width: 70,
    height: 70,
    borderRadius: 39,
    backgroundColor: theme.colors.primary,
    borderWidth: 7,
    borderColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow,
  },
});
