import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useAuth } from '../lib/AuthContext';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';
import { openLocationInMaps } from '../lib/mapUtils';
import {
  buildMiloBrainReply,
  type MiloBrainAction,
} from '../lib/miloBrain';
import {
  askMiloAi,
  buildMiloAiRecentMessages,
  type MiloAiFocusStats,
  type MiloAiDebugReason,
  type MiloAiInsight,
  type MiloAiProposedTaskCompletion,
  type MiloAiProposedTaskDeletion,
  type MiloAiProposedTask,
  type MiloAiProposedTaskUpdate,
  type MiloAiSuggestedAction,
  type MiloAiSmartNudge,
  type MiloAiSmartPlan,
  type MiloAiTimelineInsight,
} from '../lib/miloAiClient';
import {
  loadOnlineMeetingLinks,
  saveOnlineMeetingLink,
  type OnlineMeetingLink,
} from '../lib/meetingLinkStorage';
import {
  isLikelyMeetingUrl,
  normalizeMeetingUrl,
  openMeetingLink,
} from '../lib/meetingLinkUtils';
import {
  archiveCurrentMiloChat,
  clearCurrentMiloChat,
  loadCurrentMiloChat,
  loadMiloChatSession,
  saveCurrentMiloChat,
  type MiloChatStorageMessage,
  type MiloChatStoredProposalStatus,
  type MiloChatStoredTaskSnapshot,
} from '../lib/miloChatStorage';
import {
  DEFAULT_MILO_AI_SETTINGS,
  incrementMiloAiCallsToday,
  loadMiloAiSettings,
  resetMiloAiSettings,
  updateMiloAiSettings,
  type MiloAiSettings,
} from '../lib/miloAiSettings';
import type { FocusSession } from '../types/focus';
import type { RootStackParamList } from '../types/navigation';
import type { Task } from '../types/task';

import MiloMoodImage from '../components/milo/MiloMoodImage';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type MiloTalkRole = 'user' | 'milo';
type MiloTalkBrainStatus =
  | 'ready'
  | 'online'
  | 'fallback'
  | 'localOnly'
  | 'smallTalk';
type MiloProposedTaskStatus = 'pending' | 'created' | 'cancelled';
type MiloProposedTaskUpdateStatus = 'pending' | 'updated' | 'cancelled';
type MiloProposedTaskCompletionStatus = 'pending' | 'completed' | 'cancelled';
type MiloProposedTaskDeletionStatus = 'pending' | 'removed' | 'cancelled';

type MiloTalkMessage = {
  id: string;
  role: MiloTalkRole;
  text: string;
  relatedTask?: Task;
  relatedTaskSummary?: string;
  actions?: MiloBrainAction[];
  createdAt: string;
  isTyping?: boolean;
  proposedTask?: MiloAiProposedTask;
  proposedTaskStatus?: MiloProposedTaskStatus;
  proposedTaskSourceText?: string;
  proposedTaskUpdate?: MiloAiProposedTaskUpdate;
  proposedTaskUpdateStatus?: MiloProposedTaskUpdateStatus;
  proposedTaskCompletion?: MiloAiProposedTaskCompletion;
  proposedTaskCompletionStatus?: MiloProposedTaskCompletionStatus;
  proposedTaskDeletion?: MiloAiProposedTaskDeletion;
  proposedTaskDeletionStatus?: MiloProposedTaskDeletionStatus;
  proposedTaskDeletionSnapshot?: Task;
  smartPlan?: MiloAiSmartPlan;
  smartNudge?: MiloAiSmartNudge;
  timelineInsight?: MiloAiTimelineInsight;
  miloInsight?: MiloAiInsight;
};

const MILO_TALK_INITIAL_TEXT =
  'Hi, I’m Milo. Ask me what to focus on, what is urgent, or how to prepare for your task.';

const miloTalkSuggestions = [
  'What should I do now?',
  'What is urgent?',
  'Due today?',
  'Help me prepare',
  'Find resources',
];

const miloTalkSuggestionIcons: Record<string, IconName> = {
  'What should I do now?': 'sparkles-outline',
  'What is urgent?': 'notifications-outline',
  'Due today?': 'calendar-outline',
  'Help me prepare': 'create-outline',
  'Find resources': 'book-outline',
};

const simpleSmallTalkMessages = new Set([
  'bye',
  'good morning',
  'good night',
  'hai',
  'haha',
  'helo',
  'hello',
  'hey',
  'hi',
  'hii',
  'ok',
  'okay',
  'thank u',
  'thank you',
  'thanks',
  'tq',
]);

const onlineOnlyPromptKeywords = [
  'add a date',
  'add a meeting',
  'add a task',
  'add date',
  'add meeting',
  'add task',
  'cancel task',
  'change',
  'create',
  'delete',
  'edit',
  'give me my insight',
  'insight',
  'make a plan',
  'mark as done',
  'mark done',
  'move',
  'plan my day',
  'plan today',
  'remove',
  'rename',
  'reschedule',
  'schedule',
  'set date',
  'smart nudge',
  'smart plan',
  'timeline',
  'update',
];

const localSafePromptKeywords = [
  'completed tasks',
  'do i have a meeting',
  'do i have a meeting link',
  'do i have meeting',
  'do i have meeting link',
  'do i need maps',
  'due today',
  'due tomorrow',
  'find resources',
  'focus now',
  'focus task',
  'help me prepare',
  'how many tasks',
  'join meeting',
  'meeting link',
  'open maps',
  'overdue',
  'pending tasks',
  'prepare meeting',
  'resources for this task',
  'start focus',
  'summary today',
  'task summary',
  'urgent',
  'what is completed',
  'what is due today',
  'what is overdue',
  'what is pending',
  'what is urgent',
  'what should i do now',
  'what should i focus on',
  'where is my next location',
];

const localSafeExactPrompts = new Set([
  'completed tasks',
  'due today',
  'due tomorrow',
  'find resources',
  'focus now',
  'focus task',
  'hello',
  'help me prepare',
  'join meeting',
  'meeting link',
  'open maps',
  'overdue',
  'pending tasks',
  'start focus',
  'summary',
  'urgent',
]);

const localSafePromptExclusions = [
  'create task',
  'insight',
  'plan',
  'smart nudge',
  'timeline',
];

function createInitialMiloTalkMessages(): MiloTalkMessage[] {
  return [
    {
      id: 'milo-initial-message',
      role: 'milo',
      text: MILO_TALK_INITIAL_TEXT,
      createdAt: new Date().toISOString(),
    },
  ];
}

function normalizeMiloLocalPrompt(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bmilo\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSimpleMiloSmallTalk(message: string) {
  const normalizedMessage = normalizeMiloLocalPrompt(message);

  if (!normalizedMessage) {
    return false;
  }

  return simpleSmallTalkMessages.has(normalizedMessage);
}

function hasOnlineOnlyMiloIntent(message: string) {
  const normalizedMessage = normalizeMiloLocalPrompt(message);

  if (!normalizedMessage) {
    return false;
  }

  if (
    onlineOnlyPromptKeywords.some((keyword) =>
      normalizedMessage.includes(keyword)
    )
  ) {
    return !(
      normalizedMessage.includes('what is completed') ||
      normalizedMessage.includes('completed tasks')
    );
  }

  return false;
}

function isLocalSafePrompt(message: string) {
  const normalizedMessage = normalizeMiloLocalPrompt(message);

  if (!normalizedMessage || hasOnlineOnlyMiloIntent(message)) {
    return false;
  }

  if (
    isSimpleMiloSmallTalk(message) ||
    localSafeExactPrompts.has(normalizedMessage)
  ) {
    return true;
  }

  if (
    localSafePromptExclusions.some((keyword) =>
      normalizedMessage.includes(keyword)
    )
  ) {
    return false;
  }

  return localSafePromptKeywords.some((keyword) =>
    normalizedMessage.includes(keyword)
  );
}

function shouldUseLocalOnlyForMessage(
  message: string,
  settings: MiloAiSettings
) {
  return (
    settings.aiMode === 'local' ||
    (settings.skipAiForSmallTalk && isLocalSafePrompt(message))
  );
}

const talkActionIcons: Record<MiloBrainAction['type'], IconName> = {
  viewTask: 'document-text-outline',
  startFocus: 'timer-outline',
  findResources: 'search-outline',
  openMaps: 'map-outline',
  joinMeeting: 'videocam-outline',
};

const aiActionConfig: Record<
  MiloAiSuggestedAction,
  Pick<MiloBrainAction, 'type' | 'label'>
> = {
  view_task: {
    type: 'viewTask',
    label: 'View Task',
  },
  start_focus: {
    type: 'startFocus',
    label: 'Start Focus',
  },
  find_resources: {
    type: 'findResources',
    label: 'Find Resources',
  },
  open_maps: {
    type: 'openMaps',
    label: 'Open Maps',
  },
  join_meeting: {
    type: 'joinMeeting',
    label: 'Join Meeting',
  },
};

const proposedTaskIcons: Record<Task['plannerType'], IconName> = {
  task: 'checkbox-outline',
  meeting: 'people-outline',
  date: 'heart-outline',
};

function createMiloTalkMessageId(role: MiloTalkRole) {
  return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildTodayMiloAiFocusStats(
  focusSessions: FocusSession[]
): MiloAiFocusStats {
  const todayDate = getTodayDateKey();
  const todayFocusSessions = focusSessions.filter(
    (session) => session.completedAt.slice(0, 10) === todayDate
  );

  return {
    focusMinutesToday: todayFocusSessions.reduce(
      (total, session) => total + session.minutes,
      0
    ),
    focusSessionsToday: todayFocusSessions.length,
  };
}

function buildMiloTalkTaskSummary(task: Task) {
  const typeLabel =
    task.plannerType === 'meeting'
      ? 'meeting'
      : task.plannerType === 'date'
      ? 'date plan'
      : 'task';
  const dueLabel = [task.dueDate, task.dueTime].filter(Boolean).join(', ');

  return `${titleCase(typeLabel)} | ${titleCase(task.priority)} priority | ${
    dueLabel || 'No due time'
  }`;
}

function buildStoredTaskSnapshot(
  task?: Task
): MiloChatStoredTaskSnapshot | undefined {
  if (!task) {
    return undefined;
  }

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    dueTime: task.dueTime,
    location: task.location,
    plannerType: task.plannerType,
    priority: task.priority,
    estimatedDurationMinutes: task.estimatedDurationMinutes,
    status: task.status,
    createdAt: task.createdAt,
  };
}

function restoreStoredTaskSnapshot(
  snapshot?: MiloChatStoredTaskSnapshot
): Task | undefined {
  if (!snapshot) {
    return undefined;
  }

  return {
    ...snapshot,
    subtasks: [],
  };
}

function getStoredMessageRelatedTaskId(message: MiloTalkMessage) {
  return (
    message.relatedTask?.id ||
    message.actions?.find((action) => action.taskId)?.taskId ||
    message.proposedTaskUpdate?.taskId ||
    message.proposedTaskCompletion?.taskId ||
    message.proposedTaskDeletion?.taskId ||
    message.smartNudge?.taskId ||
    message.miloInsight?.nextBestTaskId ||
    null
  );
}

function serializeMiloTalkMessages(
  messages: MiloTalkMessage[]
): MiloChatStorageMessage[] {
  return messages
    .filter((message) => !message.isTyping && message.text.trim())
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
      relatedTaskId: getStoredMessageRelatedTaskId(message),
      relatedTaskSummary: message.relatedTaskSummary,
      actions: message.actions?.map((action) => ({
        type: action.type,
        label: action.label,
        taskId: action.taskId,
        location: action.location,
      })),
      proposedTask: message.proposedTask,
      proposedTaskStatus: message.proposedTaskStatus,
      proposedTaskSourceText: message.proposedTaskSourceText,
      proposedTaskUpdate: message.proposedTaskUpdate,
      proposedTaskUpdateStatus: message.proposedTaskUpdateStatus,
      proposedTaskCompletion: message.proposedTaskCompletion,
      proposedTaskCompletionStatus: message.proposedTaskCompletionStatus,
      proposedTaskDeletion: message.proposedTaskDeletion,
      proposedTaskDeletionStatus: message.proposedTaskDeletionStatus,
      proposedTaskDeletionSnapshot: buildStoredTaskSnapshot(
        message.proposedTaskDeletionSnapshot
      ),
      smartPlan: message.smartPlan,
      smartNudge: message.smartNudge,
      timelineInsight: message.timelineInsight,
      miloInsight: message.miloInsight,
    }));
}

function getMiloChatStorageSignature(messages: MiloChatStorageMessage[]) {
  return JSON.stringify(messages);
}

function getProposedTaskStatus(
  status?: MiloChatStoredProposalStatus
): MiloProposedTaskStatus | undefined {
  return status === 'pending' || status === 'created' || status === 'cancelled'
    ? status
    : undefined;
}

