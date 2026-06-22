import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  MiloAiInsight,
  MiloAiProposedTask,
  MiloAiProposedTaskCompletion,
  MiloAiProposedTaskDeletion,
  MiloAiProposedTaskUpdate,
  MiloAiSmartNudge,
  MiloAiSmartPlan,
  MiloAiTimelineInsight,
} from './miloAiClient';
import type { MiloBrainActionType } from './miloBrain';
import type { Task } from '../types/task';

export type MiloChatStoredRole = 'user' | 'milo';
export type MiloChatStoredProposalStatus =
  | 'pending'
  | 'created'
  | 'updated'
  | 'completed'
  | 'removed'
  | 'cancelled';

export type MiloChatStoredAction = {
  type: MiloBrainActionType;
  label: string;
  taskId?: string;
  location?: string;
};

export type MiloChatStoredTaskSnapshot = Pick<
  Task,
  | 'id'
  | 'title'
  | 'description'
  | 'dueDate'
  | 'dueTime'
  | 'location'
  | 'plannerType'
  | 'priority'
  | 'estimatedDurationMinutes'
  | 'status'
  | 'createdAt'
>;

export type MiloChatStorageMessage = {
  id: string;
  role: MiloChatStoredRole;
  text: string;
  createdAt: string;
  relatedTaskId?: string | null;
  relatedTaskSummary?: string;
  actions?: MiloChatStoredAction[];
  proposedTask?: MiloAiProposedTask;
  proposedTaskStatus?: MiloChatStoredProposalStatus;
  proposedTaskSourceText?: string;
  proposedTaskUpdate?: MiloAiProposedTaskUpdate;
  proposedTaskUpdateStatus?: MiloChatStoredProposalStatus;
  proposedTaskCompletion?: MiloAiProposedTaskCompletion;
  proposedTaskCompletionStatus?: MiloChatStoredProposalStatus;
  proposedTaskDeletion?: MiloAiProposedTaskDeletion;
  proposedTaskDeletionStatus?: MiloChatStoredProposalStatus;
  proposedTaskDeletionSnapshot?: MiloChatStoredTaskSnapshot;
  smartPlan?: MiloAiSmartPlan;
  smartNudge?: MiloAiSmartNudge;
  timelineInsight?: MiloAiTimelineInsight;
  miloInsight?: MiloAiInsight;
};

export type MiloChatSession = {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  messages: MiloChatStorageMessage[];
};

const ANONYMOUS_CURRENT_CHAT_STORAGE_KEY = '@focusmate/milo-chat/current';
const ANONYMOUS_CHAT_SESSIONS_STORAGE_KEY = '@focusmate/milo-chat/sessions';
const MAX_STORED_MESSAGES = 200;
const MAX_MESSAGE_TEXT_LENGTH = 1400;
const MAX_TITLE_LENGTH = 48;
const MAX_PREVIEW_LENGTH = 110;

const getCurrentChatStorageKey = (userId?: string | null) =>
  userId
    ? `@focusmate/milo-chat/current/user:${userId}`
    : ANONYMOUS_CURRENT_CHAT_STORAGE_KEY;

