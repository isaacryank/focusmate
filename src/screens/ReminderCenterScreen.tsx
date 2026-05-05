import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { Task } from '../types/task';
import { getTodayDate } from '../lib/miloPersonality';
import { scheduleTestNotification } from '../lib/notificationUtils';
import { getTaskUrgency } from '../lib/taskUrgency';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import PlannerItemCard from '../components/ui/PlannerItemCard';
import EmptyState from '../components/ui/EmptyState';
import AppButton from '../components/ui/AppButton';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type ReminderFilter = 'reminders' | 'today' | 'upcoming' | 'needsSetup';

function hasReminder(task: Task) {
  return Boolean(task.reminder && task.reminder !== 'none');
}

function getReminderLabel(task: Task) {
  if (!task.reminder || task.reminder === 'none') return 'No reminder';

  if (task.reminder === '10min') return '10 min before';
  if (task.reminder === '30min') return '30 min before';
  if (task.reminder === '1hour') return '1 hour before';
  if (task.reminder === '1day') return '1 day before';

  return task.reminder;
}

function sortReminderItems(items: Task[]) {
  return [...items].sort((a, b) => {
    const dateA = `${a.dueDate || '9999-99-99'} ${a.dueTime || ''}`;
    const dateB = `${b.dueDate || '9999-99-99'} ${b.dueTime || ''}`;

    return dateA.localeCompare(dateB);
  });
}

function getReminderMood({
  reminderCount,
  needsSetupCount,
  todayCount,
}: {
  reminderCount: number;
  needsSetupCount: number;
  todayCount: number;
}) {
  if (needsSetupCount > 0) {
    return {
      mood: 'focused' as const,
      title: 'Milo found items to set up',
      message: `${needsSetupCount} item(s) need a reminder.`,
      tagline: 'Milo can help.',
    };
  }

  if (todayCount > 0) {
    return {
      mood: 'waving' as const,
      title: 'Milo is ready today',
      message: `${todayCount} item(s) today.`,
      tagline: 'Milo will remind you.',
    };
  }

  if (reminderCount > 0) {
    return {
      mood: 'happy' as const,
      title: 'Milo is watching your reminders',
      message: `${reminderCount} reminder(s) set.`,
      tagline: 'You are staying organized.',
    };
  }

  return {
    mood: 'happy' as const,
    title: 'Milo has no reminders yet',
    message: 'Add a date and reminder.',
    tagline: 'Let Milo remember with you.',
  };
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
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
      <Text numberOfLines={1} style={styles.statTitle}>
        {title}
      </Text>
    </View>
  );
}

function FilterChip({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.filterText,
          selected && styles.filterTextSelected,
        ]}
      >
        {label}
      </Text>

      <View
        style={[
          styles.filterBadge,
          selected && styles.filterBadgeSelected,
        ]}
      >
        <Text
          style={[
            styles.filterBadgeText,
            selected && styles.filterBadgeTextSelected,
          ]}
        >
          {value}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function ReminderInfoCard({ task }: { task: Task }) {
  const reminderReady = hasReminder(task) && Boolean(task.dueDate);
  const urgency = getTaskUrgency(task);
  const urgencyColor = theme.colors[urgency.colorKey];

  return (
    <View style={styles.infoCard}>
      <View
        style={[
          styles.infoIcon,
          {
            backgroundColor: reminderReady
              ? theme.colors.primarySoft
              : theme.colors.yellowSoft,
          },
        ]}
      >
        <Ionicons
          name={reminderReady ? 'notifications' : 'alert-circle'}
          size={20}
          color={reminderReady ? theme.colors.primaryDark : theme.colors.yellow}
        />
      </View>

      <View style={styles.infoTextArea}>
        <Text style={styles.infoTitle}>
          {reminderReady ? 'Reminder active' : 'Reminder needs setup'}
        </Text>

        <Text style={styles.infoText}>
          {reminderReady
            ? `${getReminderLabel(task)} - ${task.dueDate || 'No date'}${
                task.dueTime ? ` - ${task.dueTime}` : ''
              }`
            : 'Add a date and reminder so Milo can notify you.'}
        </Text>

        <View style={styles.reminderMetaRow}>
          <View
            style={[
              styles.urgencyChip,
              {
                backgroundColor: `${urgencyColor}18`,
                borderColor: `${urgencyColor}45`,
              },
            ]}
          >
            <Text style={[styles.urgencyChipText, { color: urgencyColor }]}>
              {urgency.label}
            </Text>
          </View>
        </View>

        <Text style={styles.startEarlyText}>{urgency.startEarlyMessage}</Text>
      </View>
    </View>
  );
}

