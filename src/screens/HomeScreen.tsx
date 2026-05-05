import React, { useMemo } from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import {
  CategoryIconKey,
  categoryIcons,
  miloActivities,
  miloReactions,
} from '../assets/generatedAssetMap';
import { getMiloHomeHero } from '../lib/miloHomeHero';
import { getTodayDate } from '../lib/miloPersonality';
import { getTaskUrgency, TaskUrgency } from '../lib/taskUrgency';
import { useAuth } from '../lib/AuthContext';
import { useTasks } from '../lib/TaskContext';
import { Task } from '../types/task';
import { theme } from '../theme';

import EmptyState from '../components/ui/EmptyState';
import ScreenContainer from '../components/ui/ScreenContainer';

type HomeItem = {
  task: Task;
  urgency: TaskUrgency;
  categoryIcon: ImageSourcePropType;
  miloSticker: ImageSourcePropType;
  isMeetingSoon: boolean;
};

const typeLabels: Record<Task['plannerType'], string> = {
  task: 'Task',
  meeting: 'Meeting',
  date: 'Date',
};

const typeTone: Record<
  Task['plannerType'],
  { backgroundColor: string; color: string; chipBackground: string }
> = {
  task: {
    backgroundColor: '#DFF7E8',
    color: theme.colors.primaryDark,
    chipBackground: '#EAFBF0',
  },
  meeting: {
    backgroundColor: '#EEE8FF',
    color: theme.colors.purple,
    chipBackground: theme.colors.purpleSoft,
  },
  date: {
    backgroundColor: '#FFF0D9',
    color: '#B7791F',
    chipBackground: '#FFF6E8',
  },
};

function parsePlannerDateTime(item: Task, fallbackEndOfDay = false) {
  if (!item.dueDate) return null;

  const [year, month, day] = item.dueDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  const plannedDate = new Date(year, month - 1, day);

  if (!item.dueTime) {
    if (fallbackEndOfDay) plannedDate.setHours(23, 59, 0, 0);
    return plannedDate;
  }

  const normalizedTime = item.dueTime
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!normalizedTime) return plannedDate;

  const [, rawHour, rawMinute, meridiem] = normalizedTime;
  let hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return plannedDate;

  if (meridiem) {
    const upperMeridiem = meridiem.toUpperCase();
    if (upperMeridiem === 'PM' && hour < 12) hour += 12;
    if (upperMeridiem === 'AM' && hour === 12) hour = 0;
  }

  plannedDate.setHours(hour, minute, 0, 0);
  return plannedDate;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function getPlannerDateContext(item: Task) {
  const plannedDate = parsePlannerDateTime(item);
  if (!plannedDate) return 'Any day';

  return `${weekdayLabels[plannedDate.getDay()]}, ${plannedDate.getDate()} ${
    monthLabels[plannedDate.getMonth()]
  }`;
}

function isMeetingSoon(item: Task, now: Date, todayDate: string) {
  if (
    item.status === 'completed' ||
    item.plannerType !== 'meeting' ||
    item.dueDate !== todayDate
  ) {
    return false;
  }

  const plannedDate = parsePlannerDateTime(item);
  if (!plannedDate || !item.dueTime) return false;

  const minutesUntilMeeting =
    (plannedDate.getTime() - now.getTime()) / (1000 * 60);

  return minutesUntilMeeting >= 0 && minutesUntilMeeting <= 120;
}

function getAttentionRank(item: Task, now: Date, todayDate: string) {
  const urgency = getTaskUrgency(item, now);

  if (urgency.level === 'overdue') return 0;
  if (urgency.level === 'urgent') return 1;
  if (isMeetingSoon(item, now, todayDate)) return 2;
  if (urgency.level === 'medium') return 3;
  if (urgency.level === 'high') return 4;
  return 5;
}