const getChatSessionsStorageKey = (userId?: string | null) =>
  userId
    ? `@focusmate/milo-chat/sessions/user:${userId}`
    : ANONYMOUS_CHAT_SESSIONS_STORAGE_KEY;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}...`
    : trimmed;
}

function getDateText(value: unknown) {
  const text = trimText(value, 40);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : undefined;
}

function sanitizeStoredAction(value: unknown): MiloChatStoredAction | null {
  if (!isRecord(value)) return null;

  const type = value.type;
  if (
    type !== 'viewTask' &&
    type !== 'startFocus' &&
    type !== 'findResources' &&
    type !== 'openMaps' &&
    type !== 'joinMeeting'
  ) {
    return null;
  }

  const label = trimText(value.label, 36);
  if (!label) return null;

  return {
    type,
    label,
    taskId: trimText(value.taskId, 80),
    location: trimText(value.location, 160),
  };
}

function sanitizeStoredTaskSnapshot(
  value: unknown
): MiloChatStoredTaskSnapshot | undefined {
  if (!isRecord(value)) return undefined;

  const id = trimText(value.id, 80);
  const title = trimText(value.title, 120);
  const plannerType = value.plannerType;
  const priority = value.priority;
  const status = value.status;
  const createdAt = getDateText(value.createdAt) || new Date().toISOString();

  if (
    !id ||
    !title ||
    (plannerType !== 'task' && plannerType !== 'meeting' && plannerType !== 'date') ||
    (priority !== 'low' && priority !== 'medium' && priority !== 'high') ||
    (status !== 'pending' && status !== 'completed')
  ) {
    return undefined;
  }

  return {
    id,
    title,
    description: trimText(value.description, 260),
    dueDate: trimText(value.dueDate, 20),
    dueTime: trimText(value.dueTime, 30),
    location: trimText(value.location, 160),
    plannerType,
    priority,
    estimatedDurationMinutes:
      typeof value.estimatedDurationMinutes === 'number' &&
      Number.isFinite(value.estimatedDurationMinutes)
        ? value.estimatedDurationMinutes
        : undefined,
    status,
    createdAt,
  };
}

function sanitizeProposalStatus(
  value: unknown
): MiloChatStoredProposalStatus | undefined {
  return value === 'pending' ||
    value === 'created' ||
    value === 'updated' ||
    value === 'completed' ||
    value === 'removed' ||
    value === 'cancelled'
    ? value
    : undefined;
}

function sanitizeStoredMessage(value: unknown): MiloChatStorageMessage | null {
  if (!isRecord(value) || value.isTyping === true) return null;

  const id = trimText(value.id, 90);
  const role = value.role === 'user' || value.role === 'milo' ? value.role : null;
  const text = trimText(value.text, MAX_MESSAGE_TEXT_LENGTH);
  const createdAt = getDateText(value.createdAt);

  if (!id || !role || !text || !createdAt) return null;

  const actions = Array.isArray(value.actions)
    ? value.actions
        .map(sanitizeStoredAction)
        .filter((action): action is MiloChatStoredAction => Boolean(action))
        .slice(0, 5)
    : undefined;

  return {
    id,
    role,
    text,
    createdAt,
    relatedTaskId: trimText(value.relatedTaskId, 80) || null,
    relatedTaskSummary: trimText(value.relatedTaskSummary, 180),
    actions,
    proposedTask: isRecord(value.proposedTask)
      ? (value.proposedTask as MiloAiProposedTask)
      : undefined,
    proposedTaskStatus: sanitizeProposalStatus(value.proposedTaskStatus),
    proposedTaskSourceText: trimText(value.proposedTaskSourceText, 1200),
    proposedTaskUpdate: isRecord(value.proposedTaskUpdate)
      ? (value.proposedTaskUpdate as MiloAiProposedTaskUpdate)
      : undefined,
    proposedTaskUpdateStatus: sanitizeProposalStatus(
      value.proposedTaskUpdateStatus
    ),
    proposedTaskCompletion: isRecord(value.proposedTaskCompletion)
      ? (value.proposedTaskCompletion as MiloAiProposedTaskCompletion)
      : undefined,
    proposedTaskCompletionStatus: sanitizeProposalStatus(
      value.proposedTaskCompletionStatus
    ),
    proposedTaskDeletion: isRecord(value.proposedTaskDeletion)
      ? (value.proposedTaskDeletion as MiloAiProposedTaskDeletion)
      : undefined,
    proposedTaskDeletionStatus: sanitizeProposalStatus(
      value.proposedTaskDeletionStatus
    ),
    proposedTaskDeletionSnapshot: sanitizeStoredTaskSnapshot(
      value.proposedTaskDeletionSnapshot
    ),
    smartPlan: isRecord(value.smartPlan)
      ? (value.smartPlan as MiloAiSmartPlan)
      : undefined,
    smartNudge: isRecord(value.smartNudge)
      ? (value.smartNudge as MiloAiSmartNudge)
      : undefined,
    timelineInsight: isRecord(value.timelineInsight)
      ? (value.timelineInsight as MiloAiTimelineInsight)
      : undefined,
    miloInsight: isRecord(value.miloInsight)
      ? (value.miloInsight as MiloAiInsight)
      : undefined,
  };
}

function sanitizeStoredMessages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(sanitizeStoredMessage)
    .filter((message): message is MiloChatStorageMessage => Boolean(message))
    .slice(-MAX_STORED_MESSAGES);
}

function sanitizeStoredSession(value: unknown): MiloChatSession | null {
  if (!isRecord(value)) return null;

  const id = trimText(value.id, 90);
  const title = trimText(value.title, MAX_TITLE_LENGTH);
  const preview = trimText(value.preview, MAX_PREVIEW_LENGTH);
  const createdAt = getDateText(value.createdAt);
  const updatedAt = getDateText(value.updatedAt);
  const messages = sanitizeStoredMessages(value.messages);

  if (!id || !title || !preview || !createdAt || !updatedAt || !messages.length) {
    return null;
  }

  return {
    id,
    title,
    preview,
    createdAt,
    updatedAt,
    messages,
  };
}

function sortSessions(sessions: MiloChatSession[]) {
  return [...sessions].sort(
    (first, second) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
  );
}

function mergeChatSessions(sessions: MiloChatSession[]) {
  const sessionsById = new Map<string, MiloChatSession>();

  sessions.forEach((session) => {
    const current = sessionsById.get(session.id);

    if (
      !current ||
      new Date(session.updatedAt).getTime() > new Date(current.updatedAt).getTime()
    ) {
      sessionsById.set(session.id, session);
    }
  });

  return sortSessions(Array.from(sessionsById.values()));
}

function getStoredMessagesSignature(messages: MiloChatStorageMessage[]) {
  return JSON.stringify(messages);
}

async function loadCurrentMessagesForKey(storageKey: string) {
  const stored = await AsyncStorage.getItem(storageKey);
  if (!stored) return [];

  const parsed = JSON.parse(stored);
  return sanitizeStoredMessages(
    Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.messages : []
  );
}

async function loadSessionsForKey(storageKey: string) {
  const stored = await AsyncStorage.getItem(storageKey);
  if (!stored) return [];

  const parsed = JSON.parse(stored);
  const sessions = Array.isArray(parsed)
    ? parsed
        .map(sanitizeStoredSession)
        .filter((session): session is MiloChatSession => Boolean(session))
    : [];

  return sortSessions(sessions);
}

function getSessionTitle(messages: MiloChatStorageMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  return trimText(firstUserMessage?.text, MAX_TITLE_LENGTH) || 'Milo chat';
}

function getSessionPreview(messages: MiloChatStorageMessage[]) {
  const lastMessage = [...messages]
    .reverse()
    .find((message) => message.text.trim());
  return trimText(lastMessage?.text, MAX_PREVIEW_LENGTH) || 'Milo chat';
}

function buildChatSession(
  messages: MiloChatStorageMessage[],
  existingSession?: MiloChatSession
): MiloChatSession {
  const now = new Date().toISOString();
  const createdAt = messages[0]?.createdAt || now;
  const updatedAt = messages[messages.length - 1]?.createdAt || now;

  return {
    id:
      existingSession?.id ||
      `milo-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: getSessionTitle(messages),
    preview: getSessionPreview(messages),
    createdAt: existingSession?.createdAt || createdAt,
    updatedAt,
    messages,
  };
}

