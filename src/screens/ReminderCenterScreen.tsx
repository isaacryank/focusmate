import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
import EmptyState from '../components/ui/EmptyState';
import AppButton from '../components/ui/AppButton';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type ReminderFilter =
  | 'reminders'
  | 'today'
  | 'upcoming'
  | 'needsSetup';

function hasReminder(task: Task) {
  return Boolean(task.reminder && task.reminder !== 'none');
}

function getReminderLabel(task: Task) {
  if (!task.reminder || task.reminder === 'none') return 'No reminder';

  if (task.reminder === 'atTime') return 'At due time';
  if (task.reminder === '10min') return '10 min before';
  if (task.reminder === '30min') return '30 min before';
  if (task.reminder === '1hour') return '1 hour before';
  if (task.reminder === '1day') return '1 day before';
  if (
    task.reminder === 'custom' &&
    typeof task.manualReminderMinutes === 'number'
  ) {
    return `${task.manualReminderMinutes} min before`;
  }
  if (task.reminder === 'custom') return 'Custom reminder';

  return task.reminder;
}

function uniqueTasksById(items: Task[]) {
  const seen = new Set<string>();

  return items.filter((task) => {
    if (seen.has(task.id)) return false;

    seen.add(task.id);
    return true;
  });
}

function sortReminderItems(items: Task[]) {
  return [...items].sort((a, b) => {
    const dateA = `${a.dueDate || '9999-99-99'} ${a.dueTime || ''}`;
    const dateB = `${b.dueDate || '9999-99-99'} ${b.dueTime || ''}`;

    return dateA.localeCompare(dateB);
  });
}

function isHighFocusTask(task: Task) {
  const urgency = getTaskUrgency(task);

  return (
    task.priority === 'high' ||
    urgency.level === 'high' ||
    urgency.level === 'urgent' ||
    urgency.level === 'overdue'
  );
}

function getTypeAccent(task: Task) {
  if (task.plannerType === 'meeting') return theme.colors.purple;
  if (task.plannerType === 'date') return theme.colors.yellow;
  return theme.colors.primary;
}

function getStatusAccent(task: Task) {
  const urgency = getTaskUrgency(task);

  if (urgency.level === 'overdue' || urgency.level === 'urgent') {
    return theme.colors.danger;
  }

  if (urgency.level === 'high') return theme.colors.yellow;
  if (urgency.level === 'medium') return theme.colors.blue;
  if (urgency.level === 'done') return theme.colors.success;
  if (task.priority === 'high') return theme.colors.yellow;
  if (task.priority === 'low') return theme.colors.blue;

  return theme.colors.primary;
}

function getTypeIcon(task: Task) {
  if (task.plannerType === 'meeting') return 'people-outline';
  if (task.plannerType === 'date') return 'calendar-outline';
  return 'checkmark-circle-outline';
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

function getEmptyStateCopy(filter: ReminderFilter) {
  if (filter === 'today') {
    return {
      title: 'No items due today.',
      message: 'Milo is all clear here. You can focus without stress.',
    };
  }

  if (filter === 'upcoming') {
    return {
      title: 'No upcoming reminders yet.',
      message: 'Milo will keep watch when something is planned.',
    };
  }

  if (filter === 'needsSetup') {
    return {
      title: 'Milo is all clear for now.',
      message: 'No active reminders need setup. You can focus without stress.',
    };
  }

  return {
    title: 'Milo is all clear for now.',
    message: 'No active reminders here. You can focus without stress.',
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
  isLast,
}: {
  label: string;
  value: number;
  selected: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.filterChip,
        isLast && styles.filterChipLast,
        selected && styles.filterChipSelected,
      ]}
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
  const isHighFocusReminder = isHighFocusTask(task);

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
        <Text style={styles.infoTitle}>Reminder details</Text>

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
              {isHighFocusReminder ? 'High focus reminder' : urgency.label}
            </Text>
          </View>

          {task.conflictAccepted ? (
            <View style={styles.acceptedConflictChip}>
              <Text style={styles.acceptedConflictText}>
                Keep Both accepted
              </Text>
            </View>
          ) : null}
        </View>

        {task.conflictAccepted ? (
          <Text style={styles.acceptedConflictNote}>
            Milo will remember this accepted overlap.
          </Text>
        ) : null}

        {isHighFocusReminder ? (
          <Text style={styles.highFocusText}>
            Milo will keep this easy to spot.
          </Text>
        ) : null}

        <Text style={styles.startEarlyText}>{urgency.startEarlyMessage}</Text>
      </View>
    </View>
  );
}