function getProposedTaskUpdateStatus(
  status?: MiloChatStoredProposalStatus
): MiloProposedTaskUpdateStatus | undefined {
  return status === 'pending' || status === 'updated' || status === 'cancelled'
    ? status
    : undefined;
}

function getProposedTaskCompletionStatus(
  status?: MiloChatStoredProposalStatus
): MiloProposedTaskCompletionStatus | undefined {
  return status === 'pending' ||
    status === 'completed' ||
    status === 'cancelled'
    ? status
    : undefined;
}

function getProposedTaskDeletionStatus(
  status?: MiloChatStoredProposalStatus
): MiloProposedTaskDeletionStatus | undefined {
  return status === 'pending' || status === 'removed' || status === 'cancelled'
    ? status
    : undefined;
}

function hydrateMiloTalkMessages(
  storedMessages: MiloChatStorageMessage[],
  tasks: Task[]
): MiloTalkMessage[] {
  return storedMessages.map((message) => {
    const relatedTask = message.relatedTaskId
      ? tasks.find((task) => task.id === message.relatedTaskId)
      : undefined;

    return {
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
      relatedTask,
      relatedTaskSummary: relatedTask
        ? buildMiloTalkTaskSummary(relatedTask)
        : message.relatedTaskSummary,
      actions: message.actions?.map((action) => ({
        type: action.type,
        label: action.label,
        taskId: action.taskId,
        location: action.location,
      })),
      proposedTask: message.proposedTask,
      proposedTaskStatus: getProposedTaskStatus(message.proposedTaskStatus),
      proposedTaskSourceText: message.proposedTaskSourceText,
      proposedTaskUpdate: message.proposedTaskUpdate,
      proposedTaskUpdateStatus: getProposedTaskUpdateStatus(
        message.proposedTaskUpdateStatus
      ),
      proposedTaskCompletion: message.proposedTaskCompletion,
      proposedTaskCompletionStatus: getProposedTaskCompletionStatus(
        message.proposedTaskCompletionStatus
      ),
      proposedTaskDeletion: message.proposedTaskDeletion,
      proposedTaskDeletionStatus: getProposedTaskDeletionStatus(
        message.proposedTaskDeletionStatus
      ),
      proposedTaskDeletionSnapshot: restoreStoredTaskSnapshot(
        message.proposedTaskDeletionSnapshot
      ),
      smartPlan: message.smartPlan,
      smartNudge: message.smartNudge,
      timelineInsight: message.timelineInsight,
      miloInsight: message.miloInsight,
    };
  });
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

function findRelatedTaskByAiId(tasks: Task[], taskId?: string | null) {
  if (!taskId) {
    return undefined;
  }

  return tasks.find((task) => task.id === taskId);
}

function getMeetingLinkForTask(
  task: Task | undefined,
  meetingLinks: OnlineMeetingLink[]
) {
  if (!task) {
    return undefined;
  }

  return meetingLinks.find((meetingLink) => meetingLink.taskId === task.id);
}

function buildValidatedMiloAiActions({
  message,
  onlineMeetingLinks,
  relatedTask,
  suggestedActions = [],
}: {
  message: string;
  onlineMeetingLinks: OnlineMeetingLink[];
  relatedTask?: Task;
  suggestedActions?: MiloAiSuggestedAction[];
}) {
  const validatedActions: MiloBrainAction[] = [];
  const seenActions = new Set<MiloAiSuggestedAction>();

  suggestedActions.forEach((suggestedAction) => {
    const actionConfig = aiActionConfig[suggestedAction];

    if (!actionConfig || seenActions.has(suggestedAction)) {
      return;
    }

    if (
      (suggestedAction === 'view_task' ||
        suggestedAction === 'start_focus') &&
      !relatedTask
    ) {
      return;
    }

    if (
      suggestedAction === 'find_resources' &&
      !relatedTask &&
      !userAskedForResources(message)
    ) {
      return;
    }

    if (
      suggestedAction === 'open_maps' &&
      (!relatedTask || !relatedTask.location?.trim())
    ) {
      return;
    }

    const meetingLink = getMeetingLinkForTask(relatedTask, onlineMeetingLinks);
    if (suggestedAction === 'join_meeting' && !meetingLink?.url) {
      return;
    }

    seenActions.add(suggestedAction);
    validatedActions.push({
      ...actionConfig,
      taskId: relatedTask?.id,
      location:
        suggestedAction === 'open_maps'
          ? relatedTask?.location?.trim()
          : undefined,
      meetingUrl:
        suggestedAction === 'join_meeting' ? meetingLink?.url : undefined,
    });
  });

  return validatedActions;
}

function buildValidatedPlanningAction({
  onlineMeetingLinks,
  suggestedAction,
  taskId,
  tasks,
}: {
  onlineMeetingLinks: OnlineMeetingLink[];
  suggestedAction?: MiloAiSuggestedAction | null;
  taskId?: string | null;
  tasks: Task[];
}) {
  if (!suggestedAction) {
    return {
      action: undefined,
      task: undefined,
    };
  }

  const task = taskId ? tasks.find((item) => item.id === taskId) : undefined;
  const actions = buildValidatedMiloAiActions({
    message: 'planning guidance',
    onlineMeetingLinks,
    relatedTask: task,
    suggestedActions: [suggestedAction],
  });

  return {
    action: actions[0],
    task,
  };
}

function formatMiloInsightStat(
  value: number | null | undefined,
  suffix?: string
) {
  if (typeof value !== 'number') {
    return undefined;
  }

  return suffix ? `${value} ${suffix}` : `${value}`;
}

function getMiloInsightStatRows(stats?: MiloAiInsight['stats'] | null) {
  if (!stats) {
    return [];
  }

  return [
    {
      label: 'Completed today',
      value: formatMiloInsightStat(stats.completedToday),
    },
    {
      label: 'Pending',
      value: formatMiloInsightStat(stats.pending),
    },
    {
      label: 'Overdue',
      value: formatMiloInsightStat(stats.overdue),
    },
    {
      label: 'Due today',
      value: formatMiloInsightStat(stats.dueToday),
    },
    {
      label: 'High priority',
      value: formatMiloInsightStat(stats.highPriority),
    },
    {
      label: 'Focus minutes',
      value: formatMiloInsightStat(stats.focusMinutesToday, 'min'),
    },
    {
      label: 'Focus sessions',
      value: formatMiloInsightStat(stats.focusSessionsToday),
    },
  ].filter((row): row is { label: string; value: string } =>
    Boolean(row.value)
  );
}

function trimStructuredCardText(value: string) {
  const text = value.trim();

  if (text.length <= 450) {
    return text;
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const paragraphPreview = paragraphs.slice(0, 2).join('\n\n');
  const preview = paragraphPreview || text;

  if (preview.length <= 450) {
    return preview;
  }

  const sentences = preview.match(/[^.!?\n]+[.!?]+/g);

  if (sentences?.length) {
    const sentencePreview = sentences.slice(0, 2).join(' ').trim();

    if (sentencePreview.length <= 450) {
      return sentencePreview;
    }

    return `${sentencePreview.slice(0, 447).trim()}...`;
  }

  return `${preview.slice(0, 447).trim()}...`;
}

function replaceTypingMessage(
  currentMessages: MiloTalkMessage[],
  typingMessageId: string,
  replyMessage: MiloTalkMessage
) {
  const typingMessageIndex = currentMessages.findIndex(
    (message) => message.id === typingMessageId
  );

  if (typingMessageIndex === -1) {
    return [...currentMessages, replyMessage];
  }

  const nextMessages = [...currentMessages];
  nextMessages[typingMessageIndex] = replyMessage;
  return nextMessages;
}

const miloAiFallbackMessages: Record<MiloAiDebugReason, string> = {
  openai_http_error:
    'AI limit or billing issue • Milo is using local mode',
  missing_api_key: 'AI setup issue • Milo switched to local guidance',
  openai_parse_error: 'AI response issue • Milo switched to local guidance',
  invalid_response_shape: 'AI response issue • Milo switched to local guidance',
  unhandled_exception: 'AI unavailable • Milo switched to local guidance',
  fallback_builder_failed: 'Milo local backup • Saved guidance is helping',
};

function withDebugReason(
  text: string,
  debugReason: MiloAiDebugReason | null,
  showDebugReason: boolean
) {
  return showDebugReason && debugReason
    ? `${text} Debug: ${debugReason}.`
    : text;
}

function getMiloTalkFooterText(
  status: MiloTalkBrainStatus,
  settings: MiloAiSettings,
  debugReason: MiloAiDebugReason | null
) {
  if (settings.aiMode === 'local' || status === 'localOnly') {
    return 'Local only • Saved task guidance on this device';
  }

  if (status === 'online') {
    return 'AI online • Secure Milo Brain through Supabase';
  }

  if (status === 'smallTalk') {
    return 'Local quick reply • Milo answered from saved task guidance';
  }

  if (status === 'fallback') {
    return withDebugReason(
      debugReason
        ? miloAiFallbackMessages[debugReason]
        : 'AI unavailable • Milo switched to local guidance',
      debugReason,
      settings.showDebugReason
    );
  }

  return 'AI online is attempted securely. Local Milo Brain stays ready.';
}

function normalizeProposedDate(value?: string | null) {
  const match = value?.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

function normalizeProposedTime(value?: string | null) {
  const match = value
    ?.trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const meridian = match[3];

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

  if (!meridian && hour === 24) hour = 0;
  if (!meridian && hour < 0) return null;
  if (hour < 0 || hour > 23) return null;

  const displayMeridian = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${`${minute}`.padStart(2, '0')} ${displayMeridian}`;
}

function formatProposedDateLabel(value?: string | null) {
  const dateKey = normalizeProposedDate(value);

  if (!dateKey) {
    return value?.trim() || 'Not set';
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatProposedTaskValue(value?: string | number | null) {
  if (typeof value === 'number') {
    return `${value} min`;
  }

  const trimmed = value?.trim();
  return trimmed || 'Not set';
}

function hasScheduledProposalIntent(
  proposedTask: MiloAiProposedTask,
  sourceText?: string
) {
  const normalizedSourceText = sourceText?.toLowerCase() || '';

  return (
    proposedTask.type === 'date' ||
    proposedTask.type === 'meeting' ||
    Boolean(proposedTask.due_date || proposedTask.due_time) ||
    /\b(schedule|scheduled|date|meeting|remind|reminder|plan|event|on|at|tomorrow|today|start)\b/.test(
      normalizedSourceText
    )
  );
}

function requiresProposedTime(
  proposedTask: MiloAiProposedTask,
  sourceText?: string
) {
  const normalizedSourceText = sourceText?.toLowerCase() || '';

  return (
    proposedTask.type === 'date' ||
    proposedTask.type === 'meeting' ||
    /\b(at|time|start|starts|meeting|date|remind|reminder)\b/.test(
      normalizedSourceText
    )
  );
}

function validateProposedTaskForSave(
  proposedTask: MiloAiProposedTask,
  sourceText?: string
) {
  const title = proposedTask.title.trim();

  if (!title) {
    return {
      ok: false as const,
      message:
        'Awww, Milo needs the title before adding it. What should this plan be called?',
    };
  }

  const type = proposedTask.type;
  if (type !== 'task' && type !== 'meeting' && type !== 'date') {
    return {
      ok: false as const,
      message:
        'Milo needs to know if this is a task, meeting, or date before adding it.',
    };
  }

  const dueDate = normalizeProposedDate(proposedTask.due_date);
  const dueTime = proposedTask.due_time
    ? normalizeProposedTime(proposedTask.due_time)
    : '';

  if (hasScheduledProposalIntent(proposedTask, sourceText) && !dueDate) {
    return {
      ok: false as const,
      message:
        'Almost there. Milo needs the date before adding this to your plan.',
    };
  }

  if (proposedTask.due_time && !dueTime) {
    return {
      ok: false as const,
      message:
        'Milo needs a clearer time before adding this. Try something like 10:00 AM.',
    };
  }

  if (requiresProposedTime(proposedTask, sourceText) && !dueTime) {
    return {
      ok: false as const,
      message:
        'Almost there. Milo needs the time before adding this plan.',
    };
  }

  const duration =
    typeof proposedTask.estimated_duration_minutes === 'number' &&
    Number.isFinite(proposedTask.estimated_duration_minutes) &&
    proposedTask.estimated_duration_minutes > 0
      ? proposedTask.estimated_duration_minutes
      : undefined;

  return {
    ok: true as const,
    task: {
      title,
      description: proposedTask.description?.trim() || '',
      dueDate: dueDate || '',
      dueTime,
      location: proposedTask.location?.trim() || '',
      plannerType: type,
      priority: proposedTask.priority || 'medium',
      estimatedDurationMinutes: duration,
    },
  };
}

type ValidatedTaskUpdate = {
  task: Task;
  updates: Partial<
    Pick<
      Task,
      | 'title'
      | 'description'
      | 'plannerType'
      | 'priority'
      | 'dueDate'
      | 'dueTime'
      | 'estimatedDurationMinutes'
      | 'location'
    >
  >;
  meetingLinkUrl?: string;
  nextTask: Task;
};

function getMeetingUrlForTask(
  taskId: string,
  meetingLinks: OnlineMeetingLink[]
) {
  return meetingLinks.find((meetingLink) => meetingLink.taskId === taskId)?.url;
}

function formatUpdateCardValue(value?: string | number | null) {
  if (typeof value === 'number') {
    return `${value} min`;
  }

  const trimmed = value?.trim();
  return trimmed || 'Not set';
}

function getProposedTaskUpdateRows({
  meetingLinks,
  proposedUpdate,
  task,
}: {
  meetingLinks: OnlineMeetingLink[];
  proposedUpdate: MiloAiProposedTaskUpdate;
  task?: Task;
}) {
  const changes = proposedUpdate.changes;
  const rows: { label: string; currentValue: string; nextValue: string }[] = [];
  const addRow = (
    label: string,
    currentValue: string | number | undefined | null,
    nextValue: string | number | undefined | null
  ) => {
    rows.push({
      label,
      currentValue: formatUpdateCardValue(currentValue),
      nextValue: formatUpdateCardValue(nextValue),
    });
  };

  if (changes.title) addRow('Title', task?.title, changes.title);
  if (changes.description) {
    addRow('Description', task?.description, changes.description);
  }
  if (changes.type) {
    addRow(
      'Type',
      task ? titleCase(task.plannerType) : undefined,
      titleCase(changes.type)
    );
  }
  if (changes.priority) {
    addRow(
      'Priority',
      task ? titleCase(task.priority) : undefined,
      titleCase(changes.priority)
    );
  }
  if (changes.due_date) {
    addRow(
      'Date',
      task?.dueDate ? formatProposedDateLabel(task.dueDate) : undefined,
      formatProposedDateLabel(changes.due_date)
    );
  }
  if (changes.due_time) {
    addRow(
      'Time',
      task?.dueTime,
      normalizeProposedTime(changes.due_time) || changes.due_time
    );
  }
  if (typeof changes.estimated_duration_minutes === 'number') {
    addRow(
      'Duration',
      task?.estimatedDurationMinutes,
      changes.estimated_duration_minutes
    );
  }
  if (changes.location) addRow('Location', task?.location, changes.location);
  if (changes.meeting_link) {
    addRow(
      'Meeting link',
      task ? getMeetingUrlForTask(task.id, meetingLinks) : undefined,
      changes.meeting_link
    );
  }

  return rows;
}

function validateProposedTaskUpdateForSave({
  meetingLinks,
  proposedUpdate,
  tasks,
}: {
  meetingLinks: OnlineMeetingLink[];
  proposedUpdate: MiloAiProposedTaskUpdate;
  tasks: Task[];
}): { ok: false; message: string } | ({ ok: true } & ValidatedTaskUpdate) {
  const task = tasks.find((item) => item.id === proposedUpdate.taskId);

  if (!task) {
    return {
      ok: false,
      message:
        "Milo can't find that task right now. Can you check the task title and try again?",
    };
  }

  const changes = proposedUpdate.changes;
  const updates: ValidatedTaskUpdate['updates'] = {};
  let meetingLinkUrl: string | undefined;

  if (changes.title !== undefined) {
    const title = changes.title.trim();

    if (!title) {
      return {
        ok: false,
        message: 'Milo needs a clear new title before updating this task.',
      };
    }

    if (title !== task.title) {
      updates.title = title;
    }
  }

  if (changes.description !== undefined) {
    const description = changes.description?.trim() || '';

    if (description !== (task.description || '')) {
      updates.description = description;
    }
  }

  if (changes.type !== undefined) {
    if (
      changes.type !== 'task' &&
      changes.type !== 'meeting' &&
      changes.type !== 'date'
    ) {
      return {
        ok: false,
        message: 'Milo can only change the type to task, meeting, or date.',
      };
    }

    if (changes.type !== task.plannerType) {
      updates.plannerType = changes.type;
    }
  }

  if (changes.priority !== undefined) {
    if (
      changes.priority !== 'low' &&
      changes.priority !== 'medium' &&
      changes.priority !== 'high'
    ) {
      return {
        ok: false,
        message: 'Milo can only set priority to low, medium, or high.',
      };
    }

    if (changes.priority !== task.priority) {
      updates.priority = changes.priority;
    }
  }

  if (changes.due_date !== undefined) {
    const dueDate = normalizeProposedDate(changes.due_date);

    if (!dueDate) {
      return {
        ok: false,
        message:
          'Milo needs a clearer date before updating this. Try a date like 2026-06-27.',
      };
    }

    if (dueDate !== (task.dueDate || '')) {
      updates.dueDate = dueDate;
    }
  }

  if (changes.due_time !== undefined) {
    const dueTime = normalizeProposedTime(changes.due_time);

    if (!dueTime) {
      return {
        ok: false,
        message:
          'Milo needs a clearer time before updating this. Try something like 6:00 PM.',
      };
    }

    if (dueTime !== (task.dueTime || '')) {
      updates.dueTime = dueTime;
    }
  }

  if (changes.estimated_duration_minutes !== undefined) {
    const duration = changes.estimated_duration_minutes;

    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return {
        ok: false,
        message: 'Milo needs a positive duration before updating this task.',
      };
    }

    if (duration !== task.estimatedDurationMinutes) {
      updates.estimatedDurationMinutes = duration;
    }
  }

  if (changes.location !== undefined) {
    const location = changes.location?.trim() || '';

    if (location !== (task.location || '')) {
      updates.location = location;
    }
  }

  if (changes.meeting_link !== undefined) {
    const normalizedMeetingLink = normalizeMeetingUrl(
      changes.meeting_link?.trim() || ''
    );

    if (!isLikelyMeetingUrl(normalizedMeetingLink)) {
      return {
        ok: false,
        message:
          'Milo needs a valid meeting link before saving it to this task.',
      };
    }

    if (normalizedMeetingLink !== getMeetingUrlForTask(task.id, meetingLinks)) {
      meetingLinkUrl = normalizedMeetingLink;
    }
  }

  if (Object.keys(updates).length === 0 && !meetingLinkUrl) {
    return {
      ok: false,
      message:
        "Milo doesn't see a new change to save yet. Tell me what should be different.",
    };
  }

  return {
    ok: true,
    task,
    updates,
    meetingLinkUrl,
    nextTask: {
      ...task,
      ...updates,
    },
  };
}

function getCompletionDetailRows(task?: Task) {
  if (!task) {
    return [];
  }

  const dueText = [task.dueDate, task.dueTime].filter(Boolean).join(' ');

  return [
    {
      label: 'Type',
      value: titleCase(task.plannerType),
    },
    {
      label: 'Priority',
      value: titleCase(task.priority),
    },
    ...(dueText
      ? [
          {
            label: 'Due',
            value: dueText,
          },
        ]
      : []),
  ];
}

function validateProposedTaskCompletionForSave({
  proposedCompletion,
  tasks,
}: {
  proposedCompletion: MiloAiProposedTaskCompletion;
  tasks: Task[];
}) {
  const task = tasks.find((item) => item.id === proposedCompletion.taskId);

  if (!task) {
    return {
      ok: false as const,
      message:
        "Milo can't find that task right now. Can you check the task title and try again?",
    };
  }

  if (task.status === 'completed') {
    return {
      ok: false as const,
      message: 'Awww, Milo sees that one is already completed 💚',
    };
  }

  return {
    ok: true as const,
    task,
  };
}

function getDeletionDetailRows(task?: Task) {
  if (!task) {
    return [];
  }

  const dueText = [task.dueDate, task.dueTime].filter(Boolean).join(' ');

  return [
    {
      label: 'Type',
      value: titleCase(task.plannerType),
    },
    {
      label: 'Priority',
      value: titleCase(task.priority),
    },
    ...(dueText
      ? [
          {
            label: 'Due',
            value: dueText,
          },
        ]
      : []),
    ...(task.location
      ? [
          {
            label: 'Location',
            value: task.location,
          },
        ]
      : []),
  ];
}

function validateProposedTaskDeletionForSave({
  proposedDeletion,
  tasks,
}: {
  proposedDeletion: MiloAiProposedTaskDeletion;
  tasks: Task[];
}) {
  const task = tasks.find((item) => item.id === proposedDeletion.taskId);

  if (!task) {
    return {
      ok: false as const,
      message:
        "Milo can't find that task right now. Can you check the task title and try again?",
    };
  }

  return {
    ok: true as const,
    task,
  };
}

export default function MiloChatScreen() {
  const { isDark } = useFocusMateTheme();

  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'MiloChat'>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { tasks, addTask, updateTask, toggleTask, deleteTask } = useTasks();
  const { focusSessions } = useFocus();
  const talkScrollRef = useRef<ScrollView | null>(null);
  const mountedRef = useRef(true);
  const hasLoadedStoredChatRef = useRef(false);
  const hasArchivedActiveChatRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const loadedStoredSignatureRef = useRef<string | null>(null);
  const latestMessagesRef = useRef<MiloTalkMessage[]>([]);

  const [onlineMeetingLinks, setOnlineMeetingLinks] = useState<
    OnlineMeetingLink[]
  >([]);
  const [miloTalkInput, setMiloTalkInput] = useState('');
  const [miloTalkBrainStatus, setMiloTalkBrainStatus] =
    useState<MiloTalkBrainStatus>('ready');
  const [miloTalkFallbackReason, setMiloTalkFallbackReason] =
    useState<MiloAiDebugReason | null>(null);
  const [miloAiSettings, setMiloAiSettings] = useState<MiloAiSettings>(
    DEFAULT_MILO_AI_SETTINGS
  );
  const [isMiloAiSettingsVisible, setIsMiloAiSettingsVisible] =
    useState(false);
  const [chatMessages, setChatMessages] = useState<MiloTalkMessage[]>(() =>
    createInitialMiloTalkMessages()
  );
  const miloAiFocusStats = useMemo(
    () => buildTodayMiloAiFocusStats(focusSessions),
    [focusSessions]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      title: 'Talk with Milo',
    });
  }, [navigation]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadSettings = async () => {
      const nextSettings = await loadMiloAiSettings();

      if (!isCancelled && mountedRef.current) {
        setMiloAiSettings(nextSettings);
      }
    };

    void loadSettings();

    return () => {
      isCancelled = true;
    };
  }, []);

  const refreshOnlineMeetingLinks = useCallback(async () => {
    const nextMeetingLinks = await loadOnlineMeetingLinks();

    if (mountedRef.current) {
      setOnlineMeetingLinks(nextMeetingLinks);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshOnlineMeetingLinks();
    }, [refreshOnlineMeetingLinks])
  );

  const scrollTalkToBottom = () => {
    requestAnimationFrame(() => {
      talkScrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const archiveActiveMiloChat = useCallback(async () => {
    if (hasArchivedActiveChatRef.current) {
      return;
    }

    const storedMessages = serializeMiloTalkMessages(latestMessagesRef.current);
    const hasStoredUserMessage = storedMessages.some(
      (message) => message.role === 'user'
    );

    if (!hasStoredUserMessage) {
      await clearCurrentMiloChat(user?.id);
      return;
    }

    const storageSignature = getMiloChatStorageSignature(storedMessages);

    if (
      activeSessionIdRef.current &&
      storageSignature === loadedStoredSignatureRef.current
    ) {
      await clearCurrentMiloChat(user?.id);
      return;
    }

    hasArchivedActiveChatRef.current = true;

    const archivedSession = await archiveCurrentMiloChat(
      storedMessages,
      activeSessionIdRef.current,
      user?.id
    );

    if (archivedSession) {
      activeSessionIdRef.current = archivedSession.id;
      loadedStoredSignatureRef.current = getMiloChatStorageSignature(
        archivedSession.messages
      );
    }

    await clearCurrentMiloChat(user?.id);
  }, [user?.id]);

  useEffect(() => {
    let isCancelled = false;

    const loadStoredChat = async () => {
      hasLoadedStoredChatRef.current = false;
      hasArchivedActiveChatRef.current = false;

      try {
        const sessionId = route.params?.sessionId;
        let storedMessages: MiloChatStorageMessage[] = [];
        let loadedSessionId: string | null = null;

        if (sessionId) {
          const selectedSession = await loadMiloChatSession(sessionId, user?.id);
          storedMessages = selectedSession?.messages || [];
          loadedSessionId = selectedSession?.id || null;
        } else {
          storedMessages = await loadCurrentMiloChat(user?.id);
        }

        if (isCancelled || !mountedRef.current) {
          return;
        }

        const nextMessages = storedMessages.length
          ? hydrateMiloTalkMessages(storedMessages, tasks)
          : createInitialMiloTalkMessages();

        setChatMessages(nextMessages);
        setMiloTalkBrainStatus('ready');
        setMiloTalkFallbackReason(null);
        setMiloTalkInput('');
        activeSessionIdRef.current = loadedSessionId;
        loadedStoredSignatureRef.current = storedMessages.length
          ? getMiloChatStorageSignature(storedMessages)
          : null;
        latestMessagesRef.current = nextMessages;
        hasLoadedStoredChatRef.current = true;
        scrollTalkToBottom();
      } catch (error) {
        console.log('Failed to restore Milo chat:', error);

        if (!isCancelled && mountedRef.current) {
          setChatMessages(createInitialMiloTalkMessages());
          setMiloTalkBrainStatus('ready');
          setMiloTalkFallbackReason(null);
          activeSessionIdRef.current = null;
          loadedStoredSignatureRef.current = null;
          hasLoadedStoredChatRef.current = true;
        }
      }
    };

    void loadStoredChat();

    return () => {
      isCancelled = true;
    };
  }, [route.params?.sessionId, user?.id]);

  useEffect(() => {
    latestMessagesRef.current = chatMessages;

    if (!hasLoadedStoredChatRef.current) {
      return;
    }

    const saveStoredChat = async () => {
      try {
        const storedMessages = serializeMiloTalkMessages(chatMessages);
        const hasStoredUserMessage = storedMessages.some(
          (message) => message.role === 'user'
        );

        if (hasStoredUserMessage) {
          await saveCurrentMiloChat(storedMessages, user?.id);
        } else {
          await clearCurrentMiloChat(user?.id);
        }
      } catch (error) {
        console.log('Failed to save Milo chat:', error);
      }
    };

    void saveStoredChat();
  }, [chatMessages, user?.id]);

  useFocusEffect(
    useCallback(() => {
      hasArchivedActiveChatRef.current = false;

      return () => {
        void archiveActiveMiloChat();
      };
    }, [archiveActiveMiloChat])
  );

  const handleSend = async (message = miloTalkInput) => {
    const prompt = message.trim();

    if (!prompt) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Chat should still work when haptics are unavailable.
    }

    if (!mountedRef.current) return;

    hasArchivedActiveChatRef.current = false;

    const userCreatedAt = new Date();
    const userMessage: MiloTalkMessage = {
      id: createMiloTalkMessageId('user'),
      role: 'user',
      text: prompt,
      createdAt: userCreatedAt.toISOString(),
    };
    const typingMessage: MiloTalkMessage = {
      id: createMiloTalkMessageId('milo'),
      role: 'milo',
      text: 'Milo is thinking...',
      createdAt: new Date(userCreatedAt.getTime() + 1).toISOString(),
      isTyping: true,
    };
    const recentMessages = buildMiloAiRecentMessages(chatMessages);

    setChatMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      typingMessage,
    ]);
    setMiloTalkInput('');
    scrollTalkToBottom();

    const shouldUseLocalOnly = miloAiSettings.aiMode === 'local';
    const shouldUseLocalQuickReply =
      !shouldUseLocalOnly &&
      shouldUseLocalOnlyForMessage(prompt, miloAiSettings);
    let nextStatus: MiloTalkBrainStatus = 'fallback';
    let nextDebugReason: MiloAiDebugReason | null = null;
    let replyMessage: MiloTalkMessage | null = null;

    if (!shouldUseLocalOnly && !shouldUseLocalQuickReply) {
      try {
        try {
          const nextSettings = await incrementMiloAiCallsToday();

          if (mountedRef.current) {
            setMiloAiSettings(nextSettings);
          }
        } catch (error) {
          console.log('Failed to update Milo AI usage count:', error);
        }

        const aiReply = await askMiloAi({
          message: prompt,
          focusStats: miloAiFocusStats,
          tasks,
          meetingLinks: onlineMeetingLinks,
          recentMessages,
        });

        if (aiReply.usedAi && aiReply.text) {
          const proposedTask = aiReply.proposedTask || undefined;
          const proposedTaskUpdate = proposedTask
            ? undefined
            : aiReply.proposedTaskUpdate || undefined;
          const proposedTaskCompletion = proposedTask || proposedTaskUpdate
            ? undefined
            : aiReply.proposedTaskCompletion || undefined;
          const proposedTaskDeletion =
            proposedTask || proposedTaskUpdate || proposedTaskCompletion
              ? undefined
              : aiReply.proposedTaskDeletion || undefined;
          const hasProposal = Boolean(
            proposedTask ||
              proposedTaskUpdate ||
              proposedTaskCompletion ||
              proposedTaskDeletion
          );
          const smartPlan = hasProposal
            ? undefined
            : aiReply.smartPlan || undefined;
          const smartNudge = hasProposal
            ? undefined
            : aiReply.smartNudge || undefined;
          const timelineInsight = hasProposal
            ? undefined
            : aiReply.timelineInsight || undefined;
          const miloInsight = hasProposal
            ? undefined
            : aiReply.miloInsight || undefined;
          const hasAiCard = Boolean(
            hasProposal ||
              smartPlan ||
              smartNudge ||
              timelineInsight ||
              miloInsight
          );
          const relatedTask =
            hasAiCard
              ? undefined
              : findRelatedTaskByAiId(tasks, aiReply.relatedTaskId);

          replyMessage = {
            id: createMiloTalkMessageId('milo'),
            role: 'milo',
            text: hasAiCard ? trimStructuredCardText(aiReply.text) : aiReply.text,
            relatedTask,
            relatedTaskSummary: relatedTask
              ? buildMiloTalkTaskSummary(relatedTask)
              : undefined,
            actions: buildValidatedMiloAiActions({
              message: prompt,
              onlineMeetingLinks,
              relatedTask,
              suggestedActions:
                hasAiCard ? [] : aiReply.suggestedActions,
            }),
            proposedTask,
            proposedTaskStatus: proposedTask ? 'pending' : undefined,
            proposedTaskSourceText: proposedTask ? prompt : undefined,
            proposedTaskUpdate,
            proposedTaskUpdateStatus: proposedTaskUpdate ? 'pending' : undefined,
            proposedTaskCompletion,
            proposedTaskCompletionStatus: proposedTaskCompletion
              ? 'pending'
              : undefined,
            proposedTaskDeletion,
            proposedTaskDeletionStatus: proposedTaskDeletion
              ? 'pending'
              : undefined,
            proposedTaskDeletionSnapshot: proposedTaskDeletion
              ? tasks.find((task) => task.id === proposedTaskDeletion.taskId)
              : undefined,
            smartPlan,
            smartNudge,
            timelineInsight,
            miloInsight,
            createdAt: new Date().toISOString(),
          };
          nextStatus = 'online';
        } else {
          nextDebugReason = aiReply.debugReason || null;
        }
      } catch (error) {
        console.warn('Failed to ask Milo AI:', error);
      }
    }

    if (!replyMessage) {
      // Local Milo Brain remains the offline fallback for chat guidance.
      const localReply = buildMiloBrainReply({
        message: prompt,
        tasks,
        meetingLinks: onlineMeetingLinks,
      });

      replyMessage = {
        id: createMiloTalkMessageId('milo'),
        role: 'milo',
        text: localReply.text,
        relatedTask: localReply.relatedTask,
        relatedTaskSummary: localReply.relatedTaskSummary,
        actions: localReply.actions,
        createdAt: new Date().toISOString(),
      };
      nextStatus = shouldUseLocalOnly
        ? 'localOnly'
        : shouldUseLocalQuickReply
        ? 'smallTalk'
        : 'fallback';
    }

    if (!mountedRef.current) return;

    setMiloTalkBrainStatus(nextStatus);
    setMiloTalkFallbackReason(nextDebugReason);
    setChatMessages((currentMessages) =>
      replaceTypingMessage(currentMessages, typingMessage.id, replyMessage)
    );
    scrollTalkToBottom();
  };

  const hasUserMessages = chatMessages.some(
    (message) => message.role === 'user'
  );
  const showMiloTalkSuggestions = !hasUserMessages;
  const miloAiModeLabel = miloAiSettings.aiMode === 'online' ? '• AI' : '• Local';
  const aiSettingsSwitchTrackColor = isDark
    ? { false: theme.colors.inputBorder, true: theme.colors.primary }
    : { false: '#D7E1D8', true: '#BFE9CE' };
  const aiSettingsSwitchThumbColor = isDark ? theme.colors.card : theme.colors.white;

  const handleOpenMiloAiSettings = async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Settings should still open when haptics are unavailable.
    }

    setIsMiloAiSettingsVisible(true);
  };

  const handleUpdateMiloAiSettings = async (
    partial: Partial<MiloAiSettings>
  ) => {
    try {
      const nextSettings = await updateMiloAiSettings(partial);

      if (!mountedRef.current) {
        return;
      }

      setMiloAiSettings(nextSettings);
      setMiloTalkFallbackReason(null);
      setMiloTalkBrainStatus('ready');
    } catch (error) {
      console.log('Failed to update Milo AI settings:', error);
      Alert.alert(
        'Could not save AI settings',
        'Milo could not update this setting just now. Please try again.'
      );
    }
  };

  const handleResetMiloAiSettings = () => {
    Alert.alert(
      'Reset AI settings?',
      'Milo will return to AI Online with small-talk skipping on.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const nextSettings = await resetMiloAiSettings();

                if (!mountedRef.current) {
                  return;
                }

                setMiloAiSettings(nextSettings);
                setMiloTalkFallbackReason(null);
                setMiloTalkBrainStatus('ready');
              } catch (error) {
                console.log('Failed to reset Milo AI settings:', error);
                Alert.alert(
                  'Could not reset AI settings',
                  'Milo could not reset these settings just now. Please try again.'
                );
              }
            })();
          },
        },
      ]
    );
  };

  const handleStartNewChat = async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Starting a new local chat should still work without haptics.
    }

    try {
      if (hasUserMessages) {
        await archiveCurrentMiloChat(
          serializeMiloTalkMessages(chatMessages),
          activeSessionIdRef.current,
          user?.id
        );
      }

      const nextMessages = createInitialMiloTalkMessages();
      await clearCurrentMiloChat(user?.id);
      activeSessionIdRef.current = null;
      loadedStoredSignatureRef.current = null;
      latestMessagesRef.current = nextMessages;
      hasArchivedActiveChatRef.current = false;
      setChatMessages(nextMessages);
      setMiloTalkInput('');
      setMiloTalkBrainStatus('ready');
      setMiloTalkFallbackReason(null);
      scrollTalkToBottom();
    } catch (error) {
      console.log('Failed to start a new Milo chat:', error);
      Alert.alert(
        'Could not start a new chat',
        'Milo could not save this chat just now. Please try again.'
      );
    }
  };

  const handleOpenResourceFinder = (task?: Task) => {
    navigation.navigate('MainTabs', {
      screen: 'Companion',
      params: {
        openResourceFinder: true,
        openResourceFinderForTaskId: task?.id,
      },
    });
  };

  const handleTalkActionPress = async (
    action: MiloBrainAction,
    fallbackTask?: Task
  ) => {
    const actionTask =
      tasks.find((task) => task.id === action.taskId) ||
      fallbackTask;

    if (action.type === 'viewTask' && actionTask) {
      navigation.navigate('TaskDetails', { taskId: actionTask.id });
      return;
    }

    if (action.type === 'startFocus') {
      if (actionTask) {
        navigation.navigate('FocusSession', { taskId: actionTask.id });
        return;
      }

      navigation.navigate('FocusSession');
      return;
    }

    if (action.type === 'findResources') {
      handleOpenResourceFinder(actionTask);
      return;
    }

    if (action.type === 'openMaps') {
      const location = action.location || actionTask?.location?.trim();

      if (location) {
        await openLocationInMaps(location);
      }

      return;
    }

    if (action.type === 'joinMeeting') {
      const meetingUrl =
        action.meetingUrl ||
        onlineMeetingLinks.find((meetingLink) => meetingLink.taskId === actionTask?.id)
          ?.url;

      if (meetingUrl) {
        await openMeetingLink(meetingUrl);
      }
    }
  };

  const appendMiloMessage = (message: Omit<MiloTalkMessage, 'id' | 'createdAt' | 'role'>) => {
    setChatMessages((currentMessages) => [
      ...currentMessages,
      {
        ...message,
        id: createMiloTalkMessageId('milo'),
        role: 'milo',
        createdAt: new Date().toISOString(),
      },
    ]);
    scrollTalkToBottom();
  };

  const updateProposedTaskStatus = (
    messageId: string,
    status: MiloProposedTaskStatus
  ) => {
    setChatMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              proposedTaskStatus: status,
            }
          : message
      )
    );
  };

  const updateProposedTaskUpdateStatus = (
    messageId: string,
    status: MiloProposedTaskUpdateStatus
  ) => {
    setChatMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              proposedTaskUpdateStatus: status,
            }
          : message
      )
    );
  };

  const updateProposedTaskCompletionStatus = (
    messageId: string,
    status: MiloProposedTaskCompletionStatus
  ) => {
    setChatMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              proposedTaskCompletionStatus: status,
            }
          : message
      )
    );
  };

  const updateProposedTaskDeletionStatus = (
    messageId: string,
    status: MiloProposedTaskDeletionStatus
  ) => {
    setChatMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              proposedTaskDeletionStatus: status,
            }
          : message
      )
    );
  };

  const handleCreateProposedTask = async (message: MiloTalkMessage) => {
    if (
      !message.proposedTask ||
      (message.proposedTaskStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Creating from chat should still work when haptics are unavailable.
    }

    const validation = validateProposedTaskForSave(
      message.proposedTask,
      message.proposedTaskSourceText
    );

    if (!validation.ok) {
      appendMiloMessage({
        text: validation.message,
      });
      return;
    }

    const taskId = Date.now().toString();
    const savedTask: Task = {
      id: taskId,
      title: validation.task.title,
      description: validation.task.description,
      dueDate: validation.task.dueDate,
      dueTime: validation.task.dueTime || '',
      location: validation.task.location,
      plannerType: validation.task.plannerType,
      priority: validation.task.priority,
      estimatedDurationMinutes: validation.task.estimatedDurationMinutes,
      status: 'pending',
      subtasks: [],
      createdAt: new Date().toISOString(),
    };

    updateProposedTaskStatus(message.id, 'created');
    addTask({
      id: taskId,
      title: savedTask.title,
      description: savedTask.description,
      dueDate: savedTask.dueDate,
      dueTime: savedTask.dueTime,
      location: savedTask.location,
      plannerType: savedTask.plannerType,
      priority: savedTask.priority,
      estimatedDurationMinutes: savedTask.estimatedDurationMinutes,
      subtasks: [],
    });

    appendMiloMessage({
      text: 'Done! Milo added it to your plan 🦖✨',
      relatedTask: savedTask,
      relatedTaskSummary: buildMiloTalkTaskSummary(savedTask),
      actions: [
        {
          type: 'viewTask',
          label: 'View Task',
          taskId,
        },
      ],
    });
  };

  const handleCancelProposedTask = async (message: MiloTalkMessage) => {
    if (
      !message.proposedTask ||
      (message.proposedTaskStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Cancelling from chat should still work when haptics are unavailable.
    }

    updateProposedTaskStatus(message.id, 'cancelled');
    appendMiloMessage({
      text: "No worries, Milo won't add it.",
    });
  };

  const handleUpdateProposedTask = async (message: MiloTalkMessage) => {
    if (
      !message.proposedTaskUpdate ||
      (message.proposedTaskUpdateStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Updating from chat should still work when haptics are unavailable.
    }

    const validation = validateProposedTaskUpdateForSave({
      meetingLinks: onlineMeetingLinks,
      proposedUpdate: message.proposedTaskUpdate,
      tasks,
    });

    if (!validation.ok) {
      appendMiloMessage({
        text: validation.message,
      });
      return;
    }

    try {
      if (Object.keys(validation.updates).length > 0) {
        await updateTask(validation.task.id, validation.updates);
      }

      if (validation.meetingLinkUrl) {
        await saveOnlineMeetingLink({
          taskId: validation.task.id,
          taskTitle: validation.nextTask.title,
          url: validation.meetingLinkUrl,
        });
        await refreshOnlineMeetingLinks();
      }

      updateProposedTaskUpdateStatus(message.id, 'updated');
      appendMiloMessage({
        text: 'Done! Milo updated it for you 🦖✨',
        relatedTask: validation.nextTask,
        relatedTaskSummary: buildMiloTalkTaskSummary(validation.nextTask),
        actions: [
          {
            type: 'viewTask',
            label: 'View Task',
            taskId: validation.task.id,
          },
        ],
      });
    } catch (error) {
      console.warn('Failed to update task from Milo chat:', error);
      appendMiloMessage({
        text:
          "Milo couldn't save that update just now. Please try again in a moment.",
      });
    }
  };

  const handleCancelProposedTaskUpdate = async (message: MiloTalkMessage) => {
    if (
      !message.proposedTaskUpdate ||
      (message.proposedTaskUpdateStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Cancelling from chat should still work when haptics are unavailable.
    }

    updateProposedTaskUpdateStatus(message.id, 'cancelled');
    appendMiloMessage({
      text: "No worries, Milo won't change it.",
    });
  };

  const handleCompleteProposedTask = async (message: MiloTalkMessage) => {
    if (
      !message.proposedTaskCompletion ||
      (message.proposedTaskCompletionStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Completing from chat should still work when haptics are unavailable.
    }

    const validation = validateProposedTaskCompletionForSave({
      proposedCompletion: message.proposedTaskCompletion,
      tasks,
    });

    if (!validation.ok) {
      appendMiloMessage({
        text: validation.message,
      });
      return;
    }

    try {
      await toggleTask(validation.task.id);
      const completedTask: Task = {
        ...validation.task,
        status: 'completed',
        notificationId: undefined,
      };

      updateProposedTaskCompletionStatus(message.id, 'completed');
      appendMiloMessage({
        text: 'Yayyy! Milo marked it as done. Proud of you 🦖✨',
        relatedTask: completedTask,
        relatedTaskSummary: buildMiloTalkTaskSummary(completedTask),
        actions: [
          {
            type: 'viewTask',
            label: 'View Task',
            taskId: validation.task.id,
          },
        ],
      });
    } catch (error) {
      console.warn('Failed to mark task done from Milo chat:', error);
      appendMiloMessage({
        text:
          "Milo couldn't mark that as done just now. Please try again in a moment.",
      });
    }
  };

  const handleCancelProposedTaskCompletion = async (
    message: MiloTalkMessage
  ) => {
    if (
      !message.proposedTaskCompletion ||
      (message.proposedTaskCompletionStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Cancelling from chat should still work when haptics are unavailable.
    }

    updateProposedTaskCompletionStatus(message.id, 'cancelled');
    appendMiloMessage({
      text: "No worries, Milo won't mark it as done.",
    });
  };

  const handleDeleteProposedTask = async (message: MiloTalkMessage) => {
    if (
      !message.proposedTaskDeletion ||
      (message.proposedTaskDeletionStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Removing from chat should still work when haptics are unavailable.
    }

    const validation = validateProposedTaskDeletionForSave({
      proposedDeletion: message.proposedTaskDeletion,
      tasks,
    });

    if (!validation.ok) {
      appendMiloMessage({
        text: validation.message,
      });
      return;
    }

    try {
      await deleteTask(validation.task.id);
      updateProposedTaskDeletionStatus(message.id, 'removed');
      appendMiloMessage({
        text: 'Done, Milo removed it from your plan 🦖💚',
      });
    } catch (error) {
      console.warn('Failed to remove task from Milo chat:', error);
      appendMiloMessage({
        text:
          "Milo couldn't remove that task just now. Please try again in a moment.",
      });
    }
  };

  const handleCancelProposedTaskDeletion = async (
    message: MiloTalkMessage
  ) => {
    if (
      !message.proposedTaskDeletion ||
      (message.proposedTaskDeletionStatus || 'pending') !== 'pending'
    ) {
      return;
    }

    try {
      await Haptics.selectionAsync();
    } catch {
      // Cancelling from chat should still work when haptics are unavailable.
    }

    updateProposedTaskDeletionStatus(message.id, 'cancelled');
    appendMiloMessage({
      text: "No worries, Milo won't remove it.",
    });
  };

  const renderTalkActionButton = (
    action: MiloBrainAction,
    index: number,
    relatedTask?: Task
  ) => {
    const isPrimaryAction =
      index === 0 &&
      ['startFocus', 'findResources', 'openMaps', 'joinMeeting'].includes(
        action.type
      );

    return (
      <TouchableOpacity
        key={`${action.type}-${action.taskId || 'general'}`}
        activeOpacity={0.84}
        style={[
          styles.miloTalkActionButton,
          isPrimaryAction
            ? styles.miloTalkActionPrimary
            : styles.miloTalkActionSecondary,
        ]}
        onPress={() => void handleTalkActionPress(action, relatedTask)}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <Ionicons
          name={talkActionIcons[action.type]}
          size={16}
          color={
            isPrimaryAction ? theme.colors.white : theme.colors.primaryDark
          }
        />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          style={[
            styles.miloTalkActionText,
            isPrimaryAction
              ? styles.miloTalkActionPrimaryText
              : styles.miloTalkActionSecondaryText,
          ]}
        >
          {action.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderProposedTaskCard = (message: MiloTalkMessage) => {
    const proposedTask = message.proposedTask;

    if (!proposedTask) {
      return null;
    }

    const status = message.proposedTaskStatus || 'pending';
    const isPending = status === 'pending';
    const proposedTime = proposedTask.due_time
      ? normalizeProposedTime(proposedTask.due_time) || proposedTask.due_time
      : 'Not set';
    const details = [
      {
        label: 'Type',
        value: titleCase(proposedTask.type),
      },
      {
        label: 'Priority',
        value: titleCase(proposedTask.priority || 'medium'),
      },
      {
        label: 'Date',
        value: formatProposedDateLabel(proposedTask.due_date),
      },
      {
        label: 'Time',
        value: proposedTime,
      },
      ...(proposedTask.location
        ? [
            {
              label: 'Location',
              value: proposedTask.location,
            },
          ]
        : []),
      ...(typeof proposedTask.estimated_duration_minutes === 'number'
        ? [
            {
              label: 'Duration',
              value: formatProposedTaskValue(
                proposedTask.estimated_duration_minutes
              ),
            },
          ]
        : []),
    ];

    return (
      <View style={styles.proposedTaskCard}>
        <View style={styles.proposedTaskHeader}>
          <View style={styles.proposedTaskIcon}>
            <Ionicons
              name={proposedTaskIcons[proposedTask.type]}
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.proposedTaskHeaderCopy}>
            <Text style={styles.proposedTaskEyebrow}>Proposed plan</Text>
            <Text numberOfLines={2} style={styles.proposedTaskTitle}>
              {proposedTask.title}
            </Text>
          </View>
        </View>

        <View style={styles.proposedTaskRows}>
          {details.map((detail) => (
            <View key={detail.label} style={styles.proposedTaskRow}>
              <Text style={styles.proposedTaskLabel}>{detail.label}</Text>
              <Text numberOfLines={2} style={styles.proposedTaskValue}>
                {detail.value}
              </Text>
            </View>
          ))}
        </View>

        {proposedTask.description ? (
          <Text style={styles.proposedTaskDescription}>
            {proposedTask.description}
          </Text>
        ) : null}

        {isPending ? (
          <View style={styles.proposedTaskActions}>
            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCreateButton}
              onPress={() => void handleCreateProposedTask(message)}
              accessibilityRole="button"
              accessibilityLabel="Create proposed task"
            >
              <Ionicons
                name="add-circle-outline"
                size={16}
                color={theme.colors.white}
              />
              <Text style={styles.proposedTaskCreateText}>Create Task</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCancelButton}
              onPress={() => void handleCancelProposedTask(message)}
              accessibilityRole="button"
              accessibilityLabel="Cancel proposed task"
            >
              <Text style={styles.proposedTaskCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.proposedTaskStatusPill,
              status === 'cancelled' && styles.proposedTaskStatusPillMuted,
            ]}
          >
            <Text
              style={[
                styles.proposedTaskStatusText,
                status === 'cancelled' && styles.proposedTaskStatusTextMuted,
              ]}
            >
              {status === 'created' ? 'Added to plan' : 'Cancelled'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderProposedTaskUpdateCard = (message: MiloTalkMessage) => {
    const proposedTaskUpdate = message.proposedTaskUpdate;

    if (!proposedTaskUpdate) {
      return null;
    }

    const task = tasks.find((item) => item.id === proposedTaskUpdate.taskId);
    const status = message.proposedTaskUpdateStatus || 'pending';
    const isPending = status === 'pending';
    const updateRows = getProposedTaskUpdateRows({
      meetingLinks: onlineMeetingLinks,
      proposedUpdate: proposedTaskUpdate,
      task,
    });

    return (
      <View style={styles.taskUpdateCard}>
        <View style={styles.proposedTaskHeader}>
          <View style={styles.proposedTaskIcon}>
            <Ionicons
              name={task ? proposedTaskIcons[task.plannerType] : 'create-outline'}
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.proposedTaskHeaderCopy}>
            <Text style={styles.proposedTaskEyebrow}>Proposed update</Text>
            <Text numberOfLines={2} style={styles.proposedTaskTitle}>
              {task?.title || 'Task not found'}
            </Text>
          </View>
        </View>

        {proposedTaskUpdate.reason ? (
          <Text style={styles.taskUpdateReason}>
            {proposedTaskUpdate.reason}
          </Text>
        ) : null}

        <View style={styles.taskUpdateRows}>
          {updateRows.map((row) => (
            <View key={row.label} style={styles.taskUpdateRow}>
              <Text style={styles.taskUpdateLabel}>{row.label}</Text>
              <View style={styles.taskUpdateValues}>
                <View style={styles.taskUpdateValueBox}>
                  <Text style={styles.taskUpdateValueLabel}>Current</Text>
                  <Text numberOfLines={2} style={styles.taskUpdateValueText}>
                    {row.currentValue}
                  </Text>
                </View>
                <Ionicons
                  name="arrow-forward"
                  size={13}
                  color={theme.colors.textSoft}
                />
                <View style={styles.taskUpdateValueBox}>
                  <Text style={styles.taskUpdateValueLabel}>New</Text>
                  <Text numberOfLines={2} style={styles.taskUpdateValueText}>
                    {row.nextValue}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {isPending ? (
          <View style={styles.proposedTaskActions}>
            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCreateButton}
              onPress={() => void handleUpdateProposedTask(message)}
              accessibilityRole="button"
              accessibilityLabel="Update proposed task"
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={theme.colors.white}
              />
              <Text style={styles.proposedTaskCreateText}>Update Task</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCancelButton}
              onPress={() => void handleCancelProposedTaskUpdate(message)}
              accessibilityRole="button"
              accessibilityLabel="Cancel proposed task update"
            >
              <Text style={styles.proposedTaskCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.proposedTaskStatusPill,
              status === 'cancelled' && styles.proposedTaskStatusPillMuted,
            ]}
          >
            <Text
              style={[
                styles.proposedTaskStatusText,
                status === 'cancelled' && styles.proposedTaskStatusTextMuted,
              ]}
            >
              {status === 'updated' ? 'Updated' : 'Cancelled'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderProposedTaskCompletionCard = (message: MiloTalkMessage) => {
    const proposedTaskCompletion = message.proposedTaskCompletion;

    if (!proposedTaskCompletion) {
      return null;
    }

    const task = tasks.find((item) => item.id === proposedTaskCompletion.taskId);
    const status = message.proposedTaskCompletionStatus || 'pending';
    const isPending = status === 'pending';
    const detailRows = getCompletionDetailRows(task);

    return (
      <View style={styles.taskCompletionCard}>
        <View style={styles.proposedTaskHeader}>
          <View style={styles.proposedTaskIcon}>
            <Ionicons
              name={task ? proposedTaskIcons[task.plannerType] : 'checkmark-done-outline'}
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.proposedTaskHeaderCopy}>
            <Text style={styles.proposedTaskEyebrow}>Mark done?</Text>
            <Text numberOfLines={2} style={styles.proposedTaskTitle}>
              {task?.title || 'Task not found'}
            </Text>
          </View>
        </View>

        {detailRows.length ? (
          <View style={styles.proposedTaskRows}>
            {detailRows.map((detail) => (
              <View key={detail.label} style={styles.proposedTaskRow}>
                <Text style={styles.proposedTaskLabel}>{detail.label}</Text>
                <Text numberOfLines={2} style={styles.proposedTaskValue}>
                  {detail.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {proposedTaskCompletion.reason ? (
          <Text style={styles.taskCompletionReason}>
            {proposedTaskCompletion.reason}
          </Text>
        ) : null}

        {isPending ? (
          <View style={styles.proposedTaskActions}>
            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCreateButton}
              onPress={() => void handleCompleteProposedTask(message)}
              accessibilityRole="button"
              accessibilityLabel="Mark proposed task as done"
            >
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={theme.colors.white}
              />
              <Text style={styles.proposedTaskCreateText}>Mark Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCancelButton}
              onPress={() => void handleCancelProposedTaskCompletion(message)}
              accessibilityRole="button"
              accessibilityLabel="Cancel proposed task completion"
            >
              <Text style={styles.proposedTaskCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.proposedTaskStatusPill,
              status === 'cancelled' && styles.proposedTaskStatusPillMuted,
            ]}
          >
            <Text
              style={[
                styles.proposedTaskStatusText,
                status === 'cancelled' && styles.proposedTaskStatusTextMuted,
              ]}
            >
              {status === 'completed' ? 'Marked done' : 'Cancelled'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderProposedTaskDeletionCard = (message: MiloTalkMessage) => {
    const proposedTaskDeletion = message.proposedTaskDeletion;

    if (!proposedTaskDeletion) {
      return null;
    }

    const task =
      tasks.find((item) => item.id === proposedTaskDeletion.taskId) ||
      message.proposedTaskDeletionSnapshot;
    const status = message.proposedTaskDeletionStatus || 'pending';
    const isPending = status === 'pending';
    const detailRows = getDeletionDetailRows(task);

    return (
      <View style={styles.taskDeletionCard}>
        <View style={styles.proposedTaskHeader}>
          <View style={styles.proposedTaskIcon}>
            <Ionicons
              name={
                task ? proposedTaskIcons[task.plannerType] : 'trash-outline'
              }
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.proposedTaskHeaderCopy}>
            <Text style={styles.proposedTaskEyebrow}>Remove task?</Text>
            <Text numberOfLines={2} style={styles.proposedTaskTitle}>
              {task?.title || 'Task not found'}
            </Text>
          </View>
        </View>

        {detailRows.length ? (
          <View style={styles.proposedTaskRows}>
            {detailRows.map((detail) => (
              <View key={detail.label} style={styles.proposedTaskRow}>
                <Text style={styles.proposedTaskLabel}>{detail.label}</Text>
                <Text numberOfLines={2} style={styles.proposedTaskValue}>
                  {detail.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {proposedTaskDeletion.reason ? (
          <Text style={styles.taskDeletionReason}>
            {proposedTaskDeletion.reason}
          </Text>
        ) : null}

        {isPending ? (
          <View style={styles.proposedTaskActions}>
            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCreateButton}
              onPress={() => void handleDeleteProposedTask(message)}
              accessibilityRole="button"
              accessibilityLabel="Remove proposed task"
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={theme.colors.white}
              />
              <Text style={styles.proposedTaskCreateText}>Remove Task</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.proposedTaskCancelButton}
              onPress={() => void handleCancelProposedTaskDeletion(message)}
              accessibilityRole="button"
              accessibilityLabel="Cancel proposed task removal"
            >
              <Text style={styles.proposedTaskCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.proposedTaskStatusPill,
              status === 'cancelled' && styles.proposedTaskStatusPillMuted,
            ]}
          >
            <Text
              style={[
                styles.proposedTaskStatusText,
                status === 'cancelled' && styles.proposedTaskStatusTextMuted,
              ]}
            >
              {status === 'removed' ? 'Removed' : 'Cancelled'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderPlanningActionButton = ({
    actionKey,
    suggestedAction,
    taskId,
  }: {
    actionKey: string;
    suggestedAction?: MiloAiSuggestedAction | null;
    taskId?: string | null;
  }) => {
    const { action, task } = buildValidatedPlanningAction({
      onlineMeetingLinks,
      suggestedAction,
      taskId,
      tasks,
    });

    if (!action) {
      return null;
    }

    return (
      <View key={actionKey} style={styles.smartCardActionGrid}>
        {renderTalkActionButton(action, 0, task)}
      </View>
    );
  };

  const renderSmartPlanCard = (message: MiloTalkMessage) => {
    const smartPlan = message.smartPlan;

    if (!smartPlan) {
      return null;
    }

    return (
      <View style={styles.smartCard}>
        <View style={styles.smartCardHeader}>
          <View style={styles.smartCardIcon}>
            <Ionicons
              name="sparkles-outline"
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.smartCardHeaderCopy}>
            <Text style={styles.smartCardEyebrow}>Smart plan</Text>
            <Text numberOfLines={2} style={styles.smartCardTitle}>
              {smartPlan.title}
            </Text>
          </View>
        </View>

        <Text style={styles.smartCardMessage}>{smartPlan.summary}</Text>

        {smartPlan.steps.length ? (
          <View style={styles.smartPlanStepList}>
            {smartPlan.steps.map((step, index) => {
              const task = step.taskId
                ? tasks.find((item) => item.id === step.taskId)
                : undefined;

              return (
                <View
                  key={`${step.label}-${index}`}
                  style={styles.smartPlanStep}
                >
                  <View style={styles.smartPlanStepNumber}>
                    <Text style={styles.smartPlanStepNumberText}>
                      {index + 1}
                    </Text>
                  </View>
                  <View style={styles.smartPlanStepBody}>
                    <Text style={styles.smartPlanStepLabel}>{step.label}</Text>
                    {task ? (
                      <Text numberOfLines={1} style={styles.smartCardTask}>
                        {task.title}
                      </Text>
                    ) : null}
                    {step.reason ? (
                      <Text style={styles.smartCardReason}>{step.reason}</Text>
                    ) : null}
                    {renderPlanningActionButton({
                      actionKey: `smart-plan-${index}`,
                      suggestedAction: step.suggestedAction,
                      taskId: step.taskId,
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSmartNudgeCard = (message: MiloTalkMessage) => {
    const smartNudge = message.smartNudge;

    if (!smartNudge) {
      return null;
    }

    const task = smartNudge.taskId
      ? tasks.find((item) => item.id === smartNudge.taskId)
      : undefined;

    return (
      <View style={styles.smartCard}>
        <View style={styles.smartCardHeader}>
          <View style={styles.smartCardIcon}>
            <Ionicons
              name="leaf-outline"
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.smartCardHeaderCopy}>
            <Text style={styles.smartCardEyebrow}>Smart nudge</Text>
            <Text numberOfLines={2} style={styles.smartCardTitle}>
              {smartNudge.title}
            </Text>
          </View>
        </View>

        <Text style={styles.smartCardMessage}>{smartNudge.message}</Text>

        {task ? (
          <Text numberOfLines={1} style={styles.smartCardTask}>
            {task.title}
          </Text>
        ) : null}

        {renderPlanningActionButton({
          actionKey: 'smart-nudge-action',
          suggestedAction: smartNudge.suggestedAction,
          taskId: smartNudge.taskId,
        })}
      </View>
    );
  };

  const renderTimelineInsightCard = (message: MiloTalkMessage) => {
    const timelineInsight = message.timelineInsight;

    if (!timelineInsight) {
      return null;
    }

    const relatedTasks = (timelineInsight.taskIds || [])
      .map((taskId) => tasks.find((item) => item.id === taskId))
      .filter((task): task is Task => Boolean(task));

    return (
      <View style={styles.smartCard}>
        <View style={styles.smartCardHeader}>
          <View style={styles.smartCardIcon}>
            <Ionicons
              name="time-outline"
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.smartCardHeaderCopy}>
            <Text style={styles.smartCardEyebrow}>Timeline insight</Text>
            <Text numberOfLines={2} style={styles.smartCardTitle}>
              {timelineInsight.title}
            </Text>
          </View>
        </View>

        <Text style={styles.smartCardMessage}>{timelineInsight.message}</Text>

        {timelineInsight.warnings?.length ? (
          <View style={styles.timelineWarningList}>
            {timelineInsight.warnings.map((warning, index) => (
              <View
                key={`${warning}-${index}`}
                style={styles.timelineWarningRow}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.timelineWarningText}>{warning}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {relatedTasks.length ? (
          <View style={styles.timelineTaskList}>
            {relatedTasks.map((task) => (
              <View key={task.id} style={styles.timelineTaskPill}>
                <Ionicons
                  name={proposedTaskIcons[task.plannerType]}
                  size={13}
                  color={theme.colors.primaryDark}
                />
                <Text numberOfLines={1} style={styles.timelineTaskText}>
                  {task.title}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderMiloInsightCard = (message: MiloTalkMessage) => {
    const miloInsight = message.miloInsight;

    if (!miloInsight) {
      return null;
    }

    const statRows = getMiloInsightStatRows(miloInsight.stats);
    const nextBestTask = miloInsight.nextBestTaskId
      ? tasks.find((item) => item.id === miloInsight.nextBestTaskId)
      : undefined;

    return (
      <View style={styles.smartCard}>
        <View style={styles.smartCardHeader}>
          <View style={styles.smartCardIcon}>
            <Ionicons
              name="analytics-outline"
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.smartCardHeaderCopy}>
            <Text style={styles.smartCardEyebrow}>Milo insight</Text>
            <Text numberOfLines={2} style={styles.smartCardTitle}>
              {miloInsight.title}
            </Text>
          </View>
        </View>

        <Text style={styles.smartCardMessage}>{miloInsight.summary}</Text>

        {statRows.length ? (
          <View style={styles.insightStatGrid}>
            {statRows.map((row) => (
              <View key={row.label} style={styles.insightStatChip}>
                <Text style={styles.insightStatValue}>{row.value}</Text>
                <Text numberOfLines={1} style={styles.insightStatLabel}>
                  {row.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {miloInsight.wins?.length ? (
          <View style={styles.insightList}>
            <Text style={styles.insightListTitle}>Wins</Text>
            {miloInsight.wins.map((win, index) => (
              <View key={`${win}-${index}`} style={styles.insightListRow}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.insightListText}>{win}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {miloInsight.concerns?.length ? (
          <View style={styles.insightList}>
            <Text style={styles.insightListTitle}>Needs attention</Text>
            {miloInsight.concerns.map((concern, index) => (
              <View key={`${concern}-${index}`} style={styles.insightListRow}>
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.insightListText}>{concern}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {miloInsight.reflection ? (
          <View style={styles.insightReflectionBox}>
            <Text style={styles.insightReflectionLabel}>Milo reflection</Text>
            <Text style={styles.insightReflectionText}>
              {miloInsight.reflection}
            </Text>
          </View>
        ) : null}

        {nextBestTask ? (
          <View style={styles.insightNextTask}>
            <Ionicons
              name={proposedTaskIcons[nextBestTask.plannerType]}
              size={14}
              color={theme.colors.primaryDark}
            />
            <View style={styles.insightNextTaskCopy}>
              <Text style={styles.insightNextTaskLabel}>Next best focus</Text>
              <Text numberOfLines={1} style={styles.insightNextTaskTitle}>
                {nextBestTask.title}
              </Text>
            </View>
          </View>
        ) : null}

        {renderPlanningActionButton({
          actionKey: 'milo-insight-action',
          suggestedAction: miloInsight.suggestedAction,
          taskId: miloInsight.nextBestTaskId,
        })}
      </View>
    );
  };

  const renderTalkMessage = (message: MiloTalkMessage) => {
    if (message.role === 'user') {
      return (
        <View key={message.id} style={styles.miloTalkMessageRowUser}>
          <View style={styles.miloTalkUserBubble}>
            <Text
              style={[
                styles.miloTalkUserText,
                !isDark && styles.miloTalkUserTextLight,
              ]}
            >
              {message.text}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View key={message.id} style={styles.miloTalkMessageRowMilo}>
        <View style={styles.miloTalkMessageAvatar}>
          <MiloMoodImage
            mood={message.isTyping ? 'focused' : 'waving'}
            size={34}
          />
        </View>
        <View style={styles.miloTalkMiloColumn}>
          <Text style={styles.miloTalkMiloName}>Milo</Text>
          <View style={styles.miloTalkMiloBubble}>
            <Text
              style={[
                styles.miloTalkMiloText,
                message.isTyping && styles.miloTalkMiloTypingText,
              ]}
            >
              {message.text}
            </Text>

            {message.proposedTask ? renderProposedTaskCard(message) : null}

            {message.proposedTaskUpdate
              ? renderProposedTaskUpdateCard(message)
              : null}

            {message.proposedTaskCompletion
              ? renderProposedTaskCompletionCard(message)
              : null}

            {message.proposedTaskDeletion
              ? renderProposedTaskDeletionCard(message)
              : null}

            {message.smartPlan ? renderSmartPlanCard(message) : null}

            {message.smartNudge ? renderSmartNudgeCard(message) : null}

            {message.timelineInsight
              ? renderTimelineInsightCard(message)
              : null}

            {message.miloInsight ? renderMiloInsightCard(message) : null}

            {message.relatedTask ? (
              <View style={styles.miloTalkTaskCard}>
                <View style={styles.miloTalkTaskIcon}>
                  <Ionicons
                    name={
                      message.relatedTask.plannerType === 'meeting'
                        ? 'people-outline'
                        : message.relatedTask.plannerType === 'date'
                        ? 'heart-outline'
                        : 'checkbox-outline'
                    }
                    size={16}
                    color={theme.colors.primaryDark}
                  />
                </View>
                <View style={styles.miloTalkTaskCopy}>
                  <Text numberOfLines={1} style={styles.miloTalkTaskTitle}>
                    {message.relatedTask.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.miloTalkTaskMeta}>
                    {message.relatedTaskSummary}
                  </Text>
                </View>
              </View>
            ) : null}

            {message.actions?.length ? (
              <View style={styles.miloTalkActionGrid}>
                {message.actions.map((action, index) =>
                  renderTalkActionButton(action, index, message.relatedTask)
                )}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const canSendMiloTalkMessage = Boolean(miloTalkInput.trim());
  const headerBackIconColor = isDark ? theme.colors.text : theme.colors.primaryDark;
  const headerActionIconColor = theme.colors.primaryDark;
  const sendIconColor = canSendMiloTalkMessage
    ? theme.colors.white
    : isDark
    ? theme.colors.white
    : theme.colors.primaryDark;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={styles.screen}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerSideArea}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[styles.headerButton, !isDark && styles.headerButtonLight]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={headerBackIconColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerCopy}>
          <View style={styles.headerTitleRow}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              Talk with Milo
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.headerInlineStatusText,
                miloAiSettings.aiMode === 'local' &&
                  styles.headerInlineStatusTextLocal,
              ]}
            >
              {miloAiModeLabel}
            </Text>
          </View>
        </View>

        <View style={[styles.headerSideArea, styles.headerRightArea]}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.headerAiSettingsButton,
              !isDark && styles.headerButtonLight,
              miloAiSettings.aiMode === 'local' &&
                styles.headerAiSettingsButtonLocal,
            ]}
            onPress={() => void handleOpenMiloAiSettings()}
            accessibilityRole="button"
            accessibilityLabel="AI Settings"
          >
            <Ionicons
              name="options-outline"
              size={17}
              color={headerActionIconColor}
            />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.headerNewChatButton,
              !isDark && styles.headerNewChatButtonLight,
            ]}
            onPress={() => void handleStartNewChat()}
            accessibilityRole="button"
            accessibilityLabel="Start a new Milo chat"
          >
            <Ionicons
              name="add-circle-outline"
              size={17}
              color={headerActionIconColor}
            />
            <Text
              style={[
                styles.headerNewChatText,
                !isDark && styles.headerNewChatTextLight,
              ]}
            >
              New
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.miloTalkConversationPane}>
        <View pointerEvents="none" style={styles.miloTalkWallpaperPattern}>
          <Ionicons
            name="leaf-outline"
            size={54}
            color={
              isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(35, 107, 53, 0.07)'
            }
            style={[styles.wallpaperIcon, styles.wallpaperIconTopLeft]}
          />
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={48}
            color={
              isDark ? 'rgba(0, 168, 132, 0.08)' : 'rgba(47, 143, 70, 0.09)'
            }
            style={[styles.wallpaperIcon, styles.wallpaperIconTopRight]}
          />
          <Ionicons
            name="sparkles-outline"
            size={42}
            color={
              isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(35, 107, 53, 0.06)'
            }
            style={[styles.wallpaperIcon, styles.wallpaperIconMiddleLeft]}
          />
          <Ionicons
            name="timer-outline"
            size={50}
            color={
              isDark ? 'rgba(0, 168, 132, 0.07)' : 'rgba(47, 143, 70, 0.075)'
            }
            style={[styles.wallpaperIcon, styles.wallpaperIconMiddleRight]}
          />
          <Ionicons
            name="checkbox-outline"
            size={46}
            color={
              isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(35, 107, 53, 0.055)'
            }
            style={[styles.wallpaperIcon, styles.wallpaperIconBottomLeft]}
          />
          <View
            style={[
              styles.wallpaperDot,
              styles.wallpaperDotOne,
              {
                backgroundColor: isDark
                  ? 'rgba(0, 168, 132, 0.08)'
                  : 'rgba(47, 143, 70, 0.09)',
              },
            ]}
          />
          <View
            style={[
              styles.wallpaperDot,
              styles.wallpaperDotTwo,
              {
                backgroundColor: isDark
                  ? 'rgba(255, 255, 255, 0.035)'
                  : 'rgba(35, 107, 53, 0.065)',
              },
            ]}
          />
        </View>

        <ScrollView
          ref={talkScrollRef}
          style={styles.miloTalkMessageList}
          contentContainerStyle={[
            styles.miloTalkMessageListContent,
            !showMiloTalkSuggestions && styles.miloTalkMessageListContentCompact,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollTalkToBottom}
        >
          {chatMessages.map(renderTalkMessage)}
        </ScrollView>
      </View>

      <View
        style={[
          styles.miloTalkComposer,
          !showMiloTalkSuggestions && styles.miloTalkComposerCompact,
          {
            paddingBottom: showMiloTalkSuggestions
              ? Math.max(insets.bottom, 10) + 10
              : Math.max(insets.bottom, 8) + 6,
          },
        ]}
      >
        {showMiloTalkSuggestions ? (
          <View style={styles.miloTalkSuggestionRow}>
            {miloTalkSuggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion}
                activeOpacity={0.82}
                style={styles.miloTalkSuggestionChip}
                onPress={() => void handleSend(suggestion)}
                accessibilityRole="button"
                accessibilityLabel={`Send suggestion: ${suggestion}`}
              >
                <Ionicons
                  name={miloTalkSuggestionIcons[suggestion]}
                  size={14}
                  color={theme.colors.primaryDark}
                />
                <Text numberOfLines={1} style={styles.miloTalkSuggestionText}>
                  {suggestion}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View
          style={[
            styles.miloTalkInputRow,
            !showMiloTalkSuggestions && styles.miloTalkInputRowCompact,
          ]}
        >
          <TextInput
            value={miloTalkInput}
            onChangeText={setMiloTalkInput}
            placeholder="Message Milo..."
            placeholderTextColor={theme.colors.muted}
            returnKeyType="send"
            onSubmitEditing={() => void handleSend()}
            style={styles.miloTalkInput}
          />
          <TouchableOpacity
            activeOpacity={0.84}
            disabled={!canSendMiloTalkMessage}
            style={[
              styles.miloTalkSendButton,
              !isDark && styles.miloTalkSendButtonLightActive,
              !canSendMiloTalkMessage && styles.miloTalkSendButtonDisabled,
              !canSendMiloTalkMessage &&
                !isDark &&
                styles.miloTalkSendButtonLightDisabled,
            ]}
            onPress={() => void handleSend()}
            accessibilityRole="button"
            accessibilityLabel="Send message to Milo"
          >
            <Ionicons name="send" size={17} color={sendIconColor} />
          </TouchableOpacity>
        </View>

        <Text
          style={[
            styles.miloTalkPrototypeFooter,
            (miloAiSettings.aiMode === 'local' ||
              miloTalkBrainStatus === 'localOnly') &&
              styles.miloTalkPrototypeFooterLocal,
          ]}
        >
          {getMiloTalkFooterText(
            miloTalkBrainStatus,
            miloAiSettings,
            miloTalkFallbackReason
          )}
        </Text>
      </View>

      <Modal
        visible={isMiloAiSettingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMiloAiSettingsVisible(false)}
      >
        <View style={styles.aiSettingsOverlay}>
          <View
            style={[
              styles.aiSettingsSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 18 },
            ]}
          >
            <View style={styles.aiSettingsHandle} />

            <View style={styles.aiSettingsHeader}>
              <View>
                <View style={styles.aiSettingsEyebrowRow}>
                  <Ionicons
                    name="leaf-outline"
                    size={13}
                    color={theme.colors.primaryDark}
                  />
                  <Text style={styles.aiSettingsEyebrow}>Milo Brain</Text>
                </View>
                <Text style={styles.aiSettingsTitle}>AI Settings</Text>
                <Text style={styles.aiSettingsHelper}>
                  Control how Milo uses AI and local guidance.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.aiSettingsCloseButton}
                onPress={() => setIsMiloAiSettingsVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close AI settings"
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.aiSettingsSectionLabel}>AI Mode</Text>
            <View style={styles.aiModeCardGrid}>
              {(['online', 'local'] as const).map((mode) => {
                const isSelected = miloAiSettings.aiMode === mode;

                return (
                  <TouchableOpacity
                    key={mode}
                    activeOpacity={0.84}
                    style={[
                      styles.aiModeCard,
                      isSelected && styles.aiModeCardActive,
                    ]}
                    onPress={() =>
                      void handleUpdateMiloAiSettings({ aiMode: mode })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      mode === 'online' ? 'Use AI Online' : 'Use Local Only'
                    }
                  >
                    <View
                      style={[
                        styles.aiModeIconBox,
                        isSelected && styles.aiModeIconBoxActive,
                      ]}
                    >
                      <Ionicons
                        name={mode === 'online' ? 'cloud-outline' : 'leaf-outline'}
                        size={25}
                        color={theme.colors.primaryDark}
                      />
                    </View>
                    <Text
                      style={[
                        styles.aiModeCardTitle,
                        isSelected && styles.aiModeCardTitleActive,
                      ]}
                    >
                      {mode === 'online' ? 'AI Online' : 'Local Only'}
                    </Text>
                    <Text style={styles.aiModeCardText}>
                      {mode === 'online'
                        ? 'Uses Supabase + OpenAI'
                        : 'Uses saved task guidance'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.aiSettingsSectionLabel}>Smart Controls</Text>
            <View style={styles.aiSettingsControlsCard}>
              <View style={styles.aiSettingsRow}>
                <View style={styles.aiSettingsIconBox}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={theme.colors.primaryDark}
                  />
                </View>
                <View style={styles.aiSettingsRowCopy}>
                  <Text style={styles.aiSettingsRowTitle}>
                    Skip AI for small talk
                  </Text>
                  <Text style={styles.aiSettingsRowText}>
                    Quick hellos and thanks stay local.
                  </Text>
                </View>
                <Switch
                  value={miloAiSettings.skipAiForSmallTalk}
                  onValueChange={(value) =>
                    void handleUpdateMiloAiSettings({
                      skipAiForSmallTalk: value,
                    })
                  }
                  trackColor={aiSettingsSwitchTrackColor}
                  thumbColor={
                    miloAiSettings.skipAiForSmallTalk
                      ? theme.colors.primaryDark
                      : aiSettingsSwitchThumbColor
                  }
                />
              </View>

              <View style={styles.aiSettingsDivider} />

              <View style={styles.aiSettingsRow}>
                <View style={styles.aiSettingsIconBox}>
                  <Ionicons
                    name="bug-outline"
                    size={18}
                    color={theme.colors.primaryDark}
                  />
                </View>
                <View style={styles.aiSettingsRowCopy}>
                  <Text style={styles.aiSettingsRowTitle}>
                    Show debug reason
                  </Text>
                  <Text style={styles.aiSettingsRowText}>
                    Adds the fallback reason to the footer.
                  </Text>
                </View>
                <Switch
                  value={miloAiSettings.showDebugReason}
                  onValueChange={(value) =>
                    void handleUpdateMiloAiSettings({ showDebugReason: value })
                  }
                  trackColor={aiSettingsSwitchTrackColor}
                  thumbColor={
                    miloAiSettings.showDebugReason
                      ? theme.colors.primaryDark
                      : aiSettingsSwitchThumbColor
                  }
                />
              </View>
            </View>

            <Text style={styles.aiSettingsSectionLabel}>Usage Today</Text>
            <View style={styles.aiUsageCard}>
              <View style={styles.aiUsageIconBox}>
                <Ionicons
                  name="trending-up-outline"
                  size={21}
                  color={theme.colors.primaryDark}
                />
              </View>
              <View style={styles.aiUsageCopy}>
                <Text style={styles.aiUsageLabel}>AI calls today</Text>
                <Text style={styles.aiUsageCount}>
                  {miloAiSettings.aiCallsToday}
                </Text>
                <Text style={styles.aiUsageText}>
                  Tracked locally for cost awareness.
                </Text>
                <Text style={styles.aiUsageResetText}>
                  Resets daily.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.aiSettingsResetButton}
              onPress={handleResetMiloAiSettings}
              accessibilityRole="button"
              accessibilityLabel="Reset AI settings"
            >
              <Text style={styles.aiSettingsResetText}>Reset AI settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.chatBackground,
  },
  header: {
    minHeight: 74,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  headerSideArea: {
    width: 104,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRightArea: {
    justifyContent: 'flex-end',
    gap: 6,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonLight: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.inputBorder,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerAiSettingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAiSettingsButtonLocal: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: `${theme.colors.warning}45`,
  },
  headerNewChatButton: {
    minWidth: 52,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}35`,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    gap: 4,
  },
  headerNewChatButtonLight: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.inputBorder,
  },
  headerNewChatText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  headerNewChatTextLight: {
    color: theme.colors.primary,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  headerInlineStatusText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  headerInlineStatusTextLocal: {
    color: theme.colors.warning,
  },
  aiSettingsOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  aiSettingsSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    ...theme.shadowSoft,
  },
  aiSettingsHandle: {
    alignSelf: 'center',
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 18,
  },
  aiSettingsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  aiSettingsEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiSettingsEyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  aiSettingsTitle: {
    marginTop: 8,
    color: theme.colors.text,
    fontSize: 25,
    fontWeight: '900',
  },
  aiSettingsHelper: {
    marginTop: 8,
    maxWidth: 280,
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  aiSettingsCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSettingsSectionLabel: {
    marginTop: 20,
    marginBottom: 9,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  aiModeCardGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  aiModeCard: {
    flex: 1,
    minHeight: 128,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  aiModeCardActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  aiModeIconBox: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: theme.colors.input,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  aiModeIconBoxActive: {
    backgroundColor: theme.colors.cardSoft,
  },
  aiModeCardTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  aiModeCardTitleActive: {
    color: theme.colors.primaryDark,
  },
  aiModeCardText: {
    marginTop: 6,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  aiSettingsControlsCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  aiSettingsRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 12,
  },
  aiSettingsIconBox: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSettingsRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  aiSettingsRowTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  aiSettingsRowText: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  aiSettingsDivider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginLeft: 66,
  },
  aiUsageCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  aiUsageIconBox: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}35`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiUsageCopy: {
    flex: 1,
    minWidth: 0,
  },
  aiUsageLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  aiUsageCount: {
    marginTop: 2,
    color: theme.colors.primaryDark,
    fontSize: 30,
    fontWeight: '900',
  },
  aiUsageText: {
    marginTop: 2,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  aiUsageResetText: {
    marginTop: 8,
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
  },
  aiSettingsResetButton: {
    alignSelf: 'center',
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: `${theme.colors.danger}45`,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  aiSettingsResetText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '900',
  },
  miloTalkMessageList: {
    flex: 1,
    minHeight: 0,
    zIndex: 1,
  },
  miloTalkConversationPane: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.chatBackground,
    position: 'relative',
    overflow: 'hidden',
  },
  miloTalkWallpaperPattern: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  wallpaperIcon: {
    position: 'absolute',
  },
  wallpaperIconTopLeft: {
    top: 22,
    left: 22,
    transform: [{ rotate: '-12deg' }],
  },
  wallpaperIconTopRight: {
    top: 88,
    right: 28,
    transform: [{ rotate: '14deg' }],
  },
  wallpaperIconMiddleLeft: {
    top: '42%',
    left: 38,
    transform: [{ rotate: '18deg' }],
  },
  wallpaperIconMiddleRight: {
    top: '54%',
    right: 34,
    transform: [{ rotate: '-10deg' }],
  },
  wallpaperIconBottomLeft: {
    bottom: 86,
    left: 86,
    transform: [{ rotate: '-8deg' }],
  },
  wallpaperDot: {
    position: 'absolute',
    borderRadius: 999,
  },
  wallpaperDotOne: {
    width: 78,
    height: 78,
    top: '28%',
    right: -26,
  },
  wallpaperDotTwo: {
    width: 58,
    height: 58,
    bottom: '18%',
    left: -18,
  },
  miloTalkMessageListContent: {
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 30,
  },
  miloTalkMessageListContentCompact: {
    paddingBottom: 10,
  },
  miloTalkMessageRowUser: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  miloTalkUserBubble: {
    maxWidth: '78%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 6,
    backgroundColor: theme.colors.outgoingBubble,
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  miloTalkUserText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  miloTalkUserTextLight: {
    color: theme.colors.primaryDark,
  },
  miloTalkMessageRowMilo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingRight: 16,
  },
  miloTalkMessageAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  miloTalkMiloColumn: {
    flex: 1,
    minWidth: 0,
  },
  miloTalkMiloName: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    marginLeft: 3,
  },
  miloTalkMiloBubble: {
    maxWidth: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: theme.colors.incomingBubble,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    paddingHorizontal: 13,
    paddingVertical: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.045,
    shadowRadius: 4,
    elevation: 1,
  },
  miloTalkMiloText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  miloTalkMiloTypingText: {
    color: theme.colors.textSoft,
  },
  proposedTaskCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  proposedTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  proposedTaskIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  proposedTaskHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  proposedTaskEyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  proposedTaskTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  proposedTaskRows: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  proposedTaskRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    paddingVertical: 6,
  },
  proposedTaskLabel: {
    width: 74,
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '900',
  },
  proposedTaskValue: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },
  proposedTaskDescription: {
    marginTop: 9,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  proposedTaskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 11,
  },
  proposedTaskCreateButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 6,
  },
  proposedTaskCreateText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  proposedTaskCancelButton: {
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  proposedTaskCancelText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  proposedTaskStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 11,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}40`,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  proposedTaskStatusPillMuted: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
  },
  proposedTaskStatusText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  proposedTaskStatusTextMuted: {
    color: theme.colors.textSoft,
  },
  taskUpdateCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  taskUpdateReason: {
    marginTop: 9,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  taskUpdateRows: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  taskUpdateRow: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    paddingVertical: 8,
  },
  taskUpdateLabel: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  taskUpdateValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  taskUpdateValueBox: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  taskUpdateValueLabel: {
    color: theme.colors.textSoft,
    fontSize: 9,
    fontWeight: '900',
    marginBottom: 3,
  },
  taskUpdateValueText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 14,
  },
  taskCompletionCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  taskCompletionReason: {
    marginTop: 9,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  taskDeletionCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: `${theme.colors.danger}35`,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  taskDeletionReason: {
    marginTop: 9,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  smartCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  smartCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  smartCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  smartCardHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  smartCardEyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  smartCardTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  smartCardMessage: {
    marginTop: 10,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  smartPlanStepList: {
    marginTop: 10,
    gap: 9,
  },
  smartPlanStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  smartPlanStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    flexShrink: 0,
  },
  smartPlanStepNumberText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  smartPlanStepBody: {
    flex: 1,
    minWidth: 0,
  },
  smartPlanStepLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  smartCardTask: {
    marginTop: 4,
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  smartCardReason: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  smartCardActionGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timelineWarningList: {
    marginTop: 10,
    gap: 7,
  },
  timelineWarningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  timelineWarningText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  timelineTaskList: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  timelineTaskPill: {
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    gap: 5,
  },
  timelineTaskText: {
    maxWidth: 190,
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  insightStatGrid: {
    marginTop: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  insightStatChip: {
    minWidth: 92,
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  insightStatValue: {
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  insightStatLabel: {
    marginTop: 2,
    color: theme.colors.textSoft,
    fontSize: 9,
    fontWeight: '900',
  },
  insightList: {
    marginTop: 11,
    gap: 7,
  },
  insightListTitle: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  insightListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  insightListText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  insightReflectionBox: {
    marginTop: 11,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  insightReflectionLabel: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  insightReflectionText: {
    marginTop: 5,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
  },
  insightNextTask: {
    marginTop: 11,
    borderRadius: 999,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
  },
  insightNextTaskCopy: {
    flex: 1,
    minWidth: 0,
  },
  insightNextTaskLabel: {
    color: theme.colors.textSoft,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  insightNextTaskTitle: {
    marginTop: 2,
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  miloTalkTaskCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miloTalkTaskIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  miloTalkTaskCopy: {
    flex: 1,
    minWidth: 0,
  },
  miloTalkTaskTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  miloTalkTaskMeta: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  miloTalkComposer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 12,
    paddingTop: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 6,
  },
  miloTalkComposerCompact: {
    paddingTop: 7,
  },
  miloTalkSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miloTalkSuggestionChip: {
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}35`,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 6,
  },
  miloTalkSuggestionText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  miloTalkInputRow: {
    marginTop: 10,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miloTalkInputRowCompact: {
    marginTop: 0,
  },
  miloTalkInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  miloTalkSendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },
  miloTalkSendButtonLightActive: {
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 3,
  },
  miloTalkSendButtonDisabled: {
    backgroundColor: theme.colors.inputBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
  miloTalkSendButtonLightDisabled: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  miloTalkPrototypeFooter: {
    marginTop: 8,
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  miloTalkPrototypeFooterLocal: {
    color: theme.colors.warning,
  },
  miloTalkActionGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miloTalkActionButton: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 118,
    minHeight: 38,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    gap: 6,
  },
  miloTalkActionPrimary: {
    backgroundColor: theme.colors.primaryDark,
  },
  miloTalkActionSecondary: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  miloTalkActionText: {
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    minWidth: 0,
  },
  miloTalkActionPrimaryText: {
    color: theme.colors.white,
  },
  miloTalkActionSecondaryText: {
    color: theme.colors.primaryDark,
  },
});
