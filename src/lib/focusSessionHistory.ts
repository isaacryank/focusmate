import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';

export type FocusSessionStatus = 'completed' | 'stopped' | 'skipped';
export type FocusSessionQuality = 'clean' | 'distracted';
export type FocusSessionTaskType =
  | 'task'
  | 'meeting'
  | 'date'
  | 'focus_without_task';

export type FocusSessionHistoryItem = {
  id: string;
  date: string;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  durationMinutes: number;
  selectedTaskTitle: string | null;
  selectedTaskId?: string;
  localTaskId?: string | null;
  taskTitle: string | null;
  taskId?: string;
  taskTypeSnapshot?: FocusSessionTaskType | null;
  focusQuality: FocusSessionQuality;
  presetName: string;
  status: FocusSessionStatus;
  focusScore?: number;
};

export type FocusSessionRecord = FocusSessionHistoryItem;

type SupabaseFocusSessionRow = {
  id: string;
  user_id: string;
  local_id: string | null;
  task_id: string | null;
  task_local_id: string | null;
  task_title_snapshot: string | null;
  task_type_snapshot: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  focus_minutes: number | null;
  break_minutes: number | null;
  preset: string | null;
  status: string | null;
  quality: string | null;
  score: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export const FOCUS_SESSION_HISTORY_KEY = '@focusmate/focusSessionHistory/v1';
const MAX_FOCUS_SESSION_HISTORY_RECORDS = 100;
const ANONYMOUS_FOCUS_SESSION_HISTORY_STORAGE_KEY = FOCUS_SESSION_HISTORY_KEY;
const LEGACY_FOCUS_SESSION_HISTORY_STORAGE_KEY =
  '@focusmate/focus_session_history';
const LEGACY_FOCUS_SESSIONS_STORAGE_KEY = '@focusmate/focus_sessions';

const getFocusSessionHistoryStorageKey = (userId?: string | null) =>
  userId
    ? `${FOCUS_SESSION_HISTORY_KEY}/user:${userId}`
    : ANONYMOUS_FOCUS_SESSION_HISTORY_STORAGE_KEY;

const getLegacyFocusSessionHistoryStorageKey = (userId?: string | null) =>
  userId
    ? `${LEGACY_FOCUS_SESSION_HISTORY_STORAGE_KEY}/user:${userId}`
    : LEGACY_FOCUS_SESSION_HISTORY_STORAGE_KEY;

const getLegacyFocusSessionsStorageKey = (userId?: string | null) =>
  userId
    ? `@focusmate/focus_sessions/user:${userId}`
    : LEGACY_FOCUS_SESSIONS_STORAGE_KEY;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFocusSessionStatus(value: unknown): value is FocusSessionStatus {
  return value === 'completed' || value === 'stopped' || value === 'skipped';
}

function isFocusSessionQuality(value: unknown): value is FocusSessionQuality {
  return value === 'clean' || value === 'distracted';
}

function isFocusSessionTaskType(value: unknown): value is FocusSessionTaskType {
  return (
    value === 'task' ||
    value === 'meeting' ||
    value === 'date' ||
    value === 'focus_without_task'
  );
}

function getCleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getDateText(value: unknown) {
  const text = getCleanString(value);

  return text && !Number.isNaN(new Date(text).getTime()) ? text : '';
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeFocusSessionHistoryItem(
  value: unknown
): FocusSessionHistoryItem | null {
  if (!isRecord(value)) return null;

  const endedAt =
    getDateText(value.endedAt) ||
    getDateText(value.date) ||
    getDateText(value.completedAt) ||
    getDateText(value.createdAt);
  const startedAt =
    getDateText(value.startedAt) || getDateText(value.createdAt) || endedAt;
  const createdAt = getDateText(value.createdAt) || endedAt || startedAt;
  const date = getDateText(value.date) || endedAt || startedAt || createdAt;

  if (!date) return null;

  const status = isFocusSessionStatus(value.status)
    ? value.status
    : value.completed === false
    ? 'stopped'
    : 'completed';
  const focusQuality = isFocusSessionQuality(value.focusQuality)
    ? value.focusQuality
    : 'clean';
  const durationValue =
    getNumber(value.durationMinutes) ?? getNumber(value.minutes) ?? 0;
  const roundedDurationMinutes = Math.round(durationValue);

  if (roundedDurationMinutes <= 0) return null;

  const durationMinutes = Math.max(1, roundedDurationMinutes);
  const selectedTaskTitle =
    getCleanString(value.selectedTaskTitle) ||
    getCleanString(value.taskTitle) ||
    null;
  const selectedTaskId =
    getCleanString(value.selectedTaskId) ||
    getCleanString(value.taskId) ||
    getCleanString(value.localTaskId);
  const localTaskId = getCleanString(value.localTaskId);
  const presetName =
    getCleanString(value.presetName) || getCleanString(value.preset) || 'Focus';
  const focusScore =
    getNumber(value.focusScore) !== undefined
      ? Math.round(Math.min(100, Math.max(0, getNumber(value.focusScore)!)))
      : undefined;
  const taskTypeSnapshot = isFocusSessionTaskType(value.taskTypeSnapshot)
    ? value.taskTypeSnapshot
    : null;
  const id =
    getCleanString(value.id) ||
    `${startedAt || date}:${status}:${durationMinutes}:${selectedTaskId}`;

  return {
    id,
    date,
    startedAt: startedAt || date,
    endedAt: endedAt || date,
    createdAt: createdAt || date,
    durationMinutes,
    selectedTaskTitle,
    ...(selectedTaskId ? { selectedTaskId, taskId: selectedTaskId } : {}),
    ...(localTaskId ? { localTaskId } : {}),
    taskTitle: selectedTaskTitle,
    taskTypeSnapshot,
    focusQuality,
    presetName,
    status,
    ...(focusScore !== undefined ? { focusScore } : {}),
  };
}

function focusSessionToSupabaseRow(
  session: FocusSessionHistoryItem,
  userId: string
) {
  const taskLocalId =
    session.taskId || session.selectedTaskId || session.localTaskId || null;
  const taskTypeSnapshot =
    session.taskTypeSnapshot || (taskLocalId ? null : 'focus_without_task');

  return {
    user_id: userId,
    local_id: session.id,
    task_id: null,
    task_local_id: taskLocalId,
    task_title_snapshot:
      session.taskTitle ||
      session.selectedTaskTitle ||
      (taskTypeSnapshot === 'focus_without_task'
        ? 'Focus without task'
        : 'Focus session'),
    task_type_snapshot: taskTypeSnapshot,
    started_at: session.startedAt,
    ended_at: session.endedAt || session.date,
    duration_minutes: session.durationMinutes,
    focus_minutes: session.durationMinutes,
    break_minutes: null,
    preset: session.presetName,
    status: session.status,
    quality: session.focusQuality,
    score:
      typeof session.focusScore === 'number' && Number.isFinite(session.focusScore)
        ? session.focusScore
        : null,
  };
}

function supabaseRowToFocusSession(
  row: SupabaseFocusSessionRow
): FocusSessionHistoryItem | null {
  const endedAt = getDateText(row.ended_at) || getDateText(row.created_at);
  const startedAt = getDateText(row.started_at) || endedAt;
  const durationMinutes = Math.round(row.duration_minutes || row.focus_minutes || 0);

  if (!endedAt || durationMinutes <= 0) {
    return null;
  }

  const status = isFocusSessionStatus(row.status) ? row.status : 'completed';
  const focusQuality = isFocusSessionQuality(row.quality) ? row.quality : 'clean';
  const taskTypeSnapshot = isFocusSessionTaskType(row.task_type_snapshot)
    ? row.task_type_snapshot
    : null;
  const taskTitle = row.task_title_snapshot?.trim() || null;
  const taskId = row.task_local_id?.trim() || row.task_id?.trim() || undefined;
  const focusScore =
    typeof row.score === 'number' && Number.isFinite(row.score)
      ? Math.round(Math.min(100, Math.max(0, row.score)))
      : undefined;

  return {
    id: row.local_id || row.id,
    date: endedAt,
    startedAt: startedAt || endedAt,
    endedAt,
    createdAt: row.created_at || endedAt,
    durationMinutes,
    selectedTaskTitle: taskTitle,
    ...(taskId ? { selectedTaskId: taskId, taskId } : {}),
    taskTitle,
    taskTypeSnapshot,
    focusQuality,
    presetName: row.preset?.trim() || 'Focus',
    status,
    ...(focusScore !== undefined ? { focusScore } : {}),
  };
}

async function loadSupabaseFocusSessions(userId?: string | null) {
  if (!userId || !isSupabaseConfigured) {
    return [];
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('ended_at', { ascending: false })
      .limit(500);

    if (error) {
      console.warn('Failed to fetch Supabase focus sessions:', error);
      return [];
    }

    return (data ?? [])
      .map((row) => supabaseRowToFocusSession(row as SupabaseFocusSessionRow))
      .filter((session): session is FocusSessionHistoryItem => Boolean(session));
  } catch (error) {
    console.warn('Failed to fetch Supabase focus sessions:', error);
    return [];
  }
}

async function syncFocusSessionsToSupabase(
  sessions: FocusSessionHistoryItem[],
  userId?: string | null
) {
  if (!userId || !isSupabaseConfigured || sessions.length === 0) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const rows = sessions.map((session) => focusSessionToSupabaseRow(session, userId));
    const { error } = await supabase
      .from('focus_sessions')
      .upsert(rows, { onConflict: 'user_id,local_id' });

    if (error) {
      console.warn('Failed to upsert Supabase focus sessions:', error);
    }
  } catch (error) {
    console.warn('Failed to upsert Supabase focus sessions:', error);
  }
}

function parseStoredSessions(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    const rawSessions = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.sessions)
      ? parsed.sessions
      : [];

    return rawSessions
      .map(normalizeFocusSessionHistoryItem)
      .filter((item): item is FocusSessionHistoryItem => Boolean(item));
  } catch (error) {
    console.log('Failed to parse focus session history:', error);
    return [];
  }
}

