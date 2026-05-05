import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { theme } from '../theme';
import { useAuth } from '../lib/AuthContext';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';
import {
  getMiloRecommendedTasks,
  getMiloState,
  getTodayDate,
} from '../lib/miloPersonality';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import EmptyState from '../components/ui/EmptyState';
import PlannerItemCard from '../components/ui/PlannerItemCard';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

function getReadableDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function MetricBox({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.metricBox}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function QuickButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.quickButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon}
      <Text style={styles.quickButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { userName } = useAuth();
  const { tasks, toggleTask } = useTasks();
  const { totalFocusMinutes } = useFocus();

  const todayDate = getTodayDate();

  const miloState = useMemo(() => {
    return getMiloState(tasks, totalFocusMinutes);
  }, [tasks, totalFocusMinutes]);

  const recommendedTasks = useMemo(() => {
    return getMiloRecommendedTasks(tasks, 3);
  }, [tasks]);

  const stats = useMemo(() => {
    const todayItems = tasks.filter((task) => task.dueDate === todayDate);
    const pending = tasks.filter((task) => task.status === 'pending');
    const completed = tasks.filter((task) => task.status === 'completed');

    return {
      today: todayItems.length,
      pending: pending.length,
      completed: completed.length,
    };
  }, [tasks, todayDate]);

  return (
    <ScreenContainer topPadding={16} bottomPadding={124}>
      <View style={styles.header}>
        <View style={styles.headerTextArea}>
          <Text style={styles.greeting}>
            Hi, <Text style={styles.name}>{userName}</Text>
          </Text>
          <Text style={styles.title}>FocusMate</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.searchButton}
          onPress={() => navigation.navigate('Tasks')}
          accessibilityRole="button"
          accessibilityLabel="Search planner items"
        >
          <Ionicons name="search" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <MiloMessageCard
        compact
        mood={miloState.mood}
        title={miloState.title}
        message={miloState.message}
        tagline={miloState.tagline}
        primaryActionLabel={miloState.primaryActionLabel}
        onPrimaryActionPress={() => navigation.navigate(miloState.primaryActionTarget)}
        secondaryActionLabel="Talk to Milo"
        onSecondaryActionPress={() => navigation.navigate('Companion')}
      />

      <View style={styles.todayCard}>
        <View style={styles.todayTopRow}>
          <View>
            <Text style={styles.todayLabel}>Today</Text>
            <Text style={styles.todayDate}>{getReadableDate()}</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.todayPlanButton}
            onPress={() => navigation.navigate('TodayPlan')}
            accessibilityRole="button"
            accessibilityLabel="Open today's plan"
          >
            <Text style={styles.todayPlanText}>View Plan</Text>
            <Ionicons
              name="chevron-forward"
              size={15}
              color={theme.colors.primaryDark}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.metricRow}>
          <MetricBox value={stats.today} label="Today" color={theme.colors.primaryDark} />
          <MetricBox value={stats.pending} label="Pending" color={theme.colors.yellow} />
          <MetricBox value={stats.completed} label="Done" color={theme.colors.blue} />
        </View>
      </View>

      <View style={styles.quickRow}>
        <QuickButton
          label="Create"
          onPress={() => navigation.navigate('AddTask')}
          icon={
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={theme.colors.primaryDark}
            />
          }
        />

        <QuickButton
          label="Focus"
          onPress={() => navigation.navigate('FocusSession')}
          icon={
            <MaterialCommunityIcons
              name="target"
              size={18}
              color={theme.colors.primaryDark}
            />
          }
        />

        <QuickButton
          label="Reminders"
          onPress={() => navigation.navigate('ReminderCenter')}
          icon={
            <Ionicons
              name="notifications-outline"
              size={18}
              color={theme.colors.primaryDark}
            />
          }
        />
      </View>

      <SectionHeader
        title="Milo Suggests"
        subtitle="Milo chooses the best items to handle first."
        actionLabel={recommendedTasks.length > 0 ? 'View All' : undefined}
        onActionPress={
          recommendedTasks.length > 0
            ? () => navigation.navigate('Tasks')
            : undefined
        }
      />

      {recommendedTasks.length > 0 ? (
        <View style={styles.taskList}>
          {recommendedTasks.map((task) => (
            <PlannerItemCard
              key={task.id}
              task={task}
              compact
              onToggle={() => toggleTask(task.id)}
              onPress={() =>
                navigation.navigate('TaskDetails', {
                  taskId: task.id,
                })
              }
            />
          ))}
        </View>
      ) : (
        <EmptyState
          imageSource={getMiloImageSource('happy')}
          title="Milo is waiting for your first plan"
          message="Add a task, meeting, or important date. Milo will help you remember and break it into small steps."
          actionLabel="Create planner item"
          onActionPress={() => navigation.navigate('AddTask')}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTextArea: {
    flex: 1,
    paddingRight: 14,
  },
  greeting: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  name: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
  },
  title: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  todayCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  todayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },
  todayLabel: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  todayDate: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  todayPlanButton: {
    marginLeft: 'auto',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayPlanText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  metricRow: {
    flexDirection: 'row',
  },
  metricBox: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 18,
    paddingVertical: 11,
    alignItems: 'center',
    marginRight: 8,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  metricLabel: {
    marginTop: 1,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  quickRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  quickButton: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickButtonText: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  taskList: {
    marginBottom: 10,
  },
});