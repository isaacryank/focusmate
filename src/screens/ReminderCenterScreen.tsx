import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useTasks } from '../lib/TaskContext';
import { Task } from '../types/task';
import { getTodayDate } from '../lib/miloPersonality';
import { getTaskUrgency } from '../lib/taskUrgency';

import ScreenContainer from '../components/ui/ScreenContainer';
import EmptyState from '../components/ui/EmptyState';
import MiloMoodImage, { getMiloImageSource } from '../components/milo/MiloMoodImage';

type ReminderFilter =
  | 'reminders'
  | 'today'
  | 'upcoming'
  | 'needsSetup';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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
  if (urgency.level === 'medium') return theme.colors.primary;
  if (urgency.level === 'done') return theme.colors.success;
  if (task.priority === 'high') return theme.colors.yellow;
  if (task.priority === 'low') return theme.colors.blue;

  return theme.colors.primary;
}

function getTypeIcon(task: Task): IoniconName {
  if (task.plannerType === 'meeting') return 'people-outline';
  if (task.plannerType === 'date') return 'calendar-outline';
  return 'book-outline';
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

function PageDecor() {
  return (
    <View pointerEvents="none" style={styles.pageDecor}>
      <View style={[styles.pageBlob, styles.pageBlobTop]} />
      <View style={[styles.pageBlob, styles.pageBlobMid]} />
      <View style={[styles.pageBlob, styles.pageBlobBottom]} />
    </View>
  );
}

function Header({
  onBack,
  onSettingsPress,
}: {
  onBack: () => void;
  onSettingsPress: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        activeOpacity={0.84}
        style={styles.headerButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>

      <Text numberOfLines={1} style={styles.headerTitle}>
        Reminder Center
      </Text>

      <TouchableOpacity
        activeOpacity={0.84}
        style={styles.headerButton}
        onPress={onSettingsPress}
        accessibilityRole="button"
        accessibilityLabel="Open notification settings"
      >
        <Ionicons name="settings-outline" size={22} color={theme.colors.text} />
      </TouchableOpacity>
    </View>
  );
}

function HeroCard({
  count,
  onAddPress,
}: {
  count: number;
  onAddPress: () => void;
}) {
  const { isDark } = useFocusMateTheme();
  const heroGradientColors = isDark
    ? (['#102820', '#0F241C', '#0A1813'] as const)
    : (['#FFFFFF', '#F4FCF2', '#EAF8EC'] as const);

  return (
    <View style={styles.heroCard}>
      <LinearGradient
        pointerEvents="none"
        colors={heroGradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroGradient}
      />

      <View pointerEvents="none" style={styles.heroDecor}>
        <View style={styles.heroInnerHighlight} />
        <View style={styles.heroBaseWash} />
        <View style={styles.heroMiloHalo} />
        <View style={styles.heroMiloHaloRing} />
        <View style={[styles.heroGlow, styles.heroGlowOne]} />
        <View style={[styles.heroGlow, styles.heroGlowTwo]} />
        <View style={[styles.heroCloud, styles.heroCloudOne]} />
        <View style={[styles.heroCloud, styles.heroCloudTwo]} />
        <View style={[styles.heroHill, styles.heroHillBack]} />
        <View style={[styles.heroHill, styles.heroHillFront]} />
        <View style={[styles.heroSpark, styles.heroSparkOne]} />
        <View style={[styles.heroSpark, styles.heroSparkTwo]} />
        <View style={[styles.heroSpark, styles.heroSparkThree]} />
        <View style={[styles.heroSpark, styles.heroSparkFour]} />
        <View style={[styles.heroSpark, styles.heroSparkFive]} />
      </View>

      <View style={styles.heroCopy}>
        <View style={styles.heroBadge}>
          <Ionicons name="sparkles" size={13} color={theme.colors.primaryDark} />
          <Text style={styles.heroBadgeText}>Focused Milo</Text>
        </View>

        <Text style={styles.heroTitle}>Milo found items that need attention</Text>
        <Text style={styles.heroSubtitle}>
          {count} item(s) need a reminder.
        </Text>
        <Text style={styles.heroHelper}>Milo can help you stay on track!</Text>

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.heroPrimaryButton}
          onPress={onAddPress}
          accessibilityRole="button"
          accessibilityLabel="Add reminder item"
        >
          <Text style={styles.heroPrimaryText}>Add Item</Text>
          <View style={styles.heroPlus}>
            <Ionicons name="add" size={18} color={theme.colors.primaryDark} />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.heroMiloStage}>
        <View style={styles.heroMiloShadow} />
        <View style={styles.heroMiloPlatform} />
        <MiloMoodImage mood="focused" size={122} style={styles.heroMilo} />
      </View>
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.sectionAction}
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={theme.colors.primaryDark}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function withAlpha(color: string, alpha: string) {
  return color.startsWith('#') && color.length === 7 ? `${color}${alpha}` : color;
}

function Sparkline({ color }: { color: string }) {
  const points = [
    { x: 3, y: 19 },
    { x: 23, y: 16 },
    { x: 42, y: 19 },
    { x: 62, y: 12 },
    { x: 81, y: 14 },
    { x: 102, y: 7 },
  ];
  const segments = points.slice(0, -1).map((point, index) => {
    const nextPoint = points[index + 1];
    const dx = nextPoint.x - point.x;
    const dy = nextPoint.y - point.y;
    const width = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    return {
      left: point.x + dx / 2 - width / 2,
      top: point.y + dy / 2 - 1,
      width,
      rotate: `${angle}deg`,
    };
  });

  return (
    <View style={styles.sparkline}>
      <View
        style={[
          styles.sparklineWash,
          { backgroundColor: withAlpha(color, '12') },
        ]}
      />

      {segments.map((segment, index) => (
        <React.Fragment key={`segment-${index}`}>
          <View
            style={[
              styles.sparkSegmentGlow,
              {
                left: segment.left,
                top: segment.top,
                width: segment.width,
                backgroundColor: withAlpha(color, '24'),
                transform: [{ rotate: segment.rotate }],
              },
            ]}
          />
          <View
            style={[
              styles.sparkSegment,
              {
                left: segment.left,
                top: segment.top,
                width: segment.width,
                backgroundColor: color,
                transform: [{ rotate: segment.rotate }],
              },
            ]}
          />
        </React.Fragment>
      ))}

      {[points[1], points[3]].map((dot, index) => (
        <View
          key={`dot-${index}`}
          style={[
            styles.sparkDot,
            {
              left: dot.x - 2,
              top: dot.y - 2,
              backgroundColor: color,
            },
          ]}
        />
      ))}

      <View
        style={[
          styles.sparkDotFinal,
          {
            left: points[5].x - 5,
            top: points[5].y - 5,
            borderColor: withAlpha(color, '34'),
          },
        ]}
      >
        <View
          style={[
            styles.sparkDotFinalCore,
            {
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  onPress,
}: {
  title: string;
  value: number;
  icon: IoniconName;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.statCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${value}`}
    >
      <View style={styles.statTopRow}>
        <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={19} color={color} />
        </View>
        <View style={styles.statChevron}>
          <Ionicons name="chevron-forward" size={15} color={theme.colors.muted} />
        </View>
      </View>

      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.statTitle}>
        {title}
      </Text>
      <Sparkline color={color} />
    </TouchableOpacity>
  );
}

function FilterChip({
  label,
  value,
  icon,
  selected,
  onPress,
}: {
  label: string;
  value: number;
  icon: IoniconName;
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
      <View style={[styles.filterIcon, selected && styles.filterIconSelected]}>
        <Ionicons
          name={icon}
          size={16}
          color={selected ? theme.colors.primaryDark : theme.colors.muted}
        />
      </View>

      <Text numberOfLines={1} style={[styles.filterText, selected && styles.filterTextSelected]}>
        {label}
      </Text>

      <View style={[styles.filterBadge, selected && styles.filterBadgeSelected]}>
        <Text style={[styles.filterBadgeText, selected && styles.filterBadgeTextSelected]}>
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

function ReminderMeta({
  icon,
  text,
}: {
  icon: IoniconName;
  text: string;
}) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={theme.colors.mutedText} />
      <Text numberOfLines={1} style={styles.metaText}>
        {text}
      </Text>
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
  const dateText = task.dueDate || 'No date';
  const timeText = task.dueTime || 'Any time';
  const reminderText = getReminderLabel(task);

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
          activeOpacity={0.72}
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
            <Ionicons name="checkmark" size={17} color="#FFFFFF" />
          ) : null}
        </TouchableOpacity>

        <View
          style={[
            styles.taskIcon,
            {
              backgroundColor: `${typeAccent}16`,
              borderColor: `${typeAccent}32`,
            },
          ]}
        >
          <Ionicons name={getTypeIcon(task)} size={20} color={typeAccent} />
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
                  borderColor: `${statusAccent}42`,
                },
              ]}
            >
              <Text numberOfLines={1} style={[styles.taskUrgencyText, { color: statusAccent }]}>
                {urgency.label}
              </Text>
            </View>

            <ReminderMeta icon="calendar-outline" text={dateText} />
            <ReminderMeta icon="time-outline" text={timeText} />
            <ReminderMeta icon="notifications-outline" text={reminderText} />
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            activeOpacity={0.76}
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
              size={21}
              color={theme.colors.primaryDark}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {expanded ? <ReminderInfoCard task={task} /> : null}
    </View>
  );
}

export default function ReminderCenterScreen() {
  useFocusMateTheme();

  const navigation = useNavigation<any>();
  const { tasks, toggleTask } = useTasks();

  const [selectedFilter, setSelectedFilter] =
    useState<ReminderFilter>('reminders');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

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

  const handleSelectFilter = (filter: ReminderFilter) => {
    setSelectedFilter(filter);
    setExpandedTaskId(null);
  };

  return (
    <ScreenContainer
      topPadding={0}
      bottomPadding={56}
      contentStyle={styles.screenContent}
    >
      <PageDecor />

      <Header
        onBack={() => navigation.goBack()}
        onSettingsPress={() =>
          navigation.navigate('MainTabs', {
            screen: 'Settings',
          })
        }
      />

      <HeroCard
        count={groups.needsSetup.length}
        onAddPress={() => navigation.navigate('AddTask')}
      />

      <SectionTitle
        title="Overview"
        subtitle="Milo tracks what needs attention."
        actionLabel="View all"
        onActionPress={() => handleSelectFilter('reminders')}
      />

      <View style={styles.statsGrid}>
        <StatCard
          title="Reminders"
          value={groups.reminders.length}
          color={theme.colors.primaryDark}
          icon="notifications-outline"
          onPress={() => handleSelectFilter('reminders')}
        />
        <StatCard
          title="Today"
          value={groups.today.length}
          color={theme.colors.blue}
          icon="today-outline"
          onPress={() => handleSelectFilter('today')}
        />
        <StatCard
          title="Upcoming"
          value={groups.upcoming.length}
          color={theme.colors.purple}
          icon="calendar-outline"
          onPress={() => handleSelectFilter('upcoming')}
        />
        <StatCard
          title="Needs Setup"
          value={groups.needsSetup.length}
          color={theme.colors.yellow}
          icon="alert-circle-outline"
          onPress={() => handleSelectFilter('needsSetup')}
        />
      </View>

      <View style={styles.filterPanel}>
        <FilterChip
          label="Reminders"
          value={groups.reminders.length}
          icon="notifications-outline"
          selected={selectedFilter === 'reminders'}
          onPress={() => handleSelectFilter('reminders')}
        />
        <FilterChip
          label="Today"
          value={groups.today.length}
          icon="today-outline"
          selected={selectedFilter === 'today'}
          onPress={() => handleSelectFilter('today')}
        />
        <FilterChip
          label="Upcoming"
          value={groups.upcoming.length}
          icon="calendar-outline"
          selected={selectedFilter === 'upcoming'}
          onPress={() => handleSelectFilter('upcoming')}
        />
        <FilterChip
          label="Needs Setup"
          value={groups.needsSetup.length}
          icon="alert-circle-outline"
          selected={selectedFilter === 'needsSetup'}
          onPress={() => handleSelectFilter('needsSetup')}
        />
      </View>

      <SectionTitle
        title="Active Reminders"
        subtitle="Reminders Milo is watching."
      />

      {visibleItems.length > 0 ? (
        <View style={styles.itemList}>
          {visibleItems.map((task) => (
            <ReminderAccordionCard
              key={task.id}
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 16,
  },
  pageDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  pageBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  pageBlobTop: {
    top: 30,
    right: -56,
    width: 170,
    height: 170,
    backgroundColor: 'rgba(47, 143, 70, 0.08)',
  },
  pageBlobMid: {
    top: 360,
    left: -75,
    width: 190,
    height: 190,
    backgroundColor: 'rgba(229, 246, 233, 0.34)',
  },
  pageBlobBottom: {
    bottom: 170,
    right: -90,
    width: 220,
    height: 220,
    backgroundColor: 'rgba(47, 143, 70, 0.06)',
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 6,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  heroCard: {
    minHeight: 218,
    borderRadius: 28,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.2)',
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 17,
    marginBottom: 21,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 10,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  heroInnerHighlight: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    height: 78,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  heroBaseWash: {
    position: 'absolute',
    left: -24,
    right: -24,
    bottom: -28,
    height: 94,
    borderTopLeftRadius: 90,
    borderTopRightRadius: 90,
    backgroundColor: 'rgba(47, 143, 70, 0.1)',
  },
  heroMiloHalo: {
    position: 'absolute',
    right: -4,
    top: 35,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: 'rgba(129, 214, 116, 0.2)',
  },
  heroMiloHaloRing: {
    position: 'absolute',
    right: 14,
    top: 53,
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(47, 143, 70, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  heroGlow: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroGlowOne: {
    width: 170,
    height: 170,
    top: -24,
    right: -18,
    backgroundColor: 'rgba(47, 143, 70, 0.07)',
  },
  heroGlowTwo: {
    width: 120,
    height: 120,
    bottom: -48,
    left: -26,
    backgroundColor: 'rgba(244, 197, 66, 0.1)',
  },
  heroCloud: {
    position: 'absolute',
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  heroCloudOne: {
    top: 34,
    right: 92,
    width: 78,
  },
  heroCloudTwo: {
    bottom: 62,
    right: 150,
    width: 64,
  },
  heroHill: {
    position: 'absolute',
    left: -40,
    right: -40,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  heroHillBack: {
    bottom: -32,
    height: 74,
    backgroundColor: 'rgba(47, 143, 70, 0.13)',
  },
  heroHillFront: {
    bottom: -36,
    left: 82,
    height: 64,
    backgroundColor: 'rgba(47, 143, 70, 0.18)',
  },
  heroSpark: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(47, 143, 70, 0.28)',
  },
  heroSparkOne: {
    top: 66,
    right: 120,
  },
  heroSparkTwo: {
    top: 104,
    right: 72,
    width: 5,
    height: 5,
  },
  heroSparkThree: {
    top: 96,
    left: 33,
    width: 5,
    height: 5,
    backgroundColor: 'rgba(244, 197, 66, 0.42)',
  },
  heroSparkFour: {
    top: 46,
    right: 54,
    width: 4,
    height: 4,
    backgroundColor: 'rgba(244, 197, 66, 0.46)',
  },
  heroSparkFive: {
    top: 134,
    right: 130,
    width: 4,
    height: 4,
    backgroundColor: 'rgba(47, 143, 70, 0.24)',
  },
  heroCopy: {
    flex: 1.15,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 8,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    marginBottom: 12,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  heroBadgeText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 6,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
  },
  heroSubtitle: {
    color: theme.colors.mutedText,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 9,
  },
  heroHelper: {
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 7,
  },
  heroPrimaryButton: {
    alignSelf: 'flex-start',
    minHeight: 46,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 19,
    paddingRight: 8,
    marginTop: 18,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
  },
  heroPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    marginRight: 12,
  },
  heroPlus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: 'rgba(35, 107, 53, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMiloStage: {
    width: 122,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  heroMiloShadow: {
    position: 'absolute',
    bottom: 19,
    width: 94,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(35, 107, 53, 0.16)',
  },
  heroMiloPlatform: {
    position: 'absolute',
    bottom: 24,
    width: 106,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: 'rgba(47, 143, 70, 0.18)',
    borderTopColor: 'rgba(255, 255, 255, 0.62)',
    backgroundColor: 'rgba(255, 255, 255, 0.36)',
  },
  heroMilo: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    paddingHorizontal: 9,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionActionText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    width: '48%',
    minHeight: 146,
    backgroundColor: theme.colors.card,
    borderRadius: 23,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.18)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 7,
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    ...theme.shadowSoft,
  },
  statChevron: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 12,
  },
  statTitle: {
    marginTop: 3,
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '900',
  },
  sparkline: {
    width: 112,
    height: 30,
    marginTop: 10,
    overflow: 'visible',
  },
  sparklineWash: {
    position: 'absolute',
    left: 0,
    right: 4,
    bottom: 1,
    height: 15,
    borderRadius: 999,
  },
  sparkSegment: {
    position: 'absolute',
    height: 2,
    borderRadius: 2,
    opacity: 0.86,
  },
  sparkSegmentGlow: {
    position: 'absolute',
    height: 6,
    borderRadius: 6,
    marginTop: -2,
    opacity: 0.72,
  },
  sparkDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.72,
  },
  sparkDotFinal: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  sparkDotFinalCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  filterPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    borderRadius: 23,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.14)',
    padding: 8,
    marginBottom: 20,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  filterChip: {
    width: '49%',
    minHeight: 46,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    marginBottom: 8,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.09,
    shadowRadius: 9,
    elevation: 2,
  },
  filterChipSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
    borderBottomColor: theme.colors.primaryDark,
    shadowOpacity: 0.16,
    shadowRadius: 13,
    elevation: 4,
  },
  filterIcon: {
    width: 26,
    height: 26,
    borderRadius: 11,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  filterIconSelected: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.inputBorder,
  },
  filterText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  filterTextSelected: {
    color: theme.colors.primaryDark,
  },
  filterBadge: {
    minWidth: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 5,
  },
  filterBadgeSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    borderBottomColor: theme.colors.primaryDark,
  },
  filterBadgeText: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '900',
  },
  filterBadgeTextSelected: {
    color: '#FFFFFF',
  },
  itemList: {
    marginBottom: 12,
  },
  accordionCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.16)',
    marginBottom: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 6,
  },
  accordionCardOpen: {
    borderColor: theme.colors.primary,
  },
  accordionHeader: {
    minHeight: 68,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 29,
    height: 29,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#CCD4DD',
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  taskIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    borderWidth: 1,
    borderBottomWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  taskTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  taskTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  taskMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  taskUrgencyPill: {
    borderWidth: 1,
    borderBottomWidth: 2,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 7,
    marginBottom: 4,
  },
  taskUrgencyText: {
    fontSize: 10,
    fontWeight: '900',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
    maxWidth: 142,
  },
  metaText: {
    marginLeft: 4,
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '800',
  },
  cardActions: {
    alignItems: 'center',
    marginLeft: 2,
  },
  detailsButton: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    marginLeft: 12,
    marginRight: 10,
    paddingTop: 9,
    paddingBottom: 10,
    paddingLeft: 10,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  infoTextArea: {
    flex: 1,
  },
  infoTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  infoText: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
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
});