function sortFocusSessionHistory(
  sessions: FocusSessionHistoryItem[]
): FocusSessionHistoryItem[] {
  return [...sessions].sort(
    (first, second) =>
      new Date(second.endedAt || second.date).getTime() -
      new Date(first.endedAt || first.date).getTime()
  );
}

function areLikelySameSession(
  first: FocusSessionHistoryItem,
  second: FocusSessionHistoryItem
) {
  const firstEndedAt = new Date(first.endedAt || first.date).getTime();
  const secondEndedAt = new Date(second.endedAt || second.date).getTime();

  return (
    first.status === second.status &&
    first.durationMinutes === second.durationMinutes &&
    Math.abs(firstEndedAt - secondEndedAt) <= 60 * 1000
  );
}

function getSessionRichness(session: FocusSessionHistoryItem) {
  return [
    session.startedAt,
    session.endedAt,
    session.createdAt,
    session.taskId,
    session.taskTitle,
    session.selectedTaskId,
    session.selectedTaskTitle,
    session.presetName !== 'Focus' ? session.presetName : '',
    session.focusScore,
  ].filter(Boolean).length;
}

function mergeSession(
  current: FocusSessionHistoryItem,
  incoming: FocusSessionHistoryItem
): FocusSessionHistoryItem {
  const richer =
    getSessionRichness(incoming) > getSessionRichness(current)
      ? incoming
      : current;
  const other = richer === incoming ? current : incoming;
  const taskId = richer.taskId || richer.selectedTaskId || other.taskId;
  const localTaskId = richer.localTaskId || other.localTaskId;
  const taskTitle =
    richer.taskTitle || richer.selectedTaskTitle || other.taskTitle || null;

  return {
    ...other,
    ...richer,
    ...(taskId ? { taskId, selectedTaskId: taskId } : {}),
    ...(localTaskId ? { localTaskId } : {}),
    taskTitle,
    selectedTaskTitle: taskTitle,
  };
}