function ReminderAccordionCard({
  task,
  expanded,
  onToggleExpanded,
  onToggleDone,
  onOpenDetails,
}: {
  task: Task;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleDone: () => void;
  onOpenDetails: () => void;
}) {
  const typeAccent = getTypeAccent(task);
  const statusAccent = getStatusAccent(task);
  const urgency = getTaskUrgency(task);
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter((item) => item.completed).length;
  const dueText = [task.dueDate, task.dueTime].filter(Boolean).join(' - ');
  const displayDueText = dueText || 'Needs setup';

  return (
    <View style={[styles.accordionCard, expanded && styles.accordionCardOpen]}>
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.accordionHeader}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${task.title}`}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          style={[
            styles.checkCircle,
            task.status === 'completed' && {
              backgroundColor: statusAccent,
              borderColor: statusAccent,
            },
          ]}
          onPress={(event) => {
            event.stopPropagation();
            onToggleDone();
          }}
          accessibilityRole="button"
          accessibilityLabel={
            task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'
          }
        >
          {task.status === 'completed' ? (
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          ) : null}
        </TouchableOpacity>

        <View
          style={[
            styles.taskIcon,
            {
              backgroundColor: `${typeAccent}18`,
            },
          ]}
        >
          <Ionicons
            name={getTypeIcon(task) as any}
            size={17}
            color={typeAccent}
          />
        </View>

        <View style={styles.taskTextArea}>
          <Text numberOfLines={1} style={styles.taskTitle}>
            {task.title}
          </Text>

          <View style={styles.taskMetaRow}>
            <View
              style={[
                styles.taskUrgencyPill,
                {
                  backgroundColor: `${statusAccent}18`,
                  borderColor: `${statusAccent}40`,
                },
              ]}
            >
              <Text style={[styles.taskUrgencyText, { color: statusAccent }]}>
                {urgency.label}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={theme.colors.muted} />
              <Text numberOfLines={1} style={styles.metaText}>
                {displayDueText}
              </Text>
            </View>

            {subtasks.length > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="list-outline" size={12} color={theme.colors.muted} />
                <Text style={styles.metaText}>
                  {completedSubtasks}/{subtasks.length}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.cardActions}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.colors.primaryDark}
          />

          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.detailsButton}
            onPress={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open details for ${task.title}`}
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.muted}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {expanded ? <ReminderInfoCard task={task} /> : null}
    </View>
  );
}

