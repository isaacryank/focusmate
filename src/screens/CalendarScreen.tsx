import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { miloReactions } from '../assets/generatedAssetMap';
import { getMiloCalendarHero } from '../lib/miloCalendarHero';
import { getMiloCalendarInsights } from '../lib/miloCalendarInsights';
import { getTodayDate } from '../lib/miloPersonality';
import { getTaskUrgency } from '../lib/taskUrgency';
import { useTasks } from '../lib/TaskContext';
import { theme } from '../theme';
import { Task } from '../types/task';

import ScreenContainer from '../components/ui/ScreenContainer';

type DateItem = {
  dateKey: string;
  dayName: string;
  dayNumber: string;
  isToday: boolean;
};

type IndicatorTone = 'task' | 'meeting' | 'date' | 'urgent';

const typeLabels: Record<Task['plannerType'], string> = {
  task: 'Task',
  meeting: 'Meeting',
  date: 'Date',
};

const typeTone: Record<
  Task['plannerType'],
  {
    color: string;
    backgroundColor: string;
    iconBackground: string;
    chipBackground: string;
    iconName: React.ComponentProps<typeof Ionicons>['name'];
  }
> = {
  task: {
    color: theme.colors.primaryDark,
    backgroundColor: 'rgba(231,248,237,0.72)',
    iconBackground: theme.colors.primary,
    chipBackground: '#DDF7E8',
    iconName: 'book-outline',
  },
  meeting: {
    color: theme.colors.purple,
    backgroundColor: 'rgba(240,236,255,0.76)',
    iconBackground: theme.colors.purple,
    chipBackground: '#EEE8FF',
    iconName: 'people-outline',
  },
  date: {
    color: '#D97706',
    backgroundColor: 'rgba(255,246,217,0.78)',
    iconBackground: '#F59E0B',
    chipBackground: '#FFE9BF',
    iconName: 'calendar-outline',
  },
};

const indicatorColors: Record<IndicatorTone, string> = {
  task: theme.colors.primaryDark,
  meeting: theme.colors.purple,
  date: '#D97706',
  urgent: theme.colors.danger,
};

const DATE_ITEM_GAP = 6;

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey?: string) {
  if (!dateKey) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function createDateStrip(selectedDate: string) {
  const selected = parseDateKey(selectedDate) || new Date();
  const todayDate = getTodayDate();
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }).map((_, index) => {
    const date = new Date(year, month, index + 1);
    const dateKey = formatDateKey(date);

    return {
      dateKey,
      dayName: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      dayNumber: `${date.getDate()}`,
      isToday: dateKey === todayDate,
    };
  });
}

function createMonthGrid(selectedDate: string) {
  const selected = parseDateKey(selectedDate) || new Date();
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const todayDate = getTodayDate();
  const days: Array<DateItem | null> = Array.from({ length: firstDay }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = formatDateKey(date);

    days.push({
      dateKey,
      dayName: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      dayNumber: `${day}`,
      isToday: dateKey === todayDate,
    });
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return {
    title: selected.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    }),
    days,
  };
}

function parseTimeMinutes(time?: string) {
  if (!time) return Number.MAX_SAFE_INTEGER;

  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER - 1;

  const [, rawHour, rawMinute, meridiem] = match;
  let hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (meridiem) {
    const upperMeridiem = meridiem.toUpperCase();
    if (upperMeridiem === 'PM' && hour < 12) hour += 12;
    if (upperMeridiem === 'AM' && hour === 12) hour = 0;
  }

  return hour * 60 + minute;
}

