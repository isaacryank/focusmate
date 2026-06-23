export type FocusSessionStatus = 'completed' | 'stopped' | 'skipped';

export type FocusSession = {
  id: string;
  minutes: number;
  completedAt: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  status: FocusSessionStatus;
  taskId?: string;
  taskTitle?: string | null;
  preset?: string;
  createdAt: string;
};

export type AddFocusSessionInput = {
  id?: string;
  taskId?: string | null;
  taskTitle?: string | null;
  taskTypeSnapshot?: 'task' | 'meeting' | 'date' | 'focus_without_task' | null;
  startedAt?: string | number | null;
  endedAt?: string | number | null;
  durationMinutes: number;
  status?: FocusSessionStatus;
  preset?: string;
  focusQuality?: 'clean' | 'distracted';
  focusScore?: number;
  createdAt?: string | number | null;
};
