import type { OnlineMeetingLink } from './meetingLinkStorage';
import { getTaskUrgency } from './taskUrgency';
import type { Task } from '../types/task';

export type MiloBrainIntent =
  | 'greeting'
  | 'thanks'
  | 'now'
  | 'urgent'
  | 'due_today'
  | 'prepare_meeting'
  | 'assignment'
  | 'find_resources'
  | 'meeting_link'
  | 'open_maps'
  | 'general';

export type MiloBrainActionType =
  | 'viewTask'
  | 'startFocus'
  | 'findResources'
  | 'openMaps'
  | 'joinMeeting';

export type MiloBrainAction = {
  type: MiloBrainActionType;
  label: string;
  taskId?: string;
  location?: string;
  meetingUrl?: string;
};

export type MiloBrainReply = {
  intent: MiloBrainIntent;
  text: string;
  relatedTask?: Task;
  relatedTaskSummary?: string;
  actions: MiloBrainAction[];
};

type MiloBrainInput = {
  message: string;
  tasks: Task[];
  meetingLinks?: OnlineMeetingLink[];
  now?: Date;
};

type ActionOptions = {
  includeStartFocus?: boolean;
  includeResources?: boolean;
  includeMaps?: boolean;
  includeMeeting?: boolean;
  meetingLink?: OnlineMeetingLink | null;
  primaryAction?: MiloBrainActionType;
};

const ACADEMIC_KEYWORDS = [
  'assignment',
  'coursework',
  'documentation',
  'fyp',
  'homework',
  'lab',
  'presentation',
  'project',
  'proposal',
  'report',
  'research',
  'revision',
  'slides',
  'study',
  'thesis',
];

const MEETING_PREP_KEYWORDS = [
  'agenda',
  'brief',
  'client',
  'discussion',
  'meeting',
  'minutes',
  'supervisor',
  'sync',
];

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTomorrowDateKey(now: Date) {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  return getLocalDateKey(tomorrow);
}

function normalizeMessage(message: string) {
  return message.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function hasAnyWord(value: string, words: string[]) {
  return words.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(value));
}

function isThanksMessage(value: string) {
  return (
    value === 'thanks' ||
    value === 'thank you' ||
    value === 'thank u' ||
    value === 'thanks milo' ||
    value === 'thank you milo'
  );
}

function isGreetingMessage(value: string) {
  const greetings = [
    'hi',
    'hello',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
  ];

  if (greetings.includes(value)) return true;

  return greetings.some((greeting) => {
    const remainingText = value.replace(greeting, '').trim();

    return (
      value.startsWith(`${greeting} `) &&
      ['milo', 'there', 'milo there'].includes(remainingText)
    );
  });
}

function parseDateKey(dateKey?: string) {
  if (!dateKey) return null;

  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseTimeValue(timeValue?: string) {
  const timeMatch = timeValue
    ?.trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || '0');
  const meridian = timeMatch[3];

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  if (meridian === 'AM' && hour === 12) hour = 0;
  if (meridian === 'PM' && hour !== 12) hour += 12;

  if (hour < 0 || hour > 23) return null;

  return { hour, minute };
}

function parseTaskDateTime(task: Task) {
  const date = parseDateKey(task.dueDate);
  const time = parseTimeValue(task.dueTime);

  if (!date || !time) return null;

  date.setHours(time.hour, time.minute, 0, 0);
  return date;
}

function getDueSortTime(task: Task) {
  const dateTime = parseTaskDateTime(task);
  if (dateTime) return dateTime.getTime();

  const date = parseDateKey(task.dueDate);
  if (date) return date.getTime();

  return Number.MAX_SAFE_INTEGER;
}

function getPriorityScore(task: Task) {
  if (task.priority === 'high') return 24;
  if (task.priority === 'medium') return 12;
  return 4;
}

function getMiloUrgencyScore(task: Task) {
  if (task.miloUrgency === 'high') return 24;
  if (task.miloUrgency === 'medium') return 14;
  if (task.miloUrgency === 'low') return 6;
  return 0;
}

