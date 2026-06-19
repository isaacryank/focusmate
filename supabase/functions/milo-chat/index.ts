type DenoRuntime = {
  env: {
    get(name: string): string | undefined;
  };
  serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void;
};

declare const Deno: DenoRuntime;

type MiloChatAction =
  | 'view_task'
  | 'start_focus'
  | 'find_resources'
  | 'open_maps'
  | 'join_meeting';

type MiloChatTaskContext = {
  id: string;
  local_id?: string;
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  due_date?: string;
  due_time?: string;
  estimated_duration_minutes?: number;
  completed?: boolean;
  location?: string;
  hasMeetingLink?: boolean;
  hasResourceContext?: boolean;
};

type MiloChatRecentMessage = {
  role: 'user' | 'milo';
  text: string;
};

type MiloProposedTask = {
  title: string;
  type: 'task' | 'meeting' | 'date';
  priority?: 'low' | 'medium' | 'high' | null;
  due_date?: string | null;
  due_time?: string | null;
  estimated_duration_minutes?: number | null;
  location?: string | null;
  description?: string | null;
  meeting_link?: string | null;
};

type MiloTaskUpdateChanges = {
  title?: string;
  description?: string | null;
  type?: 'task' | 'meeting' | 'date';
  priority?: 'low' | 'medium' | 'high';
  due_date?: string | null;
  due_time?: string | null;
  estimated_duration_minutes?: number | null;
  location?: string | null;
  meeting_link?: string | null;
};

type MiloProposedTaskUpdate = {
  taskId: string;
  changes: MiloTaskUpdateChanges;
  reason?: string | null;
};

type MiloProposedTaskCompletion = {
  taskId: string;
  reason?: string | null;
};

type MiloProposedTaskDeletion = {
  taskId: string;
  reason?: string | null;
};

type MiloChatResponse = {
  text: string;
  relatedTaskId?: string | null;
  suggestedActions?: MiloChatAction[];
  proposedTask?: MiloProposedTask | null;
  proposedTaskUpdate?: MiloProposedTaskUpdate | null;
  proposedTaskCompletion?: MiloProposedTaskCompletion | null;
  proposedTaskDeletion?: MiloProposedTaskDeletion | null;
  usedAi: boolean;
};

const FALLBACK_TEXT =
  'Milo is having trouble thinking online right now. I can still help using local task guidance.';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_TASKS = 24;
const MAX_RECENT_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 1200;

