import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AppState,
  type AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';
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

type PomodoroPresetId = 'classic' | 'quick' | 'deep' | 'custom';

type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
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
  savedAt: number;
};

type CompleteModeOptions = {
  mode?: PomodoroMode;
  settings?: PomodoroSettings;
  completedFocusCount?: number;
  cycleFocusCount?: number;
  startedAt?: number | null;
  playFeedback?: boolean;
  showAlert?: boolean;
};

type FocusSessionSummary = {
  durationMinutes: number;
  taskTitle: string | null;
  wasDistracted: boolean;
  miloMessage: string;
};

const CLASSIC_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
};

const POMODORO_PRESETS: Record<
  PomodoroPresetId,
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
const pomodoroPresetOrder: PomodoroPresetId[] = [
  'classic',
  'quick',
  'deep',
  'custom',
];

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

function isPomodoroPresetId(value: unknown): value is PomodoroPresetId {
  return (
    typeof value === 'string' &&
    pomodoroPresetOrder.includes(value as PomodoroPresetId)
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

function getModeMinutes(mode: PomodoroMode, settings: PomodoroSettings) {
  if (mode === 'focus') return settings.focusMinutes;
  if (mode === 'shortBreak') return settings.shortBreakMinutes;
  return settings.longBreakMinutes;
}

function getModeSeconds(mode: PomodoroMode, settings: PomodoroSettings) {
  return getModeMinutes(mode, settings) * 60;
}

function getSuggestedBreakMode(
  completedFocusCount: number,
  longBreakInterval: number
): PomodoroMode {
  return completedFocusCount > 0 && completedFocusCount % longBreakInterval === 0
    ? 'longBreak'
    : 'shortBreak';
}

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`;
}

function formatAwayDuration(awayMs: number) {
  const totalSeconds = Math.max(0, Math.floor(awayMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
  const secondLabel = seconds === 1 ? 'second' : 'seconds';

  return `${minutes} ${minuteLabel} ${seconds} ${secondLabel}`;
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

function getFocusTaskMetaText(task: Task) {
  const typeText = formatTitleCase(task.plannerType);
  const priorityText = `${formatTitleCase(task.priority)} priority`;
  const dueText = [task.dueDate, task.dueTime].filter(Boolean).join(' ');

  return dueText
    ? `${typeText} - ${priorityText} - ${dueText}`
    : `${typeText} - ${priorityText}`;
}

function getFocusSummaryMiloMessage(
  wasDistracted: boolean,
  taskTitle: string | null
) {
  if (wasDistracted && taskTitle) {
    return `You came back and finished ${taskTitle}. Lets aim for a cleaner focus next time.`;
  }

  if (wasDistracted) {
    return 'You came back and finished. Lets aim for a cleaner focus next time.';
  }

  if (taskTitle) {
    return `Great job! You completed a clean focus session for ${taskTitle}.`;
  }

  return 'Great job! You completed a clean focus session.';
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
  presetId,
  selected,
  onPress,
}: {
  presetId: PomodoroPresetId;
  selected: boolean;
  onPress: () => void;
}) {
  const preset = POMODORO_PRESETS[presetId];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.presetButton, selected && styles.presetButtonActive]}
    >
      <Text style={[styles.presetButtonLabel, selected && styles.presetButtonLabelActive]}>
        {preset.label}
      </Text>
      <Text
        style={[styles.presetButtonSummary, selected && styles.presetButtonSummaryActive]}
      >
        {preset.summary}
      </Text>
    </TouchableOpacity>
  );
}

function CustomNumberControl({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={styles.customControlRow}>
      <View style={styles.customControlTextArea}>
        <Text style={styles.customControlLabel}>{label}</Text>
        <Text style={styles.customControlHint}>
          {min}-{max} {unit}
        </Text>
      </View>

      <View style={styles.stepper}>
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={!canDecrease}
          style={[styles.stepperButton, !canDecrease && styles.stepperButtonDisabled]}
          onPress={() => onChange(value - 1)}
        >
          <Ionicons
            name="remove"
            size={18}
            color={canDecrease ? theme.colors.primaryDark : theme.colors.muted}
          />
        </TouchableOpacity>

        <Text style={styles.stepperValue}>
          {value}
          <Text style={styles.stepperUnit}> {unit}</Text>
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          disabled={!canIncrease}
          style={[styles.stepperButton, !canIncrease && styles.stepperButtonDisabled]}
          onPress={() => onChange(value + 1)}
        >
          <Ionicons
            name="add"
            size={18}
            color={canIncrease ? theme.colors.primaryDark : theme.colors.muted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function FocusSessionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
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
  const [hasRestoredPomodoroState, setHasRestoredPomodoroState] =
    useState(false);

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
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const completionHandledRef = useRef(false);

  const activePreset = POMODORO_PRESETS[selectedPreset];
  const timerSettings =
    selectedPreset === 'custom' ? customSettings : activePreset.settings;
  const currentModeConfig = MODE_META[currentMode];
  const totalSeconds = getModeSeconds(currentMode, timerSettings);
  const todayDate = getTodayDate();

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
  const selectedPresetSummary = `${timerSettings.focusMinutes}/${timerSettings.shortBreakMinutes}/${timerSettings.longBreakMinutes}`;
  const selectedPresetHelper =
    selectedPreset === 'custom'
      ? `Custom set to ${selectedPresetSummary} minutes, with a long break every ${timerSettings.longBreakInterval} focus blocks.`
      : activePreset.helperText;

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
    return tasks
      .filter((task) => task.status !== 'completed')
      .sort((a, b) => {
        const dueDifference = getTaskDueSortTime(a) - getTaskDueSortTime(b);
        if (dueDifference !== 0) return dueDifference;

        return a.createdAt.localeCompare(b.createdAt);
      });
  }, [tasks]);

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

  const resetTimerForMode = useCallback(
    (mode: PomodoroMode, settings: PomodoroSettings = timerSettingsRef.current) => {
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
    },
    []
  );

  const changeMode = useCallback(
    (mode: PomodoroMode, settings: PomodoroSettings = timerSettingsRef.current) => {
      currentModeRef.current = mode;
      setCurrentMode(mode);
      resetTimerForMode(mode, settings);
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
    const shouldShowAlert = options.showAlert !== false;

    if (options.playFeedback !== false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      const suggestedBreakMode =
        nextCycleFocusCount >= settings.longBreakInterval
          ? 'longBreak'
          : 'shortBreak';
      const suggestedBreak = MODE_META[suggestedBreakMode];
      const completedWasDistracted = wasDistractedRef.current;
      const completedTaskTitle =
        selectedFocusTaskTitleRef.current?.trim() || null;
      const summary: FocusSessionSummary = {
        durationMinutes: settings.focusMinutes,
        taskTitle: completedTaskTitle,
        wasDistracted: completedWasDistracted,
        miloMessage: getFocusSummaryMiloMessage(
          completedWasDistracted,
          completedTaskTitle
        ),
      };

      await logFocusSessionOnce(settings.focusMinutes, sessionStartedAt);
      updateCompletedFocusCount(loggedCompletedFocusCount);
      updateCycleFocusCount(nextCycleFocusCount, settings);
      startedAtRef.current = null;
      wasDistractedRef.current = false;
      setWasDistracted(false);
      setFocusWarningText(null);
      changeMode(suggestedBreakMode, settings);
      Speech.speak(
        `Focus session completed. Great work. Milo suggests a ${suggestedBreak.label}.`,
        {
          rate: 0.95,
          pitch: 1.08,
        }
      );

      if (shouldShowAlert) {
        setFocusSummary(summary);
      }

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
      });
      return;
    }

    if (completedMode === 'longBreak') {
      updateCycleFocusCount(0, settings);
    }

    startedAtRef.current = null;
    changeMode('focus', settings);

    Speech.speak('Break completed. Milo is ready for the next focus block.', {
      rate: 0.95,
      pitch: 1.08,
    });

    if (shouldShowAlert) {
      Alert.alert(
        'Break complete',
        'Nice reset. Milo is ready when you want to start another focus block.'
      );
    }

    await persistPomodoroState({
      currentMode: 'focus',
      isRunning: false,
      endTimestamp: null,
      startedAt: null,
      cycleProgressCount: completedMode === 'longBreak' ? 0 : cycleFocusCountRef.current,
      remainingMs: getModeSeconds('focus', settings) * 1000,
      focusLeftAt: null,
    });
  }, [
    changeMode,
    logFocusSessionOnce,
    persistPomodoroState,
    updateCompletedFocusCount,
    updateCycleFocusCount,
  ]);

  const syncRunningTimer = useCallback(async () => {
    if (!isRunningRef.current || !endTimestampRef.current) return;

    const nextRemainingMs = Math.max(endTimestampRef.current - Date.now(), 0);
    remainingMsRef.current = nextRemainingMs;
    setRemainingSeconds(Math.ceil(nextRemainingMs / 1000));

    if (nextRemainingMs === 0) {
      await completeCurrentMode();
    }
  }, [completeCurrentMode]);

  const handleReturnToApp = useCallback(() => {
    const now = Date.now();
    const focusLeftAt = focusLeftAtRef.current;

    if (isRunningRef.current && currentModeRef.current === 'focus' && focusLeftAt) {
      const awayMs = now - focusLeftAt;

      if (awayMs > DISTRACTION_THRESHOLD_MS) {
        wasDistractedRef.current = true;
        setWasDistracted(true);
        setFocusWarningText(
          `Milo noticed you left Focus Mode for ${formatAwayDuration(
            awayMs
          )}. Lets continue clean focus.`
        );
      }

      focusLeftAtRef.current = null;
      persistPomodoroState({
        focusLeftAt: null,
        wasDistracted: wasDistractedRef.current,
      });
    }

    syncRunningTimer();
  }, [persistPomodoroState, syncRunningTimer]);

  useEffect(() => {
    let isMounted = true;

    const restorePomodoroState = async () => {
      try {
        const storedState = await AsyncStorage.getItem(POMODORO_SESSION_STORAGE_KEY);

        if (!isMounted) return;

        if (!storedState) {
          setHasRestoredPomodoroState(true);
          return;
        }

        const parsed = JSON.parse(storedState) as unknown;
        const stored = isRecord(parsed) ? parsed : {};
        const restoredPreset = isPomodoroPresetId(stored.selectedPreset)
          ? stored.selectedPreset
          : 'classic';
        const restoredCustomSettings = sanitizePomodoroSettings(
          stored.customSettings
        );
        const restoredSettings =
          restoredPreset === 'custom'
            ? restoredCustomSettings
            : POMODORO_PRESETS[restoredPreset].settings;
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
        const restoredCycleProgressCount = Math.round(
          clampNumber(
            getFiniteNumber(stored.cycleProgressCount, 0),
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

        setSelectedPreset(restoredPreset);
        setCustomSettings(restoredCustomSettings);
        setCurrentMode(restoredMode);
        setPomodoroCompletedFocusCount(restoredCompletedFocusCount);
        setCycleFocusCount(restoredCycleProgressCount);
        setWasDistracted(restoredWasDistracted);
        setSelectedFocusTaskId(nextSelectedFocusTaskId);
        setSelectedFocusTaskTitle(nextSelectedFocusTaskTitle);
        setFocusWithoutTaskSelected(nextFocusWithoutTaskSelected);
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

          if (restoredMode === 'focus' && restoredFocusLeftAt) {
            const awayMs = Date.now() - restoredFocusLeftAt;

            if (awayMs > DISTRACTION_THRESHOLD_MS) {
              wasDistractedRef.current = true;
              setWasDistracted(true);
              setFocusWarningText(
                `Milo noticed you left Focus Mode for ${formatAwayDuration(
                  awayMs
                )}. Lets continue clean focus.`
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

        if (
          leavingActiveState &&
          isRunningRef.current &&
          currentModeRef.current === 'focus'
        ) {
          const focusLeftAt = focusLeftAtRef.current ?? Date.now();
          focusLeftAtRef.current = focusLeftAt;
          persistPomodoroState({ focusLeftAt });
        }

        if (returningToActiveState) {
          handleReturnToApp();
        }

        appStateRef.current = nextAppState;
      }
    );

    return () => subscription.remove();
  }, [handleReturnToApp, hasRestoredPomodoroState, persistPomodoroState]);

  const handleSelectPreset = (presetId: PomodoroPresetId) => {
    if (presetId === selectedPreset) return;

    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before changing the timer preset.'
      );
      return;
    }

    const nextSettings =
      presetId === 'custom' ? customSettings : POMODORO_PRESETS[presetId].settings;
    const nextCycleFocusCount = Math.round(
      clampNumber(cycleProgressCount, 0, nextSettings.longBreakInterval)
    );

    selectedPresetRef.current = presetId;
    timerSettingsRef.current = nextSettings;
    clearFocusTaskSelection();
    setFocusSummary(null);
    setSelectedPreset(presetId);
    updateCycleFocusCount(nextCycleFocusCount, nextSettings);
    resetTimerForMode(currentMode, nextSettings);
  };

  const handleChangeCustomSetting = (
    settingName: keyof PomodoroSettings,
    value: number
  ) => {
    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before changing custom timer settings.'
      );
      return;
    }

    const min =
      settingName === 'longBreakInterval'
        ? MIN_LONG_BREAK_INTERVAL
        : MIN_DURATION_MINUTES;
    const max =
      settingName === 'longBreakInterval'
        ? MAX_LONG_BREAK_INTERVAL
        : MAX_DURATION_MINUTES;
    const nextSettings = {
      ...customSettings,
      [settingName]: clampNumber(value, min, max),
    };

    customSettingsRef.current = nextSettings;
    selectedPresetRef.current = 'custom';
    timerSettingsRef.current = nextSettings;
    clearFocusTaskSelection();
    setFocusSummary(null);
    setSelectedPreset('custom');
    setCustomSettings(nextSettings);
    updateCycleFocusCount(cycleProgressCount, nextSettings);
    resetTimerForMode(currentMode, nextSettings);
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
    setIsRunning(true);
    setDndReminderVisible(false);

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
    setFocusSummary(null);
    clearFocusTaskSelection();
    wasDistractedRef.current = false;
    focusLeftAtRef.current = null;
    setWasDistracted(false);
    setFocusWarningText(null);
    await persistPomodoroState({
      wasDistracted: false,
      focusLeftAt: null,
      selectedFocusTaskId: null,
      selectedFocusTaskTitle: null,
      focusWithoutTaskSelected: false,
    });
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

    if (currentMode === 'focus' && startingFreshSession) {
      setTaskPickerVisible(true);
      return;
    }

    await startTimer();
  };

  const handleReset = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusSummary(null);
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

  const handleSkip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const skippedMode = currentMode;
    const nextMode = skippedMode === 'focus' ? 'shortBreak' : 'focus';

    if (skippedMode === 'longBreak') {
      updateCycleFocusCount(0, timerSettings);
    }

    setFocusSummary(null);
    clearFocusTaskSelection();
    changeMode(nextMode);

    Speech.speak(
      skippedMode === 'focus'
        ? 'Focus block skipped. Milo will not count this one.'
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
      cycleProgressCount: skippedMode === 'longBreak' ? 0 : cycleFocusCountRef.current,
      remainingMs: getModeSeconds(nextMode, timerSettings) * 1000,
      focusLeftAt: null,
      wasDistracted: false,
      selectedFocusTaskId: null,
      selectedFocusTaskTitle: null,
      focusWithoutTaskSelected: false,
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
          <View style={styles.focusModalCard}>
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
              showsVerticalScrollIndicator={false}
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
                <Text style={styles.modalPrimaryButtonText}>Ill turn it on</Text>
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
        visible={Boolean(focusSummary)}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.focusModalCard}>
            <View style={styles.modalAccentBar} />
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>Session Summary</Text>
            </View>
            <Text style={styles.modalTitle}>Focus completed</Text>

            {focusSummary ? (
              <>
                <View style={styles.summaryRows}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Duration</Text>
                    <Text style={styles.summaryValue}>
                      {focusSummary.durationMinutes} min
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <LinearGradient
          colors={['#F9FFFB', '#DDF8E7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTextArea}>
            <Text style={styles.heroLabel}>Milo Focus Mode</Text>
            <Text style={styles.heroTitle}>Pomodoro timer</Text>
            <Text style={styles.heroSubtitle}>
              Focus for {timerSettings.focusMinutes} minutes, then let Milo guide the right
              break.
            </Text>
          </View>

          <View style={styles.miloBubble}>
            <Image source={miloImage} style={styles.miloImage} resizeMode="contain" />
          </View>
        </LinearGradient>

        <View style={styles.analyticsRow}>
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsNumber}>{completedFocusCount}</Text>
            <Text style={styles.analyticsLabel}>Focus Blocks</Text>
          </View>

          <View style={styles.analyticsCard}>
            <Text style={[styles.analyticsNumber, { color: theme.colors.blue }]}>
              {todayFocusMinutes}
            </Text>
            <Text style={styles.analyticsLabel}>Focus Minutes</Text>
          </View>

          <View style={styles.analyticsCard}>
            <Text style={[styles.analyticsNumber, { color: theme.colors.purple }]}>
              {totalFocusMinutes}
            </Text>
            <Text style={styles.analyticsLabel}>Total Minutes</Text>
          </View>
        </View>

        <View style={styles.presetCard}>
          <View style={styles.presetHeaderRow}>
            <View>
              <Text style={styles.presetLabel}>Timer Preset</Text>
              <Text style={styles.presetTitle}>{activePreset.label}</Text>
              <Text style={styles.presetDescription}>
                Timer Preset = duration package.
              </Text>
            </View>

            <View style={styles.presetSummaryBadge}>
              <Ionicons name="timer" size={15} color={theme.colors.primaryDark} />
              <Text style={styles.presetSummaryBadgeText}>
                {selectedPresetSummary}
              </Text>
            </View>
          </View>

          <View style={styles.presetGrid}>
            {pomodoroPresetOrder.map((presetId) => (
              <PresetButton
                key={presetId}
                presetId={presetId}
                selected={selectedPreset === presetId}
                onPress={() => handleSelectPreset(presetId)}
              />
            ))}
          </View>

          <Text style={styles.presetHelperText}>{selectedPresetHelper}</Text>

          {selectedPreset === 'custom' ? (
            <View style={styles.customSettingsPanel}>
              <CustomNumberControl
                label="Focus duration"
                value={customSettings.focusMinutes}
                unit="min"
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                onChange={(value) => handleChangeCustomSetting('focusMinutes', value)}
              />

              <CustomNumberControl
                label="Short break"
                value={customSettings.shortBreakMinutes}
                unit="min"
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                onChange={(value) =>
                  handleChangeCustomSetting('shortBreakMinutes', value)
                }
              />

              <CustomNumberControl
                label="Long break"
                value={customSettings.longBreakMinutes}
                unit="min"
                min={MIN_DURATION_MINUTES}
                max={MAX_DURATION_MINUTES}
                onChange={(value) =>
                  handleChangeCustomSetting('longBreakMinutes', value)
                }
              />

              <CustomNumberControl
                label="Long break interval"
                value={customSettings.longBreakInterval}
                unit="blocks"
                min={MIN_LONG_BREAK_INTERVAL}
                max={MAX_LONG_BREAK_INTERVAL}
                onChange={(value) =>
                  handleChangeCustomSetting('longBreakInterval', value)
                }
              />
            </View>
          ) : null}
        </View>

        <View style={styles.timerCard}>
          <View style={styles.timerTopRow}>
            <View>
              <Text style={[styles.timerLabel, { color: currentModeConfig.accentColor }]}>
                {currentModeConfig.title}
              </Text>
              <Text style={styles.timerTitle}>
                {isRunning ? currentModeConfig.runningTitle : currentModeConfig.readyTitle}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.sessionBadge}
              onPress={() => navigation.navigate('Analytics')}
            >
              <Ionicons name="stats-chart" size={16} color={theme.colors.primaryDark} />
              <Text style={styles.sessionBadgeText}>Analytics</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.focusTaskStrip}>
            <View style={styles.focusTaskIcon}>
              <MaterialCommunityIcons
                name={
                  selectedFocusTaskDisplayTitle
                    ? 'target'
                    : focusWithoutTaskSelected
                    ? 'timer-sand'
                    : 'format-list-checks'
                }
                size={18}
                color={theme.colors.primaryDark}
              />
            </View>

            <View style={styles.focusTaskTextArea}>
              <Text style={styles.focusTaskLabel}>Focus task</Text>
              <Text style={styles.focusTaskTitle} numberOfLines={2}>
                {focusTaskDisplayText}
              </Text>
              <Text style={styles.focusTaskHelper} numberOfLines={1}>
                {focusTaskHelperText}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.timerCircle,
              {
                backgroundColor: currentModeConfig.softColor,
              },
            ]}
          >
            <Text style={styles.timerText}>{formatSeconds(remainingSeconds)}</Text>
            <Text
              style={[styles.timerSubText, { color: currentModeConfig.accentColor }]}
            >
              {progressPercent}% complete
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: currentModeConfig.accentColor,
                },
              ]}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.mainButton, isRunning && styles.pauseButton]}
              onPress={handleStartPause}
            >
              <Ionicons
                name={isRunning ? 'pause' : 'play'}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.mainButtonText}>
                {isRunning ? 'Pause' : 'Start'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.resetButton}
              onPress={handleReset}
            >
              <Ionicons name="refresh" size={21} color={theme.colors.primaryDark} />
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.skipButton}
              onPress={handleSkip}
            >
              <Ionicons name="play-skip-forward" size={20} color={theme.colors.textSoft} />
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
          </View>

        </View>

        <View style={styles.sectionHeaderBlock}>
          <Text style={styles.sectionTitle}>Current Session</Text>
          <Text style={styles.sectionHelperText}>
            Current Session = Focus / Short Break / Long Break.
          </Text>
        </View>

        <View style={styles.modeRow}>
          {pomodoroModeOrder.map((mode) => (
            <ModeButton
              key={mode}
              mode={mode}
              settings={timerSettings}
              selected={currentMode === mode}
              onPress={() => handleSelectMode(mode)}
            />
          ))}
        </View>

        <View style={styles.cycleCard}>
          <View style={styles.cycleTopRow}>
            <View>
              <Text style={styles.cycleLabel}>Cycle Progress</Text>
              <Text style={styles.cycleTitle}>
                {cycleProgressCount}/{longBreakInterval} focus blocks
              </Text>
            </View>

            <View style={styles.breakSuggestionBadge}>
              <Ionicons name="leaf" size={16} color={theme.colors.primaryDark} />
              <Text style={styles.breakSuggestionText}>
                {cycleSuggestionText}
              </Text>
            </View>
          </View>

          <View style={styles.cycleDotsRow}>
            {Array.from({ length: longBreakInterval }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.cycleDot,
                  index < cycleProgressCount && styles.cycleDotActive,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.miloMessageCard}>
          <Image
            source={miloImage}
            style={styles.messageMiloImage}
            resizeMode="contain"
          />

          <View style={styles.messageTextArea}>
            <Text style={styles.messageTitle}>Milo says</Text>
            <Text style={styles.messageText}>{miloMessage}</Text>
          </View>
        </View>

        <View style={styles.suggestedTaskCard}>
          <View style={styles.suggestedTopRow}>
            <View style={styles.suggestedIcon}>
              <MaterialCommunityIcons name="target" size={22} color="#FFFFFF" />
            </View>

            <View style={styles.suggestedTextArea}>
              <Text style={styles.suggestedLabel}>Suggested Focus Item</Text>
              <Text style={styles.suggestedTitle} numberOfLines={2}>
                {suggestedTask ? suggestedTask.title : 'No pending task yet'}
              </Text>

              <Text style={styles.suggestedSubtitle}>
                {suggestedTask
                  ? 'Milo thinks this should come first.'
                  : 'Create a task first, then come back to focus mode.'}
              </Text>
            </View>
          </View>

          {suggestedTask ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.openTaskButton}
              onPress={() =>
                navigation.navigate('TaskDetails', { taskId: suggestedTask.id })
              }
            >
              <Text style={styles.openTaskButtonText}>Open Task Details</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Focus Tips</Text>

          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.primaryDark} />
            <Text style={styles.tipText}>Choose only one task before starting.</Text>
          </View>

          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.primaryDark} />
            <Text style={styles.tipText}>Put your phone on silent if possible.</Text>
          </View>

          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.primaryDark} />
            <Text style={styles.tipText}>
              After {longBreakInterval} focus blocks, take a long break.
            </Text>
          </View>
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
    paddingTop: 18,
  },
  heroCard: {
    borderRadius: theme.radius.xl,
    padding: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...theme.shadow,
  },
  heroTextArea: {
    flex: 1,
    paddingRight: 10,
  },
  heroLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 6,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    marginTop: 7,
    color: theme.colors.textSoft,
    fontWeight: '600',
    lineHeight: 20,
  },
  miloBubble: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
  },
  miloImage: {
    width: 136,
    height: 136,
  },
  analyticsRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  analyticsCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  analyticsNumber: {
    color: theme.colors.primaryDark,
    fontSize: 22,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  presetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  presetTitle: {
    marginTop: 4,
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  presetDescription: {
    marginTop: 3,
    color: theme.colors.muted,
    fontWeight: '700',
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
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    marginHorizontal: -4,
  },
  presetButton: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 58,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    marginHorizontal: 4,
    marginBottom: 8,
  },
  presetButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  presetButtonLabel: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
  },
  presetButtonLabelActive: {
    color: '#FFFFFF',
  },
  presetButtonSummary: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '800',
    fontSize: 11,
  },
  presetButtonSummaryActive: {
    color: '#FFFFFF',
  },
  presetHelperText: {
    marginTop: 2,
    color: theme.colors.textSoft,
    fontWeight: '600',
    lineHeight: 20,
  },
  customSettingsPanel: {
    marginTop: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  customControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  customControlTextArea: {
    flex: 1,
    paddingRight: 10,
  },
  customControlLabel: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 13,
  },
  customControlHint: {
    marginTop: 3,
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  stepper: {
    width: 154,
    height: 42,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: theme.colors.background,
  },
  stepperValue: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },
  stepperUnit: {
    color: theme.colors.muted,
    fontSize: 10,
  },
  timerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  timerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  timerTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  sessionBadge: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionBadgeText: {
    marginLeft: 5,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  focusTaskStrip: {
    marginTop: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  focusTaskIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  focusTaskTextArea: {
    flex: 1,
  },
  focusTaskLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 11,
  },
  focusTaskTitle: {
    marginTop: 2,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 15,
  },
  focusTaskHelper: {
    marginTop: 3,
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 11,
  },
  timerCircle: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: theme.colors.primarySoft,
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 10,
    borderColor: '#FFFFFF',
  },
  timerText: {
    color: theme.colors.text,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  timerSubText: {
    marginTop: 4,
    color: theme.colors.primaryDark,
    fontWeight: '900',
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  buttonRow: {
    flexDirection: 'row',
  },
  mainButton: {
    flex: 1,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: 10,
  },
  pauseButton: {
    backgroundColor: theme.colors.yellow,
  },
  mainButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  resetButton: {
    width: 88,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: 8,
  },
  resetButtonText: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontWeight: '900',
  },
  skipButton: {
    width: 82,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  skipButtonText: {
    marginLeft: 5,
    color: theme.colors.textSoft,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(34, 40, 49, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  focusModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surface,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
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
    borderColor: '#CDEFD9',
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
    maxHeight: 260,
    marginTop: 14,
  },
  taskPickerListContent: {
    paddingBottom: 2,
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
    borderColor: '#CDEFD9',
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
