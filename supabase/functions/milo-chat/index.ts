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

type MiloChatResponse = {
  text: string;
  relatedTaskId?: string | null;
  suggestedActions?: MiloChatAction[];
  proposedTask?: MiloProposedTask | null;
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

function getCreationIntentInfo(message: string) {
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, ' ').trim();
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
      !hasExplicitExistingTaskIntent,
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
    'Do not propose deleting tasks, editing tasks, or silently changing existing tasks.',
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
    creationIntent: getCreationIntentInfo(message),
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
            },
            required: [
              'text',
              'relatedTaskId',
              'suggestedActions',
              'usedAi',
              'proposedTask',
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

    const parsedResponse = JSON.parse(outputText) as Partial<MiloChatResponse>;
    const proposedTask = sanitizeProposedTask(parsedResponse.proposedTask);
    const creationIntent = getCreationIntentInfo(message);
    const shouldSuppressExistingTaskLink =
      Boolean(proposedTask) || creationIntent.shouldPreferProposedTask;
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
      usedAi: true,
    } satisfies MiloChatResponse);
  } catch (error) {
    console.warn('milo-chat failed:', error);
    return fallbackResponse();
  }
});