function sortItems(items: Task[]) {
  return [...items].sort((a, b) => {
    const timeDifference = parseTimeMinutes(a.dueTime) - parseTimeMinutes(b.dueTime);
    if (timeDifference !== 0) return timeDifference;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function getDateIndicators(items: Task[]): IndicatorTone[] {
  const indicators: IndicatorTone[] = [];

  if (items.some((item) => item.plannerType === 'task')) indicators.push('task');
  if (items.some((item) => item.plannerType === 'meeting')) indicators.push('meeting');
  if (items.some((item) => item.plannerType === 'date')) indicators.push('date');
  if (
    items.some((item) =>
      ['overdue', 'urgent', 'high'].includes(getTaskUrgency(item).level)
    )
  ) {
    indicators.push('urgent');
  }

  return indicators.slice(0, 4);
}

function getSummary(selectedItems: Task[]) {
  const now = new Date();
  const selectedPendingItems = selectedItems.filter((item) => item.status !== 'completed');

  return {
    overdue: selectedPendingItems.filter(
      (item) => getTaskUrgency(item, now).level === 'overdue'
    ).length,
    dueToday: selectedPendingItems.filter(
      (item) => getTaskUrgency(item, now).level === 'urgent'
    ).length,
    startEarly: selectedPendingItems.filter((item) =>
      ['high', 'medium'].includes(getTaskUrgency(item, now).level)
    ).length,
  };
}

function getReminderBadgeCount(tasks: Task[]) {
  const now = new Date();
  const pendingItems = tasks.filter((item) => item.status !== 'completed');

  return pendingItems.filter((item) =>
    ['overdue', 'urgent'].includes(getTaskUrgency(item, now).level)
  ).length;
}

function normalizeMeetingUrl(rawUrl: string) {
  const trimmedUrl = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;

  return `https://${trimmedUrl}`;
}

function extractFirstUrl(text?: string) {
  if (!text) return null;

  const match = text.match(
    /https?:\/\/[^\s)]+|www\.[^\s)]+|(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com)\/[^\s)]+/i
  );

  return match ? normalizeMeetingUrl(match[0]) : null;
}

function getMeetingLink(item: Task) {
  const extendedItem = item as Task & Record<string, unknown>;
  const possibleValues = [
    extendedItem.meetingLink,
    extendedItem.link,
    extendedItem.url,
    extendedItem.notes,
    item.location,
    item.description,
  ];

  for (const value of possibleValues) {
    if (typeof value !== 'string') continue;

    const url = extractFirstUrl(value);
    if (url) return url;
  }

  return null;
}

