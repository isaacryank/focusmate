import { Task } from '../types/task';
import { needsPreparation } from './miloSmartPlan';
import { getDaysUntilDue, getTaskUrgency, TaskUrgency } from './taskUrgency';

const STARTING_SOON_MINUTES = 15;
const TONIGHT_START_HOUR = 20;
const WHOLE_DAY_MINUTES = 24 * 60;

export type MiloSituationKind =
  | 'done'
  | 'overdue'
  | 'missed'
  | 'happening_now'
  | 'starting_soon'
  | 'accepted_overlap'
  | 'all_day'
  | 'due_today'
  | 'due_tonight'
  | 'high_focus'
  | 'start_early'
  | 'upcoming'
  | 'calm';

export type MiloTaskSituation = {
  kind: MiloSituationKind;
  label: string;
  message: string;
  heroRank: number;
  sortRank: number;
  isActive: boolean;
  urgency: TaskUrgency;
  startsAt?: Date;
  endsAt?: Date;
  minutesLate?: number;
};

export type MiloHomeSituation = {
  kind: MiloSituationKind;
  label: string;
  message: string;
  heroRank: number;
  task?: Task;
};

export type MiloHomeSummary = {
  tasksToday: number;
  meetingsToday: number;
  datesToday: number;
  doneToday: number;
  totalToday: number;
  overdue: number;
  missed: number;
  happeningNow: number;
  startingSoon: number;
  acceptedOverlap: number;
  dueToday: number;
  dueTonight: number;
  highFocus: number;
  startEarly: number;
  allDay: number;
  meetingSoon: number;
  reminderCount: number;
  packedDay: boolean;
  strongestSituation: MiloHomeSituation;
};

type SituationCopy = {
  label: string;
  message: string;
  heroRank: number;
  sortRank: number;
  isActive: boolean;
};