function getKeywordText(item: Task) {
  return `${item.title} ${item.description || ''} ${item.location || ''}`
    .toLowerCase()
    .trim();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getCategoryIconKey(item: Task): CategoryIconKey {
  const text = getKeywordText(item);

  if (includesAny(text, ['birthday'])) return 'birthday_cake';
  if (includesAny(text, ['hiking', 'hike', 'mountain'])) return 'hiking_mountain';
  if (includesAny(text, ['jogging', 'jog', 'run'])) return 'jogging_run';
  if (includesAny(text, ['workout', 'gym', 'dumbbell', 'exercise'])) return 'workout_dumbbell';
  if (includesAny(text, ['coffee', 'cafe'])) return 'coffee_break';
  if (includesAny(text, ['groceries', 'grocery'])) return 'groceries_bag';
  if (includesAny(text, ['shopping', 'shop'])) return 'shopping_cart';
  if (includesAny(text, ['work', 'laptop', 'office'])) return 'work_laptop';
  if (includesAny(text, ['call', 'phone'])) return 'phone_call';
  if (includesAny(text, ['health', 'medicine', 'doctor', 'clinic'])) return 'health_medicine';
  if (includesAny(text, ['bill', 'payment', 'pay'])) return 'bill_payment';
  if (includesAny(text, ['travel', 'flight', 'airport'])) return 'travel_airplane';
  if (includesAny(text, ['home', 'household', 'clean'])) return 'home_household';
  if (item.plannerType === 'meeting') return 'meeting_people';
  if (item.plannerType === 'date') return 'date_calendar';

  return 'study_book';
}

function getMiloSticker(item: Task, urgency: TaskUrgency): ImageSourcePropType {
  const text = getKeywordText(item);

  if (urgency.level === 'overdue') return miloReactions.worried;
  if (urgency.level === 'urgent') return miloReactions.determined_lock_in;
  if (urgency.level === 'done') return miloReactions.proud;
  if (urgency.level === 'medium') return miloReactions.cheering;
  if (includesAny(text, ['birthday'])) return miloActivities.birthday_cake;
  if (includesAny(text, ['reminder'])) return miloActivities.reminder_bell;
  if (includesAny(text, ['checklist', 'todo', 'to-do'])) return miloActivities.checklist_clipboard;
  if (item.plannerType === 'meeting') return miloActivities.online_meeting;
  if (item.plannerType === 'date') return miloActivities.holding_calendar;
  if (includesAny(text, ['study', 'assignment'])) return miloActivities.studying_desk;

  return miloActivities.reading_book;
}

function getUrgencyColors(urgency: TaskUrgency) {
  if (urgency.level === 'urgent') {
    return { color: '#D97706', backgroundColor: '#FFF2DC' };
  }

  if (urgency.level === 'medium') {
    return { color: theme.colors.primaryDark, backgroundColor: theme.colors.primarySoft };
  }

  switch (urgency.colorKey) {
    case 'danger':
      return { color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft };
    case 'yellow':
      return { color: '#9A6B00', backgroundColor: theme.colors.yellowSoft };
    case 'primary':
      return { color: theme.colors.primaryDark, backgroundColor: theme.colors.primarySoft };
    case 'blue':
      return { color: theme.colors.blue, backgroundColor: theme.colors.blueSoft };
    case 'success':
      return { color: theme.colors.success, backgroundColor: theme.colors.successSoft };
    default:
      return { color: theme.colors.muted, backgroundColor: theme.colors.background };
  }
}

type StatIconName = React.ComponentProps<typeof Ionicons>['name'];

function StatCard({
  iconName,
  label,
  value,
  subtitle,
  tone,
}: {
  iconName: StatIconName;
  label: string;
  value: number | string;
  subtitle: string;
  tone: { color: string; backgroundColor: string; iconBackground: string };
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: tone.backgroundColor }]}>
      <View style={[styles.statIconWrap, { backgroundColor: tone.iconBackground }]}>
        <Ionicons name={iconName} size={20} color={tone.color} />
      </View>
      <Text style={[styles.statValue, { color: tone.color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
      <Text numberOfLines={1} style={styles.statSubtitle}>
        {subtitle}
      </Text>
    </View>
  );
}

function CountChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'danger' | 'today' | 'early';
}) {
  const colors =
    tone === 'danger'
      ? { color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft }
      : tone === 'today'
      ? { color: '#D97706', backgroundColor: '#FFF2DC' }
      : { color: theme.colors.primaryDark, backgroundColor: theme.colors.primarySoft };
  const iconName =
    tone === 'danger'
      ? 'alert-circle'
      : tone === 'today'
      ? 'time'
      : 'paper-plane';

  return (
    <View style={[styles.countChip, { backgroundColor: colors.backgroundColor }]}>
      <Ionicons name={iconName} size={14} color={colors.color} />
      <Text style={[styles.countChipText, { color: colors.color }]}>
        {count} {label}
      </Text>
    </View>
  );
}