function HeaderButton({
  iconName,
  badgeCount,
  onPress,
  accessibilityLabel,
}: {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  badgeCount?: number;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.iconButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={iconName} size={22} color={theme.colors.text} />
      {badgeCount && badgeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function DateStripItem({
  item,
  selected,
  indicators,
  width,
  onPress,
}: {
  item: DateItem;
  selected: boolean;
  indicators: IndicatorTone[];
  width: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.dateItem,
        { width },
        selected && styles.dateItemSelected,
        item.isToday && !selected && styles.dateItemToday,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.dayName} ${item.dayNumber}`}
    >
      <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>
        {item.dayName}
      </Text>
      <Text style={[styles.dateNumber, selected && styles.dateTextSelected]}>
        {item.dayNumber}
      </Text>
      <View style={styles.indicatorRow}>
        {indicators.length > 0 ? (
          indicators.map((indicator) => (
            <View
              key={indicator}
              style={[
                styles.indicatorDot,
                {
                  backgroundColor: selected ? theme.colors.white : indicatorColors[indicator],
                },
              ]}
            />
          ))
        ) : (
          <View style={styles.indicatorDotPlaceholder} />
        )}
      </View>
    </TouchableOpacity>
  );
}

function TimelineItem({
  item,
  isFirst,
  isLast,
  onPress,
  onToggle,
  onJoinMeeting,
}: {
  item: Task;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
  onToggle: () => void;
  onJoinMeeting: (url: string) => void;
}) {
  const tone = typeTone[item.plannerType];
  const urgency = getTaskUrgency(item);
  const isDone = item.status === 'completed';
  const meetingLink = item.plannerType === 'meeting' ? getMeetingLink(item) : null;
  const iconBackground = isDone ? theme.colors.blue : tone.iconBackground;
  const iconColor = theme.colors.white;
  const actionAccessibilityLabel = isDone
    ? `Mark ${item.title} pending`
    : `Mark ${item.title} done`;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={styles.timelineRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
    >
      <View style={styles.timelineRail}>
        <View
          style={[
            styles.timelineIcon,
            { backgroundColor: iconBackground },
          ]}
        >
          <Ionicons
            name={isDone ? 'checkmark-circle' : tone.iconName}
            size={20}
            color={iconColor}
          />
        </View>
      </View>

      <View style={styles.routeColumn}>
        <View style={[styles.routeLineTop, isFirst && styles.routeLineHidden]} />
        <View style={[styles.routeDot, { backgroundColor: tone.iconBackground }]} />
        <View style={[styles.routeLineBottom, isLast && styles.routeLineHidden]} />
      </View>

      <View style={[styles.timelineMainCard, { backgroundColor: tone.backgroundColor }]}>
        <View style={styles.timelineTimeColumn}>
          <Text style={[styles.timelineTime, { color: tone.color }]}>
            {item.dueTime || 'Anytime'}
          </Text>
        </View>

        <View style={styles.timelineContent}>
          <Text numberOfLines={1} style={[styles.timelineTitle, isDone && styles.doneTitle]}>
            {item.title}
          </Text>
          <View style={styles.timelineMetaRow}>
            <View style={[styles.typeChip, { backgroundColor: tone.chipBackground }]}>
              <Text style={[styles.typeChipText, { color: tone.color }]}>
                {typeLabels[item.plannerType]}
              </Text>
            </View>
            {isDone ? (
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>Done</Text>
              </View>
            ) : null}
            {urgency.level !== 'none' ? (
              <View style={styles.urgencyChip}>
                <Text numberOfLines={1} style={styles.urgencyText}>
                  {urgency.label}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.timelineActionColumn}>
          {item.plannerType === 'meeting' && meetingLink ? (
            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.joinButton}
              onPress={() => onJoinMeeting(meetingLink)}
              accessibilityRole="button"
              accessibilityLabel={`Join ${item.title}`}
            >
              <Text style={styles.joinButtonText}>Join</Text>
            </TouchableOpacity>
          ) : item.plannerType === 'meeting' ? (
            <View style={styles.viewAction}>
              <Text style={[styles.viewActionText, { color: tone.color }]}>View</Text>
              <Ionicons name="chevron-forward" size={13} color={tone.color} />
            </View>
          ) : item.plannerType === 'task' ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.actionCircle}
              onPress={onToggle}
              accessibilityRole="button"
              accessibilityLabel={actionAccessibilityLabel}
            >
              <Ionicons
                name={isDone ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={20}
                color={isDone ? theme.colors.blue : theme.colors.primaryDark}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.viewAction}>
              <Text style={[styles.viewActionText, { color: tone.color }]}>View</Text>
              <Ionicons name="chevron-forward" size={13} color={tone.color} />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SummaryTile({
  label,
  count,
  iconName,
  tone,
}: {
  label: string;
  count: number;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  tone: { color: string; backgroundColor: string; iconBackground: string };
}) {
  return (
    <View style={[styles.summaryTile, { backgroundColor: tone.backgroundColor }]}>
      <View style={styles.summaryContent}>
        <View style={styles.summaryLead}>
          <View style={[styles.summaryIcon, { backgroundColor: tone.iconBackground }]}>
            <Ionicons name={iconName} size={15} color={tone.color} />
          </View>
          <Text style={[styles.summaryCount, { color: tone.color }]}>{count}</Text>
        </View>
        <Text numberOfLines={1} style={styles.summaryLabel}>
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={12} color={tone.color} />
    </View>
  );
}

function MonthCalendarModal({
  visible,
  selectedDate,
  onClose,
  onSelectDate,
}: {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
  onSelectDate: (dateKey: string) => void;
}) {
  const monthGrid = useMemo(() => createMonthGrid(selectedDate), [selectedDate]);
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.monthModalCard}>
          <View style={styles.monthModalHeader}>
            <Text style={styles.monthModalTitle}>{monthGrid.title}</Text>
            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.monthCloseButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close month calendar"
            >
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthWeekRow}>
            {weekDays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.monthWeekText}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.monthGrid}>
            {monthGrid.days.map((day, index) => {
              if (!day) {
                return <View key={`empty-${index}`} style={styles.monthDayCell} />;
              }

              const isSelected = day.dateKey === selectedDate;

              return (
                <TouchableOpacity
                  key={day.dateKey}
                  activeOpacity={0.84}
                  style={[
                    styles.monthDayCell,
                    isSelected && styles.monthDaySelected,
                    day.isToday && !isSelected && styles.monthDayToday,
                  ]}
                  onPress={() => onSelectDate(day.dateKey)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${day.dayName} ${day.dayNumber}`}
                >
                  <Text style={[styles.monthDayText, isSelected && styles.monthDayTextSelected]}>
                    {day.dayNumber}
                  </Text>
                  {day.isToday && !isSelected ? <View style={styles.monthTodayDot} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const { tasks, toggleTask } = useTasks();
  const { width } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [monthModalVisible, setMonthModalVisible] = useState(false);
  const dateStripRef = useRef<ScrollView | null>(null);
  const hasCenteredDateRef = useRef(false);

  const compactWidth = width < 380;
  const dateCardWidth = compactWidth ? 42 : 44;
  const dateStrip = useMemo(() => createDateStrip(selectedDate), [selectedDate]);
  const dateStripViewportWidth = Math.max(width - 116, dateCardWidth);

  const itemsByDate = useMemo(() => {
    return tasks.reduce<Record<string, Task[]>>((acc, task) => {
      if (!task.dueDate) return acc;
      acc[task.dueDate] = [...(acc[task.dueDate] || []), task];
      return acc;
    }, {});
  }, [tasks]);

  const selectedItems = useMemo(() => {
    return sortItems(tasks.filter((task) => task.dueDate === selectedDate));
  }, [tasks, selectedDate]);

  const selectedPendingItems = selectedItems.filter((item) => item.status !== 'completed');
  const hero = getMiloCalendarHero(selectedItems);
  const summary = getSummary(selectedItems);
  const insightCards = useMemo(
    () =>
      getMiloCalendarInsights({
        allItems: tasks,
        selectedDate,
        selectedItems,
      }),
    [tasks, selectedDate, selectedItems]
  );
  const notificationCount = getReminderBadgeCount(tasks);
  const heroMiloSize = Math.min(compactWidth ? 160 : 188, width * 0.48);

  const handleJoinMeeting = (url: string) => {
    Linking.openURL(url);
  };

  useEffect(() => {
    const selectedIndex = dateStrip.findIndex((item) => item.dateKey === selectedDate);
    if (selectedIndex < 0) return;

    const itemStride = dateCardWidth + DATE_ITEM_GAP;
    const contentWidth = dateStrip.length * itemStride + 8;
    const selectedCenter = selectedIndex * itemStride + dateCardWidth / 2;
    const maxOffset = Math.max(contentWidth - dateStripViewportWidth, 0);
    const nextOffset = Math.min(
      Math.max(selectedCenter - dateStripViewportWidth / 2, 0),
      maxOffset
    );
    const timeoutId = setTimeout(() => {
      dateStripRef.current?.scrollTo({
        x: nextOffset,
        animated: hasCenteredDateRef.current,
      });
      hasCenteredDateRef.current = true;
    }, 80);

    return () => clearTimeout(timeoutId);
  }, [dateCardWidth, dateStrip, dateStripViewportWidth, selectedDate]);

  return (
    <ScreenContainer topPadding={0} bottomPadding={176}>
      <MonthCalendarModal
        visible={monthModalVisible}
        selectedDate={selectedDate}
        onClose={() => setMonthModalVisible(false)}
        onSelectDate={(dateKey) => {
          setSelectedDate(dateKey);
          setMonthModalVisible(false);
        }}
      />

      <View style={styles.header}>
        <Text style={[styles.headerTitle, { fontSize: compactWidth ? 31 : 35 }]}>
          Calendar
        </Text>

        <View style={styles.headerActions}>
          <HeaderButton
            iconName="notifications-outline"
            badgeCount={notificationCount}
            onPress={() => navigation.navigate('ReminderCenter')}
            accessibilityLabel="Open reminders"
          />
          <HeaderButton
            iconName="search"
            onPress={() => navigation.navigate('Tasks')}
            accessibilityLabel="Search planner items"
          />
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />
        <View style={[styles.heroCopy, { maxWidth: compactWidth ? 170 : 194 }]}>
          <View style={styles.moodPill}>
            <Ionicons name="sparkles" size={13} color={theme.colors.primaryDark} />
            <Text style={styles.moodPillText}>{hero.moodLabel}</Text>
          </View>
          <Text
            style={[
              styles.heroTitle,
              { fontSize: compactWidth ? 25 : 29, lineHeight: compactWidth ? 30 : 34 },
            ]}
          >
            {hero.headline}
          </Text>
          <Text style={styles.heroSubtitle}>
            {hero.line1}
            {'\n'}
            {hero.line2}
          </Text>
        </View>
        <Image
          source={hero.miloAsset}
          style={[styles.heroMilo, { width: heroMiloSize, height: heroMiloSize }]}
        />
      </View>

      <View style={styles.weekCard}>
        <ScrollView
          ref={dateStripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateStripContent}
          style={styles.dateStripScroller}
        >
          {dateStrip.map((item) => (
            <DateStripItem
              key={item.dateKey}
              item={item}
              selected={selectedDate === item.dateKey}
              indicators={getDateIndicators(itemsByDate[item.dateKey] || [])}
              width={dateCardWidth}
              onPress={() => setSelectedDate(item.dateKey)}
            />
          ))}
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.monthButton}
          onPress={() => setMonthModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Open month calendar"
        >
          <Ionicons name="calendar-clear" size={20} color={theme.colors.primaryDark} />
        </TouchableOpacity>
      </View>

      <View style={styles.timelineCard}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineCardTitle}>Today timeline</Text>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.viewDayButton}
            onPress={() => setSelectedDate(getTodayDate())}
            accessibilityRole="button"
            accessibilityLabel="View today"
          >
            <Ionicons name="calendar-clear-outline" size={14} color={theme.colors.primaryDark} />
            <Text style={styles.viewDayText}>View Day</Text>
          </TouchableOpacity>
        </View>

        {selectedItems.length > 0 ? (
          <View style={styles.timelineList}>
            {selectedItems.map((item, index) => (
              <TimelineItem
                key={item.id}
                item={item}
                isFirst={index === 0}
                isLast={index === selectedItems.length - 1}
                onToggle={() => toggleTask(item.id)}
                onJoinMeeting={handleJoinMeeting}
                onPress={() =>
                  navigation.navigate('TaskDetails', {
                    taskId: item.id,
                  })
                }
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyTimeline}>
            <Image source={miloReactions.happy as ImageSourcePropType} style={styles.emptyMilo} />
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>No items for this date</Text>
              <Text style={styles.emptyMessage}>
                Milo sees a calm day.
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.emptyButton}
              onPress={() => navigation.navigate('AddTask')}
              accessibilityRole="button"
              accessibilityLabel="Create planner item"
            >
              <Text style={styles.emptyButtonText}>Add Item</Text>
              <Ionicons name="add" size={16} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.summaryRow}>
        <SummaryTile
          label="Overdue"
          count={summary.overdue}
          iconName="alert-circle"
          tone={{
            color: theme.colors.danger,
            backgroundColor: theme.colors.dangerSoft,
            iconBackground: '#FFE0E0',
          }}
        />
        <SummaryTile
          label="Due Today"
          count={summary.dueToday}
          iconName="time"
          tone={{
            color: '#D97706',
            backgroundColor: '#FFF4DF',
            iconBackground: '#FFE8B8',
          }}
        />
        <SummaryTile
          label="Start Early"
          count={summary.startEarly}
          iconName="paper-plane"
          tone={{
            color: theme.colors.primaryDark,
            backgroundColor: theme.colors.primarySoft,
            iconBackground: '#D7F4E0',
          }}
        />
      </View>

      {insightCards.map((insight) => (
        <View key={insight.id} style={styles.noteCard}>
          <Image source={insight.miloAsset} style={styles.noteMilo} />
          <View style={styles.noteCopy}>
            <Text style={styles.noteTitle}>{insight.title}</Text>
            <Text style={styles.noteMessage}>{insight.message}</Text>
            {insight.meta || selectedPendingItems.length > 0 ? (
              <Text style={styles.noteMeta}>
                {insight.meta || `${selectedPendingItems.length} pending on this date`}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 46,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '900',
    lineHeight: 40,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 14,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
    top: 1,
    right: 1,
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
    minHeight: 214,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#DDF6E7',
    marginBottom: 14,
    padding: 17,
    flexDirection: 'row',
    ...theme.shadowSoft,
  },
  heroGlowLarge: {
    position: 'absolute',
    right: -50,
    top: -42,
    width: 178,
    height: 178,
    borderRadius: 89,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  heroGlowSmall: {
    position: 'absolute',
    right: 96,
    bottom: 26,
    width: 70,
    height: 70,
    borderRadius: 35,
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
    marginTop: 8,
    color: theme.colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  heroMilo: {
    position: 'absolute',
    right: -20,
    bottom: -4,
    resizeMode: 'contain',
  },
  weekCard: {
    width: '100%',
    minHeight: 92,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    paddingLeft: 10,
    paddingRight: 9,
    paddingVertical: 10,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  dateStripScroller: {
    flex: 1,
  },
  dateStripContent: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  dateItem: {
    height: 60,
    borderRadius: 14,
    backgroundColor: '#FCFEFC',
    paddingVertical: 6,
    marginRight: DATE_ITEM_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateItemSelected: {
    height: 64,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.18,
    shadowRadius: 13,
    elevation: 4,
  },
  dateItemToday: {
    backgroundColor: theme.colors.primarySoft,
  },
  dateDay: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
  },
  dateNumber: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },
  dateTextSelected: {
    color: theme.colors.white,
  },
  indicatorRow: {
    minHeight: 8,
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginHorizontal: 1,
  },
  indicatorDotPlaceholder: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  monthButton: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(85,200,120,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  timelineCard: {
    borderRadius: 26,
    backgroundColor: theme.colors.surface,
    padding: 12,
    marginBottom: 12,
    ...theme.shadowSoft,
  },
  timelineHeader: {
    minHeight: 32,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timelineCardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  viewDayButton: {
    minHeight: 30,
    borderRadius: theme.radius.pill,
    backgroundColor: '#F2FAF5',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(85,200,120,0.18)',
  },
  viewDayText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  timelineList: {
    marginBottom: -3,
  },
  timelineRow: {
    minHeight: 62,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineRail: {
    width: 40,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineIcon: {
    width: 37,
    height: 37,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  routeColumn: {
    width: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLineTop: {
    width: 2,
    flex: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(138,148,166,0.22)',
  },
  routeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginVertical: 1,
  },
  routeLineBottom: {
    width: 2,
    flex: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(138,148,166,0.22)',
  },
  routeLineHidden: {
    backgroundColor: 'transparent',
  },
  timelineMainCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderRadius: 16,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineTimeColumn: {
    width: 54,
    paddingRight: 6,
    justifyContent: 'center',
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  timelineTime: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },
  timelineTitle: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  doneTitle: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  timelineMetaRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  typeChip: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typeChipText: {
    fontSize: 7,
    fontWeight: '900',
  },
  statusChip: {
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(77,157,224,0.14)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 3,
  },
  statusChipText: {
    color: theme.colors.blue,
    fontSize: 7,
    fontWeight: '900',
  },
  urgencyChip: {
    maxWidth: 78,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.66)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 3,
  },
  urgencyText: {
    color: theme.colors.muted,
    fontSize: 7,
    fontWeight: '900',
  },
  timelineActionColumn: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
  joinButton: {
    minWidth: 40,
    minHeight: 26,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  joinButtonText: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  actionCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAction: {
    minWidth: 40,
    minHeight: 26,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewActionText: {
    fontSize: 9,
    fontWeight: '900',
  },
  emptyTimeline: {
    minHeight: 82,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSoft,
    alignItems: 'center',
    padding: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
  },
  emptyMilo: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
    marginRight: 9,
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyMessage: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  emptyButton: {
    minHeight: 30,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyButtonText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: '900',
    marginRight: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: -3,
    marginBottom: 12,
  },
  summaryTile: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  summaryLead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  summaryIcon: {
    width: 24,
    height: 24,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCount: {
    marginLeft: 5,
    fontSize: 19,
    lineHeight: 21,
    fontWeight: '900',
  },
  summaryLabel: {
    color: theme.colors.text,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  noteCard: {
    minHeight: 88,
    borderRadius: 22,
    backgroundColor: '#E5F8EC',
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    ...theme.shadowSoft,
  },
  noteMilo: {
    width: 68,
    height: 68,
    resizeMode: 'contain',
    marginRight: 8,
  },
  noteCopy: {
    flex: 1,
    minWidth: 0,
  },
  noteTitle: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  noteMessage: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  noteMeta: {
    marginTop: 5,
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(34,40,49,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  monthModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    padding: 16,
    ...theme.shadowSoft,
  },
  monthModalHeader: {
    minHeight: 34,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthModalTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
  },
  monthCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  monthWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  monthWeekText: {
    flex: 1,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDaySelected: {
    backgroundColor: theme.colors.primary,
  },
  monthDayToday: {
    backgroundColor: theme.colors.primarySoft,
  },
  monthDayText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  monthDayTextSelected: {
    color: theme.colors.white,
  },
  monthTodayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primaryDark,
    marginTop: 2,
  },
});
