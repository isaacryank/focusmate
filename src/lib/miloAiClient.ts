import { supabase } from './supabase';
import { buildResourceSearchQuery } from './resourceFinderUtils';
import type { OnlineMeetingLink } from './meetingLinkStorage';
import type { Task } from '../types/task';

export type MiloAiSuggestedAction =
  | 'view_task'
  | 'start_focus'
  | 'find_resources'
  | 'open_maps'
  | 'join_meeting';

export type MiloAiTaskContext = {
  id: string;
  local_id?: string;
  title: string;
  description?: string;
  type: Task['plannerType'];
  priority: Task['priority'];
  due_date?: string;
  due_time?: string;
  estimated_duration_minutes?: number;
  completed: boolean;
  location?: string;
  hasMeetingLink: boolean;
  hasResourceContext: boolean;
};

export type MiloAiRecentMessage = {
  role: 'user' | 'milo';
  text: string;
};

export type MiloAiProposedTask = {
  title: string;
  type: Task['plannerType'];
  priority?: Task['priority'] | null;
  due_date?: string | null;
  due_time?: string | null;
  estimated_duration_minutes?: number | null;
  location?: string | null;
  description?: string | null;
  meeting_link?: string | null;
};

export type MiloAiTaskUpdateChanges = {
  title?: string;
  description?: string | null;
  type?: Task['plannerType'];
  priority?: Task['priority'];
  due_date?: string | null;
  due_time?: string | null;
  estimated_duration_minutes?: number | null;
  location?: string | null;
  meeting_link?: string | null;
};

export type MiloAiProposedTaskUpdate = {
  taskId: string;
  changes: MiloAiTaskUpdateChanges;
  reason?: string | null;
};

export type MiloAiResponse = {
  text: string;
  relatedTaskId?: string | null;
  suggestedActions?: MiloAiSuggestedAction[];
  proposedTask?: MiloAiProposedTask | null;
  proposedTaskUpdate?: MiloAiProposedTaskUpdate | null;
  usedAi: boolean;
};

type RecentMessageSource = MiloAiRecentMessage & {
  isTyping?: boolean;
};

type AskMiloAiInput = {
  message: string;
  tasks: Task[];
  meetingLinks?: OnlineMeetingLink[];
  recentMessages?: MiloAiRecentMessage[];
};

const MAX_AI_TASKS = 24;
const MAX_RECENT_MESSAGES = 8;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 260;
const MAX_LOCATION_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 1200;

function trimToLength(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}...`
    : trimmed;
}

function extractTextFromJsonArtifact(value: string) {
  const candidate = value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  if (!candidate || !/^[{["]/.test(candidate)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;

    if (typeof parsed === 'string') {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as { text?: unknown }).text === 'string'
    ) {
      return (parsed as { text: string }).text;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function cleanMiloAiText(value: string) {
  const extractedText = extractTextFromJsonArtifact(value);
  let text = (extractedText || value).trim();

  text = text
    .replace(/```[a-z0-9_-]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .trim();

  return text || value.trim();
}

function trimUnknownText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? trimToLength(value, maxLength) : undefined;
}

function sanitizeMiloAiProposedTask(
  proposedTask: unknown
): MiloAiProposedTask | null {
  if (
    !proposedTask ||
    typeof proposedTask !== 'object' ||
    Array.isArray(proposedTask)
  ) {
    return null;
  }

  const task = proposedTask as Record<string, unknown>;
  const title = trimUnknownText(task.title, MAX_TITLE_LENGTH);
  const type = task.type;

  if (!title || (type !== 'task' && type !== 'meeting' && type !== 'date')) {
    return null;
  }

  const priority =
    task.priority === 'low' ||
    task.priority === 'medium' ||
    task.priority === 'high'
      ? task.priority
      : null;
  const estimatedDurationMinutes =
    typeof task.estimated_duration_minutes === 'number' &&
    Number.isFinite(task.estimated_duration_minutes)
      ? task.estimated_duration_minutes
      : null;

  return {
    title,
    type,
    priority,
    due_date: trimUnknownText(task.due_date, 20) || null,
    due_time: trimUnknownText(task.due_time, 30) || null,
    estimated_duration_minutes: estimatedDurationMinutes,
    location: trimUnknownText(task.location, MAX_LOCATION_LENGTH) || null,
    description: trimUnknownText(task.description, MAX_DESCRIPTION_LENGTH) || null,
    meeting_link: trimUnknownText(task.meeting_link, 300) || null,
  };
}

function addTextUpdateChange(
  changes: MiloAiTaskUpdateChanges,
  key: keyof Pick<
    MiloAiTaskUpdateChanges,
    'title' | 'description' | 'due_date' | 'due_time' | 'location' | 'meeting_link'
  >,
  value: unknown,
  maxLength: number
) {
  const text = trimUnknownText(value, maxLength);

  if (text) {
    changes[key] = text;
  }
}

