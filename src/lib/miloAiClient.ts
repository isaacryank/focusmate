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

export type MiloAiProposedTaskCompletion = {
  taskId: string;
  reason?: string | null;
};

export type MiloAiProposedTaskDeletion = {
  taskId: string;
  reason?: string | null;
};

export type MiloAiSmartPlanStep = {
  label: string;
  taskId?: string | null;
  reason?: string | null;
  suggestedAction?: MiloAiSuggestedAction | null;
};

export type MiloAiSmartPlan = {
  title: string;
  summary: string;
  steps: MiloAiSmartPlanStep[];
};

export type MiloAiSmartNudge = {
  title: string;
  message: string;
  taskId?: string | null;
  suggestedAction?: MiloAiSuggestedAction | null;
};

export type MiloAiTimelineInsight = {
  title: string;
  message: string;
  warnings?: string[];
  taskIds?: string[];
};

export type MiloAiInsightStats = {
  completedToday?: number | null;
  pending?: number | null;
  overdue?: number | null;
  dueToday?: number | null;
  highPriority?: number | null;
  focusMinutesToday?: number | null;
  focusSessionsToday?: number | null;
};

export type MiloAiInsight = {
  title: string;
  summary: string;
  wins?: string[];
  concerns?: string[];
  nextBestTaskId?: string | null;
  stats?: MiloAiInsightStats | null;
  reflection?: string | null;
  suggestedAction?: MiloAiSuggestedAction | null;
};

export type MiloAiFocusStats = Pick<
  MiloAiInsightStats,
  'focusMinutesToday' | 'focusSessionsToday'
>;

export type MiloAiDebugReason =
  | 'missing_api_key'
  | 'openai_http_error'
  | 'openai_parse_error'
  | 'invalid_response_shape'
  | 'unhandled_exception'
  | 'fallback_builder_failed';

export type MiloAiResponse = {
  text: string;
  relatedTaskId?: string | null;
  suggestedActions?: MiloAiSuggestedAction[];
  proposedTask?: MiloAiProposedTask | null;
  proposedTaskUpdate?: MiloAiProposedTaskUpdate | null;
  proposedTaskCompletion?: MiloAiProposedTaskCompletion | null;
  proposedTaskDeletion?: MiloAiProposedTaskDeletion | null;
  smartPlan?: MiloAiSmartPlan | null;
  smartNudge?: MiloAiSmartNudge | null;
  timelineInsight?: MiloAiTimelineInsight | null;
  miloInsight?: MiloAiInsight | null;
  debugReason?: MiloAiDebugReason;
  usedAi: boolean;
};

type RecentMessageSource = MiloAiRecentMessage & {
  isTyping?: boolean;
  relatedTask?: Task;
  proposedTask?: MiloAiProposedTask;
  proposedTaskDeletionSnapshot?: Task;
  smartPlan?: MiloAiSmartPlan;
  smartNudge?: MiloAiSmartNudge;
  timelineInsight?: MiloAiTimelineInsight;
  miloInsight?: MiloAiInsight;
};

type AskMiloAiInput = {
  message: string;
  tasks: Task[];
  meetingLinks?: OnlineMeetingLink[];
  recentMessages?: MiloAiRecentMessage[];
  focusStats?: MiloAiFocusStats | null;
};

const MAX_AI_TASKS = 24;
const MAX_RECENT_MESSAGES = 8;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 260;
const MAX_PLANNING_MESSAGE_LENGTH = 360;
const MAX_INSIGHT_LIST_ITEM_LENGTH = 180;
const MAX_LOCATION_LENGTH = 160;
const MAX_MESSAGE_LENGTH = 1200;

const allowedDebugReasons = new Set<MiloAiDebugReason>([
  'missing_api_key',
  'openai_http_error',
  'openai_parse_error',
  'invalid_response_shape',
  'unhandled_exception',
  'fallback_builder_failed',
]);

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

function sanitizeMiloAiSuggestedAction(
  action: unknown
): MiloAiSuggestedAction | null {
  return action === 'view_task' ||
    action === 'start_focus' ||
    action === 'find_resources' ||
    action === 'open_maps' ||
    action === 'join_meeting'
    ? action
    : null;
}