export default function ReminderCenterScreen() {
  const navigation = useNavigation<any>();
  const { tasks, toggleTask } = useTasks();

  const [selectedFilter, setSelectedFilter] =
    useState<ReminderFilter>('reminders');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const todayDate = getTodayDate();

  const groups = useMemo(() => {
    const pending = tasks.filter((task) => task.status === 'pending');

    const reminders = uniqueTasksById(
      sortReminderItems(
        pending.filter((task) => Boolean(task.dueDate) && hasReminder(task))
      )
    );

    const today = uniqueTasksById(
      sortReminderItems(pending.filter((task) => task.dueDate === todayDate))
    );

    const upcoming = uniqueTasksById(
      sortReminderItems(
        pending.filter(
          (task) =>
            Boolean(task.dueDate) &&
            task.dueDate! > todayDate &&
            hasReminder(task)
        )
      )
    );

    const needsSetup = uniqueTasksById(
      sortReminderItems(
        pending.filter(
          (task) => !task.dueDate || !hasReminder(task)
        )
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

  const emptyStateCopy = getEmptyStateCopy(selectedFilter);
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

  const handleSelectFilter = (filter: ReminderFilter) => {
    setSelectedFilter(filter);
    setExpandedTaskId(null);
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
    <ScreenContainer topPadding={-30} bottomPadding={50}>
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
          onPress={() => handleSelectFilter('reminders')}
        />

        <FilterChip
          label="Today"
          value={groups.today.length}
          selected={selectedFilter === 'today'}
          onPress={() => handleSelectFilter('today')}
          isLast
        />
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label="Upcoming"
          value={groups.upcoming.length}
          selected={selectedFilter === 'upcoming'}
          onPress={() => handleSelectFilter('upcoming')}
        />

        <FilterChip
          label="Needs Setup"
          value={groups.needsSetup.length}
          selected={selectedFilter === 'needsSetup'}
          onPress={() => handleSelectFilter('needsSetup')}
          isLast
        />
      </View>

      <SectionHeader
        title={getFilterTitle()}
        subtitle={getFilterSubtitle()}
      />

      {visibleItems.length > 0 ? (
        <View style={styles.itemList}>
          {visibleItems.map((task, index) => (
            <View
              key={task.id}
              style={[
                styles.itemBlock,
                index === visibleItems.length - 1 && styles.itemBlockLast,
              ]}
            >
              <ReminderAccordionCard
                task={task}
                expanded={expandedTaskId === task.id}
                onToggleExpanded={() =>
                  setExpandedTaskId((current) =>
                    current === task.id ? null : task.id
                  )
                }
                onToggleDone={() => toggleTask(task.id)}
                onOpenDetails={() =>
                  navigation.navigate('TaskDetails', {
                    taskId: task.id,
                  })
                }
              />
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          imageSource={getMiloImageSource('happy')}
          title={emptyStateCopy.title}
          message={emptyStateCopy.message}
          actionLabel="Create planner item"
          onActionPress={() => navigation.navigate('AddTask')}
        />
      )}

      {visibleItems.length > 0 ? (
        <Text style={styles.encouragementText}>
          Milo is keeping an eye on things for you.
        </Text>
      ) : null}

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

        <View style={styles.bottomButtonLast}>
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
  filterChipLast: {
    marginRight: 0,
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
  itemBlockLast: {
    marginBottom: 0,
  },
  accordionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  accordionCardOpen: {
    borderColor: theme.colors.primary,
  },
  accordionHeader: {
    minHeight: 64,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#CCD4DD',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  taskIcon: {
    width: 30,
    height: 30,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  taskTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  taskTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  taskMetaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  taskUrgencyPill: {
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 7,
  },
  taskUrgencyText: {
    fontSize: 10,
    fontWeight: '900',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 7,
    maxWidth: 150,
  },
  metaText: {
    marginLeft: 4,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 2,
  },
  detailsButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  infoCard: {
    marginLeft: 14,
    marginRight: 12,
    paddingTop: 9,
    paddingBottom: 11,
    paddingLeft: 12,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
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
    flexWrap: 'wrap',
    marginTop: 8,
  },
  urgencyChip: {
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginRight: 7,
    marginBottom: 6,
  },
  urgencyChipText: {
    fontSize: 11,
    fontWeight: '900',
  },
  acceptedConflictChip: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 6,
  },
  acceptedConflictText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  acceptedConflictNote: {
    marginTop: 1,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  highFocusText: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
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
    marginTop: 0,
    marginBottom: 9,
  },
  encouragementText: {
    marginTop: 8,
    marginBottom: 9,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  bottomButton: {
    flex: 1,
    marginRight: 10,
  },
  bottomButtonLast: {
    flex: 1,
  },
  noteCard: {
    backgroundColor: theme.colors.blueSoft,
    borderRadius: theme.radius.lg,
    padding: 13,
    flexDirection: 'row',
  },
  noteIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
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
