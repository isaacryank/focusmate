import { Task } from '../types/task';

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
    (task) =>
      task.status === 'pending' &&
      Boolean(task.dueDate) &&
      task.dueDate! < todayDate
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
      message: `You have ${stats.overdue.length} overdue item(s). Do not panic. Let us fix one small thing first.`,
      tagline: 'Small steps beat stress.',
      primaryActionLabel: 'Review Tasks',
      primaryActionTarget: 'Tasks',
    };
  }

  if (stats.pending.length >= 5) {
    return {
      mood: 'focused',
      title: 'Milo is focused',
      message: `You have ${stats.pending.length} pending item(s). I suggest starting with the most important one.`,
      tagline: 'Focus on one task at a time.',
      primaryActionLabel: 'Start Focus',
      primaryActionTarget: 'FocusSession',
    };
  }

  if (stats.today.length > 0) {
    return {
      mood: 'waving',
      title: 'Milo is ready',
      message: `You have ${stats.today.length} planner item(s) today. I will help you stay on track.`,
      tagline: 'Today has a plan.',
      primaryActionLabel: 'View Today',
      primaryActionTarget: 'TodayPlan',
    };
  }

  if (stats.pending.length > 0) {
    return {
      mood: 'focused',
      title: 'Milo found your next step',
      message: `You have ${stats.pending.length} pending item(s). Pick one and let Milo break it down.`,
      tagline: 'A clear plan feels lighter.',
      primaryActionLabel: 'Open Tasks',
      primaryActionTarget: 'Tasks',
    };
  }

  if (stats.completed.length > 0 || totalFocusMinutes > 0) {
    return {
      mood: 'celebrating',
      title: 'Milo is proud',
      message: 'Nice work. Your planner is clear right now. Take a short break or plan your next goal.',
      tagline: 'Progress deserves celebration.',
      primaryActionLabel: 'View Analytics',
      primaryActionTarget: 'Analytics',
    };
  }

  return {
    mood: 'happy',
    title: 'Milo is waiting',
    message: 'Add your first task, meeting, or important date. Milo will help you manage it.',
    tagline: 'Let us make your first plan.',
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
      return 'It is okay. We will handle this slowly, one step at a time.';
    case 'focused':
      return 'Let us protect your focus. Start small and keep going.';
    case 'celebrating':
      return 'You did well. Milo is proud of your progress.';
    case 'waving':
      return 'I am here with you. Let us make today easier.';
    case 'sleepy':
      return 'Rest is part of productivity too.';
    case 'happy':
      return 'Planning feels better when we do it together.';
    case 'idle':
    default:
      return 'Milo is ready whenever you are.';
  }
}

export function getMiloRecommendedTasks(tasks: Task[], limit: number = 3) {
  const todayDate = getTodayDate();

  return [...tasks]
    .filter((task) => task.status === 'pending')
    .sort((a, b) => {
      const overdueA = a.dueDate && a.dueDate < todayDate ? 0 : 1;
      const overdueB = b.dueDate && b.dueDate < todayDate ? 0 : 1;

      if (overdueA !== overdueB) {
        return overdueA - overdueB;
      }

      const priorityA = a.priority === 'high' ? 0 : a.priority === 'medium' ? 1 : 2;
      const priorityB = b.priority === 'high' ? 0 : b.priority === 'medium' ? 1 : 2;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const dateA = `${a.dueDate || '9999-99-99'} ${a.dueTime || ''}`;
      const dateB = `${b.dueDate || '9999-99-99'} ${b.dueTime || ''}`;

      return dateA.localeCompare(dateB);
    })
    .slice(0, limit);
}