export async function loadCurrentMiloChat(userId?: string | null) {
  try {
    const storageKey = getCurrentChatStorageKey(userId);
    const scopedMessages = await loadCurrentMessagesForKey(storageKey);

    if (scopedMessages.length > 0 || !userId) {
      console.log('Loaded Milo chat message count:', scopedMessages.length);
      return scopedMessages;
    }

    const anonymousMessages = await loadCurrentMessagesForKey(
      ANONYMOUS_CURRENT_CHAT_STORAGE_KEY
    );

    if (anonymousMessages.length > 0) {
      const anonymousSignature = getStoredMessagesSignature(anonymousMessages);
      const sessionsStorageKey = getChatSessionsStorageKey(userId);
      const archivedSessions = mergeChatSessions([
        ...(await loadSessionsForKey(sessionsStorageKey)),
        ...(await loadSessionsForKey(ANONYMOUS_CHAT_SESSIONS_STORAGE_KEY)),
      ]);
      const isAlreadyArchived = archivedSessions.some(
        (session) =>
          getStoredMessagesSignature(session.messages) === anonymousSignature
      );

      if (isAlreadyArchived) {
        console.log('Loaded Milo chat message count:', 0);
        return [];
      }

      await saveCurrentMiloChat(anonymousMessages, userId);
      console.log('Migrated Milo chat message count:', anonymousMessages.length);
    }

    console.log('Loaded Milo chat message count:', anonymousMessages.length);
    return anonymousMessages;
  } catch (error) {
    console.log('Failed to load current Milo chat:', error);
    return [];
  }
}