function sanitizeMiloAiProposedTaskUpdate(
  proposedTaskUpdate: unknown
): MiloAiProposedTaskUpdate | null {
  if (
    !proposedTaskUpdate ||
    typeof proposedTaskUpdate !== 'object' ||
    Array.isArray(proposedTaskUpdate)
  ) {
    return null;
  }

  const update = proposedTaskUpdate as Record<string, unknown>;
  const taskId = trimUnknownText(update.taskId, 80);
  const rawChanges = update.changes;

  if (
    !taskId ||
    !rawChanges ||
    typeof rawChanges !== 'object' ||
    Array.isArray(rawChanges)
  ) {
    return null;
  }

  const updateChanges = rawChanges as Record<string, unknown>;
  const changes: MiloAiTaskUpdateChanges = {};

  addTextUpdateChange(changes, 'title', updateChanges.title, MAX_TITLE_LENGTH);
  addTextUpdateChange(
    changes,
    'description',
    updateChanges.description,
    MAX_DESCRIPTION_LENGTH
  );

  if (
    updateChanges.type === 'task' ||
    updateChanges.type === 'meeting' ||
    updateChanges.type === 'date'
  ) {
    changes.type = updateChanges.type;
  }

  if (
    updateChanges.priority === 'low' ||
    updateChanges.priority === 'medium' ||
    updateChanges.priority === 'high'
  ) {
    changes.priority = updateChanges.priority;
  }

  addTextUpdateChange(changes, 'due_date', updateChanges.due_date, 20);
  addTextUpdateChange(changes, 'due_time', updateChanges.due_time, 30);

  if (
    typeof updateChanges.estimated_duration_minutes === 'number' &&
    Number.isFinite(updateChanges.estimated_duration_minutes) &&
    updateChanges.estimated_duration_minutes > 0
  ) {
    changes.estimated_duration_minutes =
      updateChanges.estimated_duration_minutes;
  }

  addTextUpdateChange(
    changes,
    'location',
    updateChanges.location,
    MAX_LOCATION_LENGTH
  );
  addTextUpdateChange(changes, 'meeting_link', updateChanges.meeting_link, 300);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  return {
    taskId,
    changes,
    reason: trimUnknownText(update.reason, MAX_DESCRIPTION_LENGTH) || null,
  };
}

function getTaskSortKey(task: Task) {
  return [task.dueDate || '9999-99-99', task.dueTime || '99:99'].join(' ');
}

function sortTasksForAiContext(tasks: Task[]) {
  return [...tasks].sort((first, second) => {
    if (first.status !== second.status) {
      return first.status === 'pending' ? -1 : 1;
    }

    const dueDifference = getTaskSortKey(first).localeCompare(
      getTaskSortKey(second)
    );

    if (dueDifference !== 0) {
      return dueDifference;
    }

    const priorityWeight = { high: 0, medium: 1, low: 2 };
    const priorityDifference =
      priorityWeight[first.priority] - priorityWeight[second.priority];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return second.createdAt.localeCompare(first.createdAt);
  });
}

export function buildMiloAiTaskContext(
  tasks: Task[],
  meetingLinks: OnlineMeetingLink[] = []
): MiloAiTaskContext[] {
  const meetingLinkTaskIds = new Set(
    meetingLinks.map((meetingLink) => meetingLink.taskId)
  );

  return sortTasksForAiContext(tasks)
    .slice(0, MAX_AI_TASKS)
    .map((task) => ({
      id: task.id,
      title: trimToLength(task.title, MAX_TITLE_LENGTH) || 'Untitled item',
      description: trimToLength(task.description, MAX_DESCRIPTION_LENGTH),
      type: task.plannerType,
      priority: task.priority,
      due_date: trimToLength(task.dueDate, 20),
      due_time: trimToLength(task.dueTime, 20),
      estimated_duration_minutes: task.estimatedDurationMinutes,
      completed: task.status === 'completed',
      location: trimToLength(task.location, MAX_LOCATION_LENGTH),
      hasMeetingLink: meetingLinkTaskIds.has(task.id),
      hasResourceContext: Boolean(buildResourceSearchQuery(task)),
    }));
}

export function buildMiloAiRecentMessages(
  messages: RecentMessageSource[]
): MiloAiRecentMessage[] {
  return messages
    .filter((message) => !message.isTyping && message.text.trim())
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => ({
      role: message.role,
      text: trimToLength(message.text, MAX_MESSAGE_LENGTH) || '',
    }));
}

export async function askMiloAi({
  message,
  tasks,
  meetingLinks = [],
  recentMessages = [],
}: AskMiloAiInput): Promise<MiloAiResponse> {
  const prompt = trimToLength(message, MAX_MESSAGE_LENGTH);

  if (!prompt) {
    throw new Error('Milo AI message cannot be empty.');
  }

  // The mobile app calls Supabase only; OpenAI is reached securely by the Edge Function.
  const { data, error } = await supabase.functions.invoke<MiloAiResponse>(
    'milo-chat',
    {
      body: {
        message: prompt,
        tasks: buildMiloAiTaskContext(tasks, meetingLinks),
        recentMessages: buildMiloAiRecentMessages(recentMessages),
      },
    }
  );

  if (error) {
    throw error;
  }

  if (!data || typeof data.text !== 'string') {
    throw new Error('Milo AI returned an invalid response.');
  }

  return {
    text: cleanMiloAiText(data.text),
    relatedTaskId:
      typeof data.relatedTaskId === 'string' ? data.relatedTaskId : null,
    suggestedActions: Array.isArray(data.suggestedActions)
      ? data.suggestedActions
      : [],
    proposedTask: sanitizeMiloAiProposedTask(data.proposedTask),
    proposedTaskUpdate: sanitizeMiloAiProposedTaskUpdate(
      data.proposedTaskUpdate
    ),
    usedAi: data.usedAi === true,
  };
}
