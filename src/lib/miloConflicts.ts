import { MiloConflictInfo, PlannerType, Task } from '../types/task';

type ConflictDraft = {
  title: string;
  plannerType: PlannerType;
  dueDate?: string;
  dueTime?: string;
  location?: string;
  estimatedDurationMinutes?: number;
  conflictInfo?: MiloConflictInfo;
  conflictAccepted?: boolean;
};

const WHOLE_DAY_MINUTES = 24 * 60;
const CLOSE_CONFLICT_MINUTES = 30;

type CalendarConflictType =
  | 'same_time'
  | 'overlap'
  | 'ongoing_overlap'
  | 'soft_conflict'
  | 'accepted_overlap'
  | 'all_day_protected';

type CalendarConflictSeverity = 'calm' | 'soft' | 'strong';

type CalendarConflictMetadata = {
  calendarConflictType: CalendarConflictType;
  calendarConflictSeverity: CalendarConflictSeverity;
  calendarConflictLabel: string;
  calendarIsActiveWarning: boolean;
};

type MiloConflictWithCalendarMetadata = MiloConflictInfo &
  CalendarConflictMetadata;

function parseDateTime(dateKey?: string, timeValue?: string) {
  if (!dateKey || !timeValue) return null;

  const dateMatch = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeValue
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!dateMatch || !timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || '0');
  const meridian = timeMatch[3];

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridian) {
    if (hour < 1 || hour > 12) return null;
    if (meridian === 'AM' && hour === 12) hour = 0;
    if (meridian === 'PM' && hour !== 12) hour += 12;
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    minute
  );
}

function withCalendarMetadata(
  conflictInfo: MiloConflictInfo,
  metadata: CalendarConflictMetadata
): MiloConflictInfo {
  const conflictInfoWithMetadata: MiloConflictWithCalendarMetadata = {
    ...conflictInfo,
    ...metadata,
  };

  return conflictInfoWithMetadata;
}

function getWindow(item: ConflictDraft | Task) {
  const start = parseDateTime(item.dueDate, item.dueTime);
  if (!start) return null;

  const duration = item.estimatedDurationMinutes;
  if (!duration || duration <= 0) return null;

  const end = new Date(start.getTime() + duration * 60 * 1000);

  return { start, end, duration };
}

