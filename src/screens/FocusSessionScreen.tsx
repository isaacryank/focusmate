import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  AppState,
  Animated,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';
import {
  appendFocusSessionHistory,
  type FocusSessionHistoryItem,
  type FocusSessionStatus,
} from '../lib/focusSessionHistory';
import {
  cancelFocusTimerCompletionNotification,
  scheduleFocusTimerCompletionNotification,
  startFocusAlertLoop,
  stopFocusAlertLoop,
  type FocusAlertType,
} from '../lib/focusAlertUtils';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';
import { getTopMiloRecommendedTask } from '../lib/miloSituationIntelligence';
import { type Task } from '../types/task';

const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 120;
const MIN_LONG_BREAK_INTERVAL = 2;
const MAX_LONG_BREAK_INTERVAL = 12;
const DISTRACTION_THRESHOLD_MS = 15 * 1000;
const MAX_LOGGED_FOCUS_KEYS = 20;
const POMODORO_SESSION_STORAGE_KEY = '@focusmate/pomodoro_session_state';
const POMODORO_LOGGED_FOCUS_STORAGE_KEY = '@focusmate/pomodoro_logged_focus_keys';
const SAVED_POMODORO_PRESETS_STORAGE_KEY = '@focusmate/saved_pomodoro_presets';

const MODE_META = {
  focus: {
    label: 'Focus',
    title: 'Focus block',
    runningTitle: 'Focusing now',
    readyTitle: 'Ready to focus',
    accentColor: theme.colors.primary,
    softColor: theme.colors.primarySoft,
    startSpeech: 'Focus mode started. Choose one task and stay with it.',
  },
  shortBreak: {
    label: 'Short Break',
    title: 'Short break',
    runningTitle: 'Breathing break',
    readyTitle: 'Ready to rest',
    accentColor: theme.colors.blue,
    softColor: theme.colors.blueSoft,
    startSpeech: 'Short break started. Take a gentle reset.',
  },
  longBreak: {
    label: 'Long Break',
    title: 'Long break',
    runningTitle: 'Deep reset',
    readyTitle: 'Long break ready',
    accentColor: theme.colors.purple,
    softColor: theme.colors.purpleSoft,
    startSpeech: 'Long break started. Milo says you earned this rest.',
  },
} as const;

type PomodoroMode = keyof typeof MODE_META;

type BuiltInPomodoroPresetId = 'classic' | 'quick' | 'deep' | 'custom';
type PomodoroPresetId = BuiltInPomodoroPresetId | `saved:${string}`;

type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
};

type CustomTimerField = keyof PomodoroSettings;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type SavedPomodoroPreset = {
  id: string;
  name: string;
  settings: PomodoroSettings;
  createdAt: number;
};

type PresetVisualMeta = {
  icon: IoniconName;
  color: string;
  softColor: string;
};

type PomodoroPresetOption = {
  id: PomodoroPresetId;
  label: string;
  summary: string;
  helperText: string;
  settings: PomodoroSettings;
  visual: PresetVisualMeta;
  isCustom?: boolean;
  isSaved?: boolean;
};

type PersistedPomodoroSession = {
  version: 1;
  selectedPreset: PomodoroPresetId;
  customSettings: PomodoroSettings;
  currentMode: PomodoroMode;
  isRunning: boolean;
  endTimestamp: number | null;
  startedAt: number | null;
  completedFocusCount: number;
  cycleProgressCount: number;
  remainingMs: number;
  wasDistracted: boolean;
  focusLeftAt: number | null;
  loggedFocusSessionKey: string | null;
  selectedFocusTaskId: string | null;
  selectedFocusTaskTitle: string | null;
  focusWithoutTaskSelected: boolean;
  sessionBlocks: PomodoroSessionBlockSummary[];
  savedAt: number;
};

type CompleteModeOptions = {
  mode?: PomodoroMode;
  settings?: PomodoroSettings;
  completedFocusCount?: number;
  cycleFocusCount?: number;
  startedAt?: number | null;
  playFeedback?: boolean;
};

type PomodoroSessionBlockSummary = {
  id: string;
  status: FocusSessionStatus;
  durationMinutes: number;
  taskTitle: string | null;
  wasDistracted: boolean;
  presetName: string;
  completedAt: string;
};

type FocusBlockCompletionSummary = {
  durationMinutes: number;
  taskTitle: string | null;
  wasDistracted: boolean;
  nextBreakMode: Exclude<PomodoroMode, 'focus'>;
};

type BreakCompletionSummary = {
  breakMode: Exclude<PomodoroMode, 'focus'>;
};

type FocusSessionSummary = {
  totalFocusMinutes: number;
  completedBlocks: number;
  interruptedBlocks: number;
  taskTitle: string | null;
  wasDistracted: boolean;
  presetName: string;
  miloMessage: string;
};

const CLASSIC_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
};

const CUSTOM_TIMER_FIELD_ORDER: CustomTimerField[] = [
  'focusMinutes',
  'shortBreakMinutes',
  'longBreakMinutes',
  'longBreakInterval',
];

const CUSTOM_TIMER_FIELD_META: Record<
  CustomTimerField,
  {
    label: string;
    unit: string;
    min: number;
    max: number;
  }
> = {
  focusMinutes: {
    label: 'Focus',
    unit: 'min',
    min: MIN_DURATION_MINUTES,
    max: MAX_DURATION_MINUTES,
  },
  shortBreakMinutes: {
    label: 'Short break',
    unit: 'min',
    min: MIN_DURATION_MINUTES,
    max: MAX_DURATION_MINUTES,
  },
  longBreakMinutes: {
    label: 'Long break',
    unit: 'min',
    min: MIN_DURATION_MINUTES,
    max: MAX_DURATION_MINUTES,
  },
  longBreakInterval: {
    label: 'Long break every',
    unit: 'blocks',
    min: MIN_LONG_BREAK_INTERVAL,
    max: MAX_LONG_BREAK_INTERVAL,
  },
};

const POMODORO_PRESETS: Record<
  BuiltInPomodoroPresetId,
  {
    label: string;
    summary: string;
    helperText: string;
    settings: PomodoroSettings;
  }
> = {
  classic: {
    label: 'Classic',
    summary: '25 / 5 / 15',
    helperText:
      'The original Milo rhythm: 25 minutes of focus, short resets, and a long break after 4 focus blocks.',
    settings: CLASSIC_SETTINGS,
  },
  quick: {
    label: 'Quick Focus',
    summary: '15 / 5 / 10',
    helperText:
      'Best for smaller tasks or low-energy days: short focus blocks with gentle breaks.',
    settings: {
      focusMinutes: 15,
      shortBreakMinutes: 5,
      longBreakMinutes: 10,
      longBreakInterval: 4,
    },
  },
  deep: {
    label: 'Deep Focus',
    summary: '50 / 10 / 20',
    helperText:
      'A longer rhythm for heavier study or build sessions, with more recovery between blocks.',
    settings: {
      focusMinutes: 50,
      shortBreakMinutes: 10,
      longBreakMinutes: 20,
      longBreakInterval: 4,
    },
  },
  custom: {
    label: 'Custom',
    summary: 'Your rhythm',
    helperText:
      'Tune each timer length to fit your current work session while Milo keeps the cycle balanced.',
    settings: CLASSIC_SETTINGS,
  },
};

const pomodoroModeOrder: PomodoroMode[] = ['focus', 'shortBreak', 'longBreak'];
const builtInPomodoroPresetOrder: BuiltInPomodoroPresetId[] = [
  'classic',
  'quick',
  'deep',
  'custom',
];

const PRESET_VISUAL_META: Record<
  BuiltInPomodoroPresetId,
  PresetVisualMeta
> = {
  classic: {
    icon: 'timer-outline',
    color: theme.colors.primaryDark,
    softColor: theme.colors.primarySoft,
  },
  quick: {
    icon: 'flash-outline',
    color: theme.colors.blue,
    softColor: theme.colors.blueSoft,
  },
  deep: {
    icon: 'leaf-outline',
    color: theme.colors.primaryDark,
    softColor: theme.colors.primarySoft,
  },
  custom: {
    icon: 'star-outline',
    color: theme.colors.yellow,
    softColor: theme.colors.yellowSoft,
  },
};

const SAVED_PRESET_VISUAL_META: PresetVisualMeta = {
  icon: 'rocket-outline',
  color: theme.colors.primaryDark,
  softColor: theme.colors.primarySoft,
};

function getRuntimePresetVisual(
  presetId: PomodoroPresetId,
  fallbackVisual: PresetVisualMeta
): PresetVisualMeta {
  if (presetId === 'quick') {
    return {
      ...fallbackVisual,
      color: theme.colors.blue,
      softColor: theme.colors.blueSoft,
    };
  }

  if (presetId === 'custom') {
    return {
      ...fallbackVisual,
      color: theme.colors.warning,
      softColor: theme.colors.warningSoft,
    };
  }

  return {
    ...fallbackVisual,
    color: theme.colors.primaryDark,
    softColor: theme.colors.primarySoft,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getFiniteNumber(value: unknown, fallback: number) {
  return isFiniteNumber(value) ? value : fallback;
}

function getTimestampOrNull(value: unknown) {
  return isFiniteNumber(value) && value > 0 ? value : null;
}

function isBuiltInPomodoroPresetId(
  value: unknown
): value is BuiltInPomodoroPresetId {
  return (
    typeof value === 'string' &&
    builtInPomodoroPresetOrder.includes(value as BuiltInPomodoroPresetId)
  );
}

function isPomodoroPresetId(value: unknown): value is PomodoroPresetId {
  return (
    isBuiltInPomodoroPresetId(value) ||
    (typeof value === 'string' && value.startsWith('saved:') && value.length > 6)
  );
}

function isPomodoroMode(value: unknown): value is PomodoroMode {
  return (
    typeof value === 'string' &&
    pomodoroModeOrder.includes(value as PomodoroMode)
  );
}

function sanitizePomodoroSettings(value: unknown): PomodoroSettings {
  const source = isRecord(value) ? value : {};

  return {
    focusMinutes: Math.round(
      clampNumber(
        getFiniteNumber(source.focusMinutes, CLASSIC_SETTINGS.focusMinutes),
        MIN_DURATION_MINUTES,
        MAX_DURATION_MINUTES
      )
    ),
    shortBreakMinutes: Math.round(
      clampNumber(
        getFiniteNumber(
          source.shortBreakMinutes,
          CLASSIC_SETTINGS.shortBreakMinutes
        ),
        MIN_DURATION_MINUTES,
        MAX_DURATION_MINUTES
      )
    ),
    longBreakMinutes: Math.round(
      clampNumber(
        getFiniteNumber(source.longBreakMinutes, CLASSIC_SETTINGS.longBreakMinutes),
        MIN_DURATION_MINUTES,
        MAX_DURATION_MINUTES
      )
    ),
    longBreakInterval: Math.round(
      clampNumber(
        getFiniteNumber(
          source.longBreakInterval,
          CLASSIC_SETTINGS.longBreakInterval
        ),
        MIN_LONG_BREAK_INTERVAL,
        MAX_LONG_BREAK_INTERVAL
      )
    ),
  };
}

function sanitizeSavedPreset(value: unknown): SavedPomodoroPreset | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';

  if (!id || !name) return null;

  return {
    id,
    name,
    settings: sanitizePomodoroSettings(value.settings),
    createdAt: getFiniteNumber(value.createdAt, Date.now()),
  };
}

function parseSavedPomodoroPresets(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(sanitizeSavedPreset)
      .filter((preset): preset is SavedPomodoroPreset => Boolean(preset));
  } catch (error) {
    console.log('Failed to parse saved Pomodoro presets:', error);
    return [];
  }
}

function createSavedPresetId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSavedPresetStorageId(presetId: PomodoroPresetId) {
  return presetId.startsWith('saved:') ? presetId.slice(6) : null;
}

function getSavedPresetByPresetId(
  presetId: PomodoroPresetId,
  savedPresets: SavedPomodoroPreset[]
) {
  const savedPresetId = getSavedPresetStorageId(presetId);
  if (!savedPresetId) return undefined;

  return savedPresets.find((preset) => preset.id === savedPresetId);
}

function createPresetOptions(
  customSettings: PomodoroSettings,
  savedPresets: SavedPomodoroPreset[]
): PomodoroPresetOption[] {
  const builtinOptions: PomodoroPresetOption[] = builtInPomodoroPresetOrder
    .filter((presetId) => presetId !== 'custom')
    .map((presetId) => ({
      id: presetId,
      label: POMODORO_PRESETS[presetId].label,
      summary: POMODORO_PRESETS[presetId].summary,
      helperText: POMODORO_PRESETS[presetId].helperText,
      settings: POMODORO_PRESETS[presetId].settings,
      visual: PRESET_VISUAL_META[presetId],
    }));

  const savedOptions: PomodoroPresetOption[] = savedPresets.map((preset) => ({
    id: `saved:${preset.id}` as const,
    label: preset.name,
    summary: `${preset.settings.focusMinutes} / ${preset.settings.shortBreakMinutes} / ${preset.settings.longBreakMinutes}`,
    helperText: 'A saved Milo rhythm for focused work.',
    settings: preset.settings,
    visual: SAVED_PRESET_VISUAL_META,
    isSaved: true,
  }));

  return [
    ...builtinOptions,
    ...savedOptions,
    {
      id: 'custom',
      label: POMODORO_PRESETS.custom.label,
      summary: POMODORO_PRESETS.custom.summary,
      helperText: POMODORO_PRESETS.custom.helperText,
      settings: customSettings,
      visual: PRESET_VISUAL_META.custom,
      isCustom: true,
    },
  ];
}

function resolvePresetOption(
  presetId: PomodoroPresetId,
  customSettings: PomodoroSettings,
  savedPresets: SavedPomodoroPreset[]
) {
  const presetOptions = createPresetOptions(customSettings, savedPresets);

  return (
    presetOptions.find((presetOption) => presetOption.id === presetId) ??
    {
      id: 'classic',
      label: POMODORO_PRESETS.classic.label,
      summary: POMODORO_PRESETS.classic.summary,
      helperText: POMODORO_PRESETS.classic.helperText,
      settings: POMODORO_PRESETS.classic.settings,
      visual: PRESET_VISUAL_META.classic,
    }
  );
}

function createCustomTimerDraftTexts(
  settings: PomodoroSettings
): Record<CustomTimerField, string> {
  return {
    focusMinutes: String(settings.focusMinutes),
    shortBreakMinutes: String(settings.shortBreakMinutes),
    longBreakMinutes: String(settings.longBreakMinutes),
    longBreakInterval: String(settings.longBreakInterval),
  };
}

function sanitizeNumberInputText(value: string) {
  return value.replace(/[^0-9]/g, '');
}

function parseCustomTimerDraftValue(
  field: CustomTimerField,
  value: string,
  fallback: number
) {
  const meta = CUSTOM_TIMER_FIELD_META[field];
  const parsedValue = Number(value);
  const nextValue = Number.isFinite(parsedValue) ? parsedValue : fallback;

  return Math.round(clampNumber(nextValue, meta.min, meta.max));
}

function getPresetDisplayName(
  presetId: PomodoroPresetId,
  savedPresets: SavedPomodoroPreset[] = []
) {
  if (presetId === 'classic') return 'Classic Pomodoro';
  if (presetId === 'quick') return 'Quick Focus';
  if (presetId === 'deep') return 'Deep Focus';
  const savedPreset = getSavedPresetByPresetId(presetId, savedPresets);
  if (savedPreset) return savedPreset.name;
  return 'Custom Rhythm';
}

function getModeMinutes(mode: PomodoroMode, settings: PomodoroSettings) {
  if (mode === 'focus') return settings.focusMinutes;
  if (mode === 'shortBreak') return settings.shortBreakMinutes;
  return settings.longBreakMinutes;
}