function MiloTaskRow({
  item,
  onPress,
}: {
  item: HomeItem;
  onPress: () => void;
}) {
  const { task, urgency, categoryIcon, miloSticker, isMeetingSoon: meetingSoon } = item;
  const urgencyColors = getUrgencyColors(urgency);
  const urgencyLabel = meetingSoon ? 'Soon' : urgency.label;
  const tone = typeTone[task.plannerType];
  const dateContext = getPlannerDateContext(task);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.itemRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
    >
      <View style={[styles.categoryTile, { backgroundColor: tone.backgroundColor }]}>
        <Image source={categoryIcon} style={styles.categoryIcon} />
      </View>

      <Image source={miloSticker} style={styles.miloSticker} />

      <View style={styles.itemContent}>
        <Text numberOfLines={1} style={styles.itemTitle}>
          {task.title}
        </Text>
        <View style={styles.itemMetaRow}>
          <View style={[styles.typeChip, { backgroundColor: tone.chipBackground }]}>
            <Text style={[styles.typeChipText, { color: tone.color }]}>
              {typeLabels[task.plannerType]}
            </Text>
          </View>
          <View
            style={[
              styles.itemUrgencyChip,
              { backgroundColor: urgencyColors.backgroundColor },
            ]}
          >
            <Text style={[styles.itemUrgencyText, { color: urgencyColors.color }]}>
              {urgencyLabel}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.itemDateContext}>
            {dateContext}
          </Text>
        </View>
      </View>

      <Text numberOfLines={1} style={styles.itemTime}>
        {task.dueTime || (task.dueDate ? 'Today' : 'Anytime')}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { userName } = useAuth();
  const { tasks } = useTasks();
  const { width } = useWindowDimensions();

  const todayDate = getTodayDate();
  const compactWidth = width < 380;

  const homeInsights = useMemo(() => {
    const now = new Date();
    const todayItems = tasks.filter((task) => task.dueDate === todayDate);
    const pendingItems = tasks.filter((task) => task.status === 'pending');

    const overdueItems = pendingItems.filter(
      (task) => getTaskUrgency(task, now).level === 'overdue'
    );
    const dueTodayItems = pendingItems.filter(
      (task) => getTaskUrgency(task, now).level === 'urgent'
    );
    const startEarlyItems = pendingItems.filter(
      (task) => getTaskUrgency(task, now).level === 'medium'
    );
    const meetingSoonItems = pendingItems.filter((task) =>
      isMeetingSoon(task, now, todayDate)
    );

    const attentionItems = [...pendingItems]
      .sort((a, b) => {
        const rankA = getAttentionRank(a, now, todayDate);
        const rankB = getAttentionRank(b, now, todayDate);
        if (rankA !== rankB) return rankA - rankB;

        const urgencyA = getTaskUrgency(a, now);
        const urgencyB = getTaskUrgency(b, now);
        if (urgencyA.score !== urgencyB.score) return urgencyB.score - urgencyA.score;

        const dateA = parsePlannerDateTime(a, true)?.getTime() || Number.MAX_SAFE_INTEGER;
        const dateB = parsePlannerDateTime(b, true)?.getTime() || Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      })
      .slice(0, 4)
      .map((task) => {
        const urgency = getTaskUrgency(task, now);
        return {
          task,
          urgency,
          categoryIcon: categoryIcons[getCategoryIconKey(task)],
          miloSticker: getMiloSticker(task, urgency),
          isMeetingSoon: isMeetingSoon(task, now, todayDate),
        };
      });

    const totalToday = todayItems.length;

    return {
      tasksToday: todayItems.filter((task) => task.plannerType === 'task').length,
      meetingsToday: todayItems.filter((task) => task.plannerType === 'meeting').length,
      datesToday: todayItems.filter((task) => task.plannerType === 'date').length,
      doneToday: todayItems.filter((task) => task.status === 'completed').length,
      totalToday,
      overdue: overdueItems.length,
      dueToday: dueTodayItems.length,
      startEarly: startEarlyItems.length,
      meetingSoon: meetingSoonItems.length,
      reminderCount:
        overdueItems.length + dueTodayItems.length + meetingSoonItems.length,
      attentionItems,
    };
  }, [tasks, todayDate]);

  const displayName = userName?.trim() || 'Isaac';
  const heroMiloSize = Math.min(compactWidth ? 170 : 196, width * 0.5);
  const hero = getMiloHomeHero({
    displayName,
    tasksToday: homeInsights.tasksToday,
    meetingsToday: homeInsights.meetingsToday,
    datesToday: homeInsights.datesToday,
    doneToday: homeInsights.doneToday,
    totalToday: homeInsights.totalToday,
    overdue: homeInsights.overdue,
    dueToday: homeInsights.dueToday,
    startEarly: homeInsights.startEarly,
    meetingSoon: homeInsights.meetingSoon,
  });

  return (
    <ScreenContainer topPadding={12} bottomPadding={132}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.greeting}>
              Hi, <Text style={styles.greetingName}>{displayName}</Text>
            </Text>

            <Text
              style={[
                styles.headerTitle,
                { fontSize: compactWidth ? 33 : 36, lineHeight: compactWidth ? 36 : 39 },
              ]}
            >
              FocusMate
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.iconButton}
              onPress={() => navigation.navigate('ReminderCenter')}
              accessibilityRole="button"
              accessibilityLabel="Open reminders"
            >
              <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
              {homeInsights.reminderCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {homeInsights.reminderCount > 9 ? '9+' : homeInsights.reminderCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.iconButton}
              onPress={() => navigation.navigate('Tasks')}
              accessibilityRole="button"
              accessibilityLabel="Search planner items"
            >
              <Ionicons name="search" size={21} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.heroCard,
          { minHeight: compactWidth ? 232 : 244, backgroundColor: hero.heroTint },
        ]}
      >
        <View style={styles.heroCircleLarge} />
        <View style={styles.heroCircleSmall} />

        <View style={[styles.heroCopy, { maxWidth: compactWidth ? 176 : 194 }]}>
          <View style={styles.moodPill}>
            <Ionicons name="heart" size={13} color={theme.colors.primaryDark} />
            <Text style={styles.moodPillText}>{hero.moodLabel}</Text>
          </View>
          <Text
            numberOfLines={2}
            style={[
              styles.heroTitle,
              { fontSize: compactWidth ? 26 : 30, lineHeight: compactWidth ? 31 : 35 },
            ]}
          >
            {hero.headline}
          </Text>
          <Text
            style={[
              styles.heroSubtitle,
              { fontSize: compactWidth ? 12 : 13, lineHeight: compactWidth ? 17 : 18 },
            ]}
          >
            {hero.messageLine1}
            {'\n'}
            {hero.messageLine2}
          </Text>

          <View style={styles.heroActions}>
            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.primaryButton, compactWidth ? styles.heroButtonCompact : null]}
              onPress={() => navigation.navigate('TodayPlan')}
              accessibilityRole="button"
              accessibilityLabel="View today"
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.primaryButtonText,
                  compactWidth ? styles.heroButtonTextCompact : null,
                ]}
              >
                {hero.primaryActionLabel}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={theme.colors.white} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              style={[styles.secondaryButton, compactWidth ? styles.heroButtonCompact : null]}
              onPress={() => navigation.navigate('Companion')}
              accessibilityRole="button"
              accessibilityLabel="Ask Milo"
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.secondaryButtonText,
                  compactWidth ? styles.heroButtonTextCompact : null,
                ]}
              >
                {hero.secondaryActionLabel}
              </Text>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={14}
                color={theme.colors.primaryDark}
              />
            </TouchableOpacity>
          </View>
        </View>

        <Image
          source={hero.miloAsset}
          style={[styles.heroMilo, { width: heroMiloSize, height: heroMiloSize }]}
        />
      </View>

      <View style={styles.glanceCard}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.glanceTitle}>Today at a glance</Text>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => navigation.navigate('Calendar')}
            accessibilityRole="button"
            accessibilityLabel="View calendar"
            style={styles.calendarLinkButton}
          >
            <Text style={styles.calendarLink}>View Calendar</Text>
            <Ionicons name="chevron-forward" size={13} color={theme.colors.primaryDark} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            iconName="checkbox-outline"
            label="Tasks"
            value={homeInsights.tasksToday}
            subtitle="planned"
            tone={{
              color: theme.colors.primaryDark,
              backgroundColor: '#F3FCF6',
              iconBackground: '#E3F8EA',
            }}
          />
          <StatCard
            iconName="people-outline"
            label="Meetings"
            value={homeInsights.meetingsToday}
            subtitle="calls"
            tone={{
              color: theme.colors.purple,
              backgroundColor: '#F7F4FF',
              iconBackground: '#EDE7FF',
            }}
          />
          <StatCard
            iconName="calendar-outline"
            label="Dates"
            value={homeInsights.datesToday}
            subtitle="events"
            tone={{
              color: '#D97706',
              backgroundColor: '#FFF8EA',
              iconBackground: '#FFF0CC',
            }}
          />
          <StatCard
            iconName="checkmark-circle-outline"
            label="Done"
            value={`${homeInsights.doneToday}/${homeInsights.totalToday}`}
            subtitle="progress"
            tone={{
              color: theme.colors.blue,
              backgroundColor: '#F3F9FF',
              iconBackground: theme.colors.blueSoft,
            }}
          />
        </View>

        <View style={styles.chipRow}>
          <CountChip label="Overdue" count={homeInsights.overdue} tone="danger" />
          <CountChip label="Due Today" count={homeInsights.dueToday} tone="today" />
          <CountChip label="Start Early" count={homeInsights.startEarly} tone="early" />
        </View>
      </View>

      <View style={styles.actionCard}>
        <View style={styles.actionHeader}>
          <View style={styles.actionHeaderTitle}>
            <View style={styles.headerSparkle}>
              <Ionicons name="sparkles" size={13} color={theme.colors.primaryDark} />
            </View>
            <View style={styles.actionHeaderCopy}>
              <Text style={styles.actionSectionTitle}>What Milo wants you to do</Text>
              <Text numberOfLines={1} style={styles.actionSubtitle}>
                Milo picked these gently for you.
              </Text>
            </View>
          </View>
          {homeInsights.attentionItems.length > 0 ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => navigation.navigate('Tasks')}
              accessibilityRole="button"
              accessibilityLabel="View all planner items"
              style={styles.viewAllPill}
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={12} color={theme.colors.primaryDark} />
            </TouchableOpacity>
          ) : null}
        </View>

        {homeInsights.attentionItems.length > 0 ? (
          <View style={styles.itemList}>
            {homeInsights.attentionItems.map((item) => (
              <MiloTaskRow
                key={item.task.id}
                item={item}
                onPress={() =>
                  navigation.navigate('TaskDetails', {
                    taskId: item.task.id,
                  })
                }
              />
            ))}
          </View>
        ) : (
          <EmptyState
            imageSource={miloReactions.happy}
            title="Milo is ready to plan"
            message="Add a task, meeting, or date when you are ready."
            actionLabel="Create planner item"
            onActionPress={() => navigation.navigate('AddTask')}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 62,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  greeting: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  greetingName: {
    color: theme.colors.primaryDark,
  },
  headerTitle: {
    marginTop: 1,
    color: theme.colors.text,
    fontWeight: '900',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '900',
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#DDF6E7',
    marginBottom: 18,
    padding: 17,
    flexDirection: 'row',
    ...theme.shadowSoft,
  },
  heroCircleLarge: {
    position: 'absolute',
    right: -48,
    top: -38,
    width: 178,
    height: 178,
    borderRadius: 89,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  heroCircleSmall: {
    position: 'absolute',
    right: 98,
    bottom: 28,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  heroCopy: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    zIndex: 2,
  },
  moodPill: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  moodPillText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  heroTitle: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  heroSubtitle: {
    marginTop: 6,
    color: theme.colors.textSoft,
    fontWeight: '600',
  },
  heroActions: {
    marginTop: 14,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryDark,
    paddingLeft: 12,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 6,
  },
  secondaryButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    paddingLeft: 11,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  secondaryButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 6,
  },
  heroButtonCompact: {
    minHeight: 36,
    paddingLeft: 8,
    paddingRight: 7,
  },
  heroButtonTextCompact: {
    fontSize: 10,
    marginRight: 4,
  },
  heroMilo: {
    position: 'absolute',
    right: -24,
    bottom: -5,
    resizeMode: 'contain',
  },
  glanceCard: {
    borderRadius: 26,
    backgroundColor: theme.colors.surface,
    padding: 14,
    marginBottom: 20,
    ...theme.shadowSoft,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  glanceTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
  },
  calendarLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingVertical: 4,
  },
  calendarLink: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginRight: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    marginHorizontal: -5,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 88,
    marginHorizontal: 4,
    borderRadius: 16,
    paddingHorizontal: 7,
    paddingTop: 8,
    paddingBottom: 7,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(232,237,242,0.68)',
  },
  statIconWrap: {
    width: 30,
    height: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },
  statLabel: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  statSubtitle: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginHorizontal: -4,
  },
  countChip: {
    flex: 1,
    borderRadius: theme.radius.pill,
    minHeight: 31,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  countChipText: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: '900',
  },
  actionCard: {
    borderRadius: 26,
    backgroundColor: theme.colors.surface,
    padding: 12,
    marginBottom: 12,
    ...theme.shadowSoft,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  actionHeaderTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSparkle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  actionSectionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
  },
  actionHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionSubtitle: {
    marginTop: 1,
    color: theme.colors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  viewAllPill: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    marginRight: 2,
  },
  itemList: {
    marginBottom: -8,
  },
  itemRow: {
    minHeight: 82,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundSoft,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryTile: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIcon: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
  },
  miloSticker: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
    marginLeft: -13,
    marginRight: 3,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  itemMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  typeChip: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  typeChipText: {
    color: theme.colors.textSoft,
    fontSize: 9,
    fontWeight: '900',
  },
  itemUrgencyChip: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 4,
  },
  itemUrgencyText: {
    fontSize: 9,
    fontWeight: '900',
  },
  itemDateContext: {
    maxWidth: 74,
    marginLeft: 6,
    color: theme.colors.muted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  itemTime: {
    maxWidth: 58,
    marginLeft: 6,
    marginRight: 2,
    color: theme.colors.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
});