function sanitizeMiloAiDebugReason(reason: unknown): MiloAiDebugReason | undefined {
  return allowedDebugReasons.has(reason as MiloAiDebugReason)
    ? (reason as MiloAiDebugReason)
    : undefined;
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

function sanitizeMiloAiProposedTaskCompletion(
  proposedTaskCompletion: unknown
): MiloAiProposedTaskCompletion | null {
  if (
    !proposedTaskCompletion ||
    typeof proposedTaskCompletion !== 'object' ||
    Array.isArray(proposedTaskCompletion)
  ) {
    return null;
  }

  const completion = proposedTaskCompletion as Record<string, unknown>;
  const taskId = trimUnknownText(completion.taskId, 80);

  if (!taskId) {
    return null;
  }

  return {
    taskId,
    reason: trimUnknownText(completion.reason, MAX_DESCRIPTION_LENGTH) || null,
  };
}

function sanitizeMiloAiProposedTaskDeletion(
  proposedTaskDeletion: unknown
): MiloAiProposedTaskDeletion | null {
  if (
    !proposedTaskDeletion ||
    typeof proposedTaskDeletion !== 'object' ||
    Array.isArray(proposedTaskDeletion)
  ) {
    return null;
  }

  const deletion = proposedTaskDeletion as Record<string, unknown>;
  const taskId = trimUnknownText(deletion.taskId, 80);

  if (!taskId) {
    return null;
  }

  return {
    taskId,
    reason: trimUnknownText(deletion.reason, MAX_DESCRIPTION_LENGTH) || null,
  };
}

function sanitizeMiloAiTaskId(taskId: unknown) {
  return trimUnknownText(taskId, 80) || null;
}

function sanitizeMiloAiSmartPlan(
  smartPlan: unknown
): MiloAiSmartPlan | null {
  if (!smartPlan || typeof smartPlan !== 'object' || Array.isArray(smartPlan)) {
    return null;
  }

  const plan = smartPlan as Record<string, unknown>;
  const title = trimUnknownText(plan.title, MAX_TITLE_LENGTH);
  const summary = trimUnknownText(plan.summary, MAX_PLANNING_MESSAGE_LENGTH);
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];

  if (!title || !summary) {
    return null;
  }

  const steps = rawSteps
    .map((rawStep): MiloAiSmartPlanStep | null => {
      if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) {
        return null;
      }

      const step = rawStep as Record<string, unknown>;
      const label = trimUnknownText(step.label, 180);

      if (!label) {
        return null;
      }

      return {
        label,
        taskId: sanitizeMiloAiTaskId(step.taskId),
        reason: trimUnknownText(step.reason, MAX_DESCRIPTION_LENGTH) || null,
        suggestedAction: sanitizeMiloAiSuggestedAction(step.suggestedAction),
      };
    })
    .filter((step): step is MiloAiSmartPlanStep => Boolean(step))
    .slice(0, 6);

  return {
    title,
    summary,
    steps,
  };
}

function sanitizeMiloAiSmartNudge(
  smartNudge: unknown
): MiloAiSmartNudge | null {
  if (
    !smartNudge ||
    typeof smartNudge !== 'object' ||
    Array.isArray(smartNudge)
  ) {
    return null;
  }

  const nudge = smartNudge as Record<string, unknown>;
  const title = trimUnknownText(nudge.title, MAX_TITLE_LENGTH);
  const message = trimUnknownText(nudge.message, MAX_PLANNING_MESSAGE_LENGTH);

  if (!title || !message) {
    return null;
  }

  return {
    title,
    message,
    taskId: sanitizeMiloAiTaskId(nudge.taskId),
    suggestedAction: sanitizeMiloAiSuggestedAction(nudge.suggestedAction),
  };
}

function sanitizeMiloAiTimelineInsight(
  timelineInsight: unknown
): MiloAiTimelineInsight | null {
  if (
    !timelineInsight ||
    typeof timelineInsight !== 'object' ||
    Array.isArray(timelineInsight)
  ) {
    return null;
  }

  const insight = timelineInsight as Record<string, unknown>;
  const title = trimUnknownText(insight.title, MAX_TITLE_LENGTH);
  const message = trimUnknownText(insight.message, MAX_PLANNING_MESSAGE_LENGTH);

  if (!title || !message) {
    return null;
  }

  const warnings = Array.isArray(insight.warnings)
    ? insight.warnings
        .map((warning) => trimUnknownText(warning, 180))
        .filter((warning): warning is string => Boolean(warning))
        .slice(0, 5)
    : [];
  const taskIds = Array.isArray(insight.taskIds)
    ? insight.taskIds
        .map(sanitizeMiloAiTaskId)
        .filter((taskId): taskId is string => Boolean(taskId))
        .slice(0, 8)
    : [];

  return {
    title,
    message,
    warnings,
    taskIds,
  };
}

function sanitizeMiloAiStatNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function sanitizeMiloAiInsightStats(stats: unknown): MiloAiInsightStats | null {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    return null;
  }

  const insightStats = stats as Record<string, unknown>;

  return {
    completedToday: sanitizeMiloAiStatNumber(insightStats.completedToday),
    pending: sanitizeMiloAiStatNumber(insightStats.pending),
    overdue: sanitizeMiloAiStatNumber(insightStats.overdue),
    dueToday: sanitizeMiloAiStatNumber(insightStats.dueToday),
    highPriority: sanitizeMiloAiStatNumber(insightStats.highPriority),
    focusMinutesToday: sanitizeMiloAiStatNumber(
      insightStats.focusMinutesToday
    ),
    focusSessionsToday: sanitizeMiloAiStatNumber(
      insightStats.focusSessionsToday
    ),
  };
}

function sanitizeMiloAiTextList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => trimUnknownText(item, MAX_INSIGHT_LIST_ITEM_LENGTH))
        .filter((item): item is string => Boolean(item))
        .slice(0, 4)
    : [];
}

function sanitizeMiloAiInsight(miloInsight: unknown): MiloAiInsight | null {
  if (
    !miloInsight ||
    typeof miloInsight !== 'object' ||
    Array.isArray(miloInsight)
  ) {
    return null;
  }

  const insight = miloInsight as Record<string, unknown>;
  const title = trimUnknownText(insight.title, MAX_TITLE_LENGTH);
  const summary = trimUnknownText(insight.summary, MAX_PLANNING_MESSAGE_LENGTH);

  if (!title || !summary) {
    return null;
  }

  return {
    title,
    summary,
    wins: sanitizeMiloAiTextList(insight.wins),
    concerns: sanitizeMiloAiTextList(insight.concerns),
    nextBestTaskId: sanitizeMiloAiTaskId(insight.nextBestTaskId),
    stats: sanitizeMiloAiInsightStats(insight.stats),
    reflection:
      trimUnknownText(insight.reflection, MAX_PLANNING_MESSAGE_LENGTH) || null,
    suggestedAction: sanitizeMiloAiSuggestedAction(insight.suggestedAction),
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
    .map((message) => {
      const context = [
        message.relatedTask?.title
          ? `Related task: ${message.relatedTask.title}`
          : undefined,
        message.proposedTask?.title
          ? `Proposed task: ${message.proposedTask.title}`
          : undefined,
        message.proposedTaskDeletionSnapshot?.title
          ? `Proposed removal: ${message.proposedTaskDeletionSnapshot.title}`
          : undefined,
        message.smartPlan?.title
          ? `Smart plan card: ${message.smartPlan.title}`
          : undefined,
        message.smartNudge?.title
          ? `Smart nudge card: ${message.smartNudge.title}`
          : undefined,
        message.timelineInsight?.title
          ? `Timeline insight card: ${message.timelineInsight.title}`
          : undefined,
        message.miloInsight?.title
          ? `Milo insight card: ${message.miloInsight.title}`
          : undefined,
      ].filter(Boolean);
      const text = [message.text, ...context].join('\n');

      return {
        role: message.role,
        text: trimToLength(text, MAX_MESSAGE_LENGTH) || '',
      };
    });
}

export async function askMiloAi({
  message,
  focusStats,
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
        ...(focusStats ? { focusStats } : {}),
      },
    }
  );

  const responseKeys =
    data && typeof data === 'object'
      ? Object.keys(data as Record<string, unknown>)
      : [];
  const debugReason = sanitizeMiloAiDebugReason(data?.debugReason);

  if (data?.usedAi === false) {
    console.warn('Milo AI fallback debug', {
      debugReason,
      usedAi: data.usedAi,
      responseKeys,
    });
  } else {
    console.warn('Milo AI usedAi', data?.usedAi);
    console.warn('Milo AI response keys', responseKeys);
  }

  if (error) {
    console.warn('Milo AI invoke error', error);
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
          .map(sanitizeMiloAiSuggestedAction)
          .filter((action): action is MiloAiSuggestedAction => Boolean(action))
      : [],
    proposedTask: sanitizeMiloAiProposedTask(data.proposedTask),
    proposedTaskUpdate: sanitizeMiloAiProposedTaskUpdate(
      data.proposedTaskUpdate
    ),
    proposedTaskCompletion: sanitizeMiloAiProposedTaskCompletion(
      data.proposedTaskCompletion
    ),
    proposedTaskDeletion: sanitizeMiloAiProposedTaskDeletion(
      data.proposedTaskDeletion
    ),
    smartPlan: sanitizeMiloAiSmartPlan(data.smartPlan),
    smartNudge: sanitizeMiloAiSmartNudge(data.smartNudge),
    timelineInsight: sanitizeMiloAiTimelineInsight(data.timelineInsight),
    miloInsight: sanitizeMiloAiInsight(data.miloInsight),
    debugReason,
    usedAi: data.usedAi !== false,
  };
}
