import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import {
  appendFocusSessionHistory,
  clearFocusSessionHistory,
  getFocusSessionHistory,
  type FocusSessionHistoryItem,
} from './focusSessionHistory';
import { AddFocusSessionInput, FocusSession } from '../types/focus';

type FocusContextType = {
  focusSessions: FocusSession[];
  totalFocusMinutes: number;
  addFocusSession: (session: AddFocusSessionInput | number) => Promise<void>;
  clearFocusSessions: () => Promise<void>;
};

const FocusContext = createContext<FocusContextType | undefined>(undefined);

function toIsoDate(value: string | number | null | undefined, fallback: string) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) {
    return new Date(value).toISOString();
  }

  return fallback;
}

function createLegacySession(minutes: number): AddFocusSessionInput {
  const now = new Date().toISOString();

  return {
    durationMinutes: minutes,
    status: 'completed',
    startedAt: now,
    endedAt: now,
    createdAt: now,
    preset: 'Focus',
  };
}

function createHistoryItem(
  input: AddFocusSessionInput | number
): FocusSessionHistoryItem {
  const sessionInput = typeof input === 'number' ? createLegacySession(input) : input;
  const now = new Date().toISOString();
  const endedAt = toIsoDate(sessionInput.endedAt, now);
  const startedAt = toIsoDate(sessionInput.startedAt, endedAt);
  const createdAt = toIsoDate(sessionInput.createdAt, endedAt);
  const status = sessionInput.status ?? 'completed';
  const durationMinutes = Math.max(
    1,
    Math.round(sessionInput.durationMinutes)
  );
  const taskId = sessionInput.taskId?.trim() || undefined;
  const taskTitle = sessionInput.taskTitle?.trim() || null;
  const id =
    sessionInput.id ||
    `${startedAt}:${status}:${durationMinutes}:${taskId || 'no-task'}`;

  return {
    id,
    date: endedAt,
    startedAt,
    endedAt,
    createdAt,
    durationMinutes,
    selectedTaskTitle: taskTitle,
    ...(taskId ? { selectedTaskId: taskId, taskId } : {}),
    taskTitle,
    focusQuality: sessionInput.focusQuality ?? 'clean',
    presetName: sessionInput.preset?.trim() || 'Focus',
    status,
    ...(typeof sessionInput.focusScore === 'number' &&
    Number.isFinite(sessionInput.focusScore)
      ? {
          focusScore: Math.round(
            Math.min(100, Math.max(0, sessionInput.focusScore))
          ),
        }
      : {}),
  };
}

function historyToFocusSessions(history: FocusSessionHistoryItem[]) {
  return history
    .filter(
      (session) => session.status !== 'skipped' && session.durationMinutes > 0
    )
    .map<FocusSession>((session) => ({
      id: session.id,
      minutes: session.durationMinutes,
      completedAt: session.endedAt || session.date,
      startedAt: session.startedAt,
      endedAt: session.endedAt || session.date,
      durationMinutes: session.durationMinutes,
      status: session.status,
      taskId: session.taskId || session.selectedTaskId,
      taskTitle: session.taskTitle || session.selectedTaskTitle,
      preset: session.presetName,
      createdAt: session.createdAt,
    }));
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoadingAuth } = useAuth();
  const userId = user?.id ?? null;
  const loadRequestIdRef = useRef(0);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);

  const loadFocusSessions = useCallback(async () => {
    const loadRequestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = loadRequestId;

    try {
      const history = await getFocusSessionHistory(userId);

      if (loadRequestIdRef.current !== loadRequestId) return;

      setFocusSessions(historyToFocusSessions(history));
    } catch (error) {
      console.log('Failed to load focus sessions:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (isLoadingAuth) return;

    setFocusSessions([]);
    void loadFocusSessions();
  }, [isLoadingAuth, loadFocusSessions]);

  const addFocusSession = useCallback(
    async (input: AddFocusSessionInput | number) => {
      const historyItem = createHistoryItem(input);
      const nextHistory = await appendFocusSessionHistory(historyItem, userId);

      setFocusSessions(historyToFocusSessions(nextHistory));
    },
    [userId]
  );

  const clearFocusSessions = useCallback(async () => {
    setFocusSessions([]);
    await clearFocusSessionHistory(userId, true);
  }, [userId]);

  const totalFocusMinutes = useMemo(() => {
    return focusSessions.reduce((total, session) => total + session.minutes, 0);
  }, [focusSessions]);

  return (
    <FocusContext.Provider
      value={{
        focusSessions,
        totalFocusMinutes,
        addFocusSession,
        clearFocusSessions,
      }}
    >
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus() {
  const context = useContext(FocusContext);

  if (!context) {
    throw new Error('useFocus must be used inside FocusProvider');
  }

  return context;
}
