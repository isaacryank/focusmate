import { MiloConflictInfo, PlannerType, Task } from '../types/task';

type ConflictDraft = {
  title: string;
  plannerType: PlannerType;
  dueDate?: string;
  dueTime?: string;
  location?: string;
  estimatedDurationMinutes?: number;
};

const WHOLE_DAY_MINUTES = 24 * 60;

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

  if (meridian === 'AM' && hour === 12) hour = 0;
  if (meridian === 'PM' && hour !== 12) hour += 12;

  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    minute
  );
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
  const draftWindow = getWindow(draft);
  const draftStart = parseDateTime(draft.dueDate, draft.dueTime);

  for (const task of tasks) {
    if (task.id === ignoreTaskId || task.status === 'completed') continue;

    const taskStart = parseDateTime(task.dueDate, task.dueTime);

    if (sameStartTime(draft, task)) {
      return {
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
    }

    const taskWindow = getWindow(task);

    if (draftWindow && taskWindow) {
      const overlaps =
        draftWindow.start.getTime() < taskWindow.end.getTime() &&
        draftWindow.end.getTime() > taskWindow.start.getTime();

      if (overlaps) {
        const wholeDayConflict = isWholeDay(draft) || isWholeDay(task);
        const level = wholeDayConflict ? 'soft' : 'hard';
        const type = wholeDayConflict ? 'whole_day' : 'ongoing_overlap';
        const message = wholeDayConflict
          ? `This is during ${task.title}. Want to keep both?`
          : `Heads up: ${draft.dueTime || 'this time'} overlaps with ${task.title}.`;

        return {
          level,
          type,
          conflictingTaskId: task.id,
          conflictingTitle: task.title,
          conflictingTime: task.dueTime,
          conflictingStartTimeLabel: formatTimeLabel(taskWindow.start) || task.dueTime,
          conflictingEndTimeLabel: formatTimeLabel(taskWindow.end),
          selectedTimeLabel: formatTimeLabel(draftWindow.start) || draft.dueTime,
          message,
          messageTone: 'careful',
        };
      }

      const gapBefore = draftWindow.start.getTime() - taskWindow.end.getTime();
      const gapAfter = taskWindow.start.getTime() - draftWindow.end.getTime();
      const smallestGap = Math.min(
        gapBefore >= 0 ? gapBefore : Number.MAX_SAFE_INTEGER,
        gapAfter >= 0 ? gapAfter : Number.MAX_SAFE_INTEGER
      );
      const closeMs = 30 * 60 * 1000;

      if (
        smallestGap > 0 &&
        smallestGap <= closeMs &&
        (fixedType(draft.plannerType) ||
          fixedType(task.plannerType) ||
          !samePlace(draft.location, task.location))
      ) {
        return {
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
