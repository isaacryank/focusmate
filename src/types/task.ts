export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskStatus = 'pending' | 'completed';

export type PlannerType = 'task' | 'meeting' | 'date';

export type ReminderOption =
  | 'none'
  | 'atTime'
  | '10min'
  | '30min'
  | '1hour'
  | '1day'
  | 'custom';

export type MiloUrgencyLevel = 'calm' | 'low' | 'medium' | 'high' | 'done';

export type MiloSmartNudge = {
  id: string;
  label: string;
  message: string;
  timing: string;
};

export type MiloSmartPlanStep = {
  id: string;
  title: string;
  reason?: string;
};

export type MiloConflictInfo = {
  level: 'hard' | 'soft' | 'same_time' | 'preparation';
  type?:
    | 'same_time'
    | 'hard_overlap'
    | 'ongoing_overlap'
    | 'soft_overlap'
    | 'whole_day'
    | 'accepted_overlap';
  message: string;
  conflictingTaskId?: string;
  conflictingTitle?: string;
  conflictingTime?: string;
  conflictingStartTimeLabel?: string;
  conflictingEndTimeLabel?: string;
  selectedTimeLabel?: string;
  messageTone?: 'calm' | 'careful' | 'accepted';
};

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
  manualReminderMinutes?: number;
  plannerType: PlannerType;
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
  status: TaskStatus;
  subtasks?: Subtask[];
  createdAt: string;
};