export async function saveCurrentMiloChat(
  messages: MiloChatStorageMessage[],
  userId?: string | null
) {
  const nextMessages = sanitizeStoredMessages(messages);
  await AsyncStorage.setItem(
    getCurrentChatStorageKey(userId),
    JSON.stringify(nextMessages)
  );
}

export async function loadMiloChatSessions(userId?: string | null) {
  try {
    const storageKey = getChatSessionsStorageKey(userId);
    const scopedSessions = await loadSessionsForKey(storageKey);
    const anonymousSessions = userId
      ? await loadSessionsForKey(ANONYMOUS_CHAT_SESSIONS_STORAGE_KEY)
      : [];
    const mergedSessions = mergeChatSessions([
      ...scopedSessions,
      ...anonymousSessions,
    ]);

    if (userId && mergedSessions.length > scopedSessions.length) {
      await saveMiloChatSessions(mergedSessions, userId);
      console.log(
        'Migrated Milo chat session count:',
        mergedSessions.length - scopedSessions.length
      );
    }

    console.log('Loaded Milo chat session count:', mergedSessions.length);
    return mergedSessions;
  } catch (error) {
    console.log('Failed to load Milo chat sessions:', error);
    return [];
  }
}

export async function saveMiloChatSessions(
  sessions: MiloChatSession[],
  userId?: string | null
) {
  const nextSessions = mergeChatSessions(
    sessions
      .map(sanitizeStoredSession)
      .filter((session): session is MiloChatSession => Boolean(session))
  );

  await AsyncStorage.setItem(
    getChatSessionsStorageKey(userId),
    JSON.stringify(nextSessions)
  );

  return nextSessions;
}

export async function loadMiloChatSession(
  sessionId: string,
  userId?: string | null
) {
  const sessions = await loadMiloChatSessions(userId);
  return sessions.find((session) => session.id === sessionId) || null;
}

export async function upsertMiloChatSession(
  session: MiloChatSession,
  userId?: string | null
) {
  const sanitizedSession = sanitizeStoredSession(session);

  if (!sanitizedSession) {
    return null;
  }

  const sessions = await loadMiloChatSessions(userId);
  const nextSessions = [
    sanitizedSession,
    ...sessions.filter((item) => item.id !== sanitizedSession.id),
  ];

  await saveMiloChatSessions(nextSessions, userId);
  return sanitizedSession;
}

export async function saveMiloChatSession(
  session: MiloChatSession,
  userId?: string | null
) {
  return upsertMiloChatSession(session, userId);
}

export async function archiveCurrentMiloChat(
  messages: MiloChatStorageMessage[],
  sessionId?: string | null,
  userId?: string | null
) {
  const storableMessages = sanitizeStoredMessages(messages);

  if (!storableMessages.some((message) => message.role === 'user')) {
    return null;
  }

  const sessions = await loadMiloChatSessions(userId);
  const existingSession = sessionId
    ? sessions.find((session) => session.id === sessionId)
    : undefined;
  const archivedSession = buildChatSession(storableMessages, existingSession);

  return upsertMiloChatSession(archivedSession, userId);
}

export async function clearCurrentMiloChat(
  userId?: string | null,
  includeAnonymous = false
) {
  const keys = [
    getCurrentChatStorageKey(userId),
    ...(includeAnonymous || !userId ? [ANONYMOUS_CURRENT_CHAT_STORAGE_KEY] : []),
  ];

  await Promise.all(Array.from(new Set(keys)).map((key) => AsyncStorage.removeItem(key)));
}

export async function deleteMiloChatSession(
  sessionId: string,
  userId?: string | null
) {
  const sessions = await loadMiloChatSessions(userId);
  await saveMiloChatSessions(
    sessions.filter((session) => session.id !== sessionId),
    userId
  );

  if (userId) {
    const anonymousSessions = await loadSessionsForKey(
      ANONYMOUS_CHAT_SESSIONS_STORAGE_KEY
    );

    await saveMiloChatSessions(
      anonymousSessions.filter((session) => session.id !== sessionId)
    );
  }
}

export async function clearMiloChatSessions(
  userId?: string | null,
  includeAnonymous = false
) {
  const keys = [
    getChatSessionsStorageKey(userId),
    ...(includeAnonymous || !userId ? [ANONYMOUS_CHAT_SESSIONS_STORAGE_KEY] : []),
  ];

  await Promise.all(Array.from(new Set(keys)).map((key) => AsyncStorage.removeItem(key)));
}
