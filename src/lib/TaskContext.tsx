import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
import { useAuth } from './AuthContext';
import { supabase } from './supabase';

const ANONYMOUS_TASKS_STORAGE_KEY = '@focusmate/tasks/anonymous';
const TASK_CONTEXT_LOG_PREFIX = '[TaskContext]';

const getTasksStorageKey = (userId?: string | null) =>
  userId ? `@focusmate/tasks/user:${userId}` : ANONYMOUS_TASKS_STORAGE_KEY;

type StoredTask = Task & {
  localOnly?: boolean;
};

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

type AddTaskOptions = {
  syncToSupabase?: boolean;
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
  addTask: (task: AddTaskInput, options?: AddTaskOptions) => void;
  updateTask: (id: string, updates: UpdateTaskInput) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearAllTasks: () => Promise<void>;
};

const TaskContext = createContext<TaskContextType | undefined>(undefined);

function normalizeTask(task: any): StoredTask {
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
    localOnly: Boolean(task.localOnly),
  };
}

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoadingAuth } = useAuth();
  const userId = user?.id ?? null;
  const tasksStorageKey = getTasksStorageKey(userId);
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [hasLoadedTasks, setHasLoadedTasks] = useState(false);
  const [loadedTasksStorageKey, setLoadedTasksStorageKey] = useState<
    string | null
  >(null);
  const loadRequestIdRef = useRef(0);
  const currentTaskScopeRef = useRef({
    storageKey: tasksStorageKey,
    userId,
  });
  const skipNextSaveRef = useRef(false);
  const hasLoadedCurrentTaskScope =
    hasLoadedTasks && loadedTasksStorageKey === tasksStorageKey;
  const scopedTasks = hasLoadedCurrentTaskScope ? tasks : [];

  useEffect(() => {
    if (isLoadingAuth) {
      return;
    }

    let isCancelled = false;
    const loadRequestId = loadRequestIdRef.current + 1;
    const taskScope = {
      storageKey: tasksStorageKey,
      userId,
    };

    loadRequestIdRef.current = loadRequestId;
    currentTaskScopeRef.current = taskScope;

    setIsLoadingTasks(true);
    setHasLoadedTasks(false);
    setLoadedTasksStorageKey(null);
    setTasks([]);

    const isCurrentLoad = () =>
      !isCancelled &&
      loadRequestIdRef.current === loadRequestId &&
      currentTaskScopeRef.current.storageKey === taskScope.storageKey &&
      currentTaskScopeRef.current.userId === taskScope.userId;

    const logTaskLoadCounts = (
      localTaskCount: number,
      remoteTaskCount: number,
      finalTaskCount: number
    ) => {
      console.log(
        `${TASK_CONTEXT_LOG_PREFIX} current auth user id:`,
        taskScope.userId
      );
      console.log(
        `${TASK_CONTEXT_LOG_PREFIX} storage key being loaded:`,
        taskScope.storageKey
      );
      console.log(`${TASK_CONTEXT_LOG_PREFIX} local task count:`, localTaskCount);
      console.log(
        `${TASK_CONTEXT_LOG_PREFIX} remote task count:`,
        remoteTaskCount
      );
      console.log(`${TASK_CONTEXT_LOG_PREFIX} final task count:`, finalTaskCount);
    };

    const loadScopedTasks = async () => {
      let nextTasks: StoredTask[] = [];
      let localTaskCount = 0;
      let remoteTaskCount = 0;

      try {
        const storedTasks = await AsyncStorage.getItem(taskScope.storageKey);

        if (!isCurrentLoad()) {
          return;
        }

        if (storedTasks) {
          const parsedTasks = JSON.parse(storedTasks);
          nextTasks = Array.isArray(parsedTasks)
            ? parsedTasks.map(normalizeTask)
            : [];
        }

        localTaskCount = nextTasks.length;
      } catch (error) {
        if (!isCurrentLoad()) {
          return;
        }

        console.log('Failed to load tasks:', error);
        nextTasks = [];
        localTaskCount = 0;
      }

      if (taskScope.userId) {
        try {
          const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('user_id', taskScope.userId);

          if (!isCurrentLoad()) {
            return;
          }

          if (error) {
            console.warn('Failed to fetch Supabase tasks:', error);
          } else {
            const remoteTasks: StoredTask[] = (data ?? []).map((row) =>
              supabaseRowToTask(row as SupabaseTaskRow)
            );

            remoteTaskCount = remoteTasks.length;
            nextTasks = remoteTasks;
          }
        } catch (error) {
          if (!isCurrentLoad()) {
            return;
          }

          console.warn('Failed to fetch Supabase tasks:', error);
        }
      }

      if (!isCurrentLoad()) {
        return;
      }

      logTaskLoadCounts(localTaskCount, remoteTaskCount, nextTasks.length);
      setTasks(nextTasks);
      setLoadedTasksStorageKey(taskScope.storageKey);
      setIsLoadingTasks(false);
      setHasLoadedTasks(true);
    };

    void loadScopedTasks();

    return () => {
      isCancelled = true;
    };
  }, [isLoadingAuth, tasksStorageKey, userId]);

  useEffect(() => {
    if (!hasLoadedCurrentTaskScope) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    saveTasks(tasks, tasksStorageKey);
  }, [tasks, hasLoadedCurrentTaskScope, tasksStorageKey]);

  const saveTasks = async (nextTasks: StoredTask[], storageKey: string) => {
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(nextTasks));
    } catch (error) {
      console.log('Failed to save tasks:', error);
    }
  };

  const syncTaskToSupabase = async (
    task: StoredTask,
    scopedUserId: string | null
  ) => {
    if (!scopedUserId || task.localOnly) {
      return;
    }

    try {
      const row = taskToSupabaseRow(task, scopedUserId);
      const { error } = await supabase
        .from('tasks')
        .upsert(row, { onConflict: 'user_id,local_id' });

      if (error) {
        console.warn('Failed to upsert Supabase task:', error);
      }
    } catch (error) {
      console.warn('Failed to upsert Supabase task:', error);
    }
  };

  const deleteTaskFromSupabase = async (
    localTaskId: string,
    scopedUserId: string | null
  ) => {
    if (!scopedUserId) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('user_id', scopedUserId)
        .eq('local_id', localTaskId);

      if (error) {
        console.warn('Failed to delete Supabase task:', error);
      }
    } catch (error) {
      console.warn('Failed to delete Supabase task:', error);
    }
  };

  const addTask = (task: AddTaskInput, options?: AddTaskOptions) => {
    const shouldSyncToSupabase = options?.syncToSupabase !== false;
    const newTask: StoredTask = {
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
      localOnly: shouldSyncToSupabase ? undefined : true,
    };

    skipNextSaveRef.current = false;
    setTasks((current) => {
      const currentScopeTasks = hasLoadedCurrentTaskScope ? current : [];
      return [newTask, ...currentScopeTasks];
    });

    if (shouldSyncToSupabase) {
      void syncTaskToSupabase(newTask, userId);
    }
  };

  const updateTask = async (id: string, updates: UpdateTaskInput) => {
    const existingTask = scopedTasks.find((task) => task.id === id);

    if (!existingTask) {
      return;
    }

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

    const updatedTask = {
      ...existingTask,
      ...updates,
    };

    setTasks((current) =>
      current.map((task) => (task.id === id ? updatedTask : task))
    );

    void syncTaskToSupabase(updatedTask, userId);
  };

  const toggleTask = async (id: string) => {
    const existingTask = scopedTasks.find((task) => task.id === id);

    if (!existingTask) {
      return;
    }

    const isMarkingDone = existingTask.status === 'pending';
    const nextStatus: Task['status'] =
      existingTask.status === 'completed' ? 'pending' : 'completed';
    const toggledTask = {
      ...existingTask,
      status: nextStatus,
      notificationId:
        nextStatus === 'completed' ? undefined : existingTask.notificationId,
    };

    setTasks((current) =>
      current.map((task) => (task.id === id ? toggledTask : task))
    );

    void syncTaskToSupabase(toggledTask, userId);

    if (isMarkingDone && existingTask.notificationId) {
      await cancelPlannerReminder(existingTask.notificationId);
    }
  };

  const deleteTask = async (id: string) => {
    const taskToDelete = scopedTasks.find((task) => task.id === id);

    if (!taskToDelete) {
      return;
    }

    if (taskToDelete?.notificationId) {
      await cancelPlannerReminder(taskToDelete.notificationId);
    }

    setTasks((current) => current.filter((task) => task.id !== id));

    if (!taskToDelete.localOnly) {
      void deleteTaskFromSupabase(id, userId);
    }
  };

  const clearAllTasks = async () => {
    for (const task of scopedTasks) {
      if (task.notificationId) {
        await cancelPlannerReminder(task.notificationId);
      }
    }

    skipNextSaveRef.current = true;
    setTasks([]);
    await AsyncStorage.removeItem(tasksStorageKey);
  };

  return (
    <TaskContext.Provider
      value={{
        tasks: scopedTasks,
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