const situationCopy: Record<MiloSituationKind, SituationCopy> = {
  done: {
    label: 'Done',
    message: 'This is complete. Milo is proud of you.',
    heroRank: 99,
    sortRank: 99,
    isActive: false,
  },
  overdue: {
    label: 'Overdue',
    message: 'One thing is overdue, but we can recover it gently.',
    heroRank: 2,
    sortRank: 2,
    isActive: true,
  },
  missed: {
    label: 'Missed',
    message: 'This slipped a little. Want to do it now or reschedule?',
    heroRank: 1,
    sortRank: 1,
    isActive: true,
  },
  happening_now: {
    label: 'Happening now',
    message: 'This is happening now. Stay focused.',
    heroRank: 0,
    sortRank: 0,
    isActive: true,
  },
  starting_soon: {
    label: 'Starting soon',
    message: 'This starts soon. Lets get ready.',
    heroRank: 3,
    sortRank: 3,
    isActive: true,
  },
  accepted_overlap: {
    label: 'Keep Both',
    message: 'You chose Keep Both. Ill remind you to stay focused.',
    heroRank: 7,
    sortRank: 7,
    isActive: true,
  },
  all_day: {
    label: 'All Day',
    message: 'This is part of your day, not just one moment.',
    heroRank: 9,
    sortRank: 9,
    isActive: true,
  },
  due_today: {
    label: 'Due Today',
    message: 'Lets handle what matters today.',
    heroRank: 4,
    sortRank: 4,
    isActive: true,
  },
  due_tonight: {
    label: 'Due Tonight',
    message: 'You still have time, but dont leave it too late.',
    heroRank: 5,
    sortRank: 5,
    isActive: true,
  },
  high_focus: {
    label: 'High Focus',
    message: 'This needs stronger focus.',
    heroRank: 6,
    sortRank: 6,
    isActive: true,
  },
  start_early: {
    label: 'Start Early',
    message: 'A small early step can reduce stress later.',
    heroRank: 8,
    sortRank: 8,
    isActive: true,
  },
  upcoming: {
    label: 'Upcoming',
    message: 'This is coming up. Milo is keeping it visible.',
    heroRank: 10,
    sortRank: 10,
    isActive: false,
  },
  calm: {
    label: 'Calm',
    message: 'Your plan looks manageable right now.',
    heroRank: 11,
    sortRank: 11,
    isActive: false,
  },
};

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function cleanText(value?: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseDateKey(dateKey?: string) {
  const cleanedDate = cleanText(dateKey);
  if (!cleanedDate) return null;

  const match = cleanedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseTimeValue(timeValue?: string) {
  const cleanedTime = cleanText(timeValue);
  if (!cleanedTime) return null;

  const match = cleanedTime
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const meridiem = match[3];

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    if (meridiem === 'PM' && hour !== 12) hour += 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return {
    hour,
    minute,
    isMidnight: hour === 0 && minute === 0,
  };
}

function buildDateTime(date: Date, hour: number, minute: number) {
  const dateTime = new Date(date);
  dateTime.setHours(hour, minute, 0, 0);
  return dateTime;
}

export function parseMiloTaskDateTime(
  task: Task,
  options: { fallbackEndOfDay?: boolean } = {}
) {
  const date = parseDateKey(task.dueDate);
  if (!date) return null;

  const time = parseTimeValue(task.dueTime);
  if (time) {
    return buildDateTime(date, time.hour, time.minute);
  }

  if (options.fallbackEndOfDay) {
    date.setHours(23, 59, 0, 0);
  }

  return date;
}

function getTaskSchedule(task: Task) {
  const date = parseDateKey(task.dueDate);
  const time = parseTimeValue(task.dueTime);
  const duration =
    typeof task.estimatedDurationMinutes === 'number'
      ? task.estimatedDurationMinutes
      : undefined;
  const start = date && time ? buildDateTime(date, time.hour, time.minute) : null;
  const end =
    start && duration && duration > 0
      ? new Date(start.getTime() + duration * 60 * 1000)
      : null;

  return {
    date,
    dateKey: date ? getDateKey(date) : undefined,
    start,
    end,
    hasTime: Boolean(time),
    isMidnightStart: Boolean(time?.isMidnight),
    duration,
    isWholeDay: Boolean(duration && duration >= WHOLE_DAY_MINUTES),
  };
}

function createSituation(
  kind: MiloSituationKind,
  urgency: TaskUrgency,
  overrides: Partial<MiloTaskSituation> = {}
): MiloTaskSituation {
  const copy = situationCopy[kind];

  return {
    kind,
    label: copy.label,
    message: copy.message,
    heroRank: copy.heroRank,
    sortRank: copy.sortRank,
    isActive: copy.isActive,
    urgency,
    ...overrides,
  };
}

function getPriorityRank(task: Task) {
  if (task.priority === 'high') return 3;
  if (task.priority === 'medium') return 2;
  return 1;
}

function hasAcceptedOverlap(task: Task) {
  return task.conflictAccepted === true;
}

function hasConflictSignal(task: Task) {
  return Boolean(
    task.conflictInfo ||
      task.conflictAccepted ||
      task.conflictLevel ||
      task.conflictWithTitle ||
      task.conflictWithTime
  );
}

function needsTaskPreparation(task: Task) {
  try {
    return needsPreparation({
      title: task.title || '',
      description: task.description,
      plannerType: task.plannerType || 'task',
      priority: task.priority || 'medium',
      dueDate: cleanText(task.dueDate),
      dueTime: cleanText(task.dueTime),
      location: task.location,
      reminder: task.reminder,
      estimatedDurationMinutes: task.estimatedDurationMinutes,
      status: task.status,
      subtasks: task.subtasks,
    });
  } catch {
    return false;
  }
}

function formatMissedLabel(minutesLate: number) {
  if (minutesLate > 0 && minutesLate < 60) {
    return `Missed by ${minutesLate} min`;
  }

  return 'Missed';
}

function getMiloSortTime(task: Task, situation: MiloTaskSituation) {
  const schedule = getTaskSchedule(task);
  const dateTime = parseMiloTaskDateTime(task, { fallbackEndOfDay: true });

  if (!dateTime) return Number.MAX_SAFE_INTEGER;

  if (
    situation.kind === 'all_day' ||
    (situation.kind === 'due_today' && schedule.isMidnightStart)
  ) {
    const endOfDay = schedule.date ? new Date(schedule.date) : new Date(dateTime);
    endOfDay.setHours(23, 59, 0, 0);
    return endOfDay.getTime();
  }

  return dateTime.getTime();
}

export function getMiloSituationForTask(
  task: Task,
  now: Date = new Date()
): MiloTaskSituation {
  const urgency = getTaskUrgency(task, now);

  if (task.status === 'completed') {
    return createSituation('done', urgency);
  }

  const todayKey = getDateKey(now);
  const schedule = getTaskSchedule(task);
  const daysUntilDue = getDaysUntilDue(task.dueDate, now);
  const isToday = schedule.dateKey === todayKey;
  const prepNeeded = needsTaskPreparation(task);

  if (daysUntilDue !== undefined && daysUntilDue < 0) {
    return createSituation('overdue', urgency);
  }

  if (isToday && schedule.isWholeDay && !hasAcceptedOverlap(task)) {
    return createSituation('all_day', urgency, {
      startsAt: schedule.start || schedule.date || undefined,
      endsAt: schedule.end || undefined,
    });
  }

  if (
    isToday &&
    schedule.start &&
    schedule.end &&
    schedule.duration &&
    schedule.duration > 0 &&
    !schedule.isWholeDay &&
    now.getTime() >= schedule.start.getTime() &&
    now.getTime() < schedule.end.getTime()
  ) {
    return createSituation('happening_now', urgency, {
      startsAt: schedule.start,
      endsAt: schedule.end,
    });
  }

  if (
    isToday &&
    schedule.start &&
    schedule.hasTime &&
    !schedule.isWholeDay &&
    !schedule.isMidnightStart &&
    schedule.start.getTime() < now.getTime()
  ) {
    const minutesLate = Math.max(
      1,
      Math.floor((now.getTime() - schedule.start.getTime()) / (1000 * 60))
    );

    return createSituation('missed', urgency, {
      label: formatMissedLabel(minutesLate),
      startsAt: schedule.start,
      minutesLate,
    });
  }

  if (isToday && schedule.start && schedule.hasTime && !schedule.isWholeDay) {
    const minutesUntilStart =
      (schedule.start.getTime() - now.getTime()) / (1000 * 60);

    if (minutesUntilStart >= 0 && minutesUntilStart <= STARTING_SOON_MINUTES) {
      return createSituation('starting_soon', urgency, {
        startsAt: schedule.start,
        endsAt: schedule.end || undefined,
      });
    }
  }

  if (hasAcceptedOverlap(task)) {
    return createSituation('accepted_overlap', urgency);
  }

  if (
    isToday &&
    schedule.start &&
    schedule.hasTime &&
    schedule.start.getHours() >= TONIGHT_START_HOUR
  ) {
    return createSituation('due_tonight', urgency, {
      startsAt: schedule.start,
    });
  }

  if (isToday) {
    return createSituation('due_today', urgency, {
      startsAt: schedule.start || schedule.date || undefined,
    });
  }

  if (
    task.priority === 'high' ||
    urgency.level === 'high' ||
    hasConflictSignal(task)
  ) {
    return createSituation('high_focus', urgency, {
      startsAt: schedule.start || schedule.date || undefined,
      endsAt: schedule.end || undefined,
    });
  }

  if (
    daysUntilDue !== undefined &&
    daysUntilDue > 0 &&
    (urgency.level === 'medium' || prepNeeded)
  ) {
    return createSituation('start_early', urgency, {
      startsAt: schedule.start || schedule.date || undefined,
      endsAt: schedule.end || undefined,
    });
  }

  return createSituation('upcoming', urgency, {
    startsAt: schedule.start || schedule.date || undefined,
    endsAt: schedule.end || undefined,
  });
}

export function sortTasksForMilo(tasks: Task[], now: Date = new Date()) {
  return tasks
    .filter((task) => task.status !== 'completed')
    .sort((a, b) => {
      const situationA = getMiloSituationForTask(a, now);
      const situationB = getMiloSituationForTask(b, now);

      if (situationA.sortRank !== situationB.sortRank) {
        return situationA.sortRank - situationB.sortRank;
      }

      if (situationA.urgency.score !== situationB.urgency.score) {
        return situationB.urgency.score - situationA.urgency.score;
      }

      const priorityDifference = getPriorityRank(b) - getPriorityRank(a);
      if (priorityDifference !== 0) return priorityDifference;

      const dateA = getMiloSortTime(a, situationA);
      const dateB = getMiloSortTime(b, situationB);

      return dateA - dateB;
    });
}

export function getMiloRecommendedTasks(
  tasks: Task[],
  now: Date = new Date()
) {
  return sortTasksForMilo(tasks, now);
}

export function getTopMiloRecommendedTask(
  tasks: Task[],
  now: Date = new Date()
) {
  return getMiloRecommendedTasks(tasks, now)[0];
}

function getSituationCount(
  items: { task: Task; situation: MiloTaskSituation }[],
  kind: MiloSituationKind
) {
  return items.filter((item) => item.situation.kind === kind).length;
}

function pickStrongestSituation(
  items: { task: Task; situation: MiloTaskSituation }[]
) {
  return [...items]
    .filter((item) => item.situation.isActive)
    .sort((a, b) => {
      if (a.situation.heroRank !== b.situation.heroRank) {
        return a.situation.heroRank - b.situation.heroRank;
      }

      const dateA = getMiloSortTime(a.task, a.situation);
      const dateB = getMiloSortTime(b.task, b.situation);

      return dateA - dateB;
    })[0];
}

export function getHomeMiloSummary(
  tasks: Task[],
  now: Date = new Date()
): MiloHomeSummary {
  const todayKey = getDateKey(now);
  const todayItems = tasks.filter((task) => task.dueDate === todayKey);
  const pendingItems = tasks.filter((task) => task.status !== 'completed');
  const pendingTodayItems = pendingItems.filter((task) => task.dueDate === todayKey);
  const situationItems = pendingItems.map((task) => ({
    task,
    situation: getMiloSituationForTask(task, now),
  }));

  const overdue = getSituationCount(situationItems, 'overdue');
  const missed = getSituationCount(situationItems, 'missed');
  const happeningNow = getSituationCount(situationItems, 'happening_now');
  const startingSoon = getSituationCount(situationItems, 'starting_soon');
  const acceptedOverlap = getSituationCount(situationItems, 'accepted_overlap');
  const dueTonight = getSituationCount(situationItems, 'due_tonight');
  const dueTodaySituation = getSituationCount(situationItems, 'due_today');
  const highFocus = getSituationCount(situationItems, 'high_focus');
  const startEarly = getSituationCount(situationItems, 'start_early');
  const allDay = getSituationCount(situationItems, 'all_day');
  const dueToday = pendingTodayItems.length;
  const meetingSoon = situationItems.filter(
    (item) =>
      item.task.plannerType === 'meeting' &&
      item.situation.kind === 'starting_soon'
  ).length;
  const packedHighFocus = situationItems.filter((item) =>
    ['happening_now', 'starting_soon', 'accepted_overlap', 'high_focus'].includes(
      item.situation.kind
    )
  ).length;
  const packedDay = pendingTodayItems.length >= 4 || packedHighFocus >= 3;
  const strongestItem = pickStrongestSituation(situationItems);
  const strongestSituation: MiloHomeSituation = strongestItem
    ? {
        kind: strongestItem.situation.kind,
        label: strongestItem.situation.label,
        message: strongestItem.situation.message,
        heroRank: strongestItem.situation.heroRank,
        task: strongestItem.task,
      }
    : {
        kind: 'calm',
        label: situationCopy.calm.label,
        message: situationCopy.calm.message,
        heroRank: situationCopy.calm.heroRank,
      };

  return {
    tasksToday: todayItems.filter((task) => task.plannerType === 'task').length,
    meetingsToday: todayItems.filter((task) => task.plannerType === 'meeting').length,
    datesToday: todayItems.filter((task) => task.plannerType === 'date').length,
    doneToday: todayItems.filter((task) => task.status === 'completed').length,
    totalToday: todayItems.length,
    overdue,
    missed,
    happeningNow,
    startingSoon,
    acceptedOverlap,
    dueToday,
    dueTonight,
    highFocus,
    startEarly,
    allDay,
    meetingSoon,
    reminderCount:
      overdue +
      missed +
      happeningNow +
      startingSoon +
      acceptedOverlap +
      dueTodaySituation +
      dueTonight +
      allDay +
      highFocus,
    packedDay,
    strongestSituation,
  };
}
