import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../theme';
import { useAuth } from '../lib/AuthContext';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';
import { scheduleTestNotification } from '../lib/notificationUtils';
import { TaskPriority } from '../types/task';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import AppButton from '../components/ui/AppButton';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMessageCard from '../components/milo/MiloMessageCard';

function getTodayDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        {icon}
      </View>

      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function SettingsItem({
  title,
  subtitle,
  icon,
  onPress,
  danger,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.settingsItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View
        style={[
          styles.settingsIcon,
          danger && {
            backgroundColor: theme.colors.dangerSoft,
          },
        ]}
      >
        {icon}
      </View>

      <View style={styles.settingsTextArea}>
        <Text
          style={[
            styles.settingsTitle,
            danger && {
              color: theme.colors.danger,
            },
          ]}
        >
          {title}
        </Text>

        <Text style={styles.settingsSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { userName, signOut } = useAuth();
  const { tasks, addTask, clearAllTasks } = useTasks();
  const { totalFocusMinutes, clearFocusSessions } = useFocus();

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const stats = useMemo(() => {
    const pending = tasks.filter((task) => task.status === 'pending');
    const completed = tasks.filter((task) => task.status === 'completed');
    const meetings = tasks.filter((task) => task.plannerType === 'meeting');
    const reminders = tasks.filter(
      (task) => task.reminder && task.reminder !== 'none'
    );

    return {
      total: tasks.length,
      pending: pending.length,
      completed: completed.length,
      meetings: meetings.length,
      reminders: reminders.length,
    };
  }, [tasks]);

  const handleTestNotification = async () => {
    const ok = await scheduleTestNotification();

    if (ok) {
      setNotice({
        type: 'success',
        title: 'Test reminder scheduled',
        message: 'Milo will send a test notification in a few seconds.',
      });
      return;
    }

    setNotice({
      type: 'warning',
      title: 'Notification permission needed',
      message: 'Please allow notifications so Milo can remind you.',
    });
  };

  const handleClearPlanner = () => {
    Alert.alert(
      'Clear all planner items?',
      'This will remove all tasks, dates, meetings, and reminder IDs from this prototype.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllTasks();

            setNotice({
              type: 'success',
              title: 'Planner cleared',
              message: 'Milo removed all planner items from this device.',
            });
          },
        },
      ]
    );
  };

  const handleClearFocus = () => {
    Alert.alert(
      'Clear focus history?',
      'This will reset the local focus analytics for your prototype.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearFocusSessions();

            setNotice({
              type: 'success',
              title: 'Focus history cleared',
              message: 'Milo reset your local focus analytics.',
            });
          },
        },
      ]
    );
  };

  const handleCreateDemoData = async () => {
    await clearAllTasks();

    const demoItems: {
      title: string;
      description: string;
      dueDate: string;
      dueTime: string;
      location: string;
      priority: TaskPriority;
      plannerType: 'task' | 'meeting' | 'date';
      reminder: 'none' | '10min' | '30min' | '1hour' | '1day';
    }[] = [
      {
        title: 'Prepare FYP presentation slides',
        description: 'Create introduction, problem statement, methodology, and prototype screenshots.',
        dueDate: getTodayDate(),
        dueTime: '10:00 AM',
        location: 'Library',
        priority: 'high',
        plannerType: 'task',
        reminder: '30min',
      },
      {
        title: 'Supervisor meeting',
        description: 'Discuss FocusMate progress, Milo companion flow, and backend plan.',
        dueDate: getTodayDate(1),
        dueTime: '2:30 PM',
        location: 'Faculty office',
        priority: 'high',
        plannerType: 'meeting',
        reminder: '1hour',
      },
      {
        title: 'Submit progress report',
        description: 'Upload weekly FYP progress summary.',
        dueDate: getTodayDate(2),
        dueTime: '11:59 PM',
        location: 'Online portal',
        priority: 'medium',
        plannerType: 'task',
        reminder: '1day',
      },
      {
        title: 'Friend meetup',
        description: 'Dinner meetup reminder.',
        dueDate: getTodayDate(3),
        dueTime: '8:00 PM',
        location: 'Cafe',
        priority: 'low',
        plannerType: 'date',
        reminder: '1day',
      },
    ];

    demoItems.forEach((item, index) => {
      addTask({
        id: `${Date.now()}-${index}`,
        title: item.title,
        description: item.description,
        dueDate: item.dueDate,
        dueTime: item.dueTime,
        location: item.location,
        priority: item.priority,
        plannerType: item.plannerType,
        reminder: item.reminder,
        subtasks: [],
      });
    });

    setNotice({
      type: 'success',
      title: 'Demo data created',
      message: 'Milo added sample planner items for your FYP demonstration.',
    });
  };

  const handleLogout = () => {
    Alert.alert('Log out?', 'You can sign in again using the demo login.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  };

  return (
    <ScreenContainer topPadding={16} bottomPadding={124}>
      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <MiloMessageCard
        compact
        mood="happy"
        title={`Hi, ${userName}`}
        message="This is your FocusMate profile and prototype control center. Milo keeps your planner, reminders, analytics, and FYP system plan easy to access."
        tagline="Your friendly planning companion."
        primaryActionLabel="View Analytics"
        onPrimaryActionPress={() => navigation.navigate('Analytics')}
        secondaryActionLabel="AI Plan"
        onSecondaryActionPress={() => navigation.navigate('IntegrationCenter')}
      />

      <SectionHeader
        title="Profile Summary"
        subtitle="Local prototype data stored on this device."
      />

      <View style={styles.statsGrid}>
        <StatCard
          label="Total"
          value={stats.total}
          color={theme.colors.primaryDark}
          icon={
            <Ionicons
              name="albums-outline"
              size={19}
              color={theme.colors.primaryDark}
            />
          }
        />

        <StatCard
          label="Pending"
          value={stats.pending}
          color={theme.colors.yellow}
          icon={<Ionicons name="time" size={19} color={theme.colors.yellow} />}
        />

        <StatCard
          label="Done"
          value={stats.completed}
          color={theme.colors.blue}
          icon={
            <Ionicons
              name="checkmark-done"
              size={19}
              color={theme.colors.blue}
            />
          }
        />

        <StatCard
          label="Focus min"
          value={totalFocusMinutes}
          color={theme.colors.purple}
          icon={
            <MaterialCommunityIcons
              name="timer-outline"
              size={19}
              color={theme.colors.purple}
            />
          }
        />
      </View>

      <SectionHeader title="Main Screens" />

      <SectionCard>
        <SettingsItem
          title="Productivity Analytics"
          subtitle="View completed tasks and focus session progress."
          icon={
            <Ionicons
              name="stats-chart-outline"
              size={22}
              color={theme.colors.primaryDark}
            />
          }
          onPress={() => navigation.navigate('Analytics')}
        />

        <SettingsItem
          title="Reminder Center"
          subtitle={`${stats.reminders} planner item(s) currently have reminders.`}
          icon={
            <Ionicons
              name="notifications-outline"
              size={22}
              color={theme.colors.primaryDark}
            />
          }
          onPress={() => navigation.navigate('ReminderCenter')}
        />

        <SettingsItem
          title="AI & Backend Plan"
          subtitle="Explain OpenAI, WhatsApp, Supabase, and backend architecture."
          icon={
            <Ionicons
              name="sparkles-outline"
              size={22}
              color={theme.colors.primaryDark}
            />
          }
          onPress={() => navigation.navigate('IntegrationCenter')}
        />

        <SettingsItem
          title="Milo Companion"
          subtitle="Open Milo mood, voice, suggestions, and focus actions."
          icon={
            <Ionicons
              name="heart-outline"
              size={22}
              color={theme.colors.primaryDark}
            />
          }
          onPress={() => navigation.navigate('Companion')}
        />
      </SectionCard>

      <SectionHeader
        title="Prototype Tools"
        subtitle="Useful controls for testing and FYP demonstration."
      />

      <SectionCard>
        <SettingsItem
          title="Send Test Reminder"
          subtitle="Check whether local phone notifications are working."
          icon={
            <Ionicons
              name="alarm-outline"
              size={22}
              color={theme.colors.primaryDark}
            />
          }
          onPress={handleTestNotification}
        />

        <SettingsItem
          title="Create Demo Data"
          subtitle="Reset planner and add clean sample items for presentation."
          icon={
            <Ionicons
              name="refresh-circle-outline"
              size={22}
              color={theme.colors.primaryDark}
            />
          }
          onPress={handleCreateDemoData}
        />

        <SettingsItem
          title="Clear Planner Items"
          subtitle="Remove all local tasks, meetings, dates, and reminder IDs."
          icon={
            <Ionicons
              name="trash-outline"
              size={22}
              color={theme.colors.danger}
            />
          }
          onPress={handleClearPlanner}
          danger
        />

        <SettingsItem
          title="Clear Focus History"
          subtitle="Reset local focus minutes and analytics history."
          icon={
            <MaterialCommunityIcons
              name="timer-remove-outline"
              size={22}
              color={theme.colors.danger}
            />
          }
          onPress={handleClearFocus}
          danger
        />
      </SectionCard>

      <SectionHeader title="Account" />

      <View style={styles.accountCard}>
        <View style={styles.accountAvatar}>
          <Text style={styles.accountInitial}>
            {userName.trim().charAt(0).toUpperCase() || 'S'}
          </Text>
        </View>

        <View style={styles.accountTextArea}>
          <Text style={styles.accountName}>{userName}</Text>
          <Text style={styles.accountSubtitle}>Demo local account</Text>
        </View>
      </View>

      <View style={styles.logoutArea}>
        <AppButton
          title="Log out"
          variant="danger"
          onPress={handleLogout}
          icon={<Ionicons name="log-out-outline" size={18} color="#FFFFFF" />}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    marginTop: 1,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  settingsItem: {
    minHeight: 74,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsTextArea: {
    flex: 1,
    paddingRight: 8,
  },
  settingsTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  settingsSubtitle: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  accountCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  accountAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },
  accountInitial: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  accountTextArea: {
    flex: 1,
  },
  accountName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  accountSubtitle: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  logoutArea: {
    marginTop: 16,
  },
});