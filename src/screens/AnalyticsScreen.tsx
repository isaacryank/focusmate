import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';
import { Task } from '../types/task';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import PlannerItemCard from '../components/ui/PlannerItemCard';
import EmptyState from '../components/ui/EmptyState';
import AppButton from '../components/ui/AppButton';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type DayStat = {
  dateKey: string;
  label: string;
  completedTasks: number;
  focusMinutes: number;
};

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTaskDateKey(task: Task) {
  if (task.dueDate) return task.dueDate;

  const createdDate = new Date(task.createdAt);

  if (Number.isNaN(createdDate.getTime())) {
    return formatDateKey(new Date());
  }

  return formatDateKey(createdDate);
}

function getFocusDateKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return formatDateKey(new Date());
  }

  return formatDateKey(date);
}

function getLastSevenDays(): DayStat[] {
  const today = new Date();

  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    return {
      dateKey: formatDateKey(date),
      label: date.toLocaleDateString(undefined, {
        weekday: 'short',
      }),
      completedTasks: 0,
      focusMinutes: 0,
    };
  });
}

function getAnalyticsMood({
  completed,
  pending,
  totalFocusMinutes,
}: {
  completed: number;
  pending: number;
  totalFocusMinutes: number;
}) {
  if (completed > 0 && totalFocusMinutes > 0) {
    return {
      mood: 'celebrating' as const,
      title: 'Milo is proud',
      message: `You completed ${completed} planner item(s) and focused for ${totalFocusMinutes} minute(s).`,
      tagline: 'Progress is building up.',
    };
  }

  if (pending > completed && pending > 0) {
    return {
      mood: 'focused' as const,
      title: 'Milo sees more to do',
      message: `You still have ${pending} pending item(s). Pick one small task and continue steadily.`,
      tagline: 'One small action is enough to restart.',
    };
  }

  if (completed > 0) {
    return {
      mood: 'happy' as const,
      title: 'Milo likes your progress',
      message: `You completed ${completed} planner item(s). Keep using FocusMate to track your work.`,
      tagline: 'Good planning creates momentum.',
    };
  }

  return {
    mood: 'waving' as const,
    title: 'Milo is ready to track progress',
    message: 'Complete tasks and finish focus sessions to see your productivity analytics grow.',
    tagline: 'Your progress starts with one plan.',
  };
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        {icon}
      </View>

      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.statTitle}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.statSubtitle}>
        {subtitle}
      </Text>
    </View>
  );
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? Math.min((value / total) * 100, 100) : 0;

  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>
          {value}/{total}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${percent}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function DayActivityBar({
  day,
  maxValue,
}: {
  day: DayStat;
  maxValue: number;
}) {
  const activityValue = day.completedTasks + Math.ceil(day.focusMinutes / 25);
  const height = maxValue > 0 ? Math.max((activityValue / maxValue) * 86, 10) : 10;

  return (
    <View style={styles.dayBarItem}>
      <View style={styles.dayBarTrack}>
        <View style={[styles.dayBarFill, { height }]} />
      </View>

      <Text style={styles.dayLabel}>{day.label}</Text>
      <Text style={styles.dayMiniText}>
        {day.completedTasks}T
      </Text>
    </View>
  );
}

function InsightCard({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon: React.ReactNode;
}) {
  return (
    <View style={styles.insightCard}>
      <View style={styles.insightIcon}>{icon}</View>

      <View style={styles.insightTextArea}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightMessage}>{message}</Text>
      </View>
    </View>
  );
}

