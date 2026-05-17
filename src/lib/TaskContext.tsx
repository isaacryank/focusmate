import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  PlannerType,
  ReminderOption,
  Subtask,
  Task,
  TaskPriority,
  MiloConflictInfo,
  MiloSmartNudge,
  MiloSmartPlanStep,
  MiloUrgencyLevel,
} from '../types/task';
import { cancelPlannerReminder } from './notificationUtils';

const TASKS_STORAGE_KEY = '@focusmate/tasks';

export type SupabaseTaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: string | null;
  priority: string | null;
  due_date: string | null;
  due_time: string | null;
  estimated_duration_minutes: number | null;
  location_name: string | null;
  reminder_enabled: boolean | null;
  reminder_minutes_before: number | null;
  custom_reminder_minutes: number | null;
  completed: boolean | null;
  completed_at: string | null;
  conflict_accepted: boolean | null;
  conflict_info: unknown | null;
  milo_urgency: string | null;
  milo_note: string | null;
  local_created_at: string | null;
  local_updated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  local_id: string | null;
  milo_smart_plan: unknown | null;
  milo_smart_nudges: unknown | null;
  subtasks: unknown | null;
  conflict_with_title: string | null;
  conflict_with_time: string | null;
  conflict_level: string | null;
};

export type SupabaseTaskUpsertRow = Omit<
  SupabaseTaskRow,
  'id' | 'created_at' | 'updated_at'
> &
  Partial<Pick<SupabaseTaskRow, 'id' | 'created_at' | 'updated_at'>>;

function stringOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function normalizePlannerType(value?: string | null): PlannerType {
  if (value === 'meeting' || value === 'date' || value === 'task') {
    return value;
  }

  return 'task';
}

function normalizePriority(value?: string | null): TaskPriority {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  return 'medium';
}

function normalizeMiloUrgency(value?: string | null): MiloUrgencyLevel | undefined {
  if (
    value === 'calm' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'done'
  ) {
    return value;
  }

  return undefined;
}

function normalizeConflictLevel(
  value?: string | null
): MiloConflictInfo['level'] | undefined {
  if (
    value === 'hard' ||
    value === 'soft' ||
    value === 'same_time' ||
    value === 'preparation'
  ) {
    return value;
  }

  return undefined;
}

function normalizeConflictInfo(value: unknown): MiloConflictInfo | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as MiloConflictInfo;
}

export function reminderToMinutes(
  reminder?: ReminderOption,
  manualReminderMinutes?: number
) {
  switch (reminder) {
    case 'atTime':
      return 0;
    case '10min':
      return 10;
    case '30min':
      return 30;
    case '1hour':
      return 60;
    case '1day':
      return 1440;
    case 'custom':
      return numberOrNull(manualReminderMinutes);
    case 'none':
    default:
      return null;
  }
}

export function minutesToReminder(
  minutes?: number | null,
  customReminderMinutes?: number | null
): ReminderOption {
  if (numberOrNull(customReminderMinutes) !== null) {
    return 'custom';
  }

  switch (minutes) {
    case 0:
      return 'atTime';
    case 10:
      return '10min';
    case 30:
      return '30min';
    case 60:
      return '1hour';
    case 1440:
      return '1day';
    case null:
    case undefined:
      return 'none';
    default:
      return 'custom';
  }
}

function getManualReminderMinutes(
  reminder: ReminderOption,
  reminderMinutesBefore?: number | null,
  customReminderMinutes?: number | null
) {
  if (reminder !== 'custom') {
    return undefined;
  }

  return optionalNumber(customReminderMinutes) ?? optionalNumber(reminderMinutesBefore);
}

export function taskToSupabaseRow(
  task: Task,
  userId: string
): SupabaseTaskUpsertRow {
  const reminder = task.reminder || 'none';
  const reminderMinutesBefore =
    reminder === 'none'
      ? null
      : reminderToMinutes(reminder, task.manualReminderMinutes);
  const localCreatedAt = task.createdAt || null;

  return {
    user_id: userId,
    title: task.title.trim() || 'Untitled item',
    description: stringOrNull(task.description),
    type: task.plannerType,
    priority: task.priority,
    due_date: stringOrNull(task.dueDate),
    due_time: stringOrNull(task.dueTime),
    estimated_duration_minutes: numberOrNull(task.estimatedDurationMinutes),
    location_name: stringOrNull(task.location),
    reminder_enabled: reminder !== 'none',
    reminder_minutes_before: reminderMinutesBefore,
    custom_reminder_minutes:
      reminder === 'custom' ? numberOrNull(task.manualReminderMinutes) : null,
    completed: task.status === 'completed',
    completed_at: null,
    conflict_accepted: Boolean(task.conflictAccepted),
    conflict_info: task.conflictInfo ?? null,
    milo_urgency: task.miloUrgency ?? null,
    milo_note: null,
    local_created_at: localCreatedAt,
    local_updated_at: localCreatedAt,
    local_id: task.id,
    milo_smart_plan: task.miloSmartPlan ?? null,
    milo_smart_nudges: task.miloSmartNudges ?? null,
    subtasks: task.subtasks ?? null,
    conflict_with_title: stringOrNull(task.conflictWithTitle),
    conflict_with_time: stringOrNull(task.conflictWithTime),
    conflict_level: task.conflictLevel ?? null,
  };
}

