import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { FocusSession } from '../types/focus';

const FOCUS_STORAGE_KEY = '@focusmate/focus_sessions';

type FocusContextType = {
  focusSessions: FocusSession[];
  totalFocusMinutes: number;
  addFocusSession: (minutes: number) => Promise<void>;
  clearFocusSessions: () => Promise<void>;
};

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);

  useEffect(() => {
    loadFocusSessions();
  }, []);

  const loadFocusSessions = async () => {
    try {
      const storedSessions = await AsyncStorage.getItem(FOCUS_STORAGE_KEY);

      if (storedSessions) {
        setFocusSessions(JSON.parse(storedSessions));
      }
    } catch (error) {
      console.log('Failed to load focus sessions:', error);
    }
  };

  const saveFocusSessions = async (nextSessions: FocusSession[]) => {
    try {
      await AsyncStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(nextSessions));
    } catch (error) {
      console.log('Failed to save focus sessions:', error);
    }
  };

  const addFocusSession = async (minutes: number) => {
    const newSession: FocusSession = {
      id: Date.now().toString(),
      minutes,
      completedAt: new Date().toISOString(),
    };

    setFocusSessions((current) => {
      const nextSessions = [newSession, ...current];
      saveFocusSessions(nextSessions);
      return nextSessions;
    });
  };

  const clearFocusSessions = async () => {
    setFocusSessions([]);
    await AsyncStorage.removeItem(FOCUS_STORAGE_KEY);
  };

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