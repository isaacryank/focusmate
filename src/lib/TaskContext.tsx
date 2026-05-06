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
  toggleTask: (id: string) => void;
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

  const toggleTask = (id: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              status: task.status === 'completed' ? 'pending' : 'completed',
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