export default function AnalyticsScreen() {
  const navigation = useNavigation<any>();
  const { tasks } = useTasks();
  const { focusSessions, totalFocusMinutes, clearFocusSessions } = useFocus();

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const analytics = useMemo(() => {
    const completed = tasks.filter((task) => task.status === 'completed');
    const pending = tasks.filter((task) => task.status === 'pending');

    const highPriority = tasks.filter((task) => task.priority === 'high');
    const completedHighPriority = highPriority.filter(
      (task) => task.status === 'completed'
    );

    const meetings = tasks.filter((task) => task.plannerType === 'meeting');
    const dates = tasks.filter((task) => task.plannerType === 'date');

    const completionRate =
      tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

    const dayStats = getLastSevenDays();

    completed.forEach((task) => {
      const taskDate = getTaskDateKey(task);
      const day = dayStats.find((item) => item.dateKey === taskDate);

      if (day) {
        day.completedTasks += 1;
      }
    });

    focusSessions.forEach((session) => {
      const focusDate = getFocusDateKey(session.completedAt);
      const day = dayStats.find((item) => item.dateKey === focusDate);

      if (day) {
        day.focusMinutes += session.minutes;
      }
    });

    const maxActivity = Math.max(
      ...dayStats.map(
        (day) => day.completedTasks + Math.ceil(day.focusMinutes / 25)
      ),
      1
    );

    return {
      completed,
      pending,
      highPriority,
      completedHighPriority,
      meetings,
      dates,
      completionRate,
      dayStats,
      maxActivity,
    };
  }, [tasks, focusSessions]);

  const mood = useMemo(() => {
    return getAnalyticsMood({
      completed: analytics.completed.length,
      pending: analytics.pending.length,
      totalFocusMinutes,
    });
  }, [analytics.completed.length, analytics.pending.length, totalFocusMinutes]);

  const recentCompleted = useMemo(() => {
    return [...analytics.completed]
      .sort((a, b) => {
        const dateA = `${a.dueDate || getTaskDateKey(a)} ${a.dueTime || ''}`;
        const dateB = `${b.dueDate || getTaskDateKey(b)} ${b.dueTime || ''}`;

        return dateB.localeCompare(dateA);
      })
      .slice(0, 4);
  }, [analytics.completed]);

  const handleClearFocusHistory = () => {
    Alert.alert(
      'Clear focus history?',
      'This will reset your local focus analytics for the prototype.',
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

  return (
    <ScreenContainer topPadding={12} bottomPadding={124}>
      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <MiloMessageCard
        compact
        mood={mood.mood}
        title={mood.title}
        message={mood.message}
        tagline={mood.tagline}
        primaryActionLabel="Start Focus"
        onPrimaryActionPress={() => navigation.navigate('FocusSession')}
        secondaryActionLabel="Tasks"
        onSecondaryActionPress={() => navigation.navigate('Tasks')}
      />

      <SectionHeader
        title="Productivity Overview"
        subtitle="Local analytics for your FocusMate prototype."
      />

      <View style={styles.statsGrid}>
        <StatCard
          title="Completion"
          value={`${analytics.completionRate}%`}
          subtitle="all planner items"
          color={theme.colors.primaryDark}
          icon={
            <Ionicons
              name="analytics-outline"
              size={19}
              color={theme.colors.primaryDark}
            />
          }
        />

        <StatCard
          title="Completed"
          value={analytics.completed.length}
          subtitle="planner items"
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
          title="Pending"
          value={analytics.pending.length}
          subtitle="remaining items"
          color={theme.colors.yellow}
          icon={
            <Ionicons
              name="time-outline"
              size={19}
              color={theme.colors.yellow}
            />
          }
        />

        <StatCard
          title="Focus"
          value={totalFocusMinutes}
          subtitle="total minutes"
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

      <SectionHeader
        title="Progress Breakdown"
        subtitle="Milo checks how your planner categories are moving."
      />

      <View style={styles.breakdownCard}>
        <ProgressBar
          label="All planner items"
          value={analytics.completed.length}
          total={tasks.length}
          color={theme.colors.primary}
        />

        <ProgressBar
          label="High priority items"
          value={analytics.completedHighPriority.length}
          total={analytics.highPriority.length}
          color={theme.colors.yellow}
        />

        <ProgressBar
          label="Meetings"
          value={
            analytics.meetings.filter((task) => task.status === 'completed').length
          }
          total={analytics.meetings.length}
          color={theme.colors.purple}
        />

        <ProgressBar
          label="Important dates"
          value={
            analytics.dates.filter((task) => task.status === 'completed').length
          }
          total={analytics.dates.length}
          color={theme.colors.blue}
        />
      </View>

      <SectionHeader
        title="Last 7 Days"
        subtitle="Completed tasks plus focus activity."
      />

      <View style={styles.activityCard}>
        <View style={styles.activityBars}>
          {analytics.dayStats.map((day) => (
            <DayActivityBar
              key={day.dateKey}
              day={day}
              maxValue={analytics.maxActivity}
            />
          ))}
        </View>

        <View style={styles.activityLegend}>
          <View style={styles.legendItem}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>T = completed tasks</Text>
          </View>

          <Text style={styles.legendText}>
            Focus minutes are included in bar height.
          </Text>
        </View>
      </View>

      <SectionHeader
        title="Milo Insights"
        subtitle="Simple feedback for your FYP demo."
      />

      <InsightCard
        title="Planner behavior"
        message={
          tasks.length > 0
            ? `You created ${tasks.length} planner item(s). ${analytics.completed.length} are completed and ${analytics.pending.length} are still pending.`
            : 'No planner data yet. Add sample items or create your first plan.'
        }
        icon={
          <Ionicons
            name="clipboard-outline"
            size={21}
            color={theme.colors.primaryDark}
          />
        }
      />

      <InsightCard
        title="Focus behavior"
        message={
          focusSessions.length > 0
            ? `You completed ${focusSessions.length} focus session(s), with ${totalFocusMinutes} total focus minute(s).`
            : 'No focus sessions yet. Start Focus Mode to record your first session.'
        }
        icon={
          <MaterialCommunityIcons
            name="target"
            size={21}
            color={theme.colors.primaryDark}
          />
        }
      />

      <SectionHeader
        title="Recent Completed"
        subtitle="Planner items you have finished."
      />

      {recentCompleted.length > 0 ? (
        <View style={styles.completedList}>
          {recentCompleted.map((task) => (
            <PlannerItemCard
              key={task.id}
              task={task}
              compact
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
          imageSource={getMiloImageSource('focused')}
          title="No completed items yet"
          message="Complete a task, date, or meeting and Milo will show it here."
          actionLabel="Open Tasks"
          onActionPress={() => navigation.navigate('Tasks')}
        />
      )}

      <View style={styles.bottomActions}>
        <View style={styles.bottomButton}>
          <AppButton
            title="Start Focus"
            onPress={() => navigation.navigate('FocusSession')}
            icon={<MaterialCommunityIcons name="target" size={18} color="#FFFFFF" />}
          />
        </View>

        <View style={styles.bottomButton}>
          <AppButton
            title="Clear Focus"
            variant="ghost"
            onPress={handleClearFocusHistory}
            icon={
              <MaterialCommunityIcons
                name="timer-remove-outline"
                size={18}
                color={theme.colors.text}
              />
            }
          />
        </View>
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
  statTitle: {
    marginTop: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  statSubtitle: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  breakdownCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  progressBlock: {
    marginBottom: 15,
  },
  progressHeader: {
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  progressValue: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  activityCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  activityBars: {
    height: 126,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  dayBarItem: {
    flex: 1,
    alignItems: 'center',
  },
  dayBarTrack: {
    height: 92,
    width: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.background,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  dayBarFill: {
    width: '100%',
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
  },
  dayLabel: {
    marginTop: 7,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  dayMiniText: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  activityLegend: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 14,
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    marginRight: 7,
  },
  legendText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  insightCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  insightIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  insightTextArea: {
    flex: 1,
  },
  insightTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  insightMessage: {
    marginTop: 4,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  completedList: {
    marginBottom: 14,
  },
  bottomActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  bottomButton: {
    flex: 1,
    marginRight: 10,
  },
});