function getTaskNowScore(task: Task, now: Date) {
  const start = parseTaskDateTime(task);
  if (!start) return 0;

  const durationMinutes = task.estimatedDurationMinutes || 60;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const nowMs = now.getTime();
  const minutesUntilStart = Math.round((start.getTime() - nowMs) / 60000);

  if (nowMs >= start.getTime() && nowMs <= end.getTime()) return 140;
  if (minutesUntilStart >= 0 && minutesUntilStart <= 30) return 115;
  if (minutesUntilStart > 30 && minutesUntilStart <= 90) return 70;
  return 0;
}

function getTaskBrainScore(task: Task, now: Date) {
  const urgency = getTaskUrgency(task, now);
  const todayKey = getLocalDateKey(now);
  const dueTodayBoost = task.dueDate === todayKey ? 18 : 0;
  const meetingBoost = task.plannerType === 'meeting' ? 4 : 0;

  return (
    urgency.score +
    getTaskNowScore(task, now) +
    getPriorityScore(task) +
    getMiloUrgencyScore(task) +
    dueTodayBoost +
    meetingBoost
  );
}

function sortByBrainRank(tasks: Task[], now: Date) {
  return [...tasks].sort((first, second) => {
    const scoreDifference =
      getTaskBrainScore(second, now) - getTaskBrainScore(first, now);

    if (scoreDifference !== 0) return scoreDifference;

    const dueDifference = getDueSortTime(first) - getDueSortTime(second);
    if (dueDifference !== 0) return dueDifference;

    return first.createdAt.localeCompare(second.createdAt);
  });
}

function getTaskText(task: Task) {
  return `${task.title} ${task.description || ''}`.toLowerCase();
}

function isAcademicTask(task: Task) {
  return includesAny(getTaskText(task), ACADEMIC_KEYWORDS);
}

function isMeetingPrepTask(task: Task) {
  return (
    task.plannerType === 'meeting' ||
    includesAny(getTaskText(task), MEETING_PREP_KEYWORDS)
  );
}

