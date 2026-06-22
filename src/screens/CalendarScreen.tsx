import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  Linking,
  Modal,
  Pressable,
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
import { findMiloConflict } from '../lib/miloConflicts';
import {
  isActiveWarningCandidate,
  isAllDayOrPlaceholder,
  parseTimeMinutes,
} from '../lib/miloSituationIntelligence';
import { getTodayDate } from '../lib/miloPersonality';
import { getTaskUrgency } from '../lib/taskUrgency';
import { useTasks } from '../lib/TaskContext';
import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { Task } from '../types/task';
import {
  headerActionButton,
  headerBadge,
  mainHeader,
} from '../constants/header';

import ScreenContainer from '../components/ui/ScreenContainer';

type DateItem = {
  dateKey: string;
  dayName: string;
  dayNumber: string;
  isToday: boolean;
};

type MonthDateItem = DateItem & {
  isCurrentMonth: boolean;
};

type IndicatorTone = 'task' | 'meeting' | 'date' | 'urgent';
type MonthEventDotTone = 'normal' | 'urgent' | 'focus';
type CalendarConflictType =
  | 'same_time'
  | 'overlap'
  | 'ongoing_overlap'
  | 'soft_conflict'
  | 'accepted_overlap'
  | 'all_day_protected';
type CalendarConflictInfo = NonNullable<Task['conflictInfo']> & {
  calendarConflictType?: CalendarConflictType;
  calendarConflictSeverity?: 'calm' | 'soft' | 'strong';
  calendarConflictLabel?: string;
  calendarIsActiveWarning?: boolean;
};
type ConflictChipTone = 'warning' | 'active' | 'calm';
type ConflictChipInfo = {
  label: string;
  tone: ConflictChipTone;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
};

const typeLabels: Record<Task['plannerType'], string> = {
  task: 'Task',
  meeting: 'Meeting',
  date: 'Date',
};

function getTypeTone(plannerType: Task['plannerType']) {
  if (plannerType === 'meeting') {
    return {
      color: theme.colors.purple,
      backgroundColor: theme.colors.card,
      iconBackground: theme.colors.purple,
      chipBackground: theme.colors.purpleSoft,
      iconName: 'people-outline' as const,
    };
  }

  if (plannerType === 'date') {
    return {
      color: theme.colors.warning,
      backgroundColor: theme.colors.card,
      iconBackground: theme.colors.warning,
      chipBackground: theme.colors.warningSoft,
      iconName: 'calendar-outline' as const,
    };
  }

  return {
    color: theme.colors.primary,
    backgroundColor: theme.colors.card,
    iconBackground: theme.colors.primary,
    chipBackground: theme.colors.primarySoft,
    iconName: 'book-outline' as const,
  };
}

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
  const days: MonthDateItem[] = [];

  const createMonthItem = (date: Date, isCurrentMonth: boolean): MonthDateItem => {
    const dateKey = formatDateKey(date);

    return {
      dateKey,
      dayName: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
      dayNumber: `${date.getDate()}`,
      isToday: dateKey === todayDate,
      isCurrentMonth,
    };
  };

  for (let offset = firstDay; offset > 0; offset -= 1) {
    days.push(createMonthItem(new Date(year, month, 1 - offset), false));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(createMonthItem(new Date(year, month, day), true));
  }

  while (days.length % 7 !== 0) {
    const nextMonthDay = days.length - firstDay - daysInMonth + 1;
    days.push(createMonthItem(new Date(year, month + 1, nextMonthDay), false));
  }

  return {
    title: selected.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    }),
    days,
  };
}

function shiftDateByMonths(dateKey: string, monthOffset: number) {
  const selected = parseDateKey(dateKey) || new Date();
  const targetYear = selected.getFullYear();
  const targetMonth = selected.getMonth() + monthOffset;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(selected.getDate(), daysInTargetMonth);

  return formatDateKey(new Date(targetYear, targetMonth, targetDay));
}

