import { Task } from '../types/task';
import { parseMiloTaskDateTime } from './miloSituationIntelligence';

export type PlannerTypeFilter =
  | Task['plannerType']
  | 'focus_without_task'
  | 'all';
export type PlannerTimingSort = 'overdue' | 'today' | 'upcoming' | 'newest' | 'oldest';
export type PlannerTimingBucket = 'overdue' | 'today' | 'upcoming' | 'unscheduled';

export const plannerTypeFilters: { value: PlannerTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'task', label: 'Task' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'date', label: 'Date' },
];

export const sessionTypeFilters: { value: PlannerTypeFilter; label: string }[] = [
  ...plannerTypeFilters,
  { value: 'focus_without_task', label: 'No task' },
];

export const plannerTimingSorts: {
  value: PlannerTimingSort;
  label: string;
}[] = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
];

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getTaskTimingBucket(
  task: Pick<Task, 'dueDate' | 'dueTime'>,
  now: Date = new Date()
): PlannerTimingBucket {
  if (!task.dueDate) {
    return 'unscheduled';
  }

  const todayKey = getLocalDateKey(now);

  if (task.dueDate < todayKey) {
    return 'overdue';
  }

  if (task.dueDate > todayKey) {
    return 'upcoming';
  }

  if (!task.dueTime) {
    return 'today';
  }

  const dueAt = parseMiloTaskDateTime(task as Task);

  if (dueAt && dueAt.getTime() < now.getTime()) {
    return 'overdue';
  }

  return 'today';
}

export function getTaskSortTime(task: Pick<Task, 'dueDate' | 'dueTime'>) {
  const dueAt = parseMiloTaskDateTime(task as Task, { fallbackEndOfDay: true });

  return dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

export function filterTasksByPlannerType<T extends Pick<Task, 'plannerType'>>(
  items: T[],
  typeFilter: PlannerTypeFilter
) {
  if (typeFilter === 'all') {
    return items;
  }

  if (typeFilter === 'focus_without_task') {
    return [];
  }

  return items.filter((item) => item.plannerType === typeFilter);
}

export function sortTasksByTiming<T extends Pick<Task, 'dueDate' | 'dueTime'>>(
  items: T[],
  sortMode: PlannerTimingSort,
  now: Date = new Date()
) {
  if (sortMode === 'newest' || sortMode === 'oldest') {
    return items;
  }

  return items
    .filter((item) => getTaskTimingBucket(item, now) === sortMode)
    .sort((first, second) => getTaskSortTime(first) - getTaskSortTime(second));
}