const allowedActions = new Set<MiloChatAction>([
  'view_task',
  'start_focus',
  'find_resources',
  'open_maps',
  'join_meeting',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function fallbackResponse() {
  return jsonResponse({
    text: FALLBACK_TEXT,
    relatedTaskId: null,
    suggestedActions: [],
    proposedTask: null,
    proposedTaskUpdate: null,
    proposedTaskCompletion: null,
    proposedTaskDeletion: null,
    usedAi: false,
  } satisfies MiloChatResponse);
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}...`
    : trimmed;
}

function sanitizeTask(rawTask: unknown): MiloChatTaskContext | null {
  if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) {
    return null;
  }

  const task = rawTask as Record<string, unknown>;
  const id = trimText(task.id, 80) || trimText(task.local_id, 80);
  const title = trimText(task.title, 120);

  if (!id || !title) {
    return null;
  }

  return {
    id,
    local_id: trimText(task.local_id, 80),
    title,
    description: trimText(task.description, 260),
    type: trimText(task.type, 30),
    priority: trimText(task.priority, 30),
    due_date: trimText(task.due_date, 20),
    due_time: trimText(task.due_time, 20),
    estimated_duration_minutes:
      typeof task.estimated_duration_minutes === 'number' &&
      Number.isFinite(task.estimated_duration_minutes)
        ? task.estimated_duration_minutes
        : undefined,
    completed: task.completed === true,
    location: trimText(task.location, 160),
    hasMeetingLink: task.hasMeetingLink === true,
    hasResourceContext: task.hasResourceContext === true,
  };
}

function sanitizeRecentMessage(
  rawMessage: unknown
): MiloChatRecentMessage | null {
  if (
    !rawMessage ||
    typeof rawMessage !== 'object' ||
    Array.isArray(rawMessage)
  ) {
    return null;
  }

  const message = rawMessage as Record<string, unknown>;
  const role = message.role === 'user' ? 'user' : 'milo';
  const text = trimText(message.text, MAX_MESSAGE_LENGTH);

  if (!text) {
    return null;
  }

  return {
    role,
    text,
  };
}

function sanitizePriority(value: unknown) {
  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : null;
}

function sanitizeProposedTask(rawTask: unknown): MiloProposedTask | null {
  if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask)) {
    return null;
  }

  const task = rawTask as Record<string, unknown>;
  const title = trimText(task.title, 120);
  const type = task.type;

  if (
    !title ||
    (type !== 'task' && type !== 'meeting' && type !== 'date')
  ) {
    return null;
  }

  return {
    title,
    type,
    priority: sanitizePriority(task.priority),
    due_date: trimText(task.due_date, 20) || null,
    due_time: trimText(task.due_time, 30) || null,
    estimated_duration_minutes:
      typeof task.estimated_duration_minutes === 'number' &&
      Number.isFinite(task.estimated_duration_minutes)
        ? task.estimated_duration_minutes
        : null,
    location: trimText(task.location, 160) || null,
    description: trimText(task.description, 260) || null,
    meeting_link: trimText(task.meeting_link, 300) || null,
  };
}

function sanitizePlannerType(value: unknown) {
  return value === 'task' || value === 'meeting' || value === 'date'
    ? value
    : undefined;
}

function addTextChange(
  changes: MiloTaskUpdateChanges,
  key: keyof Pick<
    MiloTaskUpdateChanges,
    'title' | 'description' | 'due_date' | 'due_time' | 'location' | 'meeting_link'
  >,
  value: unknown,
  maxLength: number
) {
  const text = trimText(value, maxLength);

  if (text) {
    changes[key] = text;
  }
}

function sanitizeProposedTaskUpdate(
  rawUpdate: unknown,
  tasks: MiloChatTaskContext[]
): MiloProposedTaskUpdate | null {
  if (!rawUpdate || typeof rawUpdate !== 'object' || Array.isArray(rawUpdate)) {
    return null;
  }

  const update = rawUpdate as Record<string, unknown>;
  const taskId = trimText(update.taskId, 80);
  const taskExists = taskId
    ? tasks.some((task) => task.id === taskId || task.local_id === taskId)
    : false;

  if (!taskId || !taskExists) {
    return null;
  }

  const rawChanges = update.changes;
  if (!rawChanges || typeof rawChanges !== 'object' || Array.isArray(rawChanges)) {
    return null;
  }

  const updateChanges = rawChanges as Record<string, unknown>;
  const changes: MiloTaskUpdateChanges = {};
  const type = sanitizePlannerType(updateChanges.type);
  const priority = sanitizePriority(updateChanges.priority);

  addTextChange(changes, 'title', updateChanges.title, 120);
  addTextChange(changes, 'description', updateChanges.description, 260);
  if (type) changes.type = type;
  if (priority) changes.priority = priority;
  addTextChange(changes, 'due_date', updateChanges.due_date, 20);
  addTextChange(changes, 'due_time', updateChanges.due_time, 30);

  if (
    typeof updateChanges.estimated_duration_minutes === 'number' &&
    Number.isFinite(updateChanges.estimated_duration_minutes) &&
    updateChanges.estimated_duration_minutes > 0
  ) {
    changes.estimated_duration_minutes =
      updateChanges.estimated_duration_minutes;
  }

  addTextChange(changes, 'location', updateChanges.location, 160);
  addTextChange(changes, 'meeting_link', updateChanges.meeting_link, 300);

  if (Object.keys(changes).length === 0) {
    return null;
  }

  return {
    taskId,
    changes,
    reason: trimText(update.reason, 260) || null,
  };
}

function sanitizeProposedTaskCompletion(
  rawCompletion: unknown,
  tasks: MiloChatTaskContext[]
): MiloProposedTaskCompletion | null {
  if (
    !rawCompletion ||
    typeof rawCompletion !== 'object' ||
    Array.isArray(rawCompletion)
  ) {
    return null;
  }

  const completion = rawCompletion as Record<string, unknown>;
  const taskId = trimText(completion.taskId, 80);
  const task = taskId
    ? tasks.find((item) => item.id === taskId || item.local_id === taskId)
    : undefined;

  if (!taskId || !task || task.completed) {
    return null;
  }

  return {
    taskId,
    reason: trimText(completion.reason, 260) || null,
  };
}

function sanitizeProposedTaskDeletion(
  rawDeletion: unknown,
  tasks: MiloChatTaskContext[]
): MiloProposedTaskDeletion | null {
  if (
    !rawDeletion ||
    typeof rawDeletion !== 'object' ||
    Array.isArray(rawDeletion)
  ) {
    return null;
  }

  const deletion = rawDeletion as Record<string, unknown>;
  const taskId = trimText(deletion.taskId, 80);
  const taskExists = taskId
    ? tasks.some((task) => task.id === taskId || task.local_id === taskId)
    : false;

  if (!taskId || !taskExists) {
    return null;
  }

  return {
    taskId,
    reason: trimText(deletion.reason, 260) || null,
  };
}

function userAskedForResources(message: string) {
  const normalizedMessage = message.toLowerCase();

  return [
    'resource',
    'resources',
    'reference',
    'references',
    'tutorial',
    'guide',
    'search',
    'material',
  ].some((keyword) => normalizedMessage.includes(keyword));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDeletionIntentInfo(message: string) {
  const normalizedMessage = message
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedSearchText = normalizeSearchText(message);
  const hasDeletionIntent =
    /\b(delete|remove|cancel|canceled|cancelled)\b/.test(normalizedMessage) ||
    /\bcancel\s+(my\s+|the\s+)?[\w\s]{0,80}\b(task|date|meeting|plan)\b/.test(
      normalizedMessage
    ) ||
    /\b(no longer need|do not need|dont need|don't need|don’t need|not happening anymore)\b/.test(
      normalizedMessage
    ) ||
    /\b(no longer need|do not need|dont need|don t need|not happening anymore)\b/.test(
      normalizedSearchText
    ) ||
    /\b(has been|been|is|was)\s+(cancel|canceled|cancelled)\b/.test(
      normalizedMessage
    ) ||
    /\bremove\s+(it|this|that)\s+from\s+(my\s+|the\s+)?plan\b/.test(
      normalizedMessage
    );

  return {
    hasDeletionIntent,
    shouldPreferProposedTaskDeletion: hasDeletionIntent,
  };
}

function getCreationIntentInfo(message: string) {
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, ' ').trim();
  const deletionIntent = getDeletionIntentInfo(message);
  const hasCreationIntent =
    /\b(set|create|add|schedule|plan)\s+(a\s+|an\s+|my\s+)?(date|task|meeting)\b/.test(
      normalizedMessage
    ) ||
    /\b(schedule|plan)\s+["'“”]?[\w]/.test(normalizedMessage) ||
    /\bremind me\b/.test(normalizedMessage);
  const hasExplicitExistingTaskIntent =
    /\b(update|edit|change|modify|open|view|show)\b/.test(normalizedMessage) ||
    /\b(existing task|saved task|current task|already saved)\b/.test(
      normalizedMessage
    );
  const hasQuotedTitle = /["'“”][^"'“”]{2,}["'“”]/.test(message);
  const hasDateOrTime =
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(
      normalizedMessage
    ) ||
    /\b\d{1,2}\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\b/.test(
      normalizedMessage
    ) ||
    /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(normalizedMessage);

  return {
    hasCreationIntent,
    hasExplicitExistingTaskIntent,
    hasQuotedTitleWithScheduleDetails: hasQuotedTitle && hasDateOrTime,
    shouldPreferProposedTask:
      (hasCreationIntent || (hasQuotedTitle && hasDateOrTime)) &&
      !deletionIntent.hasDeletionIntent &&
      !hasExplicitExistingTaskIntent,
  };
}

function getUpdateIntentInfo(message: string) {
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, ' ').trim();
  const hasUpdateIntent =
    /\b(update|edit|change|move|reschedule|rename)\b/.test(normalizedMessage) ||
    /\badd\s+(location|place|venue|meeting link|link)\b/.test(
      normalizedMessage
    ) ||
    /\bchange\s+(priority|time|date|location|title|name|type)\b/.test(
      normalizedMessage
    );

  return {
    hasUpdateIntent,
    shouldPreferProposedTaskUpdate: hasUpdateIntent,
  };
}

function getCompletionIntentInfo(message: string) {
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, ' ').trim();
  const hasCompletionIntent =
    /\b(finished|completed|complete|done with|already did|have finished|mark as done|mark done|mark completed)\b/.test(
      normalizedMessage
    ) ||
    /\bfinish\s+(task|meeting|assignment|date|project|report|lab|[\w])/.test(
      normalizedMessage
    );

  return {
    hasCompletionIntent,
    shouldPreferProposedTaskCompletion: hasCompletionIntent,
  };
}

const taskMatchStopWords = new Set([
  'a',
  'an',
  'and',
  'at',
  'date',
  'event',
  'for',
  'meeting',
  'my',
  'plan',
  'task',
  'the',
  'to',
  'with',
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAffirmativeDeletionFollowUp(message: string) {
  const normalizedMessage = normalizeSearchText(message);

  if (!normalizedMessage) {
    return false;
  }

  return (
    /^(yes|yeah|yep|yup|sure|okay|ok|correct|confirm)\b/.test(
      normalizedMessage
    ) ||
    /^(that one|yes please|do it|remove it|go ahead|please do)\b/.test(
      normalizedMessage
    ) ||
    /\b(that one|yes please|do it|remove it|go ahead|confirm)\b/.test(
      normalizedMessage
    )
  );
}

function getTaskMatchWords(title: string) {
  return normalizeSearchText(title)
    .split(' ')
    .filter(
      (word) =>
        word.length >= 2 &&
        !taskMatchStopWords.has(word)
    );
}

function containsSearchWord(text: string, word: string) {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text);
}

function getTaskMentionScore(text: string, task: MiloChatTaskContext) {
  const normalizedTitle = normalizeSearchText(task.title);

  if (!normalizedTitle) {
    return 0;
  }

  if (text.includes(normalizedTitle)) {
    return 100 + normalizedTitle.length;
  }

  const titleWords = getTaskMatchWords(task.title);
  const matchedWords = titleWords.filter((word) =>
    containsSearchWord(text, word)
  );

  if (matchedWords.length === 0) {
    return 0;
  }

  if (matchedWords.length === titleWords.length && titleWords.length > 1) {
    return 80 + matchedWords.join('').length;
  }

  const distinctiveMatch = matchedWords.find((word) => word.length >= 5);

  if (distinctiveMatch) {
    return 50 + distinctiveMatch.length;
  }

  if (titleWords.length === 1) {
    return 40 + matchedWords[0].length;
  }

  return 0;
}

function getDeletionFollowUpInfo({
  message,
  recentMessages,
  tasks,
}: {
  message: string;
  recentMessages: MiloChatRecentMessage[];
  tasks: MiloChatTaskContext[];
}) {
  const hasAffirmativeFollowUp = isAffirmativeDeletionFollowUp(message);

  if (!hasAffirmativeFollowUp) {
    return {
      hasAffirmativeFollowUp,
      hasRecentDeletionDiscussion: false,
      status: 'none' as const,
      taskId: null,
      taskTitle: null,
      candidateTaskTitles: [],
      reason: null,
    };
  }

  const recentConversationText = recentMessages
    .slice(-6)
    .map((recentMessage) => `${recentMessage.role}: ${recentMessage.text}`)
    .join('\n');
  const hasRecentDeletionDiscussion =
    getDeletionIntentInfo(recentConversationText).hasDeletionIntent;

  if (!hasRecentDeletionDiscussion) {
    return {
      hasAffirmativeFollowUp,
      hasRecentDeletionDiscussion,
      status: 'none' as const,
      taskId: null,
      taskTitle: null,
      candidateTaskTitles: [],
      reason: null,
    };
  }

  const matchText = normalizeSearchText(`${recentConversationText}\n${message}`);
  const scoredTasks = tasks
    .map((task) => ({
      task,
      score: getTaskMentionScore(matchText, task),
    }))
    .filter((candidate) => candidate.score > 0);

  if (scoredTasks.length === 0) {
    return {
      hasAffirmativeFollowUp,
      hasRecentDeletionDiscussion,
      status: 'not_found' as const,
      taskId: null,
      taskTitle: null,
      candidateTaskTitles: [],
      reason: null,
    };
  }

  const topScore = Math.max(...scoredTasks.map((candidate) => candidate.score));
  const topCandidates = scoredTasks.filter(
    (candidate) => candidate.score === topScore
  );

  if (topCandidates.length > 1) {
    return {
      hasAffirmativeFollowUp,
      hasRecentDeletionDiscussion,
      status: 'ambiguous' as const,
      taskId: null,
      taskTitle: null,
      candidateTaskTitles: topCandidates
        .map((candidate) => candidate.task.title)
        .slice(0, 4),
      reason: null,
    };
  }

  const matchedTask = topCandidates[0].task;

  return {
    hasAffirmativeFollowUp,
    hasRecentDeletionDiscussion,
    status: 'matched' as const,
    taskId: matchedTask.id,
    taskTitle: matchedTask.title,
    candidateTaskTitles: [matchedTask.title],
    reason: 'User confirmed they want to remove this canceled task.',
  };
}

function filterSupportedActions({
  actions,
  message,
  relatedTask,
}: {
  actions: unknown;
  message: string;
  relatedTask?: MiloChatTaskContext;
}) {
  if (!Array.isArray(actions)) {
    return [];
  }

  const seenActions = new Set<MiloChatAction>();
  const filteredActions: MiloChatAction[] = [];

  for (const action of actions) {
    if (!allowedActions.has(action as MiloChatAction)) {
      continue;
    }

    const supportedAction = action as MiloChatAction;

    if (seenActions.has(supportedAction)) {
      continue;
    }

    if (
      (supportedAction === 'view_task' ||
        supportedAction === 'start_focus') &&
      !relatedTask
    ) {
      continue;
    }

    if (
      supportedAction === 'find_resources' &&
      !relatedTask &&
      !userAskedForResources(message)
    ) {
      continue;
    }

    if (
      supportedAction === 'open_maps' &&
      (!relatedTask || !relatedTask.location)
    ) {
      continue;
    }

    if (
      supportedAction === 'join_meeting' &&
      (!relatedTask || !relatedTask.hasMeetingLink)
    ) {
      continue;
    }

    seenActions.add(supportedAction);
    filteredActions.push(supportedAction);
  }

  return filteredActions;
}

function extractOutputText(response: unknown) {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const directOutputText = (response as Record<string, unknown>).output_text;

  if (typeof directOutputText === 'string') {
    return directOutputText;
  }

  const output = (response as Record<string, unknown>).output;

  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const content = (item as Record<string, unknown>).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== 'object') {
        continue;
      }

      const text = (contentItem as Record<string, unknown>).text;

      if (typeof text === 'string') {
        return text;
      }
    }
  }

  return undefined;
}

function getCurrentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildSystemPrompt() {
  const currentDate = getCurrentDateKey();

  return [
    'You are Milo, the cute caring green dinosaur companion in FocusMate.',
    'Sound joyful, expressive, warm, and Milo-like, as a caring little dino study buddy.',
    'Be supportive, natural, friendly, and concise. Do not sound formal, robotic, or stiff.',
    'Do not become childish or annoying. Keep the help practical and calm.',
    'You may use light emojis sometimes, such as 🦖 💚 ✨ 🌱 ⭐, but do not overuse emojis.',
    'Do not give medical, legal, or financial advice.',
    'Do not invent tasks. Only refer to tasks included in the task context.',
    'If a task is relevant, set relatedTaskId to that task id. Otherwise use null.',
    'Suggest actions only when they are supported by the task data.',
    'Allowed suggestedActions are view_task, start_focus, find_resources, open_maps, join_meeting.',
    'Use open_maps only when the related task has a location.',
    'Use join_meeting only when the related task has hasMeetingLink true.',
    'Set usedAi to true when you answer successfully.',
    `Today is ${currentDate}. Use this date for relative dates like today, tomorrow, and this week.`,
    'For delete/remove intent, return proposedTaskDeletion instead of proposedTask, proposedTaskUpdate, proposedTaskCompletion, relatedTaskId, or suggestedActions.',
    'Delete/remove intent examples include delete, remove, cancel task, cancel date, cancel meeting, no longer need, not happening anymore, has been canceled, has been cancelled, and remove it from my plan.',
    'For proposedTaskDeletion.taskId, use the id of exactly one existing task from the provided task context.',
    'If a delete request is ambiguous, such as "delete my meeting" when multiple meetings exist, ask which task and set proposedTaskDeletion to null.',
    'If the task is not found, say Milo could not find it and ask the user to check the title. Do not delete anything.',
    'Do not claim a task is already deleted or removed. Ask the user to confirm before deletion.',
    'Do not propose deleting multiple tasks at once.',
    'Deletion intent has higher priority than creation, update, completion, existing task links, and suggested actions.',
    'If Milo already asked whether the user wants to remove a specific task and the user replies affirmatively, return proposedTaskDeletion instead of asking again.',
    'Affirmative delete follow-up replies include yes, yeah, yup, sure, okay, ok, correct, that one, yes please, do it, remove it, go ahead, and confirm.',
    'When the user asks to create, add, set, schedule, remind, or plan a task/date/meeting, return proposedTask instead of saying it was created.',
    'Creation intent has higher priority than existing task matching.',
    'If creationIntent.shouldPreferProposedTask is true, ignore existing task matches and return proposedTask with relatedTaskId null and suggestedActions empty.',
    'Do not match an existing task only because it has the same type, similar date category, or a nearby date.',
    'Only link to an existing task when the user clearly asks to update, edit, change, open, view, or work with an existing saved task.',
    'A quoted new title in a creation message is the title for a new proposed task, not a search target for saved tasks.',
    'If the user gives a new title in quotes and includes a date or time, treat it as a new proposed task unless they explicitly say update or edit an existing task.',
    'Do not decide that a different saved date is a conflict. If the proposed task date or time is different from saved tasks, still return proposedTask.',
    'Task creation examples include create task, add task, set a date, schedule meeting, remind me, plan an event, or add an event on a date at a time.',
    'For proposedTask.type, use "date" for date plans/events, "meeting" for meetings/calls/supervisor sessions, and "task" for ordinary to-dos.',
    'For proposedTask.due_date, use YYYY-MM-DD. If the user gives a date without a year, use the current year unless that date has clearly passed, then use the next year.',
    'For proposedTask.due_time, use the app style like 10:00 AM or 8:00 PM.',
    'For scheduled requests, date plans, and meetings, include date and time when provided. If important date/time/title details are missing, ask for the missing detail and set proposedTask to null.',
    'Never say a proposed task has already been created or saved. Ask the user to confirm first.',
    'For update/edit intent, return proposedTaskUpdate instead of proposedTask.',
    'Update intent examples include update, edit, change, move, reschedule, rename, add location to an existing task, add meeting link to an existing task, and change priority.',
    'For proposedTaskUpdate.taskId, use the id of the existing task from the provided task context.',
    'For proposedTaskUpdate.changes, include only fields the user wants to change.',
    'Allowed update fields are title, description, type, priority, due_date, due_time, estimated_duration_minutes, location, and meeting_link.',
    'If the update request is ambiguous, such as "change my meeting to 3pm" when multiple meetings exist, ask which task and set proposedTaskUpdate to null.',
    'If the task is not found, say Milo could not find it and ask the user to check the title. Do not create a new task automatically.',
    'Do not claim an update is already done. Ask the user to confirm.',
    'For completion intent, return proposedTaskCompletion instead of proposedTask or proposedTaskUpdate.',
    'Completion intent examples include finished, completed, done with, mark as done, mark completed, I already did, I have finished, and finish task.',
    'For proposedTaskCompletion.taskId, use the id of exactly one existing pending task from the provided task context.',
    'If a completion request is ambiguous, such as "mark my meeting as done" when multiple meetings exist, ask which task and set proposedTaskCompletion to null.',
    'If the task is not found, say Milo could not find it and ask the user to check the title. Do not create a new task.',
    'If the matching task is already completed, say it already looks completed and set proposedTaskCompletion to null.',
    'Do not claim a task is already marked done. Ask the user to confirm before completion.',
    'Do not silently delete, complete, or change existing tasks.',
    'Return plain text only in the text field.',
    'Do not use Markdown formatting.',
    'Do not use **bold** markers.',
    'Do not use headings with #.',
    'Do not use tables.',
    'Do not use code blocks.',
    'Use short friendly paragraphs.',
    'Use simple bullet lines only when helpful, using normal bullets like • item or * item.',
    'Example style: Awww okay, Milo can help with that 🦖✨\n\nFor your SV meeting, prepare a simple progress update first. You can talk about what you have completed, what is working now, and what problem you need advice on.\n\nBring screenshots or a quick demo if you have them. You do not need to make it perfect — just show clear progress and ask for feedback. Milo thinks you got this 💚',
  ].join('\n');
}

function buildUserInput({
  message,
  tasks,
  recentMessages,
}: {
  message: string;
  tasks: MiloChatTaskContext[];
  recentMessages: MiloChatRecentMessage[];
}) {
  return JSON.stringify({
    message,
    tasks,
    recentMessages,
    currentDate: getCurrentDateKey(),
    deletionIntent: getDeletionIntentInfo(message),
    deletionFollowUpIntent: getDeletionFollowUpInfo({
      message,
      recentMessages,
      tasks,
    }),
    creationIntent: getCreationIntentInfo(message),
    updateIntent: getUpdateIntentInfo(message),
    completionIntent: getCompletionIntentInfo(message),
  });
}

async function callOpenAi({
  message,
  tasks,
  recentMessages,
}: {
  message: string;
  tasks: MiloChatTaskContext[];
  recentMessages: MiloChatRecentMessage[];
}) {
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY Supabase secret is missing.');
  }

  const model = Deno.env.get('MILO_AI_MODEL') || DEFAULT_MODEL;

  // OpenAI is called only from this Supabase Edge Function, never from Expo.
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: buildSystemPrompt(),
      input: buildUserInput({
        message,
        tasks,
        recentMessages,
      }),
      max_output_tokens: 500,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'milo_chat_response',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: {
                type: 'string',
              },
              relatedTaskId: {
                type: ['string', 'null'],
              },
              suggestedActions: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'view_task',
                    'start_focus',
                    'find_resources',
                    'open_maps',
                    'join_meeting',
                  ],
                },
              },
              usedAi: {
                type: 'boolean',
              },
              proposedTask: {
                type: ['object', 'null'],
                additionalProperties: false,
                properties: {
                  title: {
                    type: 'string',
                  },
                  type: {
                    type: 'string',
                    enum: ['task', 'meeting', 'date'],
                  },
                  priority: {
                    type: ['string', 'null'],
                    enum: ['low', 'medium', 'high', null],
                  },
                  due_date: {
                    type: ['string', 'null'],
                  },
                  due_time: {
                    type: ['string', 'null'],
                  },
                  estimated_duration_minutes: {
                    type: ['number', 'null'],
                  },
                  location: {
                    type: ['string', 'null'],
                  },
                  description: {
                    type: ['string', 'null'],
                  },
                  meeting_link: {
                    type: ['string', 'null'],
                  },
                },
                required: [
                  'title',
                  'type',
                  'priority',
                  'due_date',
                  'due_time',
                  'estimated_duration_minutes',
                  'location',
                  'description',
                  'meeting_link',
                ],
              },
              proposedTaskUpdate: {
                type: ['object', 'null'],
                additionalProperties: false,
                properties: {
                  taskId: {
                    type: 'string',
                  },
                  changes: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      title: {
                        type: ['string', 'null'],
                      },
                      description: {
                        type: ['string', 'null'],
                      },
                      type: {
                        type: ['string', 'null'],
                        enum: ['task', 'meeting', 'date', null],
                      },
                      priority: {
                        type: ['string', 'null'],
                        enum: ['low', 'medium', 'high', null],
                      },
                      due_date: {
                        type: ['string', 'null'],
                      },
                      due_time: {
                        type: ['string', 'null'],
                      },
                      estimated_duration_minutes: {
                        type: ['number', 'null'],
                      },
                      location: {
                        type: ['string', 'null'],
                      },
                      meeting_link: {
                        type: ['string', 'null'],
                      },
                    },
                    required: [
                      'title',
                      'description',
                      'type',
                      'priority',
                      'due_date',
                      'due_time',
                      'estimated_duration_minutes',
                      'location',
                      'meeting_link',
                    ],
                  },
                  reason: {
                    type: ['string', 'null'],
                  },
                },
                required: ['taskId', 'changes', 'reason'],
              },
              proposedTaskCompletion: {
                type: ['object', 'null'],
                additionalProperties: false,
                properties: {
                  taskId: {
                    type: 'string',
                  },
                  reason: {
                    type: ['string', 'null'],
                  },
                },
                required: ['taskId', 'reason'],
              },
              proposedTaskDeletion: {
                type: ['object', 'null'],
                additionalProperties: false,
                properties: {
                  taskId: {
                    type: 'string',
                  },
                  reason: {
                    type: ['string', 'null'],
                  },
                },
                required: ['taskId', 'reason'],
              },
            },
            required: [
              'text',
              'relatedTaskId',
              'suggestedActions',
              'usedAi',
              'proposedTask',
              'proposedTaskUpdate',
              'proposedTaskCompletion',
              'proposedTaskDeletion',
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  return response.json();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const message = trimText(body.message, MAX_MESSAGE_LENGTH);

  if (!message) {
    return jsonResponse({ error: 'Message is required' }, 400);
  }

  const tasks = Array.isArray(body.tasks)
    ? body.tasks
        .map(sanitizeTask)
        .filter((task): task is MiloChatTaskContext => Boolean(task))
        .slice(0, MAX_TASKS)
    : [];
  const recentMessages = Array.isArray(body.recentMessages)
    ? body.recentMessages
        .map(sanitizeRecentMessage)
        .filter((item): item is MiloChatRecentMessage => Boolean(item))
        .slice(-MAX_RECENT_MESSAGES)
    : [];
  const deletionFollowUpIntent = getDeletionFollowUpInfo({
    message,
    recentMessages,
    tasks,
  });

  if (deletionFollowUpIntent.status === 'matched') {
    const matchedTask = tasks.find(
      (task) => task.id === deletionFollowUpIntent.taskId
    );

    if (matchedTask) {
      return jsonResponse({
        text: `Awww okay, Milo found ${matchedTask.title}.\n\nDo you want me to remove it from your plan?`,
        relatedTaskId: null,
        suggestedActions: [],
        proposedTask: null,
        proposedTaskUpdate: null,
        proposedTaskCompletion: null,
        proposedTaskDeletion: {
          taskId: matchedTask.id,
          reason: deletionFollowUpIntent.reason,
        },
        usedAi: true,
      } satisfies MiloChatResponse);
    }
  }

  if (deletionFollowUpIntent.status === 'ambiguous') {
    const taskList = deletionFollowUpIntent.candidateTaskTitles.join(', ');

    return jsonResponse({
      text: `Awww okay, which one should Milo remove? I found ${taskList}.`,
      relatedTaskId: null,
      suggestedActions: [],
      proposedTask: null,
      proposedTaskUpdate: null,
      proposedTaskCompletion: null,
      proposedTaskDeletion: null,
      usedAi: true,
    } satisfies MiloChatResponse);
  }

  if (deletionFollowUpIntent.status === 'not_found') {
    return jsonResponse({
      text:
        "Milo can't find that task yet. Can you check the task title and tell me again?",
      relatedTaskId: null,
      suggestedActions: [],
      proposedTask: null,
      proposedTaskUpdate: null,
      proposedTaskCompletion: null,
      proposedTaskDeletion: null,
      usedAi: true,
    } satisfies MiloChatResponse);
  }

  try {
    const openAiResponse = await callOpenAi({
      message,
      tasks,
      recentMessages,
    });
    const outputText = extractOutputText(openAiResponse);

    if (!outputText) {
      throw new Error('OpenAI returned no output text.');
    }

    const creationIntent = getCreationIntentInfo(message);
    const updateIntent = getUpdateIntentInfo(message);
    const completionIntent = getCompletionIntentInfo(message);
    const deletionIntent = getDeletionIntentInfo(message);
    const parsedResponse = JSON.parse(outputText) as Partial<MiloChatResponse>;
    const proposedTask = deletionIntent.shouldPreferProposedTaskDeletion
      ? null
      : sanitizeProposedTask(parsedResponse.proposedTask);
    const proposedTaskUpdate =
      proposedTask || deletionIntent.shouldPreferProposedTaskDeletion
        ? null
        : sanitizeProposedTaskUpdate(parsedResponse.proposedTaskUpdate, tasks);
    const proposedTaskCompletion =
      proposedTask ||
      proposedTaskUpdate ||
      deletionIntent.shouldPreferProposedTaskDeletion
        ? null
        : sanitizeProposedTaskCompletion(
            parsedResponse.proposedTaskCompletion,
            tasks
          );
    const proposedTaskDeletion =
      proposedTask || proposedTaskUpdate || proposedTaskCompletion
        ? null
        : sanitizeProposedTaskDeletion(
            parsedResponse.proposedTaskDeletion,
            tasks
          );
    const shouldSuppressExistingTaskLink =
      Boolean(proposedTask) ||
      Boolean(proposedTaskUpdate) ||
      Boolean(proposedTaskCompletion) ||
      Boolean(proposedTaskDeletion) ||
      creationIntent.shouldPreferProposedTask ||
      updateIntent.shouldPreferProposedTaskUpdate ||
      completionIntent.shouldPreferProposedTaskCompletion ||
      deletionIntent.shouldPreferProposedTaskDeletion;
    const relatedTask =
      !shouldSuppressExistingTaskLink &&
      typeof parsedResponse.relatedTaskId === 'string'
        ? tasks.find((task) => task.id === parsedResponse.relatedTaskId)
        : undefined;

    return jsonResponse({
      text:
        trimText(parsedResponse.text, 900) ||
        'Milo is here with you. Tell me what you want to focus on next.',
      relatedTaskId: relatedTask?.id ?? null,
      suggestedActions: shouldSuppressExistingTaskLink
        ? []
        : filterSupportedActions({
            actions: parsedResponse.suggestedActions,
            message,
            relatedTask,
          }),
      proposedTask,
      proposedTaskUpdate,
      proposedTaskCompletion,
      proposedTaskDeletion,
      usedAi: true,
    } satisfies MiloChatResponse);
  } catch (error) {
    console.warn('milo-chat failed:', error);
    return fallbackResponse();
  }
});