function formatTimeLabel(date?: Date | null) {
  if (!date) return undefined;

  let hour = date.getHours();
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  const meridian = hour >= 12 ? 'PM' : 'AM';

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${meridian}`;
}

function sameStartTime(draft: ConflictDraft, task: Task) {
  if (!draft.dueDate || !draft.dueTime || !task.dueDate || !task.dueTime) {
    return false;
  }

  const draftStart = parseDateTime(draft.dueDate, draft.dueTime);
  const taskStart = parseDateTime(task.dueDate, task.dueTime);

  if (!draftStart || !taskStart) return false;

  return draftStart.getTime() === taskStart.getTime();
}

function isWholeDay(item: ConflictDraft | Task) {
  return (item.estimatedDurationMinutes || 0) >= WHOLE_DAY_MINUTES;
}

function isMidnightTime(timeValue?: string) {
  if (!timeValue) return false;

  const parsed = parseDateTime('2000-01-01', timeValue);
  return Boolean(parsed && parsed.getHours() === 0 && parsed.getMinutes() === 0);
}

function looksLikeAllDayPlaceholder(item: ConflictDraft | Task) {
  const duration = item.estimatedDurationMinutes || 0;

  return (
    isWholeDay(item) ||
    (isMidnightTime(item.dueTime) && (duration <= 0 || duration >= WHOLE_DAY_MINUTES))
  );
}

function hasAcceptedConflict(item: ConflictDraft | Task) {
  return Boolean(
    item.conflictAccepted ||
      item.conflictInfo?.type === 'accepted_overlap' ||
      item.conflictInfo?.messageTone === 'accepted'
  );
}

function isAcceptedConflictForPair(
  draft: ConflictDraft,
  task: Task,
  draftTaskId?: string
) {
  const draftConflictingTaskId = draft.conflictInfo?.conflictingTaskId;

  if (hasAcceptedConflict(draft) && draftConflictingTaskId === task.id) {
    return true;
  }

  const taskConflictingTaskId = task.conflictInfo?.conflictingTaskId;

  return Boolean(
    draftTaskId &&
      hasAcceptedConflict(task) &&
      taskConflictingTaskId === draftTaskId
  );
}

function isOngoing(window: { start: Date; end: Date }, now: Date) {
  return (
    now.getTime() >= window.start.getTime() &&
    now.getTime() < window.end.getTime()
  );
}

function samePlace(a?: string, b?: string) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function fixedType(type: PlannerType) {
  return type === 'meeting' || type === 'date';
}

export function findMiloConflict(
  draft: ConflictDraft,
  tasks: Task[],
  ignoreTaskId?: string
): MiloConflictInfo | undefined {
  const now = new Date();
  const draftWindow = getWindow(draft);
  const draftStart = parseDateTime(draft.dueDate, draft.dueTime);
  const draftProtectedAllDay = looksLikeAllDayPlaceholder(draft);

  for (const task of tasks) {
    if (task.id === ignoreTaskId || task.status === 'completed') continue;

    const taskStart = parseDateTime(task.dueDate, task.dueTime);
    const taskProtectedAllDay = looksLikeAllDayPlaceholder(task);
    const acceptedConflict = isAcceptedConflictForPair(draft, task, ignoreTaskId);

    if (sameStartTime(draft, task) && !draftProtectedAllDay && !taskProtectedAllDay) {
      const baseConflict: MiloConflictInfo = {
        level: 'same_time',
        type: 'same_time',
        conflictingTaskId: task.id,
        conflictingTitle: task.title,
        conflictingTime: task.dueTime,
        conflictingStartTimeLabel: formatTimeLabel(taskStart) || task.dueTime,
        selectedTimeLabel: formatTimeLabel(draftStart) || draft.dueTime,
        message: `Milo noticed this shares ${task.dueTime || draft.dueTime} with ${task.title}.`,
        messageTone: 'careful',
      };

      if (acceptedConflict) {
        return withCalendarMetadata(
          {
            ...baseConflict,
            level: 'preparation',
            type: 'accepted_overlap',
            message: `Keep Both is on for ${task.title}. Milo will keep this calm and visible.`,
            messageTone: 'accepted',
          },
          {
            calendarConflictType: 'accepted_overlap',
            calendarConflictSeverity: 'calm',
            calendarConflictLabel: 'Keep Both',
            calendarIsActiveWarning: false,
          }
        );
      }

      return withCalendarMetadata(baseConflict, {
        calendarConflictType: 'same_time',
        calendarConflictSeverity: 'strong',
        calendarConflictLabel: 'Same time',
        calendarIsActiveWarning: true,
      });
    }

    const taskWindow = getWindow(task);

    if (draftWindow && taskWindow) {
      const overlaps =
        draftWindow.start.getTime() < taskWindow.end.getTime() &&
        draftWindow.end.getTime() > taskWindow.start.getTime();

      if (overlaps) {
        const allDayProtected = draftProtectedAllDay || taskProtectedAllDay;
        const ongoingOverlap =
          !allDayProtected && (isOngoing(draftWindow, now) || isOngoing(taskWindow, now));
        const baseConflict: MiloConflictInfo = {
          level: ongoingOverlap ? 'hard' : 'soft',
          type: ongoingOverlap ? 'ongoing_overlap' : 'soft_overlap',
          conflictingTaskId: task.id,
          conflictingTitle: task.title,
          conflictingTime: task.dueTime,
          conflictingStartTimeLabel: formatTimeLabel(taskWindow.start) || task.dueTime,
          conflictingEndTimeLabel: formatTimeLabel(taskWindow.end),
          selectedTimeLabel: formatTimeLabel(draftWindow.start) || draft.dueTime,
          message: ongoingOverlap
            ? `Heads up: ${draft.dueTime || 'this time'} overlaps with ${task.title}.`
            : `Milo noticed this overlaps with ${task.title}. You can keep both with a gentle buffer.`,
          messageTone: 'careful',
        };

        if (acceptedConflict) {
          return withCalendarMetadata(
            {
              ...baseConflict,
              level: 'preparation',
              type: 'accepted_overlap',
              message: `Keep Both is on for ${task.title}. Milo will keep both plans visible.`,
              messageTone: 'accepted',
            },
            {
              calendarConflictType: 'accepted_overlap',
              calendarConflictSeverity: 'calm',
              calendarConflictLabel: 'Keep Both',
              calendarIsActiveWarning: false,
            }
          );
        }

        if (allDayProtected) {
          return withCalendarMetadata(
            {
              ...baseConflict,
              level: 'preparation',
              type: 'whole_day',
              message: `Milo sees ${task.title} as an all-day plan, so this is protected from urgent overlap warnings.`,
              messageTone: 'calm',
            },
            {
              calendarConflictType: 'all_day_protected',
              calendarConflictSeverity: 'calm',
              calendarConflictLabel: 'All day',
              calendarIsActiveWarning: false,
            }
          );
        }

        return withCalendarMetadata(baseConflict, {
          calendarConflictType: ongoingOverlap ? 'ongoing_overlap' : 'overlap',
          calendarConflictSeverity: ongoingOverlap ? 'strong' : 'soft',
          calendarConflictLabel: ongoingOverlap ? 'Ongoing overlap' : 'Overlap',
          calendarIsActiveWarning: true,
        });
      }

      const gapBefore = draftWindow.start.getTime() - taskWindow.end.getTime();
      const gapAfter = taskWindow.start.getTime() - draftWindow.end.getTime();
      const smallestGap = Math.min(
        gapBefore >= 0 ? gapBefore : Number.MAX_SAFE_INTEGER,
        gapAfter >= 0 ? gapAfter : Number.MAX_SAFE_INTEGER
      );
      const closeMs = CLOSE_CONFLICT_MINUTES * 60 * 1000;

      if (
        smallestGap > 0 &&
        smallestGap <= closeMs &&
        !draftProtectedAllDay &&
        !taskProtectedAllDay &&
        (fixedType(draft.plannerType) ||
          fixedType(task.plannerType) ||
          !samePlace(draft.location, task.location))
      ) {
        const baseConflict: MiloConflictInfo = {
          level: 'soft',
          type: 'soft_overlap',
          conflictingTaskId: task.id,
          conflictingTitle: task.title,
          conflictingTime: task.dueTime,
          conflictingStartTimeLabel: formatTimeLabel(taskWindow.start) || task.dueTime,
          conflictingEndTimeLabel: formatTimeLabel(taskWindow.end),
          selectedTimeLabel: formatTimeLabel(draftWindow.start) || draft.dueTime,
          message: `Milo noticed this is very close to ${task.title}. A little buffer may help.`,
          messageTone: 'careful',
        };

        if (acceptedConflict) {
          return withCalendarMetadata(
            {
              ...baseConflict,
              level: 'preparation',
              type: 'accepted_overlap',
              message: `Keep Both is on near ${task.title}. Milo will keep the buffer calm.`,
              messageTone: 'accepted',
            },
            {
              calendarConflictType: 'accepted_overlap',
              calendarConflictSeverity: 'calm',
              calendarConflictLabel: 'Keep Both',
              calendarIsActiveWarning: false,
            }
          );
        }

        return withCalendarMetadata(baseConflict, {
          calendarConflictType: 'soft_conflict',
          calendarConflictSeverity: 'soft',
          calendarConflictLabel: 'Soft conflict',
          calendarIsActiveWarning: true,
        });
      }
    }
  }

  const duration = draft.estimatedDurationMinutes || 0;

  if (
    (draft.plannerType === 'meeting' || draft.plannerType === 'date') &&
    duration >= 90
  ) {
    return {
      level: 'preparation',
      message: 'Milo noticed this may need preparation time before it starts.',
      messageTone: 'calm',
    };
  }

  return undefined;
}

export function moveDraftTime(
  dueDate: string,
  dueTime: string,
  direction: 'earlier' | 'later',
  estimatedDurationMinutes?: number
) {
  const date = parseDateTime(dueDate, dueTime);
  if (!date) return dueTime;

  const minutes = estimatedDurationMinutes || 60;
  const next = new Date(
    date.getTime() + (direction === 'later' ? minutes : -minutes) * 60 * 1000
  );
  let hour = next.getHours();
  const minute = `${next.getMinutes()}`.padStart(2, '0');
  const meridian = hour >= 12 ? 'PM' : 'AM';

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${meridian}`;
}
