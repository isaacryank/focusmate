import { Task } from '../types/task';
import { MiloMood, getTodayDate } from './miloPersonality';
import { getTaskUrgency } from './taskUrgency';

export type MiloReactionMood =
  | 'calm'
  | 'happy'
  | 'focused'
  | 'worried'
  | 'proud'
  | 'celebrating'
  | 'sleepy';

export type MiloReactionPriority = 'low' | 'medium' | 'high';

export type MiloReaction = {
  mood: MiloReactionMood;
  title: string;
  message: string;
  secondaryMessage?: string;
  suggestedActionLabel: string;
  reason: string;
  priorityLevel: MiloReactionPriority;
  assetKey: MiloMood;
  mascotKey: MiloMood;
};

type MiloReactionOptions = {
  date?: string;
  now?: Date;
};

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parsePlannerDateTime(item: Task, now: Date) {
  if (!item.dueDate || !item.dueTime) return null;

  const normalizedTime = item.dueTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!normalizedTime) return null;

  const [, rawHour, rawMinute, meridiem] = normalizedTime;
  let hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  if (meridiem) {
    const upperMeridiem = meridiem.toUpperCase();
    if (upperMeridiem === 'PM' && hour < 12) hour += 12;
    if (upperMeridiem === 'AM' && hour === 12) hour = 0;
  }

  const [year, month, day] = item.dueDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  const plannedDate = new Date(now);
  plannedDate.setFullYear(year, month - 1, day);
  plannedDate.setHours(hour, minute, 0, 0);

  return plannedDate;
}

function createReaction(
  reaction: Omit<MiloReaction, 'mascotKey'>
): MiloReaction {
  return {
    ...reaction,
    mascotKey: reaction.assetKey,
  };
}

export function getMiloReaction(
  items: Task[],
  options: MiloReactionOptions = {}
): MiloReaction {
  const now = options.now || new Date();
  const todayDate = getTodayDate();
  const targetDate = options.date || todayDate;
  const scopedItems = options.date
    ? items.filter((item) => item.dueDate === targetDate)
    : items;

  const pendingItems = scopedItems.filter((item) => item.status !== 'completed');
  const targetDayItems = scopedItems.filter((item) => item.dueDate === targetDate);
  const targetDayPendingItems = targetDayItems.filter(
    (item) => item.status !== 'completed'
  );
  const overdueItems = scopedItems.filter(
    (item) => getTaskUrgency(item).level === 'overdue'
  );
  const urgentItems = scopedItems.filter(
    (item) =>
      item.status !== 'completed' &&
      ['urgent', 'high'].includes(getTaskUrgency(item).level)
  );
  const soonMeetingItems = scopedItems.filter((item) => {
    if (item.status === 'completed' || item.plannerType !== 'meeting') return false;

    const plannedDate = parsePlannerDateTime(item, now);
    if (!plannedDate || getDateKey(plannedDate) !== todayDate) return false;

    const minutesUntilMeeting =
      (plannedDate.getTime() - now.getTime()) / (1000 * 60);

    return minutesUntilMeeting >= 0 && minutesUntilMeeting <= 120;
  });

  if (overdueItems.length > 0) {
    return createReaction({
      mood: 'worried',
      title: 'Milo is checking in',
      message: 'Lets fix one small thing first.',
      secondaryMessage: `${overdueItems.length} overdue item(s) need care.`,
      suggestedActionLabel: 'Review tasks',
      reason: 'overdue_incomplete_items',
      priorityLevel: 'high',
      assetKey: 'worried',
    });
  }

  if (urgentItems.length > 0) {
    return createReaction({
      mood: 'focused',
      title: 'Milo is focused',
      message: 'This deadline needs your focus.',
      secondaryMessage: `${urgentItems.length} urgent item(s) need an early step.`,
      suggestedActionLabel: 'Start focus',
      reason: 'dynamic_urgency_due_soon',
      priorityLevel: 'high',
      assetKey: 'focused',
    });
  }

  if (soonMeetingItems.length > 0) {
    return createReaction({
      mood: 'focused',
      title: 'Milo is getting ready',
      message: 'Milo will help you get ready.',
      secondaryMessage: soonMeetingItems[0].title,
      suggestedActionLabel: 'Check meeting',
      reason: 'meeting_soon',
      priorityLevel: 'high',
      assetKey: 'focused',
    });
  }

  if (
    targetDayItems.length > 0 &&
    targetDayPendingItems.length === 0
  ) {
    return createReaction({
      mood: 'proud',
      title: 'Milo is proud',
      message: 'You did it. Milo is proud.',
      secondaryMessage: 'Everything planned here is done.',
      suggestedActionLabel: 'View progress',
      reason: 'all_target_day_items_completed',
      priorityLevel: 'low',
      assetKey: 'celebrating',
    });
  }

  if (!options.date && scopedItems.length > 0 && pendingItems.length === 0) {
    return createReaction({
      mood: 'proud',
      title: 'Milo is proud',
      message: 'You did it. Milo is proud.',
      secondaryMessage: 'Your planner is clear.',
      suggestedActionLabel: 'View progress',
      reason: 'all_items_completed',
      priorityLevel: 'low',
      assetKey: 'celebrating',
    });
  }

  if (scopedItems.length === 0) {
    return createReaction({
      mood: 'calm',
      title: 'Milo sees a quiet day',
      message: 'Quiet day. Add something when youre ready.',
      suggestedActionLabel: 'Add item',
      reason: 'no_planner_items',
      priorityLevel: 'low',
      assetKey: 'idle',
    });
  }

  if (pendingItems.length >= 5) {
    return createReaction({
      mood: 'worried',
      title: 'Milo is keeping it small',
      message: 'Lets not do everything at once.',
      secondaryMessage: `${pendingItems.length} pending item(s) in your planner.`,
      suggestedActionLabel: 'Pick one item',
      reason: 'many_pending_items',
      priorityLevel: 'medium',
      assetKey: 'worried',
    });
  }

  if (pendingItems.length > 0) {
    return createReaction({
      mood: 'happy',
      title: 'Milo is with you',
      message: 'One small step is enough.',
      secondaryMessage: `${pendingItems.length} pending item(s) ready.`,
      suggestedActionLabel: 'Open tasks',
      reason: 'normal_pending_items',
      priorityLevel: 'medium',
      assetKey: 'happy',
    });
  }

  return createReaction({
    mood: 'sleepy',
    title: 'Milo is resting',
    message: 'Your planner looks calm.',
    suggestedActionLabel: 'Add item',
    reason: 'no_pending_items',
    priorityLevel: 'low',
    assetKey: 'sleepy',
  });
}
