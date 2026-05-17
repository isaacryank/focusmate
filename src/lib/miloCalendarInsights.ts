import { ImageSourcePropType } from 'react-native';

import { miloActivities, miloReactions } from '../assets/generatedAssetMap';
import { Task } from '../types/task';
import {
  isActiveWarningCandidate,
  isAllDayOrPlaceholder,
  parseTimeMinutes,
} from './miloSituationIntelligence';
import { getDaysUntilDue, getTaskUrgency } from './taskUrgency';

export type MiloCalendarInsight = {
  id: string;
  title: string;
  message: string;
  meta?: string;
  miloAsset: ImageSourcePropType;
};

type CalendarInsightInput = {
  allItems: Task[];
  selectedDate: string;
  selectedItems: Task[];
  now?: Date;
};

type CalendarConflictType =
  | 'same_time'
  | 'overlap'
  | 'ongoing_overlap'
  | 'soft_conflict'
  | 'accepted_overlap'
  | 'all_day_protected';

type CalendarConflictMetadata = {
  calendarConflictType?: CalendarConflictType;
  calendarConflictSeverity?: 'calm' | 'soft' | 'strong';
  calendarConflictLabel?: string;
  calendarIsActiveWarning?: boolean;
};

type CalendarConflictInfo = NonNullable<Task['conflictInfo']> &
  CalendarConflictMetadata;

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function hasClockTime(item: Task) {
  return parseTimeMinutes(item.dueTime) < Number.MAX_SAFE_INTEGER - 1;
}