function getModeSeconds(mode: PomodoroMode, settings: PomodoroSettings) {
  return getModeMinutes(mode, settings) * 60;
}

function getElapsedFocusDurationMinutes(
  settings: PomodoroSettings,
  remainingMs: number
) {
  const totalMs = getModeSeconds('focus', settings) * 1000;
  const elapsedMs = totalMs - clampNumber(remainingMs, 0, totalMs);

  return Math.min(settings.focusMinutes, Math.max(0, Math.ceil(elapsedMs / 60000)));
}

function deriveFocusScore({
  durationMinutes,
  focusMinutes,
  status,
  wasDistracted,
}: {
  durationMinutes: number;
  focusMinutes: number;
  status: FocusSessionStatus;
  wasDistracted: boolean;
}) {
  const durationRatio =
    focusMinutes > 0 ? clampNumber(durationMinutes / focusMinutes, 0, 1) : 0;

  if (status === 'completed') {
    return wasDistracted ? 78 : 96;
  }

  const baseScore = status === 'stopped' ? 42 : 34;
  const progressScore = Math.round(durationRatio * (wasDistracted ? 28 : 42));
  const distractionPenalty = wasDistracted ? 8 : 0;

  return Math.round(
    clampNumber(baseScore + progressScore - distractionPenalty, 0, 100)
  );
}

function getSuggestedBreakMode(
  completedFocusCount: number,
  longBreakInterval: number
): PomodoroMode {
  return completedFocusCount > 0 && completedFocusCount % longBreakInterval === 0
    ? 'longBreak'
    : 'shortBreak';
}

function getFocusAlertTypeForMode(mode: PomodoroMode): FocusAlertType {
  if (mode === 'focus') return 'focusComplete';
  if (mode === 'longBreak') return 'longBreakComplete';

  return 'shortBreakComplete';
}

function getCurrentCycleBlock(
  mode: PomodoroMode,
  cycleFocusCount: number,
  longBreakInterval: number
) {
  const safeCycleFocusCount = Math.round(
    clampNumber(cycleFocusCount, 0, longBreakInterval)
  );

  if (mode === 'focus') {
    return Math.round(clampNumber(safeCycleFocusCount + 1, 1, longBreakInterval));
  }

  return Math.round(clampNumber(safeCycleFocusCount, 1, longBreakInterval));
}

function getNextSessionType(
  mode: PomodoroMode,
  cycleFocusCount: number,
  longBreakInterval: number
): { nextMode: PomodoroMode; nextCycleFocusCount: number } {
  const safeCycleFocusCount = Math.round(
    clampNumber(cycleFocusCount, 0, longBreakInterval)
  );

  if (mode === 'focus') {
    const nextCycleFocusCount = Math.min(
      safeCycleFocusCount + 1,
      longBreakInterval
    );

    return {
      nextMode:
        nextCycleFocusCount >= longBreakInterval ? 'longBreak' : 'shortBreak',
      nextCycleFocusCount,
    };
  }

  if (mode === 'longBreak') {
    return { nextMode: 'focus', nextCycleFocusCount: 0 };
  }

  return { nextMode: 'focus', nextCycleFocusCount: safeCycleFocusCount };
}

function getDateKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTodayDate() {
  return getDateKeyFromTimestamp(Date.now());
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`;
}

function formatAwayMinutes(awayMs: number) {
  const minutes = Math.max(1, Math.round(awayMs / 60000));

  return `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
}

function parseLoggedFocusKeys(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch (error) {
    console.log('Failed to parse logged focus keys:', error);
    return [];
  }
}

function formatTitleCase(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function parseTaskDueTimeMinutes(dueTime?: string) {
  const trimmedTime = dueTime?.trim();
  if (!trimmedTime) return 23 * 60 + 59;

  const match = trimmedTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return 23 * 60 + 59;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const meridiem = match[3]?.toUpperCase();

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 23 * 60 + 59;
  }

  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return 23 * 60 + 59;
  }

  return hours * 60 + minutes;
}

function getTaskDueSortTime(task: Task) {
  if (!task.dueDate) return Number.MAX_SAFE_INTEGER;

  const dateParts = task.dueDate.split('-').map((part) => Number(part));
  if (
    dateParts.length !== 3 ||
    dateParts.some((part) => !Number.isFinite(part))
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  const [year, month, day] = dateParts;
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return Number.MAX_SAFE_INTEGER;

  return date.getTime() + parseTaskDueTimeMinutes(task.dueTime) * 60 * 1000;
}

function getFocusTaskPickerRank(task: Task, nowMs: number, todayDate: string) {
  const dueSortTime = getTaskDueSortTime(task);
  let rank = 0;

  if (dueSortTime < nowMs) rank -= 5000;
  if (task.dueDate === todayDate) rank -= 3200;
  if (dueSortTime >= nowMs && dueSortTime - nowMs <= 2 * 60 * 60 * 1000) {
    rank -= 2600;
  }
  if (task.priority === 'high') rank -= 1800;
  if (task.priority === 'medium') rank -= 700;
  if (task.plannerType === 'meeting') rank -= 450;
  if (task.plannerType === 'date') rank -= 250;

  return rank;
}

function getFocusTaskMetaText(task: Task) {
  const typeText = formatTitleCase(task.plannerType);
  const priorityText = `${formatTitleCase(task.priority)} priority`;
  const dueText = [task.dueDate, task.dueTime].filter(Boolean).join(' ');

  return dueText
    ? `${typeText} - ${priorityText} - ${dueText}`
    : `${typeText} - ${priorityText}`;
}

function sanitizeSessionBlockSummary(
  value: unknown
): PomodoroSessionBlockSummary | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const status = value.status;
  const completedAt =
    typeof value.completedAt === 'string' ? value.completedAt.trim() : '';
  const durationMinutes = getFiniteNumber(value.durationMinutes, 0);
  const taskTitle =
    typeof value.taskTitle === 'string' && value.taskTitle.trim()
      ? value.taskTitle.trim()
      : null;
  const presetName =
    typeof value.presetName === 'string' && value.presetName.trim()
      ? value.presetName.trim()
      : 'Focus';

  if (!id || Number.isNaN(new Date(completedAt).getTime())) return null;
  if (status !== 'completed' && status !== 'stopped' && status !== 'skipped') {
    return null;
  }

  return {
    id,
    status,
    durationMinutes: Math.max(0, Math.round(durationMinutes)),
    taskTitle,
    wasDistracted: Boolean(value.wasDistracted),
    presetName,
    completedAt,
  };
}

function sanitizeSessionBlockSummaries(
  value: unknown
): PomodoroSessionBlockSummary[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(sanitizeSessionBlockSummary)
    .filter((block): block is PomodoroSessionBlockSummary => Boolean(block));
}

function getSessionTaskSummary(
  blocks: PomodoroSessionBlockSummary[],
  fallbackTaskTitle: string | null
) {
  const taskTitles = Array.from(
    new Set(
      blocks
        .map((block) => block.taskTitle)
        .filter((taskTitle): taskTitle is string => Boolean(taskTitle))
    )
  );

  if (taskTitles.length === 1) return taskTitles[0] ?? null;
  if (taskTitles.length > 1) return 'Multiple tasks';

  return fallbackTaskTitle;
}

function createFocusSessionSummary({
  blocks,
  fallbackTaskTitle,
  presetName,
}: {
  blocks: PomodoroSessionBlockSummary[];
  fallbackTaskTitle: string | null;
  presetName: string;
}): FocusSessionSummary {
  const completedBlocks = blocks.filter(
    (block) => block.status === 'completed'
  ).length;
  const interruptedBlocks = blocks.filter(
    (block) => block.status !== 'completed'
  ).length;
  const totalFocusMinutes = blocks.reduce(
    (total, block) => total + block.durationMinutes,
    0
  );
  const wasDistracted = blocks.some((block) => block.wasDistracted);
  const taskTitle = getSessionTaskSummary(blocks, fallbackTaskTitle);
  const miloMessage =
    completedBlocks > 0
      ? 'Great work. Milo saved your focus blocks and your progress is safe.'
      : 'It is okay to stop here. Milo can help you restart with a smaller block next time.';

  return {
    totalFocusMinutes,
    completedBlocks,
    interruptedBlocks,
    taskTitle,
    wasDistracted,
    presetName,
    miloMessage,
  };
}

function ModeButton({
  mode,
  settings,
  selected,
  onPress,
}: {
  mode: PomodoroMode;
  settings: PomodoroSettings;
  selected: boolean;
  onPress: () => void;
}) {
  const modeConfig = MODE_META[mode];
  const modeMinutes = getModeMinutes(mode, settings);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.modeButton,
        selected && {
          backgroundColor: modeConfig.accentColor,
          borderColor: modeConfig.accentColor,
        },
      ]}
    >
      <Text style={[styles.modeLabel, selected && styles.modeLabelActive]}>
        {modeConfig.label}
      </Text>
      <Text style={[styles.modeMinutes, selected && styles.modeMinutesActive]}>
        {modeMinutes} min
      </Text>
    </TouchableOpacity>
  );
}

