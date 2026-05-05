export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskStatus = 'pending' | 'completed';

export type PlannerType = 'task' | 'meeting' | 'date';

export type ReminderOption = 'none' | '10min' | '30min' | '1hour' | '1day';

export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  location?: string;
  reminder?: ReminderOption;
  notificationId?: string;
  plannerType: PlannerType;
  priority: TaskPriority;
  status: TaskStatus;
  subtasks?: Subtask[];
  createdAt: string;
};