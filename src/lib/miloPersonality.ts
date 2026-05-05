import { Task } from '../types/task';
import { compareTasksByUrgency, getTaskUrgency } from './taskUrgency';

export type MiloMood =
  | 'idle'
  | 'happy'
  | 'focused'
  | 'worried'
  | 'waving'
  | 'sleepy'
  | 'celebrating';

export type MiloState = {
  mood: MiloMood;
  title: string;
  message: string;
  tagline: string;
  primaryActionLabel: string;
  primaryActionTarget:
    | 'AddTask'
    | 'TodayPlan'
    | 'Tasks'
    | 'FocusSession'
    | 'ReminderCenter'
    | 'Analytics';
};

export type MiloPlannerStats = {
  total: number;
  pending: Task[];
  completed: Task[];
  today: Task[];
  overdue: Task[];
  highPriority: Task[];
  meetings: Task[];
};

export function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getMiloPlannerStats(tasks: Task[]): MiloPlannerStats {
  const todayDate = getTodayDate();

  const pending = tasks.filter((task) => task.status === 'pending');
  const completed = tasks.filter((task) => task.status === 'completed');

  const today = tasks.filter((task) => task.dueDate === todayDate);

  const overdue = tasks.filter(
    (task) => getTaskUrgency(task).level === 'overdue'
  );

  const highPriority = tasks.filter(
    (task) => task.status === 'pending' && task.priority === 'high'
  );

  const meetings = tasks.filter(
    (task) => task.status === 'pending' && task.plannerType === 'meeting'
  );

  return {
    total: tasks.length,
    pending,
    completed,
    today,
    overdue,
    highPriority,
    meetings,
  };
}

export function getMiloState(
  tasks: Task[],
  totalFocusMinutes: number = 0
): MiloState {
  const stats = getMiloPlannerStats(tasks);

  if (stats.overdue.length > 0) {
    return {
      mood: 'worried',
      title: 'Milo is worried',
      message: `${stats.overdue.length} item(s) need care.`,
      tagline: 'One step at a time.',
      primaryActionLabel: 'Review Tasks',
      primaryActionTarget: 'Tasks',
    };
  }

  if (stats.pending.length >= 5) {
    return {
      mood: 'focused',
      title: 'Milo found your next step',
      message: `${stats.pending.length} items need attention.`,
      tagline: 'One step at a time.',
      primaryActionLabel: 'Open Tasks',
      primaryActionTarget: 'Tasks',
    };
  }

  if (stats.today.length > 0) {
    return {
      mood: 'waving',
      title: 'Milo is ready',
      message: `${stats.today.length} item(s) today.`,
      tagline: 'Milo will remind you.',
      primaryActionLabel: 'View Today',
      primaryActionTarget: 'TodayPlan',
    };
  }

  if (stats.pending.length > 0) {
    return {
      mood: 'focused',
      title: 'Milo found your next step',
      message: `${stats.pending.length} items need attention.`,
      tagline: 'One step at a time.',
      primaryActionLabel: 'Open Tasks',
      primaryActionTarget: 'Tasks',
    };
  }

  if (stats.completed.length > 0 || totalFocusMinutes > 0) {
    return {
      mood: 'celebrating',
      title: 'Milo is proud',
      message: 'Your planner is clear.',
      tagline: 'Nice work.',
      primaryActionLabel: 'View Analytics',
      primaryActionTarget: 'Analytics',
    };
  }

  return {
    mood: 'happy',
    title: 'Milo is waiting',
    message: 'Add something when you are ready.',
    tagline: 'Milo will remember.',
    primaryActionLabel: 'Create Item',
    primaryActionTarget: 'AddTask',
  };
}

export function getMiloMoodLabel(mood: MiloMood) {
  switch (mood) {
    case 'happy':
      return 'Happy';
    case 'focused':
      return 'Focused';
    case 'worried':
      return 'Worried';
    case 'waving':
      return 'Ready';
    case 'sleepy':
      return 'Resting';
    case 'celebrating':
      return 'Celebrating';
    case 'idle':
    default:
      return 'Calm';
  }
}

export function getMiloEncouragement(mood: MiloMood) {
  switch (mood) {
    case 'worried':
      return 'It is okay. One step at a time.';
    case 'focused':
      return 'Start small and keep going.';
    case 'celebrating':
      return 'You did well. Milo is proud.';
    case 'waving':
      return 'Milo is here with you.';
    case 'sleepy':
      return 'Rest is part of productivity too.';
    case 'happy':
      return 'Milo can help you plan.';
    case 'idle':
    default:
      return 'Milo is ready whenever you are.';
  }
}

export function getMiloRecommendedTasks(tasks: Task[], limit: number = 3) {
  return [...tasks]
    .filter((task) => task.status === 'pending')
    .sort(compareTasksByUrgency)
    .slice(0, limit);
}