function PresetButton({
  preset,
  selected,
  onPress,
}: {
  preset: PomodoroPresetOption;
  selected: boolean;
  onPress: () => void;
}) {
  const runtimeVisual = getRuntimePresetVisual(preset.id, preset.visual);
  const selectedProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(selectedProgress, {
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  }, [selected, selectedProgress]);

  const animatedStyle = {
    transform: [
      {
        translateY: selectedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6],
        }),
      },
      {
        scale: selectedProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.04],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.presetChoiceAnimated, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.presetChoiceCard, selected && styles.presetChoiceCardActive]}
      >
        {selected ? (
          <View style={styles.presetCheckBadge}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
        ) : null}

        <View
          style={[
            styles.presetIconBubble,
            { backgroundColor: runtimeVisual.softColor },
          ]}
        >
          <Ionicons
            name={runtimeVisual.icon}
            size={24}
            color={runtimeVisual.color}
          />
        </View>

        <Text style={styles.presetChoiceLabel} numberOfLines={2}>
          {preset.label}
        </Text>

        <Text style={styles.presetChoiceSummary} numberOfLines={1}>
          {preset.summary}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function FocusSessionScreen() {
  const { isDark } = useFocusMateTheme();

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { tasks } = useTasks();
  const { focusSessions, addFocusSession, totalFocusMinutes } = useFocus();

  const [selectedPreset, setSelectedPreset] =
    useState<PomodoroPresetId>('classic');
  const [customSettings, setCustomSettings] =
    useState<PomodoroSettings>(CLASSIC_SETTINGS);
  const [currentMode, setCurrentMode] = useState<PomodoroMode>('focus');
  const [remainingSeconds, setRemainingSeconds] = useState(
    getModeSeconds('focus', CLASSIC_SETTINGS)
  );
  const [isRunning, setIsRunning] = useState(false);
  const [pomodoroCompletedFocusCount, setPomodoroCompletedFocusCount] =
    useState(0);
  const [cycleFocusCount, setCycleFocusCount] = useState(0);
  const [taskPickerVisible, setTaskPickerVisible] = useState(false);
  const [dndReminderVisible, setDndReminderVisible] = useState(false);
  const [focusWarningText, setFocusWarningText] = useState<string | null>(null);
  const [wasDistracted, setWasDistracted] = useState(false);
  const [selectedFocusTaskId, setSelectedFocusTaskId] = useState<string | null>(
    null
  );
  const [selectedFocusTaskTitle, setSelectedFocusTaskTitle] = useState<
    string | null
  >(null);
  const [focusWithoutTaskSelected, setFocusWithoutTaskSelected] =
    useState(false);
  const [focusSummary, setFocusSummary] = useState<FocusSessionSummary | null>(
    null
  );
  const [focusBlockCompletion, setFocusBlockCompletion] =
    useState<FocusBlockCompletionSummary | null>(null);
  const [breakCompletion, setBreakCompletion] =
    useState<BreakCompletionSummary | null>(null);
  const [, setSessionBlocks] = useState<
    PomodoroSessionBlockSummary[]
  >([]);
  const [hasRestoredPomodoroState, setHasRestoredPomodoroState] =
    useState(false);
  const [focusBlockVisible, setFocusBlockVisible] = useState(false);
  const [customEditorVisible, setCustomEditorVisible] = useState(false);
  const [customDraftTexts, setCustomDraftTexts] = useState<
    Record<CustomTimerField, string>
  >(() => createCustomTimerDraftTexts(CLASSIC_SETTINGS));
  const [savedPresets, setSavedPresets] = useState<SavedPomodoroPreset[]>([]);
  const [presetManagerVisible, setPresetManagerVisible] = useState(false);
  const [presetDraftName, setPresetDraftName] = useState('');
  const [presetDraftTexts, setPresetDraftTexts] = useState<
    Record<CustomTimerField, string>
  >(() => createCustomTimerDraftTexts(CLASSIC_SETTINGS));

  const selectedPresetRef = useRef<PomodoroPresetId>('classic');
  const customSettingsRef = useRef<PomodoroSettings>(CLASSIC_SETTINGS);
  const currentModeRef = useRef<PomodoroMode>('focus');
  const isRunningRef = useRef(false);
  const timerSettingsRef = useRef<PomodoroSettings>(CLASSIC_SETTINGS);
  const endTimestampRef = useRef<number | null>(null);
  const remainingMsRef = useRef(getModeSeconds('focus', CLASSIC_SETTINGS) * 1000);
  const startedAtRef = useRef<number | null>(null);
  const focusLeftAtRef = useRef<number | null>(null);
  const loggedFocusSessionKeyRef = useRef<string | null>(null);
  const selectedFocusTaskIdRef = useRef<string | null>(null);
  const selectedFocusTaskTitleRef = useRef<string | null>(null);
  const focusWithoutTaskSelectedRef = useRef(false);
  const pomodoroCompletedFocusCountRef = useRef(0);
  const cycleFocusCountRef = useRef(0);
  const wasDistractedRef = useRef(false);
  const sessionBlocksRef = useRef<PomodoroSessionBlockSummary[]>([]);
  const recordedFocusHistoryKeysRef = useRef<Set<string>>(new Set());
  const timerCompletionNotificationIdRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const completionHandledRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const presetOptions = useMemo(
    () => createPresetOptions(customSettings, savedPresets),
    [customSettings, savedPresets]
  );
  const activePreset =
    presetOptions.find((presetOption) => presetOption.id === selectedPreset) ??
    resolvePresetOption('classic', customSettings, savedPresets);
  const activePresetVisual = getRuntimePresetVisual(
    activePreset.id,
    activePreset.visual
  );
  const timerSettings = activePreset.settings;
  const focusHeroGradientColors = isDark
    ? (['#12362E', '#111B21'] as const)
    : (['#F8FFF9', '#E9F9ED'] as const);
  const currentModeConfig = MODE_META[currentMode];
  const totalSeconds = getModeSeconds(currentMode, timerSettings);
  const todayDate = getTodayDate();
  const compactFocusBlock = windowHeight < 720 || windowWidth < 360;

  const todayFocusSessions = useMemo(() => {
    return focusSessions.filter(
      (session) => session.completedAt.slice(0, 10) === todayDate
    );
  }, [focusSessions, todayDate]);

  const todayFocusMinutes = useMemo(() => {
    return todayFocusSessions.reduce((total, session) => total + session.minutes, 0);
  }, [todayFocusSessions]);
  const todayCompletedFocusCount = todayFocusSessions.length;
  const completedFocusCount = Math.max(
    todayCompletedFocusCount,
    pomodoroCompletedFocusCount
  );
  const longBreakInterval = timerSettings.longBreakInterval;
  const cycleProgressCount = Math.round(
    clampNumber(cycleFocusCount, 0, longBreakInterval)
  );
  const nextBreakAfterFocusMode = getSuggestedBreakMode(
    cycleProgressCount + 1,
    longBreakInterval
  );
  const isLongBreakReady = cycleProgressCount >= longBreakInterval;
  const cycleSuggestionText =
    currentMode === 'focus'
      ? isLongBreakReady
        ? 'Suggested: Long Break'
        : cycleProgressCount === 0 && !isRunning
        ? 'Suggested: Start Focus'
        : `Next: ${MODE_META[nextBreakAfterFocusMode].label}`
      : currentMode === 'longBreak' && isLongBreakReady
      ? 'Suggested: Long Break'
      : `Current: ${currentModeConfig.label}`;
  const selectedPresetDisplayName = getPresetDisplayName(
    selectedPreset,
    savedPresets
  );
  const presetDetailValueItems: Array<{
    icon: MaterialIconName;
    label: string;
    value: string;
  }> =
    selectedPreset === 'custom'
      ? [
          {
            icon: 'timer-outline',
            label: 'Focus',
            value: `${customSettings.focusMinutes} min`,
          },
          {
            icon: 'coffee-outline',
            label: 'Short',
            value: `${customSettings.shortBreakMinutes} min`,
          },
          {
            icon: 'tree-outline',
            label: 'Long',
            value: `${customSettings.longBreakMinutes} min`,
          },
          {
            icon: 'sync',
            label: 'Every',
            value: `${customSettings.longBreakInterval} blocks`,
          },
        ]
      : [
          {
            icon: 'timer-outline',
            label: 'Focus',
            value: `${timerSettings.focusMinutes} min`,
          },
          {
            icon: 'coffee-outline',
            label: 'Short',
            value: `${timerSettings.shortBreakMinutes} min`,
          },
          {
            icon: 'tree-outline',
            label: 'Long',
            value: `${timerSettings.longBreakMinutes} min`,
          },
        ];
  const selectedPresetCycleText = `Long break every ${timerSettings.longBreakInterval} focus blocks`;
  const selectedPresetDetailNote =
    selectedPreset === 'quick'
      ? 'Short, lightweight focus sessions for quick wins.'
      : selectedPreset === 'deep'
      ? 'For long study sessions and deep work.'
      : selectedPreset === 'custom'
      ? 'A flexible timer that matches your flow and rhythm.'
      : activePreset.isSaved
      ? 'A saved timer rhythm for focused work with Milo.'
      : 'Balanced study rhythm for daily focus.';
  const focusBlockNumber = getCurrentCycleBlock(
    currentMode,
    cycleProgressCount,
    longBreakInterval
  );
  const focusBlockStatusText =
    currentMode === 'focus'
      ? isRunning
        ? 'Focus in progress'
        : 'Focus paused'
      : currentMode === 'shortBreak'
      ? 'Short break'
      : 'Long break';
  const focusBlockMiloMood =
    wasDistracted && currentMode === 'focus'
      ? 'worried'
      : currentMode !== 'focus'
      ? 'happy'
      : !isRunning
      ? 'sleepy'
      : selectedPreset === 'deep' || timerSettings.focusMinutes >= 50
      ? 'focused'
      : 'waving';
  const focusBlockMiloMessage =
    wasDistracted && currentMode === 'focus'
      ? 'Milo noticed a drift. Come back gently.'
      : currentMode !== 'focus'
      ? 'Break time! Recharge with Milo.'
      : !isRunning
      ? 'You paused. Ready when you are.'
      : selectedPreset === 'deep' || timerSettings.focusMinutes >= 50
      ? 'Stay with me - deep work starts now.'
      : cycleProgressCount > 0
      ? 'Breathe. One block at a time.'
      : 'Small steps, strong focus.';

  const routeTaskId =
    typeof route.params?.taskId === 'string' ? route.params.taskId : undefined;

  const suggestedTask = useMemo(() => {
    if (routeTaskId) {
      const routedTask = tasks.find(
        (task) => task.id === routeTaskId && task.status !== 'completed'
      );

      if (routedTask) return routedTask;
    }

    return getTopMiloRecommendedTask(tasks, new Date());
  }, [routeTaskId, tasks]);

  const incompleteFocusTasks = useMemo(() => {
    const nowMs = Date.now();

    return tasks
      .filter((task) => task.status !== 'completed')
      .sort((a, b) => {
        const rankDifference =
          getFocusTaskPickerRank(a, nowMs, todayDate) -
          getFocusTaskPickerRank(b, nowMs, todayDate);
        if (rankDifference !== 0) return rankDifference;

        const dueDifference = getTaskDueSortTime(a) - getTaskDueSortTime(b);
        if (dueDifference !== 0) return dueDifference;

        if (a.priority !== b.priority) {
          const priorityWeight = { high: 0, medium: 1, low: 2 };
          return priorityWeight[a.priority] - priorityWeight[b.priority];
        }

        return a.createdAt.localeCompare(b.createdAt);
      });
  }, [tasks, todayDate]);

  const selectedFocusTask = useMemo(() => {
    if (!selectedFocusTaskId) return undefined;
    return tasks.find((task) => task.id === selectedFocusTaskId);
  }, [selectedFocusTaskId, tasks]);

  const selectedFocusTaskDisplayTitle =
    selectedFocusTask?.title || selectedFocusTaskTitle;
  const focusTaskDisplayText = selectedFocusTaskDisplayTitle
    ? selectedFocusTaskDisplayTitle
    : focusWithoutTaskSelected
    ? 'Focus without task'
    : 'Choose before starting';
  const focusTaskHelperText = selectedFocusTaskDisplayTitle
    ? 'This focus block is tied to one task.'
    : focusWithoutTaskSelected
    ? 'Milo will track this as a general focus block.'
    : 'Pick a task when you press Start.';

  const progress =
    totalSeconds === 0
      ? 0
      : Math.min(1, Math.max(0, 1 - remainingSeconds / totalSeconds));
  const progressPercent = Math.round(progress * 100);

  const miloImage =
    remainingSeconds === 0 && !isRunning
      ? getMiloImageSource('celebrating')
      : isRunning
      ? currentMode === 'focus'
        ? getMiloImageSource('focused')
        : getMiloImageSource('happy')
      : currentMode === 'focus'
      ? getMiloImageSource('sleepy')
      : getMiloImageSource('waving');

  const miloMessage = isRunning
    ? currentMode === 'focus'
      ? 'Stay with one small step. Milo is guarding your focus.'
      : 'Rest gently. Breaks help your brain come back stronger.'
    : currentMode === 'focus'
    ? isLongBreakReady
      ? 'Your long break is ready before another focus block.'
      : cycleProgressCount === 0
      ? 'Start with one clean focus block. Milo will suggest breaks as you go.'
      : `${MODE_META[nextBreakAfterFocusMode].label} comes after this focus block.`
    : `${currentModeConfig.label} is ready. Press start when you want to rest.`;

  useEffect(() => {
    if (!selectedFocusTask || selectedFocusTask.title === selectedFocusTaskTitle) {
      return;
    }

    selectedFocusTaskTitleRef.current = selectedFocusTask.title;
    setSelectedFocusTaskTitle(selectedFocusTask.title);
  }, [selectedFocusTask, selectedFocusTaskTitle]);

  useEffect(() => {
    selectedPresetRef.current = selectedPreset;
    customSettingsRef.current = customSettings;
    currentModeRef.current = currentMode;
    isRunningRef.current = isRunning;
    timerSettingsRef.current = timerSettings;
    pomodoroCompletedFocusCountRef.current = completedFocusCount;
    cycleFocusCountRef.current = cycleProgressCount;
    wasDistractedRef.current = wasDistracted;
    selectedFocusTaskIdRef.current = selectedFocusTaskId;
    selectedFocusTaskTitleRef.current = selectedFocusTaskTitle;
    focusWithoutTaskSelectedRef.current = focusWithoutTaskSelected;
  }, [
    completedFocusCount,
    currentMode,
    customSettings,
    cycleProgressCount,
    focusWithoutTaskSelected,
    isRunning,
    selectedPreset,
    selectedFocusTaskId,
    selectedFocusTaskTitle,
    timerSettings,
    wasDistracted,
  ]);

  useEffect(() => {
    if (!hasRestoredPomodoroState) return;

    if (todayCompletedFocusCount > pomodoroCompletedFocusCount) {
      setPomodoroCompletedFocusCount(todayCompletedFocusCount);
    }
  }, [
    hasRestoredPomodoroState,
    pomodoroCompletedFocusCount,
    todayCompletedFocusCount,
  ]);

  useEffect(() => {
    if (cycleFocusCount > longBreakInterval) {
      setCycleFocusCount(longBreakInterval);
    }
  }, [cycleFocusCount, longBreakInterval]);

  const persistPomodoroState = useCallback(
    async (overrides: Partial<PersistedPomodoroSession> = {}) => {
      const running = overrides.isRunning ?? isRunningRef.current;
      const endTimestamp =
        overrides.endTimestamp !== undefined
          ? overrides.endTimestamp
          : endTimestampRef.current;
      const remainingMs =
        overrides.remainingMs ??
        (running && endTimestamp
          ? Math.max(endTimestamp - Date.now(), 0)
          : remainingMsRef.current);

      const payload: PersistedPomodoroSession = {
        version: 1,
        selectedPreset: selectedPresetRef.current,
        customSettings: customSettingsRef.current,
        currentMode: currentModeRef.current,
        isRunning: running,
        endTimestamp,
        startedAt: startedAtRef.current,
        completedFocusCount: pomodoroCompletedFocusCountRef.current,
        cycleProgressCount: cycleFocusCountRef.current,
        remainingMs,
        wasDistracted: wasDistractedRef.current,
        focusLeftAt: focusLeftAtRef.current,
        loggedFocusSessionKey: loggedFocusSessionKeyRef.current,
        selectedFocusTaskId: selectedFocusTaskIdRef.current,
        selectedFocusTaskTitle: selectedFocusTaskTitleRef.current,
        focusWithoutTaskSelected: focusWithoutTaskSelectedRef.current,
        sessionBlocks: sessionBlocksRef.current,
        savedAt: Date.now(),
        ...overrides,
      };

      try {
        await AsyncStorage.setItem(
          POMODORO_SESSION_STORAGE_KEY,
          JSON.stringify({ ...payload, version: 1, savedAt: Date.now() })
        );
      } catch (error) {
        console.log('Failed to save Pomodoro session:', error);
      }
    },
    []
  );

  const updateCompletedFocusCount = useCallback((value: number) => {
    const nextValue = Math.max(0, Math.round(value));
    pomodoroCompletedFocusCountRef.current = nextValue;
    setPomodoroCompletedFocusCount(nextValue);
  }, []);

  const updateCycleFocusCount = useCallback(
    (value: number, settings: PomodoroSettings = timerSettingsRef.current) => {
      const nextValue = Math.round(
        clampNumber(value, 0, settings.longBreakInterval)
      );

      cycleFocusCountRef.current = nextValue;
      setCycleFocusCount(nextValue);
    },
    []
  );

  const clearFocusTaskSelection = useCallback(() => {
    selectedFocusTaskIdRef.current = null;
    selectedFocusTaskTitleRef.current = null;
    focusWithoutTaskSelectedRef.current = false;
    setSelectedFocusTaskId(null);
    setSelectedFocusTaskTitle(null);
    setFocusWithoutTaskSelected(false);
  }, []);

  const selectFocusTask = useCallback((task: Task | null) => {
    const taskTitle = task?.title.trim() || null;

    selectedFocusTaskIdRef.current = task?.id ?? null;
    selectedFocusTaskTitleRef.current = taskTitle;
    focusWithoutTaskSelectedRef.current = !task;
    setSelectedFocusTaskId(task?.id ?? null);
    setSelectedFocusTaskTitle(taskTitle);
    setFocusWithoutTaskSelected(!task);
  }, []);

  const recordFocusSessionHistory = useCallback(
    async ({
      status,
      durationMinutes,
      startedAt,
      wasDistracted: sessionWasDistracted,
    }: {
      status: FocusSessionStatus;
      durationMinutes: number;
      startedAt: number | null;
      wasDistracted: boolean;
    }) => {
      const roundedDurationMinutes =
        status === 'completed'
          ? Math.max(1, Math.round(durationMinutes))
          : Math.max(0, Math.round(durationMinutes));

      const sessionStartedAt = startedAt ?? startedAtRef.current ?? Date.now();
      const historyKey = `${sessionStartedAt}:${status}`;

      if (recordedFocusHistoryKeysRef.current.has(historyKey)) return;

      recordedFocusHistoryKeysRef.current.add(historyKey);

      const selectedTaskId = selectedFocusTaskIdRef.current;
      const selectedTaskTitle =
        selectedFocusTaskTitleRef.current?.trim() || null;
      const focusScore = deriveFocusScore({
        durationMinutes: roundedDurationMinutes,
        focusMinutes: timerSettingsRef.current.focusMinutes,
        status,
        wasDistracted: sessionWasDistracted,
      });
      const session: FocusSessionHistoryItem = {
        id: historyKey,
        date: new Date().toISOString(),
        durationMinutes: roundedDurationMinutes,
        selectedTaskTitle,
        ...(selectedTaskId ? { selectedTaskId } : {}),
        focusQuality: sessionWasDistracted ? 'distracted' : 'clean',
        presetName: getPresetDisplayName(selectedPresetRef.current, savedPresets),
        status,
        focusScore,
      };

      await appendFocusSessionHistory(session);
    },
    [savedPresets]
  );

  const appendSessionBlockSummary = useCallback(
    ({
      status,
      durationMinutes,
      startedAt,
      wasDistracted: sessionWasDistracted,
    }: {
      status: FocusSessionStatus;
      durationMinutes: number;
      startedAt: number | null;
      wasDistracted: boolean;
    }) => {
      const sessionStartedAt = startedAt ?? startedAtRef.current ?? Date.now();
      const blockId = `${sessionStartedAt}:${status}`;

      if (sessionBlocksRef.current.some((block) => block.id === blockId)) {
        return sessionBlocksRef.current;
      }

      const nextBlocks = [
        ...sessionBlocksRef.current,
        {
          id: blockId,
          status,
          durationMinutes:
            status === 'completed'
              ? Math.max(1, Math.round(durationMinutes))
              : Math.max(0, Math.round(durationMinutes)),
          taskTitle: selectedFocusTaskTitleRef.current?.trim() || null,
          wasDistracted: sessionWasDistracted,
          presetName: getPresetDisplayName(selectedPresetRef.current, savedPresets),
          completedAt: new Date().toISOString(),
        },
      ];

      sessionBlocksRef.current = nextBlocks;
      setSessionBlocks(nextBlocks);

      return nextBlocks;
    },
    [savedPresets]
  );

  const showFinalSessionSummary = useCallback(async () => {
    const notificationId = timerCompletionNotificationIdRef.current;

    timerCompletionNotificationIdRef.current = null;
    await stopFocusAlertLoop();
    await cancelFocusTimerCompletionNotification(notificationId);

    const blocks = sessionBlocksRef.current;
    const fallbackTaskTitle = selectedFocusTaskTitleRef.current?.trim() || null;
    const lastBlock = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
    const summary = createFocusSessionSummary({
      blocks,
      fallbackTaskTitle,
      presetName:
        lastBlock?.presetName ??
        getPresetDisplayName(selectedPresetRef.current, savedPresets),
    });

    endTimestampRef.current = null;
    startedAtRef.current = null;
    focusLeftAtRef.current = null;
    isRunningRef.current = false;
    completionHandledRef.current = false;
    setIsRunning(false);
    setDndReminderVisible(false);
    setFocusBlockVisible(false);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    setFocusWarningText(null);
    setFocusSummary(summary);

    await persistPomodoroState({
      isRunning: false,
      endTimestamp: null,
      startedAt: null,
      focusLeftAt: null,
      sessionBlocks: blocks,
    });
  }, [persistPomodoroState, savedPresets]);

  const logFocusSessionOnce = useCallback(
    async (minutes: number, startedAt: number | null) => {
      const logStartedAt = startedAt ?? startedAtRef.current ?? Date.now();
      const logKey = `${logStartedAt}:${minutes}`;

      if (loggedFocusSessionKeyRef.current === logKey) return;

      try {
        const storedKeys = parseLoggedFocusKeys(
          await AsyncStorage.getItem(POMODORO_LOGGED_FOCUS_STORAGE_KEY)
        );

        if (storedKeys.includes(logKey)) {
          loggedFocusSessionKeyRef.current = logKey;
          return;
        }

        loggedFocusSessionKeyRef.current = logKey;
        await AsyncStorage.setItem(
          POMODORO_LOGGED_FOCUS_STORAGE_KEY,
          JSON.stringify([logKey, ...storedKeys].slice(0, MAX_LOGGED_FOCUS_KEYS))
        );
        await addFocusSession(minutes);
      } catch (error) {
        console.log('Failed to log Pomodoro focus session:', error);
      }
    },
    [addFocusSession]
  );

  const cancelTimerCompletionAlert = useCallback(async () => {
    const notificationId = timerCompletionNotificationIdRef.current;

    timerCompletionNotificationIdRef.current = null;
    await stopFocusAlertLoop();
    await cancelFocusTimerCompletionNotification(notificationId);
  }, []);

  const scheduleTimerCompletionAlert = useCallback(
    async (mode: PomodoroMode, delayMs: number) => {
      await cancelTimerCompletionAlert();

      const notificationId = await scheduleFocusTimerCompletionNotification(
        getFocusAlertTypeForMode(mode),
        delayMs
      );

      timerCompletionNotificationIdRef.current = notificationId;
    },
    [cancelTimerCompletionAlert]
  );

  useEffect(() => {
    return () => {
      const notificationId = timerCompletionNotificationIdRef.current;

      timerCompletionNotificationIdRef.current = null;
      void stopFocusAlertLoop();
      void cancelFocusTimerCompletionNotification(notificationId);
    };
  }, []);

  const resetTimerForMode = useCallback(
    (
      mode: PomodoroMode,
      settings: PomodoroSettings = timerSettingsRef.current,
      shouldCancelTimerAlert = true
    ) => {
      if (shouldCancelTimerAlert) {
        void cancelTimerCompletionAlert();
      }

      const nextSeconds = getModeSeconds(mode, settings);

      endTimestampRef.current = null;
      remainingMsRef.current = nextSeconds * 1000;
      startedAtRef.current = null;
      focusLeftAtRef.current = null;
      isRunningRef.current = false;
      wasDistractedRef.current = false;
      completionHandledRef.current = false;
      setIsRunning(false);
      setRemainingSeconds(nextSeconds);
      setTaskPickerVisible(false);
      setDndReminderVisible(false);
      setFocusWarningText(null);
      setWasDistracted(false);
      setFocusBlockVisible(false);
    },
    [cancelTimerCompletionAlert]
  );

  const changeMode = useCallback(
    (
      mode: PomodoroMode,
      settings: PomodoroSettings = timerSettingsRef.current,
      shouldCancelTimerAlert = true
    ) => {
      currentModeRef.current = mode;
      setCurrentMode(mode);
      resetTimerForMode(mode, settings, shouldCancelTimerAlert);
    },
    [resetTimerForMode]
  );

  const completeCurrentMode = useCallback(async (options: CompleteModeOptions = {}) => {
    if (completionHandledRef.current) return;

    completionHandledRef.current = true;
    endTimestampRef.current = null;
    remainingMsRef.current = 0;
    isRunningRef.current = false;
    focusLeftAtRef.current = null;
    setIsRunning(false);
    setRemainingSeconds(0);
    setDndReminderVisible(false);
    setFocusBlockVisible(false);

    const completedMode = options.mode ?? currentModeRef.current;
    const settings = options.settings ?? timerSettingsRef.current;
    const startingCompletedFocusCount =
      options.completedFocusCount ?? pomodoroCompletedFocusCountRef.current;
    const startingCycleFocusCount = Math.round(
      clampNumber(
        options.cycleFocusCount ?? cycleFocusCountRef.current,
        0,
        settings.longBreakInterval
      )
    );
    const sessionStartedAt = options.startedAt ?? startedAtRef.current ?? Date.now();

    timerCompletionNotificationIdRef.current = null;

    if (options.playFeedback !== false) {
      await startFocusAlertLoop(getFocusAlertTypeForMode(completedMode));
    }

    if (completedMode === 'focus') {
      const nextCompletedFocusCount = Math.max(
        0,
        Math.round(startingCompletedFocusCount)
      );
      const loggedCompletedFocusCount = nextCompletedFocusCount + 1;
      const nextCycleFocusCount = Math.min(
        startingCycleFocusCount + 1,
        settings.longBreakInterval
      );
      const suggestedBreakMode: Exclude<PomodoroMode, 'focus'> =
        nextCycleFocusCount >= settings.longBreakInterval
          ? 'longBreak'
          : 'shortBreak';
      const completedWasDistracted = wasDistractedRef.current;
      const completedTaskTitle =
        selectedFocusTaskTitleRef.current?.trim() || null;

      await recordFocusSessionHistory({
        status: 'completed',
        durationMinutes: settings.focusMinutes,
        startedAt: sessionStartedAt,
        wasDistracted: completedWasDistracted,
      });
      appendSessionBlockSummary({
        status: 'completed',
        durationMinutes: settings.focusMinutes,
        startedAt: sessionStartedAt,
        wasDistracted: completedWasDistracted,
      });
      await logFocusSessionOnce(settings.focusMinutes, sessionStartedAt);
      updateCompletedFocusCount(loggedCompletedFocusCount);
      updateCycleFocusCount(nextCycleFocusCount, settings);
      startedAtRef.current = null;
      wasDistractedRef.current = false;
      setWasDistracted(false);
      setFocusWarningText(null);
      changeMode(suggestedBreakMode, settings, false);
      setFocusBlockCompletion({
        durationMinutes: settings.focusMinutes,
        taskTitle: completedTaskTitle,
        wasDistracted: completedWasDistracted,
        nextBreakMode: suggestedBreakMode,
      });
      Speech.speak(
        'Great job! Focus block done. Ready for your break?',
        {
          rate: 0.95,
          pitch: 1.08,
        }
      );

      await persistPomodoroState({
        currentMode: suggestedBreakMode,
        isRunning: false,
        endTimestamp: null,
        startedAt: null,
        completedFocusCount: loggedCompletedFocusCount,
        cycleProgressCount: nextCycleFocusCount,
        remainingMs: getModeSeconds(suggestedBreakMode, settings) * 1000,
        wasDistracted: false,
        focusLeftAt: null,
        sessionBlocks: sessionBlocksRef.current,
      });
      return;
    }

    if (completedMode === 'longBreak') {
      updateCycleFocusCount(0, settings);
    }

    startedAtRef.current = null;
    changeMode('focus', settings, false);

    Speech.speak(
      completedMode === 'longBreak'
        ? 'Nice rest! Ready to continue with Milo?'
        : 'Break is done. Ready for the next focus block?',
      {
        rate: 0.95,
        pitch: 1.08,
      }
    );
    setBreakCompletion({
      breakMode: completedMode === 'longBreak' ? 'longBreak' : 'shortBreak',
    });

    await persistPomodoroState({
      currentMode: 'focus',
      isRunning: false,
      endTimestamp: null,
      startedAt: null,
      cycleProgressCount: completedMode === 'longBreak' ? 0 : cycleFocusCountRef.current,
      remainingMs: getModeSeconds('focus', settings) * 1000,
      focusLeftAt: null,
      sessionBlocks: sessionBlocksRef.current,
    });
  }, [
    appendSessionBlockSummary,
    changeMode,
    logFocusSessionOnce,
    persistPomodoroState,
    recordFocusSessionHistory,
    updateCompletedFocusCount,
    updateCycleFocusCount,
  ]);

  const syncRunningTimer = useCallback(async (options: { playFeedback?: boolean } = {}) => {
    if (!isRunningRef.current || !endTimestampRef.current) return;

    const nextRemainingMs = Math.max(endTimestampRef.current - Date.now(), 0);
    remainingMsRef.current = nextRemainingMs;
    setRemainingSeconds(Math.ceil(nextRemainingMs / 1000));

    if (nextRemainingMs === 0) {
      await completeCurrentMode({ playFeedback: options.playFeedback });
    }
  }, [completeCurrentMode]);

  const handleReturnToApp = useCallback(async () => {
    const now = Date.now();
    const focusLeftAt = focusLeftAtRef.current;
    const hadScheduledTimerAlert = Boolean(timerCompletionNotificationIdRef.current);

    await cancelTimerCompletionAlert();

    if (isRunningRef.current && currentModeRef.current === 'focus' && focusLeftAt) {
      const awayMs = now - focusLeftAt;

      if (awayMs > DISTRACTION_THRESHOLD_MS) {
        wasDistractedRef.current = true;
        setWasDistracted(true);
        setFocusWarningText(
          `You were away for ${formatAwayMinutes(
            awayMs
          )} during focus. Milo kept the timer running.`
        );
      }

      focusLeftAtRef.current = null;
      persistPomodoroState({
        focusLeftAt: null,
        wasDistracted: wasDistractedRef.current,
      });
    }

    await syncRunningTimer({ playFeedback: !hadScheduledTimerAlert });
  }, [cancelTimerCompletionAlert, persistPomodoroState, syncRunningTimer]);

  useEffect(() => {
    let isMounted = true;

    const restorePomodoroState = async () => {
      try {
        const [storedState, storedSavedPresets] = await Promise.all([
          AsyncStorage.getItem(POMODORO_SESSION_STORAGE_KEY),
          AsyncStorage.getItem(SAVED_POMODORO_PRESETS_STORAGE_KEY),
        ]);
        const restoredSavedPresets =
          parseSavedPomodoroPresets(storedSavedPresets);

        if (!isMounted) return;

        setSavedPresets(restoredSavedPresets);

        if (!storedState) {
          setHasRestoredPomodoroState(true);
          return;
        }

        const parsed = JSON.parse(storedState) as unknown;
        const stored = isRecord(parsed) ? parsed : {};
        const restoredCustomSettings = sanitizePomodoroSettings(
          stored.customSettings
        );
        const storedPreset = isPomodoroPresetId(stored.selectedPreset)
          ? stored.selectedPreset
          : 'classic';
        const restoredPreset =
          getSavedPresetStorageId(storedPreset) &&
          !getSavedPresetByPresetId(storedPreset, restoredSavedPresets)
            ? 'classic'
            : storedPreset;
        const restoredSettings = resolvePresetOption(
          restoredPreset,
          restoredCustomSettings,
          restoredSavedPresets
        ).settings;
        const restoredMode = isPomodoroMode(stored.currentMode)
          ? stored.currentMode
          : 'focus';
        const restoredTotalMs = getModeSeconds(restoredMode, restoredSettings) * 1000;
        const restoredRemainingMs = clampNumber(
          getFiniteNumber(stored.remainingMs, restoredTotalMs),
          0,
          restoredTotalMs
        );
        const restoredStartedAt = getTimestampOrNull(stored.startedAt);
        const restoredEndTimestamp = getTimestampOrNull(stored.endTimestamp);
        const restoredCompletedFocusCount = Math.max(
          0,
          Math.round(getFiniteNumber(stored.completedFocusCount, 0))
        );
        const restoredSavedAt = getTimestampOrNull(stored.savedAt);
        const shouldRestoreCycleProgress =
          !restoredSavedAt ||
          getDateKeyFromTimestamp(restoredSavedAt) === getTodayDate();
        const restoredCycleProgressCount = Math.round(
          clampNumber(
            shouldRestoreCycleProgress
              ? getFiniteNumber(stored.cycleProgressCount, 0)
              : 0,
            0,
            restoredSettings.longBreakInterval
          )
        );
        const restoredWasDistracted = Boolean(stored.wasDistracted);
        const restoredFocusLeftAt = getTimestampOrNull(stored.focusLeftAt);
        const restoredLoggedKey =
          typeof stored.loggedFocusSessionKey === 'string'
            ? stored.loggedFocusSessionKey
            : null;
        const restoredSelectedFocusTaskId =
          typeof stored.selectedFocusTaskId === 'string'
            ? stored.selectedFocusTaskId
            : null;
        const restoredSelectedFocusTaskTitle =
          typeof stored.selectedFocusTaskTitle === 'string'
            ? stored.selectedFocusTaskTitle
            : null;
        const restoredFocusWithoutTaskSelected = Boolean(
          stored.focusWithoutTaskSelected
        );
        const restoredSessionBlocks = sanitizeSessionBlockSummaries(
          stored.sessionBlocks
        );
        const shouldRestoreFocusTaskSelection =
          restoredMode === 'focus' && Boolean(restoredStartedAt);
        const nextSelectedFocusTaskId = shouldRestoreFocusTaskSelection
          ? restoredSelectedFocusTaskId
          : null;
        const nextSelectedFocusTaskTitle = shouldRestoreFocusTaskSelection
          ? restoredSelectedFocusTaskTitle
          : null;
        const nextFocusWithoutTaskSelected = shouldRestoreFocusTaskSelection
          ? restoredFocusWithoutTaskSelected
          : false;

        selectedPresetRef.current = restoredPreset;
        customSettingsRef.current = restoredCustomSettings;
        currentModeRef.current = restoredMode;
        timerSettingsRef.current = restoredSettings;
        startedAtRef.current = restoredStartedAt;
        focusLeftAtRef.current = restoredFocusLeftAt;
        loggedFocusSessionKeyRef.current = restoredLoggedKey;
        selectedFocusTaskIdRef.current = nextSelectedFocusTaskId;
        selectedFocusTaskTitleRef.current = nextSelectedFocusTaskTitle;
        focusWithoutTaskSelectedRef.current = nextFocusWithoutTaskSelected;
        pomodoroCompletedFocusCountRef.current = restoredCompletedFocusCount;
        cycleFocusCountRef.current = restoredCycleProgressCount;
        wasDistractedRef.current = restoredWasDistracted;
        sessionBlocksRef.current = restoredSessionBlocks;

        setSelectedPreset(restoredPreset);
        setCustomSettings(restoredCustomSettings);
        setCurrentMode(restoredMode);
        setPomodoroCompletedFocusCount(restoredCompletedFocusCount);
        setCycleFocusCount(restoredCycleProgressCount);
        setWasDistracted(restoredWasDistracted);
        setSelectedFocusTaskId(nextSelectedFocusTaskId);
        setSelectedFocusTaskTitle(nextSelectedFocusTaskTitle);
        setFocusWithoutTaskSelected(nextFocusWithoutTaskSelected);
        setSessionBlocks(restoredSessionBlocks);
        setTaskPickerVisible(false);
        setFocusWarningText(null);

        const shouldResumeRunning = Boolean(stored.isRunning && restoredEndTimestamp);

        if (shouldResumeRunning && restoredEndTimestamp) {
          const nextRemainingMs = Math.max(restoredEndTimestamp - Date.now(), 0);

          if (nextRemainingMs === 0) {
            if (restoredMode === 'focus' && restoredFocusLeftAt) {
              const awayMs = Date.now() - restoredFocusLeftAt;

              if (awayMs > DISTRACTION_THRESHOLD_MS) {
                wasDistractedRef.current = true;
                setWasDistracted(true);
              }
            }

            endTimestampRef.current = null;
            remainingMsRef.current = 0;
            isRunningRef.current = false;
            setIsRunning(false);
            setRemainingSeconds(0);
            setDndReminderVisible(false);
            setFocusBlockVisible(false);
            await completeCurrentMode({
              mode: restoredMode,
              settings: restoredSettings,
              completedFocusCount: restoredCompletedFocusCount,
              cycleFocusCount: restoredCycleProgressCount,
              startedAt: restoredStartedAt,
              playFeedback: false,
            });
            setHasRestoredPomodoroState(true);
            return;
          }

          endTimestampRef.current = restoredEndTimestamp;
          remainingMsRef.current = nextRemainingMs;
          isRunningRef.current = true;
          setIsRunning(true);
          setRemainingSeconds(Math.ceil(nextRemainingMs / 1000));
          setDndReminderVisible(false);
          setFocusBlockVisible(true);

          if (restoredMode === 'focus' && restoredFocusLeftAt) {
            const awayMs = Date.now() - restoredFocusLeftAt;

            if (awayMs > DISTRACTION_THRESHOLD_MS) {
              wasDistractedRef.current = true;
              setWasDistracted(true);
              setFocusWarningText(
                `You were away for ${formatAwayMinutes(
                  awayMs
                )} during focus. Milo kept the timer running.`
              );
            }

            focusLeftAtRef.current = null;
          }
        } else {
          endTimestampRef.current = null;
          remainingMsRef.current = restoredRemainingMs;
          isRunningRef.current = false;
          setIsRunning(false);
          setRemainingSeconds(Math.ceil(restoredRemainingMs / 1000));
          setDndReminderVisible(false);
          setFocusBlockVisible(Boolean(restoredStartedAt) && restoredRemainingMs > 0);
        }

        setHasRestoredPomodoroState(true);
      } catch (error) {
        console.log('Failed to restore Pomodoro session:', error);

        if (isMounted) {
          setHasRestoredPomodoroState(true);
        }
      }
    };

    restorePomodoroState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasRestoredPomodoroState) return;

    persistPomodoroState();
  }, [
    currentMode,
    customSettings,
    cycleProgressCount,
    focusWithoutTaskSelected,
    hasRestoredPomodoroState,
    isRunning,
    persistPomodoroState,
    pomodoroCompletedFocusCount,
    selectedPreset,
    selectedFocusTaskId,
    selectedFocusTaskTitle,
    wasDistracted,
  ]);

  useEffect(() => {
    if (!hasRestoredPomodoroState || !isRunning) return;

    syncRunningTimer();
    const timer = setInterval(() => {
      syncRunningTimer();
    }, 250);

    return () => clearInterval(timer);
  }, [hasRestoredPomodoroState, isRunning, syncRunningTimer]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (!hasRestoredPomodoroState) {
          appStateRef.current = nextAppState;
          return;
        }

        const previousAppState = appStateRef.current;
        const leavingActiveState =
          previousAppState === 'active' && nextAppState !== 'active';
        const returningToActiveState =
          previousAppState !== 'active' && nextAppState === 'active';

        if (leavingActiveState && isRunningRef.current) {
          if (currentModeRef.current === 'focus') {
            const focusLeftAt = focusLeftAtRef.current ?? Date.now();
            focusLeftAtRef.current = focusLeftAt;
            persistPomodoroState({ focusLeftAt });
          }

          const remainingUntilEndMs = endTimestampRef.current
            ? Math.max(endTimestampRef.current - Date.now(), 0)
            : remainingMsRef.current;

          void scheduleTimerCompletionAlert(
            currentModeRef.current,
            remainingUntilEndMs
          );
        }

        if (returningToActiveState) {
          void handleReturnToApp();
        }

        appStateRef.current = nextAppState;
      }
    );

    return () => subscription.remove();
  }, [
    handleReturnToApp,
    hasRestoredPomodoroState,
    persistPomodoroState,
    scheduleTimerCompletionAlert,
  ]);

  const handleSelectPreset = (presetId: PomodoroPresetId) => {
    if (presetId === selectedPreset) return;

    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before changing the timer preset.'
      );
      return;
    }

    const nextPresetOption =
      presetOptions.find((presetOption) => presetOption.id === presetId) ??
      resolvePresetOption('classic', customSettings, savedPresets);
    const nextSettings = nextPresetOption.settings;
    const nextCycleFocusCount = Math.round(
      clampNumber(cycleProgressCount, 0, nextSettings.longBreakInterval)
    );

    selectedPresetRef.current = presetId;
    timerSettingsRef.current = nextSettings;
    clearFocusTaskSelection();
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    setSelectedPreset(presetId);
    updateCycleFocusCount(nextCycleFocusCount, nextSettings);
    resetTimerForMode(currentMode, nextSettings);
  };

  const persistSavedPresets = async (nextPresets: SavedPomodoroPreset[]) => {
    try {
      await AsyncStorage.setItem(
        SAVED_POMODORO_PRESETS_STORAGE_KEY,
        JSON.stringify(nextPresets)
      );
    } catch (error) {
      console.log('Failed to save custom Pomodoro presets:', error);
      Alert.alert(
        'Preset not saved',
        'Milo could not save this preset locally. Please try again.'
      );
    }
  };

  const applyCustomSettings = (nextSettingsValue: PomodoroSettings) => {
    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before changing custom timer settings.'
      );
      return false;
    }

    const nextSettings = sanitizePomodoroSettings(nextSettingsValue);

    customSettingsRef.current = nextSettings;
    selectedPresetRef.current = 'custom';
    timerSettingsRef.current = nextSettings;
    clearFocusTaskSelection();
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    setSelectedPreset('custom');
    setCustomSettings(nextSettings);
    updateCycleFocusCount(cycleProgressCount, nextSettings);
    resetTimerForMode(currentMode, nextSettings);
    return true;
  };

  const handleOpenCustomEditor = () => {
    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before changing custom timer settings.'
      );
      return;
    }

    setCustomDraftTexts(createCustomTimerDraftTexts(customSettings));
    setCustomEditorVisible(true);
  };

  const handleOpenPresetManager = () => {
    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before managing presets.'
      );
      return;
    }

    setPresetDraftName('');
    setPresetDraftTexts(createCustomTimerDraftTexts(timerSettings));
    setPresetManagerVisible(true);
  };

  const handleChangeCustomDraftText = (
    field: CustomTimerField,
    value: string
  ) => {
    setCustomDraftTexts((currentDraft) => ({
      ...currentDraft,
      [field]: sanitizeNumberInputText(value),
    }));
  };

  const handleAdjustCustomDraftValue = (
    field: CustomTimerField,
    delta: number
  ) => {
    const currentValue = parseCustomTimerDraftValue(
      field,
      customDraftTexts[field],
      customSettings[field]
    );
    const meta = CUSTOM_TIMER_FIELD_META[field];
    const nextValue = Math.round(
      clampNumber(currentValue + delta, meta.min, meta.max)
    );

    setCustomDraftTexts((currentDraft) => ({
      ...currentDraft,
      [field]: String(nextValue),
    }));
  };

  const handleCancelCustomEditor = () => {
    setCustomDraftTexts(createCustomTimerDraftTexts(customSettings));
    setCustomEditorVisible(false);
  };

  const handleChangePresetDraftText = (
    field: CustomTimerField,
    value: string
  ) => {
    setPresetDraftTexts((currentDraft) => ({
      ...currentDraft,
      [field]: sanitizeNumberInputText(value),
    }));
  };

  const handleAdjustPresetDraftValue = (
    field: CustomTimerField,
    delta: number
  ) => {
    const currentValue = parseCustomTimerDraftValue(
      field,
      presetDraftTexts[field],
      timerSettings[field]
    );
    const meta = CUSTOM_TIMER_FIELD_META[field];
    const nextValue = Math.round(
      clampNumber(currentValue + delta, meta.min, meta.max)
    );

    setPresetDraftTexts((currentDraft) => ({
      ...currentDraft,
      [field]: String(nextValue),
    }));
  };

  const handleCancelPresetManager = () => {
    setPresetDraftName('');
    setPresetDraftTexts(createCustomTimerDraftTexts(timerSettings));
    setPresetManagerVisible(false);
  };

  const handleSaveCustomEditor = () => {
    const nextSettings = {
      focusMinutes: parseCustomTimerDraftValue(
        'focusMinutes',
        customDraftTexts.focusMinutes,
        customSettings.focusMinutes
      ),
      shortBreakMinutes: parseCustomTimerDraftValue(
        'shortBreakMinutes',
        customDraftTexts.shortBreakMinutes,
        customSettings.shortBreakMinutes
      ),
      longBreakMinutes: parseCustomTimerDraftValue(
        'longBreakMinutes',
        customDraftTexts.longBreakMinutes,
        customSettings.longBreakMinutes
      ),
      longBreakInterval: parseCustomTimerDraftValue(
        'longBreakInterval',
        customDraftTexts.longBreakInterval,
        customSettings.longBreakInterval
      ),
    };

    const didApply = applyCustomSettings(nextSettings);

    if (didApply) {
      setCustomEditorVisible(false);
    }
  };

  const handleSaveManagedPreset = async () => {
    const name = presetDraftName.trim();

    if (!name) {
      Alert.alert('Name your preset', 'Give this timer rhythm a short name.');
      return;
    }

    const nextSettings = {
      focusMinutes: parseCustomTimerDraftValue(
        'focusMinutes',
        presetDraftTexts.focusMinutes,
        timerSettings.focusMinutes
      ),
      shortBreakMinutes: parseCustomTimerDraftValue(
        'shortBreakMinutes',
        presetDraftTexts.shortBreakMinutes,
        timerSettings.shortBreakMinutes
      ),
      longBreakMinutes: parseCustomTimerDraftValue(
        'longBreakMinutes',
        presetDraftTexts.longBreakMinutes,
        timerSettings.longBreakMinutes
      ),
      longBreakInterval: parseCustomTimerDraftValue(
        'longBreakInterval',
        presetDraftTexts.longBreakInterval,
        timerSettings.longBreakInterval
      ),
    };
    const nextPreset: SavedPomodoroPreset = {
      id: createSavedPresetId(),
      name,
      settings: nextSettings,
      createdAt: Date.now(),
    };
    const nextSavedPresets = [...savedPresets, nextPreset];
    const nextPresetId: PomodoroPresetId = `saved:${nextPreset.id}`;
    const nextCycleFocusCount = Math.round(
      clampNumber(cycleProgressCount, 0, nextSettings.longBreakInterval)
    );

    setSavedPresets(nextSavedPresets);
    selectedPresetRef.current = nextPresetId;
    timerSettingsRef.current = nextSettings;
    clearFocusTaskSelection();
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    setSelectedPreset(nextPresetId);
    updateCycleFocusCount(nextCycleFocusCount, nextSettings);
    resetTimerForMode(currentMode, nextSettings);
    setPresetManagerVisible(false);
    setPresetDraftName('');
    setPresetDraftTexts(createCustomTimerDraftTexts(nextSettings));

    await persistSavedPresets(nextSavedPresets);
  };

  const handleDeleteSelectedSavedPreset = () => {
    const selectedSavedPreset = getSavedPresetByPresetId(
      selectedPreset,
      savedPresets
    );

    if (!selectedSavedPreset) return;

    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before deleting a saved preset.'
      );
      return;
    }

    Alert.alert(
      'Delete this preset?',
      `Remove ${selectedSavedPreset.name} from your saved timer presets?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const nextSavedPresets = savedPresets.filter(
              (savedPreset) => savedPreset.id !== selectedSavedPreset.id
            );

            setSavedPresets(nextSavedPresets);
            selectedPresetRef.current = 'classic';
            timerSettingsRef.current = CLASSIC_SETTINGS;
            clearFocusTaskSelection();
            setFocusSummary(null);
            setFocusBlockCompletion(null);
            setBreakCompletion(null);
            setSelectedPreset('classic');
            updateCycleFocusCount(cycleProgressCount, CLASSIC_SETTINGS);
            resetTimerForMode(currentMode, CLASSIC_SETTINGS);

            await persistSavedPresets(nextSavedPresets);
          },
        },
      ]
    );
  };

  const handleSelectMode = (mode: PomodoroMode) => {
    if (mode === currentMode) return;

    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before changing the current session.'
      );
      return;
    }

    clearFocusTaskSelection();
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    changeMode(mode);
  };

  const startTimer = async () => {
    if (isRunningRef.current) return;

    let startingRemainingMs = remainingMsRef.current;
    const startingFromEndedTimer =
      remainingMsRef.current <= 0 || remainingSeconds === 0;

    if (startingFromEndedTimer) {
      startingRemainingMs = totalSeconds * 1000;
      remainingMsRef.current = startingRemainingMs;
      setRemainingSeconds(totalSeconds);
    }

    const now = Date.now();
    const startingFreshSession = !startedAtRef.current || startingFromEndedTimer;

    if (startingFreshSession) {
      startedAtRef.current = now;
      focusLeftAtRef.current = null;
      loggedFocusSessionKeyRef.current = null;

      if (currentMode === 'focus') {
        wasDistractedRef.current = false;
        setWasDistracted(false);
        setFocusWarningText(null);
      }
    }

    completionHandledRef.current = false;
    endTimestampRef.current = now + startingRemainingMs;
    isRunningRef.current = true;
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    setIsRunning(true);
    setDndReminderVisible(false);
    setFocusBlockVisible(true);

    Speech.speak(currentModeConfig.startSpeech, {
      rate: 0.95,
      pitch: 1.08,
    });

    await persistPomodoroState({
      isRunning: true,
      endTimestamp: endTimestampRef.current,
      startedAt: startedAtRef.current,
      remainingMs: startingRemainingMs,
      wasDistracted: wasDistractedRef.current,
      focusLeftAt: null,
      loggedFocusSessionKey: loggedFocusSessionKeyRef.current,
    });
  };

  const handleDndReminderStart = async () => {
    setDndReminderVisible(false);
    await startTimer();
  };

  const continueToDndReminder = () => {
    setTaskPickerVisible(false);
    setDndReminderVisible(true);
  };

  const handleChooseFocusTask = (task: Task) => {
    selectFocusTask(task);
    continueToDndReminder();
  };

  const handleChooseFocusWithoutTask = () => {
    selectFocusTask(null);
    continueToDndReminder();
  };

  const handleDismissFocusSummary = async () => {
    await cancelTimerCompletionAlert();
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    clearFocusTaskSelection();
    sessionBlocksRef.current = [];
    setSessionBlocks([]);
    wasDistractedRef.current = false;
    focusLeftAtRef.current = null;
    currentModeRef.current = 'focus';
    setWasDistracted(false);
    setFocusWarningText(null);
    setCurrentMode('focus');
    updateCycleFocusCount(0, timerSettings);
    resetTimerForMode('focus', timerSettings);

    try {
      await AsyncStorage.removeItem(POMODORO_SESSION_STORAGE_KEY);
    } catch (error) {
      console.log('Failed to clear Pomodoro session:', error);
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const handleContinueFocus = () => {
    setFocusWarningText(null);
  };

  const handleStartPause = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isRunning) {
      const pausedRemainingMs = endTimestampRef.current
        ? Math.max(endTimestampRef.current - Date.now(), 0)
        : remainingMsRef.current;

      remainingMsRef.current = pausedRemainingMs;
      endTimestampRef.current = null;
      isRunningRef.current = false;
      setRemainingSeconds(Math.ceil(pausedRemainingMs / 1000));
      setIsRunning(false);
      setDndReminderVisible(false);
      await cancelTimerCompletionAlert();
      await persistPomodoroState({
        isRunning: false,
        endTimestamp: null,
        remainingMs: pausedRemainingMs,
      });
      return;
    }

    const startingFromEndedTimer =
      remainingMsRef.current <= 0 || remainingSeconds === 0;
    const startingFreshSession = !startedAtRef.current || startingFromEndedTimer;

    if (
      currentMode === 'focus' &&
      startingFreshSession &&
      !selectedFocusTaskIdRef.current &&
      !focusWithoutTaskSelectedRef.current
    ) {
      setTaskPickerVisible(true);
      return;
    }

    await startTimer();
  };

  const handleStartBreakAfterFocusCompletion = async () => {
    await stopFocusAlertLoop();
    setFocusBlockCompletion(null);
    await startTimer();
  };

  const handleStartNextFocusAfterBreak = async () => {
    await stopFocusAlertLoop();
    setBreakCompletion(null);
    await handleStartPause();
  };

  const handleEndSessionFromCycleModal = async () => {
    await stopFocusAlertLoop();
    await showFinalSessionSummary();
  };

  const handleStartFocusFromPresetDetails = async () => {
    if (currentMode !== 'focus') {
      if (isRunning) {
        Alert.alert(
          'Timer is running',
          'Pause or reset the current timer before starting a focus block.'
        );
        return;
      }

      clearFocusTaskSelection();
      setFocusSummary(null);
      setFocusBlockCompletion(null);
      setBreakCompletion(null);
      changeMode('focus', timerSettings);
      setTaskPickerVisible(true);
      return;
    }

    await handleStartPause();
  };

  const handleReset = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    clearFocusTaskSelection();
    resetTimerForMode(currentMode);
    await persistPomodoroState({
      isRunning: false,
      endTimestamp: null,
      startedAt: null,
      remainingMs: getModeSeconds(currentMode, timerSettings) * 1000,
      wasDistracted: false,
      focusLeftAt: null,
      selectedFocusTaskId: null,
      selectedFocusTaskTitle: null,
      focusWithoutTaskSelected: false,
    });
  };

  const handleResetFocusBlock = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await cancelTimerCompletionAlert();

    const nextRemainingMs = getModeSeconds(currentMode, timerSettings) * 1000;

    endTimestampRef.current = null;
    remainingMsRef.current = nextRemainingMs;
    startedAtRef.current = null;
    focusLeftAtRef.current = null;
    isRunningRef.current = false;
    wasDistractedRef.current = false;
    completionHandledRef.current = false;
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    setIsRunning(false);
    setRemainingSeconds(Math.ceil(nextRemainingMs / 1000));
    setDndReminderVisible(false);
    setFocusWarningText(null);
    setWasDistracted(false);
    setFocusBlockVisible(true);

    await persistPomodoroState({
      isRunning: false,
      endTimestamp: null,
      startedAt: null,
      remainingMs: nextRemainingMs,
      wasDistracted: false,
      focusLeftAt: null,
    });
  };

  const handleStopFocusBlock = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const stoppedMode = currentModeRef.current;

    if (stoppedMode === 'focus') {
      const elapsedDurationMinutes = getElapsedFocusDurationMinutes(
        timerSettings,
        remainingMsRef.current
      );

      await recordFocusSessionHistory({
        status: 'stopped',
        durationMinutes: elapsedDurationMinutes,
        startedAt: startedAtRef.current,
        wasDistracted: wasDistractedRef.current,
      });
      appendSessionBlockSummary({
        status: 'stopped',
        durationMinutes: elapsedDurationMinutes,
        startedAt: startedAtRef.current,
        wasDistracted: wasDistractedRef.current,
      });
    }

    await showFinalSessionSummary();
  };

  const handleSkip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await cancelTimerCompletionAlert();

    const skippedMode = currentMode;
    const nextSession =
      skippedMode === 'focus'
        ? {
            nextMode: 'shortBreak' as PomodoroMode,
            nextCycleFocusCount: cycleFocusCountRef.current,
          }
        : getNextSessionType(
            skippedMode,
            cycleFocusCountRef.current,
            timerSettings.longBreakInterval
          );
    const { nextMode, nextCycleFocusCount } = nextSession;

    if (skippedMode === 'focus') {
      const elapsedDurationMinutes = getElapsedFocusDurationMinutes(
        timerSettings,
        remainingMsRef.current
      );

      await recordFocusSessionHistory({
        status: 'skipped',
        durationMinutes: elapsedDurationMinutes,
        startedAt: startedAtRef.current,
        wasDistracted: wasDistractedRef.current,
      });
      appendSessionBlockSummary({
        status: 'skipped',
        durationMinutes: elapsedDurationMinutes,
        startedAt: startedAtRef.current,
        wasDistracted: wasDistractedRef.current,
      });
    }

    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    updateCycleFocusCount(nextCycleFocusCount, timerSettings);
    changeMode(nextMode);

    Speech.speak(
      skippedMode === 'focus'
        ? 'Focus block skipped. Take a short break before trying again.'
        : 'Break skipped. Milo is ready for focus.',
      {
        rate: 0.95,
        pitch: 1.08,
      }
    );

    await persistPomodoroState({
      currentMode: nextMode,
      isRunning: false,
      endTimestamp: null,
      startedAt: null,
      cycleProgressCount: nextCycleFocusCount,
      remainingMs: getModeSeconds(nextMode, timerSettings) * 1000,
      focusLeftAt: null,
      wasDistracted: false,
      sessionBlocks: sessionBlocksRef.current,
    });
  };

  const handleSkipFocusBlock = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await cancelTimerCompletionAlert();

    const skippedMode = currentMode;
    const nextSession =
      skippedMode === 'focus'
        ? {
            nextMode: 'shortBreak' as PomodoroMode,
            nextCycleFocusCount: cycleFocusCountRef.current,
          }
        : getNextSessionType(
            skippedMode,
            cycleFocusCountRef.current,
            timerSettings.longBreakInterval
          );
    const { nextMode, nextCycleFocusCount } = nextSession;
    const nextRemainingMs = getModeSeconds(nextMode, timerSettings) * 1000;

    if (skippedMode === 'focus') {
      const elapsedDurationMinutes = getElapsedFocusDurationMinutes(
        timerSettings,
        remainingMsRef.current
      );

      await recordFocusSessionHistory({
        status: 'skipped',
        durationMinutes: elapsedDurationMinutes,
        startedAt: startedAtRef.current,
        wasDistracted: wasDistractedRef.current,
      });
      appendSessionBlockSummary({
        status: 'skipped',
        durationMinutes: elapsedDurationMinutes,
        startedAt: startedAtRef.current,
        wasDistracted: wasDistractedRef.current,
      });
    }

    currentModeRef.current = nextMode;
    endTimestampRef.current = null;
    remainingMsRef.current = nextRemainingMs;
    startedAtRef.current = null;
    focusLeftAtRef.current = null;
    isRunningRef.current = false;
    wasDistractedRef.current = false;
    completionHandledRef.current = false;
    setFocusSummary(null);
    setFocusBlockCompletion(null);
    setBreakCompletion(null);
    setCurrentMode(nextMode);
    updateCycleFocusCount(nextCycleFocusCount, timerSettings);
    setIsRunning(false);
    setRemainingSeconds(Math.ceil(nextRemainingMs / 1000));
    setDndReminderVisible(false);
    setFocusWarningText(null);
    setWasDistracted(false);
    setFocusBlockVisible(true);

    Speech.speak(
      skippedMode === 'focus'
        ? 'Focus block skipped. Take a short break before trying again.'
        : 'Break skipped. Milo is ready for focus.',
      {
        rate: 0.95,
        pitch: 1.08,
      }
    );

    await persistPomodoroState({
      currentMode: nextMode,
      isRunning: false,
      endTimestamp: null,
      startedAt: null,
      cycleProgressCount: nextCycleFocusCount,
      remainingMs: nextRemainingMs,
      focusLeftAt: null,
      wasDistracted: false,
      sessionBlocks: sessionBlocksRef.current,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Modal
        animationType="fade"
        transparent
        visible={taskPickerVisible}
        onRequestClose={() => setTaskPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.focusModalCard, styles.taskPickerModalCard]}>
            <View style={styles.modalAccentBar} />
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>Focus Task</Text>
            </View>
            <Text style={styles.modalTitle}>Choose one task</Text>
            <Text style={styles.modalMessage}>
              Pick an incomplete FocusMate item for this focus block, or start a
              general focus session.
            </Text>

            <ScrollView
              style={styles.taskPickerList}
              contentContainerStyle={styles.taskPickerListContent}
              showsVerticalScrollIndicator={incompleteFocusTasks.length > 3}
            >
              {incompleteFocusTasks.length > 0 ? (
                incompleteFocusTasks.map((task) => (
                  <TouchableOpacity
                    key={task.id}
                    activeOpacity={0.86}
                    style={styles.taskPickerItem}
                    onPress={() => handleChooseFocusTask(task)}
                  >
                    <View style={styles.taskPickerIcon}>
                      <MaterialCommunityIcons
                        name="checkbox-marked-circle-outline"
                        size={20}
                        color={theme.colors.primaryDark}
                      />
                    </View>

                    <View style={styles.taskPickerTextArea}>
                      <Text style={styles.taskPickerTitle} numberOfLines={2}>
                        {task.title}
                      </Text>
                      <Text style={styles.taskPickerMeta} numberOfLines={1}>
                        {getFocusTaskMetaText(task)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyTaskPickerState}>
                  <Ionicons
                    name="leaf-outline"
                    size={24}
                    color={theme.colors.primaryDark}
                  />
                  <Text style={styles.emptyTaskPickerText}>
                    No incomplete tasks right now.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalButtonStack}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.modalPrimaryButton}
                onPress={handleChooseFocusWithoutTask}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  Focus without task
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={dndReminderVisible}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.focusModalCard}>
            <View style={styles.modalAccentBar} />
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>Milo</Text>
            </View>
            <Text style={styles.modalTitle}>Milo Focus Guard</Text>
            <Text style={styles.modalMessage}>
              For better focus, turn on Do Not Disturb and stay with Milo until
              the timer ends.
            </Text>
            <Text style={styles.modalMessage}>
              DND is optional. You can continue without it.
            </Text>

            <View style={styles.modalButtonStack}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.modalPrimaryButton}
                onPress={handleDndReminderStart}
              >
                <Text style={styles.modalPrimaryButtonText}>I'll turn it on</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.modalSecondaryButton}
                onPress={handleDndReminderStart}
              >
                <Text style={styles.modalSecondaryButtonText}>
                  Continue without DND
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={focusBlockVisible}
        onRequestClose={() => {}}
      >
        <ScrollView
          style={styles.focusBlockOverlayScroll}
          contentContainerStyle={styles.focusBlockOverlay}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.focusBlockCard,
              compactFocusBlock && styles.focusBlockCardCompact,
            ]}
          >
            <View style={styles.focusModalLeafOne} />
            <View style={styles.focusModalLeafTwo} />
            <View style={styles.focusModalLeafThree} />

            <View style={styles.focusBlockStatusPill}>
              <Ionicons name="leaf-outline" size={18} color={theme.colors.primaryDark} />
              <Text style={styles.focusBlockStatusText}>
                {focusBlockStatusText}
              </Text>
            </View>

            <Text
              style={[
                styles.focusBlockTimer,
                compactFocusBlock && styles.focusBlockTimerCompact,
              ]}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
            >
              {formatSeconds(remainingSeconds)}
            </Text>

            <View
              style={[
                styles.focusBlockPresetIcon,
                { backgroundColor: activePresetVisual.softColor },
                compactFocusBlock && styles.focusBlockPresetIconCompact,
              ]}
            >
              <Ionicons
                name={activePresetVisual.icon}
                size={compactFocusBlock ? 22 : 26}
                color={activePresetVisual.color}
              />
            </View>

            <Text
              style={[
                styles.focusBlockPresetName,
                compactFocusBlock && styles.focusBlockPresetNameCompact,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {selectedPresetDisplayName}
            </Text>

            <View style={styles.focusBlockTaskChip}>
              <MaterialCommunityIcons
                name={selectedFocusTaskDisplayTitle ? 'file-document-outline' : 'timer-sand'}
                size={17}
                color={theme.colors.primaryDark}
              />
              <Text style={styles.focusBlockTaskText} numberOfLines={1}>
                {selectedFocusTaskDisplayTitle || 'Focus without task'}
              </Text>
            </View>

            <View style={styles.focusBlockCycleArea}>
              <Text style={styles.focusBlockCycleText}>
                Block {focusBlockNumber} of {longBreakInterval}
              </Text>

              <View style={styles.focusBlockDotsRow}>
                {Array.from({ length: longBreakInterval }, (_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.focusBlockDot,
                      index < focusBlockNumber && styles.focusBlockDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>

            <View
              style={[
                styles.focusBlockMessageStage,
                compactFocusBlock && styles.focusBlockMessageStageCompact,
              ]}
            >
              <View style={styles.focusBlockMessageHillBack} />
              <View style={styles.focusBlockMessageHillFront} />
              <Image
                source={getMiloImageSource(focusBlockMiloMood)}
                style={[
                  styles.focusBlockMiloImage,
                  compactFocusBlock && styles.focusBlockMiloImageCompact,
                ]}
                resizeMode="contain"
              />
              <View
                style={[
                  styles.focusBlockMiloMessage,
                  compactFocusBlock && styles.focusBlockMiloMessageCompact,
                ]}
              >
                <Text style={styles.focusBlockMiloMessageText}>
                  {focusBlockMiloMessage}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.focusBlockPrimaryButton,
                compactFocusBlock && styles.focusBlockPrimaryButtonCompact,
              ]}
              onPress={handleStartPause}
            >
              <View style={styles.focusBlockPrimaryIcon}>
                <Ionicons
                  name={isRunning ? 'pause' : 'play'}
                  size={22}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.focusBlockPrimaryButtonText}>
                {isRunning ? 'Pause' : currentMode === 'focus' ? 'Resume' : 'Start Break'}
              </Text>
            </TouchableOpacity>

            <View
              style={[
                styles.focusBlockSecondaryRow,
                compactFocusBlock && styles.focusBlockSecondaryRowCompact,
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.focusBlockSecondaryButton}
                onPress={handleStopFocusBlock}
              >
                <View style={styles.focusBlockSecondaryIconCircle}>
                  <Ionicons name="stop" size={18} color={theme.colors.danger} />
                </View>
                <Text style={styles.focusBlockSecondaryButtonText}>Stop</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.focusBlockSecondaryButton}
                onPress={handleResetFocusBlock}
              >
                <View style={styles.focusBlockSecondaryIconCircle}>
                  <Ionicons name="refresh" size={23} color={theme.colors.blue} />
                </View>
                <Text style={styles.focusBlockSecondaryButtonText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.focusBlockSecondaryButton}
                onPress={handleSkipFocusBlock}
              >
                <View style={styles.focusBlockSecondaryIconCircle}>
                  <Ionicons
                    name="play-skip-forward"
                    size={21}
                    color={theme.colors.purple}
                  />
                </View>
                <Text style={styles.focusBlockSecondaryButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(focusWarningText)}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.focusModalCard}>
            <View style={styles.modalAccentBar} />
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>Milo</Text>
            </View>
            <Text style={styles.modalTitle}>Clean focus reminder</Text>
            <Text style={styles.modalMessage}>{focusWarningText}</Text>

            <View style={styles.modalButtonStack}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.modalPrimaryButton}
                onPress={handleContinueFocus}
              >
                <Text style={styles.modalPrimaryButtonText}>Continue Focus</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(focusBlockCompletion)}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.focusModalCard}>
            <View style={styles.modalAccentBar} />
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>Pomodoro Cycle</Text>
            </View>
            <Text style={styles.modalTitle}>Focus block completed</Text>

            {focusBlockCompletion ? (
              <>
                <View style={styles.summaryRows}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Duration</Text>
                    <Text style={styles.summaryValue}>
                      {focusBlockCompletion.durationMinutes} min
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Task</Text>
                    <Text style={styles.summaryValue} numberOfLines={2}>
                      {focusBlockCompletion.taskTitle || 'Focus without task'}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Status</Text>
                    <View
                      style={[
                        styles.summaryStatusBadge,
                        focusBlockCompletion.wasDistracted &&
                          styles.summaryStatusBadgeDistracted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.summaryStatusText,
                          focusBlockCompletion.wasDistracted &&
                            styles.summaryStatusTextDistracted,
                        ]}
                      >
                        {focusBlockCompletion.wasDistracted
                          ? 'Distracted'
                          : 'Clean'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.summaryMiloBox}>
                  <Image
                    source={getMiloImageSource('celebrating')}
                    style={styles.summaryMiloImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.summaryMiloText}>
                    Great job! Focus block done. Ready for your break?
                  </Text>
                </View>
              </>
            ) : null}

            <View style={styles.modalButtonStack}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.modalPrimaryButton}
                onPress={handleStartBreakAfterFocusCompletion}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  {focusBlockCompletion?.nextBreakMode === 'longBreak'
                    ? 'Start Long Break'
                    : 'Start Short Break'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.modalSecondaryButton}
                onPress={handleEndSessionFromCycleModal}
              >
                <Text style={styles.modalSecondaryButtonText}>End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(breakCompletion)}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.focusModalCard}>
            <View style={styles.modalAccentBar} />
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>
                {breakCompletion?.breakMode === 'longBreak'
                  ? 'Long Break'
                  : 'Short Break'}
              </Text>
            </View>
            <Text style={styles.modalTitle}>
              {breakCompletion?.breakMode === 'longBreak'
                ? 'Long break completed'
                : 'Break completed'}
            </Text>

            <View style={styles.summaryMiloBox}>
              <Image
                source={getMiloImageSource('happy')}
                style={styles.summaryMiloImage}
                resizeMode="contain"
              />
              <Text style={styles.summaryMiloText}>
                {breakCompletion?.breakMode === 'longBreak'
                  ? 'Nice rest! Ready to continue with Milo?'
                  : 'Break is done. Ready for the next focus block?'}
              </Text>
            </View>

            <View style={styles.modalButtonStack}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.modalPrimaryButton}
                onPress={handleStartNextFocusAfterBreak}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  Start Next Focus
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.modalSecondaryButton}
                onPress={handleEndSessionFromCycleModal}
              >
                <Text style={styles.modalSecondaryButtonText}>End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(focusSummary)}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.focusModalCard}>
            <View style={styles.modalAccentBar} />
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>Session Summary</Text>
            </View>
            <Text style={styles.modalTitle}>Session Summary</Text>

            {focusSummary ? (
              <>
                <View style={styles.summaryRows}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total focus</Text>
                    <Text style={styles.summaryValue}>
                      {focusSummary.totalFocusMinutes} min
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Completed</Text>
                    <Text style={styles.summaryValue}>
                      {focusSummary.completedBlocks} blocks
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Skipped/stopped</Text>
                    <Text style={styles.summaryValue}>
                      {focusSummary.interruptedBlocks} blocks
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Task</Text>
                    <Text style={styles.summaryValue} numberOfLines={2}>
                      {focusSummary.taskTitle || 'Focus without task'}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Status</Text>
                    <View
                      style={[
                        styles.summaryStatusBadge,
                        focusSummary.wasDistracted &&
                          styles.summaryStatusBadgeDistracted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.summaryStatusText,
                          focusSummary.wasDistracted &&
                            styles.summaryStatusTextDistracted,
                        ]}
                      >
                        {focusSummary.wasDistracted ? 'Distracted' : 'Clean'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Preset used</Text>
                    <Text style={styles.summaryValue} numberOfLines={1}>
                      {focusSummary.presetName}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryMiloBox}>
                  <Image
                    source={getMiloImageSource('celebrating')}
                    style={styles.summaryMiloImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.summaryMiloText}>
                    {focusSummary.miloMessage}
                  </Text>
                </View>
              </>
            ) : null}

            <View style={styles.modalButtonStack}>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.modalPrimaryButton}
                onPress={handleDismissFocusSummary}
              >
                <Text style={styles.modalPrimaryButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={customEditorVisible}
        onRequestClose={handleCancelCustomEditor}
      >
        <KeyboardAvoidingView
          style={styles.timerEditorOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.timerEditorSheet}>
            <View style={styles.timerEditorHandle} />
            <View style={styles.timerEditorHeader}>
              <View>
                <Text style={styles.timerEditorLabel}>Custom Rhythm</Text>
                <Text style={styles.timerEditorTitle}>Edit timer</Text>
              </View>

              <View style={styles.timerEditorBadge}>
                <Ionicons name="timer" size={15} color={theme.colors.primaryDark} />
                <Text style={styles.timerEditorBadgeText}>1-120 min</Text>
              </View>
            </View>

            <View style={styles.timerEditorFields}>
              {CUSTOM_TIMER_FIELD_ORDER.map((field) => {
                const meta = CUSTOM_TIMER_FIELD_META[field];
                const value = customDraftTexts[field];

                return (
                  <View key={field} style={styles.timerEditorField}>
                    <View style={styles.timerEditorFieldTopRow}>
                      <View>
                        <Text style={styles.timerEditorFieldLabel}>
                          {meta.label}
                        </Text>
                        <Text style={styles.timerEditorFieldHint}>
                          {meta.min}-{meta.max} {meta.unit}
                        </Text>
                      </View>

                      <View style={styles.timerEditorInputWrap}>
                        <TextInput
                          value={value}
                          onChangeText={(nextValue) =>
                            handleChangeCustomDraftText(field, nextValue)
                          }
                          keyboardType="number-pad"
                          placeholder={String(customSettings[field])}
                          placeholderTextColor={theme.colors.muted}
                          selectTextOnFocus
                          maxLength={3}
                          style={styles.timerEditorInput}
                        />
                        <Text style={styles.timerEditorInputUnit}>
                          {meta.unit}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.timerEditorAdjustRow}>
                      {[-5, -1, 1, 5].map((delta) => (
                        <TouchableOpacity
                          key={`${field}-${delta}`}
                          activeOpacity={0.82}
                          style={styles.timerEditorAdjustButton}
                          onPress={() => handleAdjustCustomDraftValue(field, delta)}
                        >
                          <Text style={styles.timerEditorAdjustText}>
                            {delta > 0 ? `+${delta}` : delta}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.timerEditorActionRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.timerEditorCancelButton}
                onPress={handleCancelCustomEditor}
              >
                <Text style={styles.timerEditorCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.timerEditorSaveButton}
                onPress={handleSaveCustomEditor}
              >
                <Text style={styles.timerEditorSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={presetManagerVisible}
        onRequestClose={handleCancelPresetManager}
      >
        <KeyboardAvoidingView
          style={styles.timerEditorOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.timerEditorSheet}>
            <View style={styles.timerEditorHandle} />
            <View style={styles.timerEditorHeader}>
              <View>
                <Text style={styles.timerEditorLabel}>Manage Presets</Text>
                <Text style={styles.timerEditorTitle}>Save a rhythm</Text>
              </View>

              <View style={styles.timerEditorBadge}>
                <Ionicons
                  name="options-outline"
                  size={15}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.timerEditorBadgeText}>Local</Text>
              </View>
            </View>

            <View style={styles.presetNameField}>
              <Text style={styles.timerEditorFieldLabel}>Preset name</Text>
              <TextInput
                value={presetDraftName}
                onChangeText={setPresetDraftName}
                placeholder="Lock In"
                placeholderTextColor={theme.colors.muted}
                maxLength={24}
                style={styles.presetNameInput}
              />
              <Text style={styles.presetManagerHint}>
                Saved presets appear between Deep Focus and Custom.
              </Text>
            </View>

            <View style={styles.timerEditorFields}>
              {CUSTOM_TIMER_FIELD_ORDER.map((field) => {
                const meta = CUSTOM_TIMER_FIELD_META[field];
                const value = presetDraftTexts[field];

                return (
                  <View key={field} style={styles.timerEditorField}>
                    <View style={styles.timerEditorFieldTopRow}>
                      <View>
                        <Text style={styles.timerEditorFieldLabel}>
                          {meta.label}
                        </Text>
                        <Text style={styles.timerEditorFieldHint}>
                          {meta.min}-{meta.max} {meta.unit}
                        </Text>
                      </View>

                      <View style={styles.timerEditorInputWrap}>
                        <TextInput
                          value={value}
                          onChangeText={(nextValue) =>
                            handleChangePresetDraftText(field, nextValue)
                          }
                          keyboardType="number-pad"
                          placeholder={String(timerSettings[field])}
                          placeholderTextColor={theme.colors.muted}
                          selectTextOnFocus
                          maxLength={3}
                          style={styles.timerEditorInput}
                        />
                        <Text style={styles.timerEditorInputUnit}>
                          {meta.unit}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.timerEditorAdjustRow}>
                      {[-5, -1, 1, 5].map((delta) => (
                        <TouchableOpacity
                          key={`${field}-${delta}`}
                          activeOpacity={0.82}
                          style={styles.timerEditorAdjustButton}
                          onPress={() => handleAdjustPresetDraftValue(field, delta)}
                        >
                          <Text style={styles.timerEditorAdjustText}>
                            {delta > 0 ? `+${delta}` : delta}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>

            {savedPresets.length > 0 ? (
              <View style={styles.savedPresetList}>
                {savedPresets.map((preset) => (
                  <View key={preset.id} style={styles.savedPresetRow}>
                    <View style={styles.savedPresetInfo}>
                      <Text style={styles.savedPresetName} numberOfLines={1}>
                        {preset.name}
                      </Text>
                      <Text style={styles.savedPresetSummary}>
                        {preset.settings.focusMinutes} /{' '}
                        {preset.settings.shortBreakMinutes} /{' '}
                        {preset.settings.longBreakMinutes}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.timerEditorActionRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.timerEditorCancelButton}
                onPress={handleCancelPresetManager}
              >
                <Text style={styles.timerEditorCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.timerEditorSaveButton}
                onPress={handleSaveManagedPreset}
              >
                <Text style={styles.timerEditorSaveText}>Save preset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            activeOpacity={0.78}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              }
            }}
          >
            <Ionicons name="arrow-back" size={23} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.screenHeader}>Milo Focus Mode</Text>
        </View>

        <LinearGradient
          colors={focusHeroGradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroHillBack} />
          <View style={styles.heroHillFront} />
          <View style={styles.heroSparkleOne} />
          <View style={styles.heroSparkleTwo} />

          <Image
            source={getMiloImageSource('waving')}
            style={styles.miloImage}
            resizeMode="contain"
          />

          <View style={styles.heroTextArea}>
            <Text style={styles.heroLabel}>Milo Focus Mode</Text>
            <Text style={styles.heroTitle}>Pomodoro timer</Text>
            <Text style={styles.heroSubtitle}>
              Focus for {timerSettings.focusMinutes} minutes, then let Milo guide the right
              break.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.analyticsRow}>
          <View style={styles.analyticsCard}>
            <View style={styles.analyticsTopRow}>
              <View
                style={[
                  styles.analyticsIconBubble,
                  { backgroundColor: theme.colors.primarySoft },
                ]}
              >
                <Ionicons
                  name="cube-outline"
                  size={20}
                  color={theme.colors.primaryDark}
                />
              </View>
              <Text style={styles.analyticsNumber}>{completedFocusCount}</Text>
            </View>
            <Text style={styles.analyticsLabel}>Focus Blocks</Text>
          </View>

          <View style={styles.analyticsCard}>
            <View style={styles.analyticsTopRow}>
              <View
                style={[
                  styles.analyticsIconBubble,
                  { backgroundColor: theme.colors.blueSoft },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={theme.colors.blue}
                />
              </View>
              <Text style={[styles.analyticsNumber, { color: theme.colors.blue }]}>
                {todayFocusMinutes}
              </Text>
            </View>
            <Text style={styles.analyticsLabel}>Focus Minutes</Text>
          </View>

          <View style={[styles.analyticsCard, styles.analyticsCardLast]}>
            <View style={styles.analyticsTopRow}>
              <View
                style={[
                  styles.analyticsIconBubble,
                  { backgroundColor: theme.colors.purpleSoft },
                ]}
              >
                <Ionicons
                  name="pie-chart-outline"
                  size={20}
                  color={theme.colors.purple}
                />
              </View>
              <Text style={[styles.analyticsNumber, { color: theme.colors.purple }]}>
                {totalFocusMinutes}
              </Text>
            </View>
            <Text style={styles.analyticsLabel}>Total Minutes</Text>
          </View>
        </View>

        <View style={styles.presetCard}>
          <View style={styles.presetHeaderRow}>
            <View style={styles.presetTitleWrap}>
              <Ionicons name="sparkles" size={15} color={theme.colors.primaryDark} />
              <Text style={styles.presetTitle}>Timer Preset</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.managePresetsPill}
              onPress={handleOpenPresetManager}
            >
              <Ionicons name="options-outline" size={15} color={theme.colors.primaryDark} />
              <Text style={styles.managePresetsText}>Manage presets</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presetCarousel}
            contentContainerStyle={styles.presetCarouselContent}
          >
            {presetOptions.map((presetOption) => (
              <PresetButton
                key={presetOption.id}
                preset={presetOption}
                selected={selectedPreset === presetOption.id}
                onPress={() => handleSelectPreset(presetOption.id)}
              />
            ))}
          </ScrollView>

          <View style={styles.presetDotsRow}>
            {presetOptions.map((presetOption) => (
              <View
                key={presetOption.id}
                style={[
                  styles.presetDot,
                  selectedPreset === presetOption.id && styles.presetDotActive,
                ]}
              />
            ))}
          </View>

          <View
            style={[
              styles.presetDetailCard,
              selectedPreset === 'custom' && styles.presetDetailCardCustom,
            ]}
          >
            <View style={styles.presetDetailTitleRow}>
              <View
                style={[
                  styles.detailIconBubble,
                  { backgroundColor: activePresetVisual.softColor },
                ]}
              >
                <Ionicons
                  name={activePresetVisual.icon}
                  size={28}
                  color={activePresetVisual.color}
                />
              </View>

              <Text style={styles.presetDetailTitle}>
                {selectedPresetDisplayName}
              </Text>
            </View>

            <View style={styles.presetDetailValueRow}>
              {presetDetailValueItems.map((item, index) => (
                <React.Fragment key={item.label}>
                  {index > 0 ? <View style={styles.presetValueSeparator} /> : null}
                  <View style={styles.presetDetailValueItem}>
                    <View style={styles.presetDetailValueLabelRow}>
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={18}
                        color={theme.colors.primaryDark}
                      />
                      <Text style={styles.presetDetailValueLabel}>
                        {item.label}
                      </Text>
                    </View>

                    <Text
                      style={styles.presetDetailValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.86}
                    >
                      {item.value}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </View>

            <View style={styles.presetDetailCycleRow}>
              <Ionicons
                name="sync-outline"
                size={16}
                color={theme.colors.primaryDark}
              />
              <Text style={styles.presetDetailCycle}>
                {selectedPresetCycleText}
              </Text>
            </View>

            <View style={styles.presetDetailNoteBox}>
              <View style={styles.noteIconBubble}>
                <Ionicons
                  name={activePresetVisual.icon}
                  size={18}
                  color={activePresetVisual.color}
                />
              </View>
              <Text style={styles.presetDetailNote}>
                {selectedPresetDetailNote}
              </Text>
            </View>

            <View style={styles.realTimeTimerNoteBox}>
              <Ionicons
                name="time-outline"
                size={15}
                color={theme.colors.primaryDark}
              />
              <Text style={styles.realTimeTimerNoteText}>
                Pomodoro uses real time, so the timer keeps running even if you
                leave the app.
              </Text>
            </View>
          </View>

          {selectedPreset === 'custom' ? (
            <View style={styles.customDetailActionRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.customEditButton}
                onPress={handleOpenCustomEditor}
              >
                <Ionicons
                  name="pencil-outline"
                  size={18}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.customEditButtonText}>Edit Timer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.customStartButton}
                onPress={handleStartFocusFromPresetDetails}
              >
                <View style={styles.startIconBubble}>
                  <Ionicons name="play" size={16} color={theme.colors.primary} />
                </View>
                <Text style={styles.customStartButtonText}>Start Focus</Text>
              </TouchableOpacity>
            </View>
          ) : activePreset.isSaved ? (
            <View style={styles.customDetailActionRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.deletePresetButton}
                onPress={handleDeleteSelectedSavedPreset}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={theme.colors.danger}
                />
                <Text style={styles.deletePresetButtonText}>Delete Preset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.customStartButton}
                onPress={handleStartFocusFromPresetDetails}
              >
                <View style={styles.startIconBubble}>
                  <Ionicons name="play" size={16} color={theme.colors.primary} />
                </View>
                <Text style={styles.customStartButtonText}>Start Focus</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.startFocusButton}
              onPress={handleStartFocusFromPresetDetails}
            >
              <View style={styles.startIconBubble}>
                <Ionicons name="play" size={16} color={theme.colors.primary} />
              </View>
              <Text style={styles.startFocusButtonText}>Start Focus</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 26 : 12,
  },
  headerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginRight: 25,
  },
  screenHeader: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  heroCard: {
    minHeight: 142,
    borderRadius: 18,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 15,
    marginBottom: 17,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  heroHillBack: {
    position: 'absolute',
    left: -16,
    right: -18,
    bottom: -30,
    height: 62,
    borderTopLeftRadius: 90,
    borderTopRightRadius: 120,
    backgroundColor: theme.colors.primarySoft,
    opacity: 0.72,
  },
  heroHillFront: {
    position: 'absolute',
    left: 96,
    right: -36,
    bottom: -22,
    height: 46,
    borderTopLeftRadius: 100,
    borderTopRightRadius: 80,
    backgroundColor: theme.colors.cardSoft,
    opacity: 0.72,
  },
  heroSparkleOne: {
    position: 'absolute',
    left: 26,
    top: 29,
    width: 10,
    height: 7,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    transform: [{ rotate: '-18deg' }],
  },
  heroSparkleTwo: {
    position: 'absolute',
    left: 128,
    top: 39,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textSoft,
  },
  heroTextArea: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 2,
  },
  heroLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 5,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroSubtitle: {
    marginTop: 8,
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 21,
  },
  miloImage: {
    width: 150,
    height: 150,
    marginLeft: -14,
    marginBottom: -9,
  },
  analyticsRow: {
    flexDirection: 'row',
    marginBottom: 17,
  },
  analyticsCard: {
    flex: 1,
    minHeight: 73,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  analyticsCardLast: {
    marginRight: 0,
  },
  analyticsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  analyticsNumber: {
    color: theme.colors.primaryDark,
    fontSize: 25,
    fontWeight: '900',
  },
  analyticsLabel: {
    marginTop: 3,
    color: theme.colors.muted,
    fontWeight: '800',
    fontSize: 10,
    textAlign: 'center',
  },
  presetCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    paddingVertical: 15,
    paddingHorizontal: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  presetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  presetTitle: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
  },
  presetDescription: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  managePresetsPill: {
    minHeight: 32,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
  },
  managePresetsText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 11,
  },
  presetSummaryBadge: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetSummaryBadgeText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  presetCarousel: {
    marginTop: 14,
    marginHorizontal: -1,
  },
  presetCarouselContent: {
    paddingHorizontal: 1,
    paddingTop: 12,
    paddingBottom: 9,
  },
  presetChoiceAnimated: {
    marginRight: 12,
  },
  presetChoiceCard: {
    width: 95,
    minHeight: 122,
    borderRadius: 13,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 10,
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  presetChoiceCardActive: {
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
  },
  presetIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  presetCheckBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    zIndex: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetChoiceLabel: {
    minHeight: 34,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
    lineHeight: 17,
    textAlign: 'center',
  },
  presetChoiceSummary: {
    marginTop: 5,
    color: theme.colors.muted,
    fontWeight: '900',
    fontSize: 11,
    textAlign: 'center',
  },
  presetDotsRow: {
    height: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -1,
    marginBottom: 10,
  },
  presetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D8DEE6',
    marginHorizontal: 3,
  },
  presetDotActive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: theme.colors.primaryDark,
  },
  presetDetailCard: {
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 15,
    paddingVertical: 15,
    ...theme.shadowSoft,
  },
  presetDetailCardCustom: {
    borderColor: `${theme.colors.warning}45`,
    backgroundColor: theme.colors.cardSoft,
  },
  presetDetailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetDetailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIconBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  presetDetailLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 11,
  },
  presetDetailTitle: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 22,
    lineHeight: 28,
  },
  presetDetailMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 11,
    paddingLeft: 62,
  },
  presetDetailMetric: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 17,
  },
  presetDetailMetricNumber: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 13,
  },
  presetDetailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 1,
  },
  presetDetailValueItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetDetailValueLabelRow: {
    width: '100%',
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetDetailValueLabel: {
    marginLeft: 5,
    color: theme.colors.textSoft,
    fontWeight: '800',
    fontSize: 11.5,
  },
  presetDetailValue: {
    width: '100%',
    marginTop: 5,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'center',
  },
  presetValueSeparator: {
    width: 1,
    height: 44,
    backgroundColor: theme.colors.divider,
    marginHorizontal: 5,
  },
  metricSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
    marginHorizontal: 7,
  },
  presetDetailNote: {
    flex: 1,
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 16,
  },
  presetDetailCycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingLeft: 66,
  },
  presetDetailCycle: {
    marginLeft: 8,
    color: theme.colors.textSoft,
    fontWeight: '800',
    fontSize: 11.5,
  },
  presetDetailNoteBox: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  realTimeTimerNoteBox: {
    borderRadius: 13,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  realTimeTimerNoteText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 7,
    color: theme.colors.textSoft,
    fontWeight: '800',
    fontSize: 10.5,
    lineHeight: 15,
  },
  noteIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  customValuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    marginHorizontal: -3,
  },
  customValuePill: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginHorizontal: 3,
    marginBottom: 7,
  },
  customValueText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
    fontSize: 12,
  },
  customDetailActionRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  customEditButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    flexDirection: 'row',
  },
  customEditButtonText: {
    marginLeft: 8,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 15,
  },
  deletePresetButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: `${theme.colors.danger}45`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    flexDirection: 'row',
  },
  deletePresetButtonText: {
    marginLeft: 8,
    color: theme.colors.danger,
    fontWeight: '900',
    fontSize: 14,
  },
  customStartButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  customStartButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  startFocusButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 14,
  },
  startIconBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  startFocusButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  timerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  focusBlockOverlayScroll: {
    flex: 1,
    backgroundColor: 'rgba(18, 25, 31, 0.68)',
  },
  focusBlockOverlay: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  focusBlockCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 30,
    backgroundColor: theme.colors.card,
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.primarySoft,
    overflow: 'hidden',
    ...theme.shadow,
  },
  focusBlockCardCompact: {
    maxWidth: 316,
    borderRadius: 26,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  focusModalLeafOne: {
    position: 'absolute',
    left: 32,
    top: 96,
    width: 12,
    height: 7,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    transform: [{ rotate: '-22deg' }],
  },
  focusModalLeafTwo: {
    position: 'absolute',
    right: 38,
    top: 80,
    width: 11,
    height: 7,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    transform: [{ rotate: '-38deg' }],
  },
  focusModalLeafThree: {
    position: 'absolute',
    right: 40,
    top: 248,
    width: 13,
    height: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    transform: [{ rotate: '-24deg' }],
  },
  focusBlockStatusPill: {
    alignSelf: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  focusBlockStatusText: {
    marginLeft: 8,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 14,
  },
  focusBlockMiloImage: {
    position: 'absolute',
    left: 17,
    bottom: -4,
    width: 106,
    height: 106,
    zIndex: 2,
  },
  focusBlockTimer: {
    marginTop: 17,
    color: theme.colors.primary,
    fontSize: 58,
    fontWeight: '900',
    textAlign: 'center',
  },
  focusBlockTimerCompact: {
    marginTop: 12,
    fontSize: 48,
  },
  focusBlockPresetIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
  },
  focusBlockPresetIconCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginTop: 6,
  },
  focusBlockPresetName: {
    marginTop: 7,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 22,
    textAlign: 'center',
  },
  focusBlockPresetNameCompact: {
    marginTop: 5,
    fontSize: 19,
  },
  focusBlockTaskChip: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    marginTop: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  focusBlockTaskText: {
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 7,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
  },
  focusBlockCycleArea: {
    marginTop: 14,
  },
  focusBlockCycleText: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 15,
    textAlign: 'center',
  },
  focusBlockDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  focusBlockDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.border,
    marginHorizontal: 3,
  },
  focusBlockDotActive: {
    backgroundColor: theme.colors.primaryDark,
  },
  focusBlockMessageStage: {
    height: 108,
    marginHorizontal: -18,
    marginTop: 9,
    overflow: 'hidden',
  },
  focusBlockMessageStageCompact: {
    height: 92,
    marginHorizontal: -16,
    marginTop: 7,
  },
  focusBlockMessageHillBack: {
    position: 'absolute',
    left: -20,
    right: -20,
    bottom: -22,
    height: 62,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
    backgroundColor: theme.colors.primarySoft,
  },
  focusBlockMessageHillFront: {
    position: 'absolute',
    left: 78,
    right: -38,
    bottom: -16,
    height: 48,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 90,
    backgroundColor: theme.colors.cardSoft,
  },
  focusBlockMiloMessage: {
    position: 'absolute',
    right: 31,
    bottom: 20,
    width: 139,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}35`,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    zIndex: 3,
  },
  focusBlockMiloImageCompact: {
    left: 14,
    width: 92,
    height: 92,
  },
  focusBlockMiloMessageCompact: {
    right: 19,
    bottom: 18,
    width: 132,
    minHeight: 50,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  focusBlockMiloMessageText: {
    color: theme.colors.textSoft,
    fontWeight: '800',
    lineHeight: 18,
    fontSize: 12,
  },
  focusBlockPrimaryButton: {
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 14,
  },
  focusBlockPrimaryButtonCompact: {
    height: 52,
    marginTop: 10,
  },
  focusBlockPrimaryIcon: {
    width: 33,
    height: 33,
    borderRadius: 16.5,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },
  focusBlockPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },
  focusBlockSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  focusBlockSecondaryRowCompact: {
    marginTop: 12,
  },
  focusBlockSecondaryButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusBlockSecondaryIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  focusBlockSecondaryButtonText: {
    marginTop: 9,
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
  timerEditorOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  timerEditorSheet: {
    width: '100%',
    maxWidth: 430,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  timerEditorHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border,
    marginBottom: 14,
  },
  timerEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timerEditorLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  timerEditorTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 20,
  },
  timerEditorBadge: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerEditorBadgeText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 11,
  },
  timerEditorFields: {
    marginTop: 2,
  },
  presetNameField: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 11,
    marginBottom: 10,
  },
  presetNameInput: {
    height: 42,
    marginTop: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  presetManagerHint: {
    marginTop: 7,
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  savedPresetList: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    padding: 10,
    marginBottom: 12,
  },
  savedPresetRow: {
    minHeight: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingLeft: 10,
    paddingRight: 6,
    marginBottom: 7,
  },
  savedPresetInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  savedPresetName: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 12,
  },
  savedPresetSummary: {
    marginTop: 3,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 11,
  },
  timerEditorField: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 11,
    marginBottom: 10,
  },
  timerEditorFieldTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerEditorFieldLabel: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
  },
  timerEditorFieldHint: {
    marginTop: 3,
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  timerEditorInputWrap: {
    width: 126,
    height: 42,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  timerEditorInput: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 17,
    paddingVertical: 0,
    textAlign: 'center',
  },
  timerEditorInputUnit: {
    color: theme.colors.muted,
    fontWeight: '800',
    fontSize: 11,
    minWidth: 38,
    textAlign: 'right',
  },
  timerEditorAdjustRow: {
    flexDirection: 'row',
    marginTop: 9,
  },
  timerEditorAdjustButton: {
    flex: 1,
    height: 34,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  timerEditorAdjustText: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  timerEditorActionRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  timerEditorCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  timerEditorCancelText: {
    color: theme.colors.textSoft,
    fontWeight: '900',
    fontSize: 14,
  },
  timerEditorSaveButton: {
    flex: 1,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerEditorSaveText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  focusModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.card,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.colors.primarySoft,
    ...theme.shadow,
  },
  taskPickerModalCard: {
    maxHeight: '82%',
  },
  modalAccentBar: {
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    marginBottom: 16,
  },
  modalBadge: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  modalBadgeText: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  modalMessage: {
    color: theme.colors.textSoft,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  modalButtonStack: {
    marginTop: 18,
  },
  modalPrimaryButton: {
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  modalSecondaryButton: {
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  modalSecondaryButtonText: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 14,
  },
  taskPickerList: {
    maxHeight: 248,
    marginTop: 14,
    flexShrink: 1,
  },
  taskPickerListContent: {
    paddingBottom: 4,
  },
  taskPickerItem: {
    minHeight: 66,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
  },
  taskPickerIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  taskPickerTextArea: {
    flex: 1,
  },
  taskPickerTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 14,
    lineHeight: 18,
  },
  taskPickerMeta: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  emptyTaskPickerState: {
    minHeight: 92,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  emptyTaskPickerText: {
    marginTop: 8,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    textAlign: 'center',
  },
  summaryRows: {
    marginTop: 8,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  summaryRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: theme.colors.muted,
    fontWeight: '900',
    fontSize: 12,
    marginRight: 12,
  },
  summaryValue: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'right',
  },
  summaryStatusBadge: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryStatusBadgeDistracted: {
    backgroundColor: theme.colors.yellowSoft,
  },
  summaryStatusText: {
    color: theme.colors.success,
    fontWeight: '900',
    fontSize: 12,
  },
  summaryStatusTextDistracted: {
    color: theme.colors.textSoft,
  },
  summaryMiloBox: {
    marginTop: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryMiloImage: {
    width: 58,
    height: 58,
    marginRight: 10,
  },
  summaryMiloText: {
    flex: 1,
    color: theme.colors.primaryDark,
    fontWeight: '800',
    lineHeight: 19,
  },
  sectionHeaderBlock: {
    marginBottom: 13,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionHelperText: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '700',
    lineHeight: 18,
  },
  modeRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  modeButton: {
    flex: 1,
    minHeight: 66,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  modeLabel: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
  },
  modeLabelActive: {
    color: '#FFFFFF',
  },
  modeMinutes: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '800',
    fontSize: 11,
  },
  modeMinutesActive: {
    color: '#FFFFFF',
  },
  cycleCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  cycleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cycleLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  cycleTitle: {
    marginTop: 4,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 18,
  },
  breakSuggestionBadge: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakSuggestionText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 11,
  },
  cycleDotsRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  cycleDot: {
    flex: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    marginRight: 7,
  },
  cycleDotActive: {
    backgroundColor: theme.colors.primary,
  },
  miloMessageCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  messageMiloImage: {
    width: 76,
    height: 76,
    marginRight: 12,
  },
  messageTextArea: {
    flex: 1,
  },
  messageTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 15,
  },
  messageText: {
    marginTop: 5,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 20,
  },
  suggestedTaskCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  suggestedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestedIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  suggestedTextArea: {
    flex: 1,
  },
  suggestedLabel: {
    color: theme.colors.purple,
    fontWeight: '900',
    fontSize: 12,
  },
  suggestedTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  suggestedSubtitle: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 18,
  },
  openTaskButton: {
    marginTop: 15,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  openTaskButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginRight: 8,
  },
  tipsCard: {
    backgroundColor: theme.colors.yellowSoft,
    borderRadius: theme.radius.lg,
    padding: 16,
  },
  tipsTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 9,
  },
  tipText: {
    flex: 1,
    marginLeft: 8,
    color: theme.colors.textSoft,
    fontWeight: '700',
    lineHeight: 19,
  },
});