function mergeFocusSessionHistory(
  sessions: FocusSessionHistoryItem[]
): FocusSessionHistoryItem[] {
  const merged: FocusSessionHistoryItem[] = [];

  sessions.forEach((session) => {
    const exactIndex = merged.findIndex((item) => item.id === session.id);

    if (exactIndex >= 0) {
      merged[exactIndex] = mergeSession(merged[exactIndex], session);
      return;
    }

    const nearbyIndex = merged.findIndex((item) =>
      areLikelySameSession(item, session)
    );

    if (nearbyIndex >= 0) {
      merged[nearbyIndex] = mergeSession(merged[nearbyIndex], session);
      return;
    }

    merged.push(session);
  });

  return sortFocusSessionHistory(merged);
}

async function loadSessionsForKey(storageKey: string) {
  return parseStoredSessions(await AsyncStorage.getItem(storageKey));
}

export async function getFocusSessionHistory(userId?: string | null) {
  try {
    const storageKey = getFocusSessionHistoryStorageKey(userId);
    const legacyHistoryKey = getLegacyFocusSessionHistoryStorageKey(userId);
    const legacySimpleKey = getLegacyFocusSessionsStorageKey(userId);
    const keys = [
      storageKey,
      legacyHistoryKey,
      legacySimpleKey,
      ...(userId
        ? [
            ANONYMOUS_FOCUS_SESSION_HISTORY_STORAGE_KEY,
            LEGACY_FOCUS_SESSION_HISTORY_STORAGE_KEY,
            LEGACY_FOCUS_SESSIONS_STORAGE_KEY,
          ]
        : []),
    ];
    const [primarySessions, ...migrationSources] = await Promise.all(
      keys.map(loadSessionsForKey)
    );
    const remoteSessions = await loadSupabaseFocusSessions(userId);
    const mergedSessions = mergeFocusSessionHistory([
      ...remoteSessions,
      ...primarySessions,
      ...migrationSources.flat(),
    ]);

    if (mergedSessions.length > primarySessions.length) {
      await saveFocusSessionHistory(mergedSessions, userId);
      console.log(
        'Migrated focus session count:',
        mergedSessions.length - primarySessions.length
      );
    } else if (remoteSessions.length > 0) {
      await AsyncStorage.setItem(
        getFocusSessionHistoryStorageKey(userId),
        JSON.stringify(mergedSessions.slice(0, MAX_FOCUS_SESSION_HISTORY_RECORDS))
      );
    }

    console.log('Loaded focus session count:', mergedSessions.length);
    return mergedSessions;
  } catch (error) {
    console.log('Failed to load focus session history:', error);
    return [];
  }
}

