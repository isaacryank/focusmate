import AsyncStorage from '@react-native-async-storage/async-storage';

export type FocusSessionStatus = 'completed' | 'stopped' | 'skipped';
export type FocusSessionQuality = 'clean' | 'distracted';

export type FocusSessionHistoryItem = {
  id: string;
  date: string;
  durationMinutes: number;
  selectedTaskTitle: string | null;
  selectedTaskId?: string;
  focusQuality: FocusSessionQuality;
  presetName: string;
  status: FocusSessionStatus;
  focusScore?: number;
};

const FOCUS_SESSION_HISTORY_STORAGE_KEY = '@focusmate/focus_session_history';
const MAX_FOCUS_SESSION_HISTORY_ITEMS = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFocusSessionStatus(value: unknown): value is FocusSessionStatus {
  return value === 'completed' || value === 'stopped' || value === 'skipped';
}

function isFocusSessionQuality(value: unknown): value is FocusSessionQuality {
  return value === 'clean' || value === 'distracted';
}

function getCleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeFocusSessionHistoryItem(
  value: unknown
): FocusSessionHistoryItem | null {
  if (!isRecord(value)) return null;

  const id = getCleanString(value.id);
  const date = getCleanString(value.date);
  const presetName = getCleanString(value.presetName) || 'Focus';
  const durationMinutes =
    typeof value.durationMinutes === 'number' &&
    Number.isFinite(value.durationMinutes)
      ? Math.max(0, Math.round(value.durationMinutes))
      : 0;
  const selectedTaskTitle = getCleanString(value.selectedTaskTitle) || null;
  const selectedTaskId = getCleanString(value.selectedTaskId);
  const focusScore =
    typeof value.focusScore === 'number' && Number.isFinite(value.focusScore)
      ? Math.round(Math.min(100, Math.max(0, value.focusScore)))
      : undefined;

  if (!id || !date || Number.isNaN(new Date(date).getTime())) {
    return null;
  }

  if (!isFocusSessionStatus(value.status)) return null;
  if (!isFocusSessionQuality(value.focusQuality)) return null;

  return {
    id,
    date,
    durationMinutes,
    selectedTaskTitle,
    ...(selectedTaskId ? { selectedTaskId } : {}),
    focusQuality: value.focusQuality,
    presetName,
    status: value.status,
    ...(focusScore !== undefined ? { focusScore } : {}),
  };
}

function sortFocusSessionHistory(
  sessions: FocusSessionHistoryItem[]
): FocusSessionHistoryItem[] {
  return [...sessions].sort(
    (first, second) =>
      new Date(second.date).getTime() - new Date(first.date).getTime()
  );
}

export async function getFocusSessionHistory() {
  try {
    const storedHistory = await AsyncStorage.getItem(
      FOCUS_SESSION_HISTORY_STORAGE_KEY
    );

    if (!storedHistory) return [];

    const parsed = JSON.parse(storedHistory);

    if (!Array.isArray(parsed)) return [];

    return sortFocusSessionHistory(
      parsed
        .map(normalizeFocusSessionHistoryItem)
        .filter((item): item is FocusSessionHistoryItem => Boolean(item))
    );
  } catch (error) {
    console.log('Failed to load focus session history:', error);
    return [];
  }
}

export async function saveFocusSessionHistory(
  sessions: FocusSessionHistoryItem[]
) {
  const nextSessions = sortFocusSessionHistory(sessions).slice(
    0,
    MAX_FOCUS_SESSION_HISTORY_ITEMS
  );

  await AsyncStorage.setItem(
    FOCUS_SESSION_HISTORY_STORAGE_KEY,
    JSON.stringify(nextSessions)
  );

  return nextSessions;
}

export async function appendFocusSessionHistory(
  session: FocusSessionHistoryItem
) {
  try {
    const currentSessions = await getFocusSessionHistory();

    if (currentSessions.some((item) => item.id === session.id)) {
      return currentSessions;
    }

    return await saveFocusSessionHistory([session, ...currentSessions]);
  } catch (error) {
    console.log('Failed to save focus session history:', error);
    return [];
  }
}