export default function ReminderCenterScreen() {
  const navigation = useNavigation<any>();
  const { tasks, toggleTask } = useTasks();

  const [selectedFilter, setSelectedFilter] =
    useState<ReminderFilter>('reminders');

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const todayDate = getTodayDate();

  const groups = useMemo(() => {
    const pending = tasks.filter((task) => task.status === 'pending');

    const reminders = sortReminderItems(
      tasks.filter((task) => hasReminder(task))
    );

    const today = sortReminderItems(
      tasks.filter((task) => task.dueDate === todayDate)
    );

    const upcoming = sortReminderItems(
      pending.filter(
        (task) =>
          Boolean(task.dueDate) &&
          task.dueDate! >= todayDate
      )
    );

    const needsSetup = sortReminderItems(
      pending.filter(
        (task) => !task.dueDate || !hasReminder(task)
      )
    );

    return {
      reminders,
      today,
      upcoming,
      needsSetup,
    };
  }, [tasks, todayDate]);

  const visibleItems = useMemo(() => {
    if (selectedFilter === 'today') return groups.today;
    if (selectedFilter === 'upcoming') return groups.upcoming;
    if (selectedFilter === 'needsSetup') return groups.needsSetup;

    return groups.reminders;
  }, [groups, selectedFilter]);

  const mood = useMemo(() => {
    return getReminderMood({
      reminderCount: groups.reminders.length,
      needsSetupCount: groups.needsSetup.length,
      todayCount: groups.today.length,
    });
  }, [groups]);

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
      title: 'Permission needed',
      message: 'Please allow notifications so Milo can remind you.',
    });
  };

  const getFilterTitle = () => {
    if (selectedFilter === 'today') return "Today's Reminders";
    if (selectedFilter === 'upcoming') return 'Upcoming Items';
    if (selectedFilter === 'needsSetup') return 'Needs Setup';

    return 'Active Reminders';
  };

  const getFilterSubtitle = () => {
    if (selectedFilter === 'today') {
      return 'Scheduled for today.';
    }

    if (selectedFilter === 'upcoming') {
      return 'Coming up soon.';
    }

    if (selectedFilter === 'needsSetup') {
      return 'Missing a date or reminder.';
    }

    return 'Reminders Milo is watching.';
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
        primaryActionLabel="Add Item"
        onPrimaryActionPress={() => navigation.navigate('AddTask')}
        secondaryActionLabel="Test Reminder"
        onSecondaryActionPress={handleTestNotification}
      />

      <SectionHeader
        title="Reminder Overview"
        subtitle="Milo tracks what needs attention."
      />

      <View style={styles.statsGrid}>
        <StatCard
          title="Reminders"
          value={groups.reminders.length}
          color={theme.colors.primaryDark}
          icon={
            <Ionicons
              name="notifications-outline"
              size={19}
              color={theme.colors.primaryDark}
            />
          }
        />

        <StatCard
          title="Today"
          value={groups.today.length}
          color={theme.colors.blue}
          icon={
            <Ionicons
              name="today-outline"
              size={19}
              color={theme.colors.blue}
            />
          }
        />

        <StatCard
          title="Upcoming"
          value={groups.upcoming.length}
          color={theme.colors.purple}
          icon={
            <Ionicons
              name="calendar-outline"
              size={19}
              color={theme.colors.purple}
            />
          }
        />

        <StatCard
          title="Need setup"
          value={groups.needsSetup.length}
          color={theme.colors.yellow}
          icon={
            <Ionicons
              name="alert-circle-outline"
              size={19}
              color={theme.colors.yellow}
            />
          }
        />
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label="Reminders"
          value={groups.reminders.length}
          selected={selectedFilter === 'reminders'}
          onPress={() => setSelectedFilter('reminders')}
        />

        <FilterChip
          label="Today"
          value={groups.today.length}
          selected={selectedFilter === 'today'}
          onPress={() => setSelectedFilter('today')}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label="Upcoming"
          value={groups.upcoming.length}
          selected={selectedFilter === 'upcoming'}
          onPress={() => setSelectedFilter('upcoming')}
        />

        <FilterChip
          label="Needs Setup"
          value={groups.needsSetup.length}
          selected={selectedFilter === 'needsSetup'}
          onPress={() => setSelectedFilter('needsSetup')}
        />
      </View>

      <SectionHeader
        title={getFilterTitle()}
        subtitle={getFilterSubtitle()}
      />

      {visibleItems.length > 0 ? (
        <View style={styles.itemList}>
          {visibleItems.map((task) => (
            <View key={task.id} style={styles.itemBlock}>
              <PlannerItemCard
                task={task}
                compact
                onToggle={() => toggleTask(task.id)}
                onPress={() =>
                  navigation.navigate('TaskDetails', {
                    taskId: task.id,
                  })
                }
              />

              <ReminderInfoCard task={task} />
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          imageSource={getMiloImageSource('happy')}
          title="Nothing here yet"
          message="Milo does not see anything here."
          actionLabel="Create planner item"
          onActionPress={() => navigation.navigate('AddTask')}
        />
      )}

      <View style={styles.bottomActions}>
        <View style={styles.bottomButton}>
          <AppButton
            title="Test Reminder"
            variant="secondary"
            onPress={handleTestNotification}
            icon={
              <Ionicons
                name="alarm-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />
        </View>

        <View style={styles.bottomButton}>
          <AppButton
            title="Add Item"
            onPress={() => navigation.navigate('AddTask')}
            icon={<Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />}
          />
        </View>
      </View>

      <View style={styles.noteCard}>
        <View style={styles.noteIcon}>
          <MaterialCommunityIcons
            name="cellphone-message"
            size={20}
            color={theme.colors.primaryDark}
          />
        </View>

        <View style={styles.noteTextArea}>
          <Text style={styles.noteTitle}>Reminder note</Text>
          <Text style={styles.noteText}>
            Milo will remind you on this device.
          </Text>
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
    marginBottom: 14,
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
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  filterChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChipSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  filterText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  filterTextSelected: {
    color: theme.colors.primaryDark,
  },
  filterBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
  },
  filterBadgeSelected: {
    backgroundColor: theme.colors.primary,
  },
  filterBadgeText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },
  filterBadgeTextSelected: {
    color: '#FFFFFF',
  },
  itemList: {
    marginBottom: 14,
  },
  itemBlock: {
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 12,
    marginTop: -2,
    marginLeft: 12,
    marginRight: 4,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  infoTextArea: {
    flex: 1,
  },
  infoTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  infoText: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  reminderMetaRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  urgencyChip: {
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  urgencyChipText: {
    fontSize: 11,
    fontWeight: '900',
  },
  startEarlyText: {
    marginTop: 7,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  bottomActions: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 16,
  },
  bottomButton: {
    flex: 1,
    marginRight: 10,
  },
  noteCard: {
    backgroundColor: theme.colors.blueSoft,
    borderRadius: theme.radius.lg,
    padding: 14,
    flexDirection: 'row',
  },
  noteIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  noteTextArea: {
    flex: 1,
  },
  noteTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  noteText: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
});
