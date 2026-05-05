import { Task } from '../types/task';

export type DynamicUrgencyLevel =
  | 'done'
  | 'overdue'
  | 'urgent'
  | 'high'
  | 'medium'
  | 'low'
  | 'none';

export type TaskUrgency = {
  level: DynamicUrgencyLevel;
  label: string;
  score: number;
  daysUntilDue?: number;
  colorKey: 'success' | 'danger' | 'yellow' | 'primary' | 'blue' | 'muted';
  reminderTone: 'none' | 'gentle' | 'steady' | 'strong' | 'urgent';
  startEarlyMessage: string;
};

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey?: string) {
  if (!dateKey) return null;

  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function getDaysUntilDue(dueDate?: string, now: Date = new Date()) {
  const due = parseDateKey(dueDate);
  if (!due) return undefined;

  const today = parseDateKey(getDateKey(now));
  if (!today) return undefined;

  const msPerDay = 24 * 60 * 60 * 1000;

  return Math.round((due.getTime() - today.getTime()) / msPerDay);
}

export function getTaskUrgency(task: Task, now: Date = new Date()): TaskUrgency {
  if (task.status === 'completed') {
    return {
      level: 'done',
      label: 'Done',
      score: 0,
      colorKey: 'success',
      reminderTone: 'none',
      startEarlyMessage: 'This is complete. Milo is proud of you.',
    };
  }

  const daysUntilDue = getDaysUntilDue(task.dueDate, now);

  if (daysUntilDue === undefined) {
    return {
      level: 'none',
      label: 'On Track',
      score: 10,
      colorKey: 'muted',
      reminderTone: 'gentle',
      startEarlyMessage: 'Add a due date when you want Milo to pace this with you.',
    };
  }

  if (daysUntilDue < 0) {
    return {
      level: 'overdue',
      label: 'Overdue',
      score: 100,
      daysUntilDue,
      colorKey: 'danger',
      reminderTone: 'urgent',
      startEarlyMessage: 'Milo suggests one small recovery step now.',
    };
  }

  if (daysUntilDue === 0) {
    return {
      level: 'urgent',
      label: 'Due Today',
      score: 90,
      daysUntilDue,
      colorKey: 'danger',
      reminderTone: 'urgent',
      startEarlyMessage: 'Milo suggests starting now and keeping the next step small.',
    };
  }

  if (daysUntilDue <= 2) {
    return {
      level: 'high',
      label: 'Due Soon',
      score: 75,
      daysUntilDue,
      colorKey: 'yellow',
      reminderTone: 'strong',
      startEarlyMessage: 'Milo suggests a focused session today before it gets tight.',
    };
  }

  if (daysUntilDue <= 7) {
    return {
      level: 'medium',
      label: 'Start Early',
      score: 50,
      daysUntilDue,
      colorKey: 'primary',
      reminderTone: 'steady',
      startEarlyMessage: 'Milo suggests making an early draft or checklist this week.',
    };
  }

  return {
    level: 'low',
    label: 'On Track',
    score: 20,
    daysUntilDue,
    colorKey: 'blue',
    reminderTone: 'gentle',
    startEarlyMessage: 'Milo can nudge you gently so this does not become last-minute.',
  };
}

export function compareTasksByUrgency(a: Task, b: Task) {
  const urgencyA = getTaskUrgency(a);
  const urgencyB = getTaskUrgency(b);

  if (urgencyA.score !== urgencyB.score) {
    return urgencyB.score - urgencyA.score;
  }

  const priorityA = a.priority === 'high' ? 3 : a.priority === 'medium' ? 2 : 1;
  const priorityB = b.priority === 'high' ? 3 : b.priority === 'medium' ? 2 : 1;

  if (priorityA !== priorityB) {
    return priorityB - priorityA;
  }

  const dateA = `${a.dueDate || '9999-99-99'} ${a.dueTime || ''}`;
  const dateB = `${b.dueDate || '9999-99-99'} ${b.dueTime || ''}`;

  return dateA.localeCompare(dateB);
}