function getSelectedDateParts(dateKey: string) {
  const date = parseDateKey(dateKey) || new Date();

  return {
    dayLabel: date.toLocaleDateString(undefined, { weekday: 'short' }),
    dayNumber: `${date.getDate()}`,
    monthYear: date.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    }),
  };
}

function hasClockTime(item: Task) {
  return parseTimeMinutes(item.dueTime) < Number.MAX_SAFE_INTEGER - 1;
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
  const warningItems = items.filter(isActiveWarningCandidate);

  if (items.some((item) => item.plannerType === 'task')) indicators.push('task');
  if (items.some((item) => item.plannerType === 'meeting')) indicators.push('meeting');
  if (items.some((item) => item.plannerType === 'date')) indicators.push('date');
  if (
    warningItems.some((item) =>
      ['overdue', 'urgent', 'high'].includes(getTaskUrgency(item).level)
    )
  ) {
    indicators.push('urgent');
  }

  return indicators.slice(0, 4);
}

function isFocusStudyItem(item: Task) {
  const searchableText = `${item.title} ${item.description || ''}`.toLowerCase();
  const focusKeywords = [
    'focus',
    'study',
    'studying',
    'revision',
    'revise',
    'exam',
    'assignment',
    'homework',
    'quiz',
    'lecture',
    'class',
  ];

  return focusKeywords.some((keyword) => searchableText.includes(keyword));
}

function isUrgentCalendarItem(item: Task) {
  if (item.status === 'completed') return false;

  return (
    item.priority === 'high' ||
    ['overdue', 'urgent', 'high'].includes(getTaskUrgency(item).level)
  );
}

function getMonthEventDotTone(item: Task): MonthEventDotTone {
  if (isUrgentCalendarItem(item)) return 'urgent';
  if (isFocusStudyItem(item)) return 'focus';

  return 'normal';
}

function getMonthEventDotColor(dotTone: MonthEventDotTone) {
  if (dotTone === 'urgent') return theme.colors.warning;
  if (dotTone === 'focus') return theme.colors.purple;

  return theme.colors.primaryDark;
}

function getMonthEventDots(items: Task[]): MonthEventDotTone[] {
  const tones: MonthEventDotTone[] = [];

  if (items.some((item) => getMonthEventDotTone(item) === 'urgent')) {
    tones.push('urgent');
  }
  if (items.some((item) => getMonthEventDotTone(item) === 'focus')) {
    tones.push('focus');
  }
  if (items.some((item) => getMonthEventDotTone(item) === 'normal')) {
    tones.push('normal');
  }

  return tones.slice(0, 3);
}

function formatPreviewTime(item: Task) {
  return hasClockTime(item) && item.dueTime ? item.dueTime : 'All day';
}

function getSummary(selectedItems: Task[]) {
  const now = new Date();
  const selectedWarningItems = selectedItems.filter(isActiveWarningCandidate);

  return {
    overdue: selectedWarningItems.filter(
      (item) => getTaskUrgency(item, now).level === 'overdue'
    ).length,
    dueToday: selectedWarningItems.filter(
      (item) => getTaskUrgency(item, now).level === 'urgent'
    ).length,
    startEarly: selectedWarningItems.filter((item) =>
      ['high', 'medium'].includes(getTaskUrgency(item, now).level)
    ).length,
  };
}