export function supabaseRowToTask(row: SupabaseTaskRow): Task {
  const reminder = row.reminder_enabled
    ? minutesToReminder(row.reminder_minutes_before, row.custom_reminder_minutes)
    : 'none';
  const smartPlan = optionalArray<MiloSmartPlanStep>(row.milo_smart_plan);
  const smartNudges = optionalArray<MiloSmartNudge>(row.milo_smart_nudges);
  const subtasks = optionalArray<Subtask>(row.subtasks);

  return {
    id: row.local_id || row.id,
    title: row.title || 'Untitled item',
    description: row.description || '',
    dueDate: row.due_date || '',
    dueTime: row.due_time || '',
    location: row.location_name || '',
    reminder,
    manualReminderMinutes: getManualReminderMinutes(
      reminder,
      row.reminder_minutes_before,
      row.custom_reminder_minutes
    ),
    plannerType: normalizePlannerType(row.type),
    priority: normalizePriority(row.priority),
    estimatedDurationMinutes: optionalNumber(row.estimated_duration_minutes),
    miloUrgency: normalizeMiloUrgency(row.milo_urgency),
    miloSmartPlan: smartPlan,
    miloSmartNudges: smartNudges,
    conflictInfo: normalizeConflictInfo(row.conflict_info),
    conflictAccepted: Boolean(row.conflict_accepted),
    conflictWithTitle: row.conflict_with_title || undefined,
    conflictWithTime: row.conflict_with_time || undefined,
    conflictLevel: normalizeConflictLevel(row.conflict_level),
    status: row.completed ? 'completed' : 'pending',
    subtasks: subtasks || [],
    createdAt: row.local_created_at || row.created_at || new Date().toISOString(),
  };
}

type AddTaskInput = {
  id?: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  location?: string;
  reminder?: ReminderOption;
  notificationId?: string;
  manualReminderMinutes?: number;
  plannerType?: PlannerType;
  priority: TaskPriority;
  estimatedDurationMinutes?: number;
  miloUrgency?: MiloUrgencyLevel;
  miloSmartPlan?: MiloSmartPlanStep[];
  miloSmartNudges?: MiloSmartNudge[];
  conflictInfo?: MiloConflictInfo;
  conflictAccepted?: boolean;
  conflictWithTitle?: string;
  conflictWithTime?: string;
  conflictLevel?: MiloConflictInfo['level'];
  subtasks?: Subtask[];
};

type UpdateTaskInput = Partial<{
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  location?: string;
  reminder?: ReminderOption;
  notificationId?: string;
  manualReminderMinutes?: number;
  plannerType?: PlannerType;
  priority: TaskPriority;
  estimatedDurationMinutes?: number;
  miloUrgency?: MiloUrgencyLevel;
  miloSmartPlan?: MiloSmartPlanStep[];
  miloSmartNudges?: MiloSmartNudge[];
  conflictInfo?: MiloConflictInfo;
  conflictAccepted?: boolean;
  conflictWithTitle?: string;
  conflictWithTime?: string;
  conflictLevel?: MiloConflictInfo['level'];
  subtasks?: Subtask[];
}>;

type TaskContextType = {
  tasks: Task[];
  isLoadingTasks: boolean;
  addTask: (task: AddTaskInput) => void;
  updateTask: (id: string, updates: UpdateTaskInput) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearAllTasks: () => Promise<void>;
};

const TaskContext = createContext<TaskContextType | undefined>(undefined);

const starterTasks: Task[] = [
  {
    id: '1',
    title: 'Prepare FYP proposal outline',
    description: 'Draft the main idea, objectives, and scope.',
    dueDate: '2026-05-10',
    dueTime: '10:00 AM',
    location: 'Library',
    reminder: '30min',
    plannerType: 'task',
    priority: 'high',
    status: 'pending',
    subtasks: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Supervisor meeting',
    description: 'Discuss FocusMate app scope and AI companion module.',
    dueDate: '2026-05-12',
    dueTime: '2:30 PM',
    location: 'Faculty office',
    reminder: '1hour',
    plannerType: 'meeting',
    priority: 'high',
    status: 'pending',
    subtasks: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    title: 'Friend meetup',
    description: 'Dinner meetup reminder.',
    dueDate: '2026-05-15',
    dueTime: '8:00 PM',
    location: 'Cafe',
    reminder: '1day',
    plannerType: 'date',
    priority: 'medium',
    status: 'pending',
    subtasks: [],
    createdAt: new Date().toISOString(),
  },
];