export async function saveFocusSessionHistory(
  sessions: FocusSessionHistoryItem[],
  userId?: string | null
) {
  const nextSessions = mergeFocusSessionHistory(sessions).slice(
    0,
    MAX_FOCUS_SESSION_HISTORY_RECORDS
  );

  await AsyncStorage.setItem(
    getFocusSessionHistoryStorageKey(userId),
    JSON.stringify(nextSessions)
  );

  await syncFocusSessionsToSupabase(nextSessions, userId);

  console.log('Stored focus session count:', nextSessions.length);
  return nextSessions;
}

export async function upsertFocusSessionRecord(
  session: FocusSessionHistoryItem,
  userId?: string | null
) {
  try {
    const normalizedSession = normalizeFocusSessionHistoryItem(session);
    if (!normalizedSession) return await getFocusSessionHistory(userId);

    const currentSessions = await getFocusSessionHistory(userId);
    const withoutExisting = currentSessions.filter(
      (item) => item.id !== normalizedSession.id
    );

    return await saveFocusSessionHistory(
      [normalizedSession, ...withoutExisting],
      userId
    );
  } catch (error) {
    console.log('Failed to upsert focus session history:', error);
    return [];
  }
}

export async function saveFocusSessionRecord(
  session: FocusSessionHistoryItem,
  userId?: string | null
) {
  return upsertFocusSessionRecord(session, userId);
}

export async function appendFocusSessionHistory(
  session: FocusSessionHistoryItem,
  userId?: string | null
) {
  return saveFocusSessionRecord(session, userId);
}

export async function clearFocusSessionHistory(
  userId?: string | null,
  includeAnonymous = false
) {
  const keys = [
    getFocusSessionHistoryStorageKey(userId),
    getLegacyFocusSessionHistoryStorageKey(userId),
    getLegacyFocusSessionsStorageKey(userId),
    ...(includeAnonymous || !userId
      ? [
          ANONYMOUS_FOCUS_SESSION_HISTORY_STORAGE_KEY,
          LEGACY_FOCUS_SESSION_HISTORY_STORAGE_KEY,
          LEGACY_FOCUS_SESSIONS_STORAGE_KEY,
        ]
      : []),
  ];

  await Promise.all(Array.from(new Set(keys)).map((key) => AsyncStorage.removeItem(key)));
}