function isPending(item: Task) {
  return item.status !== 'completed';
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getConflictInfo(item: Task) {
  return item.conflictInfo as CalendarConflictInfo | undefined;
}

function getCalendarConflictType(item: Task): CalendarConflictType | undefined {
  const conflictInfo = getConflictInfo(item);

  if (
    item.conflictAccepted ||
    conflictInfo?.type === 'accepted_overlap' ||
    conflictInfo?.messageTone === 'accepted'
  ) {
    return 'accepted_overlap';
  }

  if (
    conflictInfo?.calendarConflictType === 'all_day_protected' ||
    conflictInfo?.type === 'whole_day' ||
    isAllDayOrPlaceholder(item)
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
      return undefined;
  }
}

function getConflictMeta(item: Task) {
  const conflictInfo = getConflictInfo(item);
  return (
    conflictInfo?.conflictingTitle ||
    item.conflictWithTitle ||
    conflictInfo?.conflictingStartTimeLabel ||
    conflictInfo?.conflictingTime ||
    item.conflictWithTime ||
    item.dueTime ||
    undefined
  );
}

function getConflictInsight(items: Task[]): MiloCalendarInsight | undefined {
  const conflictPriority: Record<CalendarConflictType, number> = {
    same_time: 0,
    ongoing_overlap: 1,
    overlap: 2,
    soft_conflict: 3,
    accepted_overlap: 4,
    all_day_protected: 5,
  };
  const conflictItem = items
    .map((item) => ({
      item,
      type: getCalendarConflictType(item),
    }))
    .filter((entry): entry is { item: Task; type: CalendarConflictType } =>
      Boolean(entry.type)
    )
    .sort((a, b) => conflictPriority[a.type] - conflictPriority[b.type])[0];

  if (!conflictItem) return undefined;

  const meta = getConflictMeta(conflictItem.item);

  switch (conflictItem.type) {
    case 'same_time':
      return {
        id: 'same-time-plans',
        title: 'Same time plans',
        message: 'Two plans start together. Milo will keep them easy to see.',
        meta,
        miloAsset: miloReactions.thinking,
      };
    case 'ongoing_overlap':
      return {
        id: 'ongoing-overlap',
        title: 'Overlap right now',
        message: 'Milo sees plans overlapping now. Pick one small focus first.',
        meta,
        miloAsset: miloReactions.determined_lock_in,
      };
    case 'overlap':
      return {
        id: 'overlap-plans',
        title: 'Plans overlap',
        message: 'These plans share some time. A gentle buffer may help.',
        meta,
        miloAsset: miloActivities.holding_calendar,
      };
    case 'soft_conflict':
      return {
        id: 'soft-conflict',
        title: 'Close together',
        message: 'Milo noticed these plans are close together.',
        meta: meta || 'A small buffer may help.',
        miloAsset: miloReactions.alert_bell,
      };
    case 'accepted_overlap':
      return {
        id: 'accepted-overlap',
        title: 'Keep Both noted',
        message: 'You chose Keep Both, so Milo will just keep an eye on it.',
        meta,
        miloAsset: miloReactions.calm_meditating,
      };
    case 'all_day_protected':
      return {
        id: 'all-day-protected',
        title: 'All-day item',
        message: 'Milo sees this as all-day, so it can sit calmly here.',
        meta: meta || conflictItem.item.title,
        miloAsset: miloActivities.holding_calendar,
      };
    default:
      return undefined;
  }
}

export function getMiloCalendarInsights({
  allItems,
  selectedDate,
  selectedItems,
  now = new Date(),
}: CalendarInsightInput): MiloCalendarInsight[] {
  const todayDate = getDateKey(now);
  const selectedPending = selectedItems.filter(isPending);
  const selectedDone = selectedItems.filter((item) => item.status === 'completed');
  const todayItems = allItems.filter((item) => item.dueDate === todayDate);
  const todayPending = todayItems.filter(isPending);
  const todayCompletedImportant = todayItems.filter(
    (item) => item.status === 'completed' && (item.priority === 'high' || item.plannerType === 'meeting')
  );
  const overdueItems = allItems.filter(
    (item) => isActiveWarningCandidate(item) && getTaskUrgency(item, now).level === 'overdue'
  );
  const dueTodayItems = allItems.filter(
    (item) => isActiveWarningCandidate(item) && getTaskUrgency(item, now).level === 'urgent'
  );
  const futureDueItems = allItems.filter((item) => {
    if (!isPending(item)) return false;
    const daysUntilDue = getDaysUntilDue(item.dueDate, now);
    return daysUntilDue !== undefined && daysUntilDue > 0 && daysUntilDue <= 23;
  });
  const selectedMeetings = selectedPending.filter((item) => item.plannerType === 'meeting');
  const laterTodayMeeting = todayPending
    .filter(
      (item) =>
        item.plannerType === 'meeting' &&
        !isAllDayOrPlaceholder(item) &&
        parseTimeMinutes(item.dueTime) >= now.getHours() * 60 + now.getMinutes()
    )
    .sort((a, b) => parseTimeMinutes(a.dueTime) - parseTimeMinutes(b.dueTime))[0];
  const afterNineCount = selectedPending.filter(
    (item) => parseTimeMinutes(item.dueTime) >= 21 * 60
  ).length;
  const nextTwoDaysBusyCount = allItems.filter((item) => {
    if (!isPending(item)) return false;
    const daysUntilDue = getDaysUntilDue(item.dueDate, now);
    return daysUntilDue !== undefined && daysUntilDue > 0 && daysUntilDue <= 2;
  }).length;
  const mostlyFreeToday = todayPending.length <= 1;
  const isEvening = now.getHours() >= 17;

  const cards: MiloCalendarInsight[] = [];
  const conflictInsight = getConflictInsight(selectedPending);

  if (conflictInsight) {
    cards.push(conflictInsight);
  }

  if (overdueItems.length > 0) {
    cards.push({
      id: 'overdue-recovery',
      title: "Let's recover gently",
      message: `${pluralize(overdueItems.length, 'overdue item')} still needs attention. Start with the smallest step.`,
      meta: 'Small steps still count.',
      miloAsset: miloReactions.worried,
    });
  }

  if (dueTodayItems.length > 0) {
    cards.push({
      id: 'due-today-focus',
      title: 'Today needs a little focus',
      message: `${pluralize(dueTodayItems.length, 'item')} due today. Milo is here with you.`,
      meta: 'Pick one clear next action.',
      miloAsset: miloReactions.determined_lock_in,
    });
  }

  if (mostlyFreeToday && futureDueItems.length > 0) {
    cards.push({
      id: 'future-head-start',
      title: 'A smart head start',
      message: `Today is mostly free, but the next 23 days have ${pluralize(futureDueItems.length, 'due item')}. A little head start can help later.`,
      meta: 'Future-you will thank you.',
      miloAsset: miloActivities.checklist_clipboard,
    });
  }

  if (isEvening && todayPending.length === 0 && todayCompletedImportant.length > 0) {
    cards.push({
      id: 'clear-evening',
      title: "You're clear for the evening",
      message: 'Milo says you can breathe a little easier.',
      meta: `${pluralize(todayCompletedImportant.length, 'important item')} handled today.`,
      miloAsset: miloReactions.calm_meditating,
    });
  }

  if (selectedPending.length >= 5) {
    cards.push({
      id: 'packed-day',
      title: 'Packed day',
      message: 'Your day is full. Milo will help you take it one item at a time.',
      meta: `${pluralize(selectedPending.length, 'pending item')} on this date.`,
      miloAsset: miloReactions.focused_laptop,
    });
  }

  if (laterTodayMeeting) {
    cards.push({
      id: 'meeting-coming-up',
      title: 'Meeting coming up',
      message: 'You have a meeting later today. Milo suggests checking notes early.',
      meta: laterTodayMeeting.dueTime || laterTodayMeeting.title,
      miloAsset: miloActivities.online_meeting,
    });
  }

  if (nextTwoDaysBusyCount >= 2) {
    cards.push({
      id: 'next-two-days-busy',
      title: 'A smart head start',
      message: `The next 2 days look busy. Doing one small part today can help later.`,
      meta: `${pluralize(nextTwoDaysBusyCount, 'item')} coming soon.`,
      miloAsset: miloActivities.working_laptop,
    });
  }

  if (selectedItems.length > 0 && selectedDone.length === selectedItems.length) {
    cards.push({
      id: 'wrapped-up',
      title: 'You wrapped up well today',
      message: 'Milo saved a proud little note for this date.',
      meta: `${pluralize(selectedDone.length, 'item')} complete.`,
      miloAsset: miloReactions.proud,
    });
  }

  if (selectedPending.length === 0 && afterNineCount === 0) {
    cards.push({
      id: 'space-to-breathe',
      title: 'Calm day',
      message: 'Your calendar looks calm. Milo is keeping the day soft.',
      meta: 'A little space to breathe.',
      miloAsset: miloReactions.calm_meditating,
    });
  }

  if (selectedMeetings.length >= 2) {
    cards.push({
      id: 'meeting-stack',
      title: 'Meeting stack detected',
      message: 'Milo suggests leaving tiny buffers for notes, water, and one deep breath.',
      meta: `${pluralize(selectedMeetings.length, 'meeting')} on this date.`,
      miloAsset: miloActivities.online_meeting,
    });
  }

  if (selectedPending.some((item) => item.priority === 'high')) {
    cards.push({
      id: 'priority-nudge',
      title: 'One thing matters most',
      message: 'A high priority item is waiting. Start small and let momentum do the rest.',
      meta: 'Milo is here with you.',
      miloAsset: miloReactions.thinking,
    });
  }

  if (selectedItems.length === 0) {
    cards.push({
      id: 'quiet-day',
      title: 'Calm day',
      message: "Nothing planned here yet. Add something when you're ready.",
      meta: 'A calm calendar still counts.',
      miloAsset: miloReactions.happy,
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: 'steady-day',
      title: 'Calm day',
      message: 'Your plan looks balanced. One kind next step is enough.',
      meta: selectedPending.length > 0 ? `${pluralize(selectedPending.length, 'pending item')} on this date.` : undefined,
      miloAsset: miloActivities.holding_calendar,
    });
  }

  const uniqueCards = cards.filter(
    (card, index, list) => list.findIndex((item) => item.id === card.id) === index
  );

  return selectedDate === todayDate ? uniqueCards.slice(0, 2) : uniqueCards.slice(0, 1);
}
