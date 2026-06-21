import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  focusmateDarkTheme,
  focusmateLightTheme,
  setCurrentResolvedTheme,
  type FocusMateResolvedTheme,
  type FocusMateTheme,
  type FocusMateThemePreference,
} from './focusmateTheme';

const LOCAL_PREFERENCES_STORAGE_KEY = '@focusmate/settings/preferences';

type FocusMateThemeContextValue = {
  theme: FocusMateTheme;
  preference: FocusMateThemePreference;
  resolvedTheme: FocusMateResolvedTheme;
  isDark: boolean;
  setThemePreference: (preference: FocusMateThemePreference) => Promise<void>;
};

const FocusMateThemeContext =
  createContext<FocusMateThemeContextValue | null>(null);

function sanitizeThemePreference(
  value: unknown
): FocusMateThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system';
}

async function loadStoredThemePreference() {
  try {
    const stored = await AsyncStorage.getItem(LOCAL_PREFERENCES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;

    if (typeof parsed === 'object' && parsed !== null) {
      return sanitizeThemePreference(
        (parsed as Record<string, unknown>).appearance
      );
    }
  } catch (error) {
    console.log('Failed to load FocusMate theme preference:', error);
  }

  return 'system';
}

async function saveStoredThemePreference(
  preference: FocusMateThemePreference
) {
  try {
    const stored = await AsyncStorage.getItem(LOCAL_PREFERENCES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    const nextPreferences =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? { ...parsed, appearance: preference }
        : { appearance: preference };

    await AsyncStorage.setItem(
      LOCAL_PREFERENCES_STORAGE_KEY,
      JSON.stringify(nextPreferences)
    );
  } catch (error) {
    console.log('Failed to save FocusMate theme preference:', error);
  }
}

function resolveThemePreference(
  preference: FocusMateThemePreference,
  systemScheme: ReturnType<typeof useColorScheme>
): FocusMateResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function FocusMateThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] =
    useState<FocusMateThemePreference>('system');

  useEffect(() => {
    let isMounted = true;

    void loadStoredThemePreference().then((storedPreference) => {
      if (isMounted) {
        setPreference(storedPreference);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const resolvedTheme = resolveThemePreference(preference, systemScheme);
  const isDark = resolvedTheme === 'dark';
  const theme = isDark ? focusmateDarkTheme : focusmateLightTheme;

  setCurrentResolvedTheme(resolvedTheme);

  const setThemePreference = useCallback(
    async (nextPreference: FocusMateThemePreference) => {
      setPreference(nextPreference);
      await saveStoredThemePreference(nextPreference);
    },
    []
  );

  const value = useMemo(
    () => ({
      theme,
      preference,
      resolvedTheme,
      isDark,
      setThemePreference,
    }),
    [theme, preference, resolvedTheme, isDark, setThemePreference]
  );

  return (
    <FocusMateThemeContext.Provider value={value}>
      {children}
    </FocusMateThemeContext.Provider>
  );
}

export function useFocusMateTheme() {
  const context = useContext(FocusMateThemeContext);

  if (!context) {
    throw new Error(
      'useFocusMateTheme must be used inside FocusMateThemeProvider'
    );
  }

  return context;
}