function getTaskLabel(task: Task) {
  if (task.plannerType === 'meeting') return 'meeting';
  if (task.plannerType === 'date') return 'date plan';
  return 'task';
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDueLabel(task: Task, now: Date) {
  if (!task.dueDate && !task.dueTime) return 'No due time';

  const todayKey = getLocalDateKey(now);
  const tomorrowKey = getTomorrowDateKey(now);
  const dueDate = parseDateKey(task.dueDate);
  const dueDateLabel =
    task.dueDate === todayKey
      ? 'Today'
      : task.dueDate === tomorrowKey
      ? 'Tomorrow'
      : dueDate
      ? dueDate.toLocaleDateString('en-MY', {
          day: 'numeric',
          month: 'short',
        })
      : task.dueDate || '';

  return [dueDateLabel, task.dueTime].filter(Boolean).join(', ');
}

function buildTaskSummary(task: Task, now: Date) {
  return `${titleCase(getTaskLabel(task))} | ${titleCase(
    task.priority
  )} priority | ${formatDueLabel(task, now)}`;
}

function getMeetingLinkForTask(
  task: Task | undefined,
  meetingLinks: OnlineMeetingLink[]
) {
  if (!task) return null;

  return meetingLinks.find((meetingLink) => meetingLink.taskId === task.id) || null;
}

function orderActions(
  actions: MiloBrainAction[],
  primaryAction?: MiloBrainActionType
) {
  if (!primaryAction) return actions;

  return [...actions].sort((first, second) => {
    if (first.type === primaryAction) return -1;
    if (second.type === primaryAction) return 1;
    return 0;
  });
}

function buildActions(task: Task | undefined, options: ActionOptions = {}) {
  const actions: MiloBrainAction[] = [];
  const taskId = task?.id;

  if (taskId) {
    actions.push({
      type: 'viewTask',
      label: 'View Task',
      taskId,
    });
  }

  if (options.includeStartFocus) {
    actions.push({
      type: 'startFocus',
      label: 'Start Focus',
      taskId,
    });
  }

  if (options.includeResources && taskId) {
    actions.push({
      type: 'findResources',
      label: 'Find Resources',
      taskId,
    });
  }

  const location = task?.location?.trim();
  if (options.includeMaps && taskId && location) {
    actions.push({
      type: 'openMaps',
      label: 'Open Maps',
      taskId,
      location,
    });
  }

  if (options.includeMeeting && taskId && options.meetingLink?.url) {
    actions.push({
      type: 'joinMeeting',
      label: 'Join Meeting',
      taskId,
      meetingUrl: options.meetingLink.url,
    });
  }

  return orderActions(actions, options.primaryAction);
}

function createReply({
  intent,
  text,
  task,
  actions,
  now,
}: {
  intent: MiloBrainIntent;
  text: string;
  task?: Task;
  actions: MiloBrainAction[];
  now: Date;
}): MiloBrainReply {
  return {
    intent,
    text,
    relatedTask: task,
    relatedTaskSummary: task ? buildTaskSummary(task, now) : undefined,
    actions,
  };
}

function detectIntent(message: string): MiloBrainIntent {
  const normalizedMessage = normalizeMessage(message);

  if (
    normalizedMessage.includes('meeting link') ||
    normalizedMessage.includes('meet link') ||
    normalizedMessage.includes('join meeting') ||
    normalizedMessage.includes('online meeting') ||
    hasAnyWord(normalizedMessage, ['zoom', 'teams', 'webex'])
  ) {
    return 'meeting_link';
  }

  if (
    normalizedMessage.includes('open maps') ||
    normalizedMessage.includes('google maps') ||
    normalizedMessage.includes('directions') ||
    normalizedMessage.includes('route') ||
    hasAnyWord(normalizedMessage, ['map', 'maps', 'location', 'where'])
  ) {
    return 'open_maps';
  }

  if (
    normalizedMessage.includes('find resource') ||
    normalizedMessage.includes('find resources') ||
    normalizedMessage.includes('search resource') ||
    normalizedMessage.includes('search resources') ||
    hasAnyWord(normalizedMessage, ['resources', 'reference', 'references', 'tutorial'])
  ) {
    return 'find_resources';
  }

  if (
    normalizedMessage.includes('due today') ||
    normalizedMessage.includes('today due') ||
    normalizedMessage.includes('today tasks') ||
    normalizedMessage.includes('what is due')
  ) {
    return 'due_today';
  }

  if (
    normalizedMessage.includes('what is urgent') ||
    normalizedMessage.includes('what s urgent') ||
    normalizedMessage.includes('most urgent') ||
    normalizedMessage.includes('highest priority') ||
    hasAnyWord(normalizedMessage, ['urgent', 'important'])
  ) {
    return 'urgent';
  }

  if (
    normalizedMessage.includes('prepare for my meeting') ||
    normalizedMessage.includes('prepare meeting') ||
    normalizedMessage.includes('meeting prep') ||
    (normalizedMessage.includes('prepare') && normalizedMessage.includes('meeting'))
  ) {
    return 'prepare_meeting';
  }

  if (
    normalizedMessage.includes('my assignment') ||
    normalizedMessage.includes('with assignment') ||
    includesAny(normalizedMessage, ACADEMIC_KEYWORDS)
  ) {
    return 'assignment';
  }

  if (
    normalizedMessage.includes('what should i do now') ||
    normalizedMessage.includes('what do i do now') ||
    normalizedMessage.includes('do now') ||
    normalizedMessage.includes('start now') ||
    normalizedMessage.includes('next task') ||
    normalizedMessage.includes('next step')
  ) {
    return 'now';
  }

  if (normalizedMessage.includes('prepare')) {
    return 'prepare_meeting';
  }

  if (isThanksMessage(normalizedMessage)) {
    return 'thanks';
  }

  if (isGreetingMessage(normalizedMessage)) {
    return 'greeting';
  }

  return 'general';
}

function getPendingTasks(tasks: Task[]) {
  return tasks.filter((task) => task.status !== 'completed');
}

function getTopRankedTask(tasks: Task[], now: Date) {
  return sortByBrainRank(tasks, now)[0];
}

function buildEmptyPlannerReply(intent: MiloBrainIntent, now: Date) {
  return createReply({
    intent,
    now,
    text:
      'Milo does not see any pending planner items yet. Add one tiny task, then I can help you choose the next step.',
    actions: [
      {
        type: 'startFocus',
        label: 'Start Focus',
      },
    ],
  });
}

export function buildMiloBrainReply({
  message,
  tasks,
  meetingLinks = [],
  now = new Date(),
}: MiloBrainInput): MiloBrainReply {
  const intent = detectIntent(message);

  if (intent === 'thanks') {
    return createReply({
      intent,
      now,
      text: 'Anytime. Milo is here to help you stay on track.',
      actions: [],
    });
  }

  if (intent === 'greeting') {
    return createReply({
      intent,
      now,
      text:
        "Hi! I'm here with you. Ask me what to focus on, what is urgent, or how to prepare for your task.",
      actions: [],
    });
  }

  const pendingTasks = getPendingTasks(tasks);

  if (pendingTasks.length === 0) {
    return buildEmptyPlannerReply(intent, now);
  }

  const todayKey = getLocalDateKey(now);
  const topTask = getTopRankedTask(pendingTasks, now);

  if (intent === 'meeting_link') {
    const linkedMeetingTask = getTopRankedTask(
      pendingTasks.filter((task) => getMeetingLinkForTask(task, meetingLinks)),
      now
    );
    const fallbackMeetingTask = getTopRankedTask(
      pendingTasks.filter((task) => task.plannerType === 'meeting'),
      now
    );
    const task = linkedMeetingTask || fallbackMeetingTask;
    const meetingLink = getMeetingLinkForTask(task, meetingLinks);

    if (!task) {
      return createReply({
        intent,
        now,
        text:
          'I do not see a pending meeting right now. Add the meeting to your planner and Milo can keep the link ready.',
        actions: buildActions(topTask, {
          includeStartFocus: true,
          primaryAction: 'startFocus',
        }),
      });
    }

    if (!meetingLink) {
      return createReply({
        intent,
        now,
        task,
        text: `I found "${task.title}", but I do not see an online meeting link saved for it yet. Open the task to add or check the link.`,
        actions: buildActions(task, {
          includeStartFocus: true,
          includeMaps: true,
          primaryAction: 'viewTask',
        }),
      });
    }

    return createReply({
      intent,
      now,
      task,
      text: `I found the meeting link for "${task.title}". Join when you are ready, and keep a minute to check audio first.`,
      actions: buildActions(task, {
        includeMeeting: true,
        includeStartFocus: true,
        includeMaps: true,
        meetingLink,
        primaryAction: 'joinMeeting',
      }),
    });
  }

  if (intent === 'open_maps') {
    const task = getTopRankedTask(
      pendingTasks.filter((item) => Boolean(item.location?.trim())),
      now
    );

    if (!task) {
      return createReply({
        intent,
        now,
        text:
          'I do not see a saved location yet. Open a task or meeting and add the place so Milo can open Maps next time.',
        actions: buildActions(topTask, {
          includeStartFocus: true,
          includeResources: true,
          primaryAction: 'viewTask',
        }),
      });
    }

    return createReply({
      intent,
      now,
      task,
      text: `I found the location for "${task.title}". Milo can open Maps so you can plan the route calmly.`,
      actions: buildActions(task, {
        includeMaps: true,
        includeStartFocus: true,
        primaryAction: 'openMaps',
      }),
    });
  }

  if (intent === 'due_today') {
    const dueTodayTasks = sortByBrainRank(
      pendingTasks.filter((task) => task.dueDate === todayKey),
      now
    );
    const task = dueTodayTasks[0];

    if (!task) {
      return createReply({
        intent,
        now,
        text:
          'Nothing is due today. Milo likes this calm window. If you want momentum, start one small early step.',
        actions: buildActions(topTask, {
          includeStartFocus: true,
          includeResources: isAcademicTask(topTask),
          primaryAction: 'startFocus',
        }),
        task: topTask,
      });
    }

    return createReply({
      intent,
      now,
      task,
      text:
        dueTodayTasks.length === 1
          ? `"${task.title}" is due today. Milo suggests one focused step now so it feels smaller.`
          : `"${task.title}" is the first of ${dueTodayTasks.length} items due today. Start here, then we can move through the list gently.`,
      actions: buildActions(task, {
        includeStartFocus: true,
        includeResources: isAcademicTask(task),
        includeMaps: true,
        includeMeeting: task.plannerType === 'meeting',
        meetingLink: getMeetingLinkForTask(task, meetingLinks),
        primaryAction: 'startFocus',
      }),
    });
  }

  if (intent === 'urgent') {
    const urgentTasks = sortByBrainRank(
      pendingTasks.filter((task) => {
        const urgency = getTaskUrgency(task, now);

        return (
          urgency.level === 'overdue' ||
          urgency.level === 'urgent' ||
          urgency.level === 'high' ||
          task.priority === 'high' ||
          task.miloUrgency === 'high'
        );
      }),
      now
    );
    const task = urgentTasks[0] || topTask;
    const urgency = getTaskUrgency(task, now);

    return createReply({
      intent,
      now,
      task,
      text:
        urgency.level === 'overdue'
          ? `"${task.title}" is overdue. No panic - Milo recommends one recovery step first.`
          : urgency.level === 'urgent'
          ? `"${task.title}" is the most urgent because it is due today. Start small and protect your energy.`
          : `"${task.title}" looks like the highest-focus item right now. Milo would put this near the top.`,
      actions: buildActions(task, {
        includeStartFocus: true,
        includeResources: isAcademicTask(task),
        includeMaps: true,
        includeMeeting: task.plannerType === 'meeting',
        meetingLink: getMeetingLinkForTask(task, meetingLinks),
        primaryAction: 'startFocus',
      }),
    });
  }

  if (intent === 'prepare_meeting') {
    const meetingTask = getTopRankedTask(
      pendingTasks.filter(isMeetingPrepTask),
      now
    );
    const task = meetingTask || topTask;
    const meetingLink = getMeetingLinkForTask(task, meetingLinks);

    return createReply({
      intent,
      now,
      task,
      text:
        task.plannerType === 'meeting'
          ? `For "${task.title}", Milo suggests: check the agenda, prepare notes or questions, and keep the link or location ready.`
          : `I do not see a meeting at the top, so I picked "${task.title}". Milo suggests making a quick checklist before you begin.`,
      actions: buildActions(task, {
        includeStartFocus: true,
        includeResources: true,
        includeMaps: true,
        includeMeeting: Boolean(meetingLink),
        meetingLink,
        primaryAction: meetingLink ? 'joinMeeting' : 'viewTask',
      }),
    });
  }

  if (intent === 'assignment' || intent === 'find_resources') {
    const academicTask = getTopRankedTask(
      pendingTasks.filter(isAcademicTask),
      now
    );
    const task = academicTask || topTask;

    return createReply({
      intent,
      now,
      task,
      text:
        intent === 'find_resources'
          ? `I can help find resources for "${task.title}". Milo will use the task title and notes as local search keywords.`
          : `Let's make "${task.title}" less scary. Start with one tiny section, then use resources if you need references.`,
      actions: buildActions(task, {
        includeStartFocus: true,
        includeResources: true,
        primaryAction: intent === 'find_resources' ? 'findResources' : 'startFocus',
      }),
    });
  }

  return createReply({
    intent,
    now,
    text: `I'm not fully sure yet, but I can help with your tasks. Try asking what is urgent, what is due today, or how to prepare. I can also help you start with "${topTask.title}".`,
    actions: [],
  });
}