function getReminderBadgeCount(tasks: Task[]) {
  const now = new Date();
  const warningItems = tasks.filter(isActiveWarningCandidate);

  return warningItems.filter((item) =>
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

function getConflictInfo(item: Task, allItems: Task[]) {
  const storedConflictInfo = item.conflictInfo as CalendarConflictInfo | undefined;

  if (
    storedConflictInfo?.calendarConflictType ||
    storedConflictInfo?.type ||
    storedConflictInfo?.level ||
    item.conflictAccepted
  ) {
    return storedConflictInfo;
  }

  if (item.status === 'completed' || !hasClockTime(item)) return undefined;

  return findMiloConflict(
    {
      title: item.title,
      plannerType: item.plannerType,
      dueDate: item.dueDate,
      dueTime: item.dueTime,
      location: item.location,
      estimatedDurationMinutes: item.estimatedDurationMinutes,
      conflictInfo: item.conflictInfo,
      conflictAccepted: item.conflictAccepted,
    },
    allItems,
    item.id
  ) as CalendarConflictInfo | undefined;
}

function getCalendarConflictType(
  item: Task,
  allItems: Task[]
): CalendarConflictType | undefined {
  if (item.status === 'completed') return undefined;

  const conflictInfo = getConflictInfo(item, allItems);

  if (
    item.conflictAccepted ||
    conflictInfo?.type === 'accepted_overlap' ||
    conflictInfo?.messageTone === 'accepted'
  ) {
    return 'accepted_overlap';
  }

  if (
    isAllDayOrPlaceholder(item) ||
    conflictInfo?.calendarConflictType === 'all_day_protected' ||
    conflictInfo?.type === 'whole_day'
  ) {
    return 'all_day_protected';
  }

  if (!hasClockTime(item)) return undefined;

  if (conflictInfo?.calendarConflictType) {
    return conflictInfo.calendarConflictType;
  }

  switch (conflictInfo?.type) {
    case 'same_time':
      return 'same_time';
    case 'ongoing_overlap':
      return 'ongoing_overlap';
    case 'hard_overlap':
      return 'overlap';
    case 'soft_overlap':
      return 'soft_conflict';
    default:
      break;
  }

  if (conflictInfo?.level === 'same_time') return 'same_time';
  if (conflictInfo?.level === 'hard') return 'overlap';
  if (conflictInfo?.level === 'soft') return 'soft_conflict';

  return undefined;
}

function getConflictChipInfo(item: Task, allItems: Task[]): ConflictChipInfo | undefined {
  switch (getCalendarConflictType(item, allItems)) {
    case 'same_time':
      return {
        label: 'Same time',
        tone: 'warning',
        iconName: 'time-outline',
      };
    case 'overlap':
      return {
        label: 'Overlap',
        tone: 'warning',
        iconName: 'layers-outline',
      };
    case 'ongoing_overlap':
      return {
        label: 'Ongoing',
        tone: 'active',
        iconName: 'radio-button-on',
      };
    case 'soft_conflict':
      return {
        label: 'Soft conflict',
        tone: 'warning',
        iconName: 'alert-circle-outline',
      };
    case 'accepted_overlap':
      return {
        label: 'Keep Both',
        tone: 'calm',
        iconName: 'checkmark-circle-outline',
      };
    case 'all_day_protected':
      return {
        label: 'All-day',
        tone: 'calm',
        iconName: 'calendar-outline',
      };
    default:
      return undefined;
  }
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
      <Ionicons
        name={iconName}
        size={headerActionButton.iconSize}
        color={theme.colors.text}
      />
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
  conflictChip,
}: {
  item: Task;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
  onToggle: () => void;
  onJoinMeeting: (url: string) => void;
  conflictChip?: ConflictChipInfo;
}) {
  const tone = getTypeTone(item.plannerType);
  const urgency = getTaskUrgency(item);
  const isDone = item.status === 'completed';
  const showUrgencyChip =
    urgency.level !== 'none' &&
    !isDone &&
    hasClockTime(item) &&
    !isAllDayOrPlaceholder(item);
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

      <View
        style={[
          styles.timelineMainCard,
          {
            backgroundColor: tone.backgroundColor,
            borderColor: tone.chipBackground,
          },
        ]}
      >
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
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.88}
                style={[styles.typeChipText, { color: tone.color }]}
              >
                {typeLabels[item.plannerType]}
              </Text>
            </View>
            {isDone ? (
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>Done</Text>
              </View>
            ) : null}
            {showUrgencyChip ? (
              <View style={styles.urgencyChip}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.86}
                  style={styles.urgencyText}
                >
                  {urgency.label}
                </Text>
              </View>
            ) : null}
            {conflictChip ? (
              <View
                style={[
                  styles.conflictChip,
                  conflictChip.tone === 'active'
                    ? styles.conflictChipActive
                    : conflictChip.tone === 'calm'
                    ? styles.conflictChipCalm
                    : styles.conflictChipWarning,
                ]}
              >
                <Ionicons
                  name={conflictChip.iconName}
                  size={8}
                  color={
                    conflictChip.tone === 'active'
                      ? theme.colors.danger
                      : conflictChip.tone === 'calm'
                      ? theme.colors.primaryDark
                      : '#B45309'
                  }
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.86}
                  style={[
                    styles.conflictChipText,
                    conflictChip.tone === 'active'
                      ? styles.conflictChipTextActive
                      : conflictChip.tone === 'calm'
                      ? styles.conflictChipTextCalm
                      : styles.conflictChipTextWarning,
                  ]}
                >
                  {conflictChip.label}
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
  itemsByDate,
  selectedItems,
  onClose,
  onSelectDate,
}: {
  visible: boolean;
  selectedDate: string;
  itemsByDate: Record<string, Task[]>;
  selectedItems: Task[];
  onClose: () => void;
  onSelectDate: (dateKey: string) => void;
}) {
  const monthGrid = useMemo(() => createMonthGrid(selectedDate), [selectedDate]);
  const selectedDateParts = useMemo(
    () => getSelectedDateParts(selectedDate),
    [selectedDate]
  );
  const previewItems = selectedItems.slice(0, 2);
  const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const selectedEventLabel =
    selectedItems.length === 1 ? '1 event' : `${selectedItems.length} events`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={styles.monthModalCard}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.monthModalTint} />

          <View style={styles.monthModalHeader}>
            <Pressable
              style={styles.monthArrowButton}
              onPress={() => onSelectDate(shiftDateByMonths(selectedDate, -1))}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Text style={styles.monthArrowText}>{'<'}</Text>
            </Pressable>

            <Text style={styles.monthModalTitle}>{monthGrid.title}</Text>

            <Pressable
              style={styles.monthArrowButton}
              onPress={() => onSelectDate(shiftDateByMonths(selectedDate, 1))}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Text style={styles.monthArrowText}>{'>'}</Text>
            </Pressable>
          </View>

          <View style={styles.monthWeekRow}>
            {weekDays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.monthWeekText}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.monthGrid}>
            {monthGrid.days.map((day) => {
              const isSelected = day.dateKey === selectedDate;
              const dots = getMonthEventDots(itemsByDate[day.dateKey] || []);
              const showSelectedEventDot = isSelected && dots.length > 0;

              return (
                <Pressable
                  key={day.dateKey}
                  style={styles.monthDayCell}
                  onPress={() => onSelectDate(day.dateKey)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${day.dayName} ${day.dayNumber}`}
                >
                  <View
                    style={[
                      styles.monthDayBubble,
                      isSelected && styles.monthDaySelected,
                      day.isToday && !isSelected && styles.monthDayToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthDayText,
                        !day.isCurrentMonth && styles.monthDayTextOutside,
                        isSelected && styles.monthDayTextSelected,
                      ]}
                    >
                      {day.dayNumber}
                    </Text>
                    {showSelectedEventDot ? (
                      <View style={styles.monthSelectedEventDot} />
                    ) : dots.length > 0 ? (
                      <View style={styles.monthEventDotRow}>
                        {dots.map((dotTone) => (
                          <View
                            key={dotTone}
                            style={[
                              styles.monthEventDot,
                              {
                                backgroundColor: day.isCurrentMonth
                                  ? getMonthEventDotColor(dotTone)
                                  : theme.colors.muted,
                              },
                            ]}
                          />
                        ))}
                      </View>
                    ) : (
                      <View style={styles.monthEventDotSpacer} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.selectedDayPreview}>
            <View style={styles.selectedDateColumn}>
              <Text style={styles.selectedDateDayLabel}>{selectedDateParts.dayLabel}</Text>
              <Text style={styles.selectedDateNumber}>{selectedDateParts.dayNumber}</Text>
              <Text style={styles.selectedDateMonth}>{selectedDateParts.monthYear}</Text>
            </View>

            <View style={styles.selectedPreviewDivider} />

            <View style={styles.selectedPreviewContent}>
              <Text style={styles.selectedPreviewCount}>{selectedEventLabel}</Text>
              {previewItems.length > 0 ? (
                previewItems.map((item) => {
                  const dotTone = getMonthEventDotTone(item);
                  const typeTone = getTypeTone(item.plannerType);

                  return (
                    <View key={item.id} style={styles.previewEventRow}>
                      <View
                        style={[
                          styles.previewEventBadge,
                          { backgroundColor: typeTone.iconBackground },
                        ]}
                      >
                        <Text style={styles.previewEventBadgeText}>
                          {typeLabels[item.plannerType].charAt(0)}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={styles.previewEventTitle}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.previewEventTime}>
                        {formatPreviewTime(item)}
                      </Text>
                      <View
                        style={[
                          styles.previewEventDot,
                          { backgroundColor: getMonthEventDotColor(dotTone) },
                        ]}
                      />
                    </View>
                  );
                })
              ) : (
                <View style={styles.previewEmptyState}>
                  <Text style={styles.previewEmptyTitle}>No plans yet</Text>
                  <Text style={styles.previewEmptyMessage}>
                    You're clear for this day.
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.monthDragHandle} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CalendarScreen() {
  const { isDark } = useFocusMateTheme();

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
  const conflictChipsByTaskId = useMemo(() => {
    return selectedItems.reduce<Record<string, ConflictChipInfo>>((acc, item) => {
      const conflictChip = getConflictChipInfo(item, tasks);
      if (conflictChip) acc[item.id] = conflictChip;
      return acc;
    }, {});
  }, [selectedItems, tasks]);

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
  const selectedDayMiloNote = insightCards[0];
  const notificationCount = getReminderBadgeCount(tasks);
  const heroMiloSize = Math.min(compactWidth ? 160 : 188, width * 0.48);
  const timelineTitle =
    selectedDate === getTodayDate() ? 'Today timeline' : 'Selected day timeline';

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
    <ScreenContainer topPadding={mainHeader.topPadding} bottomPadding={176}>
      <MonthCalendarModal
        visible={monthModalVisible}
        selectedDate={selectedDate}
        itemsByDate={itemsByDate}
        selectedItems={selectedItems}
        onClose={() => setMonthModalVisible(false)}
        onSelectDate={(dateKey) => {
          setSelectedDate(dateKey);
        }}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>
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

      <View
        style={[
          styles.heroCard,
          isDark && styles.heroCardDark,
          !isDark && styles.lightSurfaceDepthLarge,
        ]}
      >
        <View style={[styles.heroGlowLarge, isDark && styles.heroGlowLargeDark]} />
        <View style={[styles.heroGlowSmall, isDark && styles.heroGlowSmallDark]} />
        <View style={[styles.heroCopy, { maxWidth: compactWidth ? 170 : 194 }]}>
          <View style={[styles.moodPill, isDark && styles.moodPillDark]}>
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

      <View style={[styles.weekCard, !isDark && styles.lightSurfaceDepthMedium]}>
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

      <View style={[styles.timelineCard, !isDark && styles.lightSurfaceDepthMedium]}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineCardTitle}>{timelineTitle}</Text>

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
                conflictChip={conflictChipsByTaskId[item.id]}
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
            iconBackground: theme.colors.dangerSoft,
          }}
        />
        <SummaryTile
          label="Due Today"
          count={summary.dueToday}
          iconName="time"
          tone={{
            color: '#D97706',
            backgroundColor: theme.colors.warningSoft,
            iconBackground: theme.colors.warningSoft,
          }}
        />
        <SummaryTile
          label="Start Early"
          count={summary.startEarly}
          iconName="paper-plane"
          tone={{
            color: theme.colors.primaryDark,
            backgroundColor: theme.colors.primarySoft,
            iconBackground: theme.colors.primarySoft,
          }}
        />
      </View>

      {selectedDayMiloNote ? (
        <View
          key={selectedDayMiloNote.id}
          style={[styles.noteCard, !isDark && styles.lightSurfaceDepthSmall]}
        >
          <Image source={selectedDayMiloNote.miloAsset} style={styles.noteMilo} />
          <View style={styles.noteCopy}>
            <Text style={styles.noteTitle}>{selectedDayMiloNote.title}</Text>
            <Text style={styles.noteMessage}>{selectedDayMiloNote.message}</Text>
            {selectedDayMiloNote.meta || selectedPendingItems.length > 0 ? (
              <Text style={styles.noteMeta}>
                {selectedDayMiloNote.meta ||
                  `${selectedPendingItems.length} pending on this date`}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: mainHeader.minHeight,
    marginBottom: mainHeader.marginBottom,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: mainHeader.titleFontSize,
    lineHeight: mainHeader.titleLineHeight,
    fontWeight: mainHeader.titleFontWeight,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: mainHeader.textToActionsGap,
    columnGap: mainHeader.actionGap,
  },
  iconButton: {
    width: headerActionButton.size,
    height: headerActionButton.size,
    borderRadius: headerActionButton.radius,
    backgroundColor: theme.colors.surface,
    borderWidth: headerActionButton.borderWidth,
    borderBottomWidth: headerActionButton.bottomBorderWidth,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: headerActionButton.shadowHeight,
    },
    shadowOpacity: headerActionButton.shadowOpacity,
    shadowRadius: headerActionButton.shadowRadius,
    elevation: headerActionButton.elevation,
  },
  badge: {
    position: 'absolute',
    top: headerBadge.top,
    right: headerBadge.right,
    minWidth: headerBadge.minWidth,
    height: headerBadge.height,
    borderRadius: headerBadge.radius,
    paddingHorizontal: headerBadge.paddingHorizontal,
    backgroundColor: theme.colors.danger,
    borderWidth: headerBadge.borderWidth,
    borderColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: headerBadge.fontSize,
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
    borderWidth: 1,
    borderColor: 'rgba(47, 143, 70, 0.18)',
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  lightSurfaceDepthSmall: {
    shadowColor: '#1F8A4C',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  lightSurfaceDepthMedium: {
    shadowColor: '#1F8A4C',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.11,
    shadowRadius: 18,
    elevation: 6,
  },
  lightSurfaceDepthLarge: {
    shadowColor: '#1F8A4C',
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.13,
    shadowRadius: 22,
    elevation: 7,
  },
  heroCardDark: {
    backgroundColor: '#12362E',
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  heroGlowLargeDark: {
    backgroundColor: 'rgba(0,168,132,0.18)',
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
  heroGlowSmallDark: {
    backgroundColor: 'rgba(0,168,132,0.12)',
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
  moodPillDark: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    ...theme.shadowSoft,
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 6,
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
    backgroundColor: theme.colors.input,
    paddingVertical: 6,
    marginRight: DATE_ITEM_GAP,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 2,
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
    shadowOpacity: 0.14,
    shadowRadius: 13,
    elevation: 5,
    borderColor: '#55B86B',
    borderTopColor: '#83E297',
    borderBottomColor: '#1F7A3B',
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
    borderTopColor: '#FDF7E978',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  timelineCard: {
    borderRadius: 26,
    backgroundColor: theme.colors.card,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    ...theme.shadowSoft,
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 6,
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
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(85,200,120,0.18)',
    borderTopColor: '#FDF7E978',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.09,
    shadowRadius: 9,
    elevation: 3,
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
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
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
    borderWidth: 1,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.06)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.09,
    shadowRadius: 11,
    elevation: 3,
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
    backgroundColor: theme.colors.card,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 3,
  },
  urgencyText: {
    flexShrink: 1,
    color: theme.colors.muted,
    fontSize: 7,
    fontWeight: '900',
  },
  conflictChip: {
    maxWidth: 92,
    minHeight: 15,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 3,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  conflictChipWarning: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.inputBorder,
  },
  conflictChipActive: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.inputBorder,
  },
  conflictChipCalm: {
    backgroundColor: theme.colors.successSoft,
    borderColor: theme.colors.inputBorder,
  },
  conflictChipText: {
    flexShrink: 1,
    marginLeft: 2,
    fontSize: 7,
    fontWeight: '900',
  },
  conflictChipTextWarning: {
    color: '#B45309',
  },
  conflictChipTextActive: {
    color: theme.colors.danger,
  },
  conflictChipTextCalm: {
    color: theme.colors.primaryDark,
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
    borderWidth: 1,
    borderColor: '#9F8CF2',
    borderTopColor: '#C9BEFF',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.11,
    shadowRadius: 10,
    elevation: 3,
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
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  viewAction: {
    minWidth: 40,
    minHeight: 26,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
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
    borderWidth: 1,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
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
    borderWidth: 1,
    borderColor: 'rgba(46, 125, 75, 0.08)',
    borderTopColor: '#FDF7E978',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
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
    backgroundColor: theme.colors.cardSoft,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    ...theme.shadowSoft,
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 5,
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
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  monthModalCard: {
    width: '100%',
    maxWidth: 366,
    borderRadius: 30,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.12)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 22,
    },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 12,
  },
  monthModalTint: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    height: 88,
    borderRadius: 26,
    backgroundColor: 'rgba(229,246,233,0.36)',
  },
  monthModalHeader: {
    minHeight: 38,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrowButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(85,200,120,0.2)',
    borderTopColor: '#FDF7E978',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
  },
  monthArrowText: {
    color: theme.colors.primaryDark,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
  },
  monthModalTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
  },
  monthWeekRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 1,
  },
  monthWeekText: {
    flex: 1,
    color: theme.colors.muted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -1,
  },
  monthDayCell: {
    width: `${100 / 7}%`,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayBubble: {
    width: 35,
    height: 35,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDaySelected: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  monthDayToday: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(85,200,120,0.2)',
  },
  monthDayText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
  },
  monthDayTextOutside: {
    color: theme.colors.muted,
    opacity: 0.45,
  },
  monthDayTextSelected: {
    color: theme.colors.white,
  },
  monthSelectedEventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.white,
    marginTop: 2,
  },
  monthEventDotRow: {
    minHeight: 6,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthEventDot: {
    width: 3.6,
    height: 3.6,
    borderRadius: 2,
    marginHorizontal: 1.1,
  },
  monthEventDotSpacer: {
    width: 4,
    height: 6,
    marginTop: 2,
  },
  selectedDayPreview: {
    minHeight: 110,
    marginTop: 15,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(46, 125, 75, 0.14)',
    flexDirection: 'row',
    paddingVertical: 11,
    paddingHorizontal: 11,
  },
  selectedDateColumn: {
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDateDayLabel: {
    color: theme.colors.text,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  selectedDateNumber: {
    color: theme.colors.text,
    fontSize: 29,
    lineHeight: 32,
    fontWeight: '900',
  },
  selectedDateMonth: {
    color: theme.colors.mutedText,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  selectedPreviewDivider: {
    width: 1,
    marginHorizontal: 10,
    backgroundColor: theme.colors.divider,
  },
  selectedPreviewContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  selectedPreviewCount: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  previewEventRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  previewEventBadge: {
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  previewEventBadgeText: {
    color: theme.colors.white,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
  },
  previewEventTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    marginRight: 6,
  },
  previewEventTime: {
    maxWidth: 54,
    color: theme.colors.textSoft,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  previewEventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: 8,
  },
  previewEmptyState: {
    minHeight: 46,
    justifyContent: 'center',
  },
  previewEmptyTitle: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  previewEmptyMessage: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  monthDragHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
    opacity: 0.42,
    marginTop: 10,
  },
});
