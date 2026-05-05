import { ImageSourcePropType } from 'react-native';

import { miloActivities, miloReactions } from '../assets/generatedAssetMap';
import { Task } from '../types/task';
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

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
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

function isPending(item: Task) {
  return item.status !== 'completed';
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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
    (item) => isPending(item) && getTaskUrgency(item, now).level === 'overdue'
  );
  const dueTodayItems = allItems.filter(
    (item) => isPending(item) && getTaskUrgency(item, now).level === 'urgent'
  );
  const futureDueItems = allItems.filter((item) => {
    if (!isPending(item)) return false;
    const daysUntilDue = getDaysUntilDue(item.dueDate, now);
    return daysUntilDue !== undefined && daysUntilDue > 0 && daysUntilDue <= 23;
  });
  const selectedMeetings = selectedPending.filter((item) => item.plannerType === 'meeting');
  const laterTodayMeeting = todayPending
    .filter((item) => item.plannerType === 'meeting' && parseTimeMinutes(item.dueTime) >= now.getHours() * 60 + now.getMinutes())
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

  if (overdueItems.length > 0) {
    cards.push({
      id: 'overdue-recovery',
      title: 'Lets recover gently',
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
      title: 'Youre clear for the evening',
      message: 'Milo says you can breathe a little easier.',
      meta: `${pluralize(todayCompletedImportant.length, 'important item')} handled today.`,
      miloAsset: miloReactions.calm_meditating,
    });
  }

  if (selectedItems.length >= 5) {
    cards.push({
      id: 'big-day',
      title: 'Big day ahead',
      message: 'Take one gentle step at a time. Milo is pacing it with you.',
      meta: `${pluralize(selectedItems.length, 'planner item')} on this date.`,
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
      title: 'A little space to breathe',
      message: 'No events after 9:00 PM. Enjoy your evening.',
      meta: 'Milo is keeping the night soft.',
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
      title: 'A quiet little day',
      message: 'Nothing planned here yet. Add something when youre ready, or enjoy the space.',
      meta: 'A calm calendar still counts.',
      miloAsset: miloReactions.happy,
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: 'steady-day',
      title: 'Steady and manageable',
      message: 'Your plan looks balanced. Milo says one kind next step is enough.',
      meta: selectedPending.length > 0 ? `${pluralize(selectedPending.length, 'pending item')} on this date.` : undefined,
      miloAsset: miloActivities.holding_calendar,
    });
  }

  const uniqueCards = cards.filter(
    (card, index, list) => list.findIndex((item) => item.id === card.id) === index
  );

  return selectedDate === todayDate ? uniqueCards.slice(0, 2) : uniqueCards.slice(0, 1);
}