function normalizeTask(task: any): Task {
  return {
    id: task.id || Date.now().toString(),
    title: task.title || 'Untitled item',
    description: task.description || '',
    dueDate: task.dueDate || '',
    dueTime: task.dueTime || '',
    location: task.location || '',
    reminder: task.reminder || 'none',
    notificationId: task.notificationId,
    manualReminderMinutes: task.manualReminderMinutes,
    plannerType: task.plannerType || 'task',
    priority: task.priority || 'medium',
    estimatedDurationMinutes: task.estimatedDurationMinutes,
    miloUrgency: task.miloUrgency,
    miloSmartPlan: Array.isArray(task.miloSmartPlan) ? task.miloSmartPlan : undefined,
    miloSmartNudges: Array.isArray(task.miloSmartNudges) ? task.miloSmartNudges : undefined,
    conflictInfo: task.conflictInfo,
    conflictAccepted: Boolean(task.conflictAccepted),
    conflictWithTitle: task.conflictWithTitle,
    conflictWithTime: task.conflictWithTime,
    conflictLevel: task.conflictLevel,
    status: task.status || 'pending',
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    createdAt: task.createdAt || new Date().toISOString(),
  };
}

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (!hasLoadedTasks) return;
    saveTasks(tasks);
  }, [tasks, hasLoadedTasks]);

  const loadTasks = async () => {
    try {
      const storedTasks = await AsyncStorage.getItem(TASKS_STORAGE_KEY);

      if (storedTasks) {
        const parsedTasks = JSON.parse(storedTasks);
        setTasks(parsedTasks.map(normalizeTask));
      } else {
        setTasks(starterTasks);
      }
    } catch (error) {
      console.log('Failed to load tasks:', error);
      setTasks(starterTasks);
    } finally {
      setIsLoadingTasks(false);
      setHasLoadedTasks(true);
    }
  };

  const saveTasks = async (nextTasks: Task[]) => {
    try {
      await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks));
    } catch (error) {
      console.log('Failed to save tasks:', error);
    }
  };

  const addTask = (task: AddTaskInput) => {
    const newTask: Task = {
      id: task.id || Date.now().toString(),
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      location: task.location,
      reminder: task.reminder || 'none',
      notificationId: task.notificationId,
      manualReminderMinutes: task.manualReminderMinutes,
      plannerType: task.plannerType || 'task',
      priority: task.priority,
      estimatedDurationMinutes: task.estimatedDurationMinutes,
      miloUrgency: task.miloUrgency,
      miloSmartPlan: task.miloSmartPlan,
      miloSmartNudges: task.miloSmartNudges,
      conflictInfo: task.conflictInfo,
      conflictAccepted: task.conflictAccepted,
      conflictWithTitle: task.conflictWithTitle,
      conflictWithTime: task.conflictWithTime,
      conflictLevel: task.conflictLevel,
      status: 'pending',
      subtasks: task.subtasks || [],
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [newTask, ...current]);
  };

  const updateTask = async (id: string, updates: UpdateTaskInput) => {
    const existingTask = tasks.find((task) => task.id === id);

    const isNotificationUpdate = Object.prototype.hasOwnProperty.call(
      updates,
      'notificationId'
    );

    if (
      isNotificationUpdate &&
      existingTask?.notificationId &&
      existingTask.notificationId !== updates.notificationId
    ) {
      await cancelPlannerReminder(existingTask.notificationId);
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              ...updates,
            }
          : task
      )
    );
  };

  const toggleTask = async (id: string) => {
    const existingTask = tasks.find((task) => task.id === id);
    const isMarkingDone = existingTask?.status === 'pending';

    if (isMarkingDone && existingTask?.notificationId) {
      await cancelPlannerReminder(existingTask.notificationId);
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              status: task.status === 'completed' ? 'pending' : 'completed',
              notificationId:
                task.status === 'pending' ? undefined : task.notificationId,
            }
          : task
      )
    );
  };

  const deleteTask = async (id: string) => {
    const taskToDelete = tasks.find((task) => task.id === id);

    if (taskToDelete?.notificationId) {
      await cancelPlannerReminder(taskToDelete.notificationId);
    }

    setTasks((current) => current.filter((task) => task.id !== id));
  };

  const clearAllTasks = async () => {
    for (const task of tasks) {
      if (task.notificationId) {
        await cancelPlannerReminder(task.notificationId);
      }
    }

    setTasks([]);
    await AsyncStorage.removeItem(TASKS_STORAGE_KEY);
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        isLoadingTasks,
        addTask,
        updateTask,
        toggleTask,
        deleteTask,
        clearAllTasks,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TaskContext);

  if (!context) {
    throw new Error('useTasks must be used inside TaskProvider');
  }

  return context;
}
