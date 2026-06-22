import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useAuth } from '../lib/AuthContext';
import { useTasks } from '../lib/TaskContext';
import {
  getFocusSessionHistory,
  type FocusSessionHistoryItem,
  type FocusSessionStatus,
} from '../lib/focusSessionHistory';
import {
  getTodayDate,
  MiloMood,
} from '../lib/miloPersonality';
import {
  getMiloRecommendedTasks,
  getMiloSituationForTask,
  isAllDayOrPlaceholder,
  type MiloSituationKind,
  type MiloTaskSituation,
} from '../lib/miloSituationIntelligence';
import {
  deleteSavedResource,
  loadSavedResources,
  saveResource,
  type SavedResource,
} from '../lib/resourceFinderStorage';
import {
  buildGoogleSearchUrl,
  buildResourceSearchQuery,
  generateResourceKeywords,
} from '../lib/resourceFinderUtils';
import { Task } from '../types/task';

import ScreenContainer from '../components/ui/ScreenContainer';
import MiloMoodImage from '../components/milo/MiloMoodImage';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type MiloVideoKey =
  | 'greeting'
  | 'idle'
  | 'proud'
  | 'sleepy'
  | 'thinking'
  | 'worried';
type CompanionDetailModal =
  | 'analytics'
  | 'sessions'
  | 'sessionDetail'
  | 'reaction'
  | 'resources';
type ResourceFinderMode = 'finder' | 'save' | 'saved';

const TEMPORARY_MILO_REACTION_MS = 6500;
const MILO_INACTIVITY_AUTOPLAY_MS = 30000;
const SPEECH_ROTATION_MS = 6000;
const TREND_CHART_HEIGHT = 112;
const TREND_DOT_SIZE = 10;
const TREND_CHART_VERTICAL_PADDING = 12;
const TREND_AXIS_LABEL_COUNT = 6;
const LOCAL_PREFERENCES_STORAGE_KEY = '@focusmate/settings/preferences';
const miloIdleScene = require('../../assets/images/companion/milo_idle_scene.png');
const miloGreetingVideo = require('../../assets/videos/milo/milo_greeting_final.mp4');
const miloIdleVideo = require('../../assets/videos/milo/milo_idle_final.mp4');
const miloProudVideo = require('../../assets/videos/milo/milo_proud_final.mp4');
const miloSleepyVideo = require('../../assets/videos/milo/milo_sleepy_final.mp4');
const miloThinkingVideo = require('../../assets/videos/milo/milo_thinking_final.mp4');
const miloWorriedVideo = require('../../assets/videos/milo/milo_worried_final.mp4');

const MILO_TAP_VIDEO_KEYS: readonly MiloVideoKey[] = [
  'greeting',
  'idle',
  'proud',
  'sleepy',
  'thinking',
  'worried',
];
const MILO_IDLE_AUTOPLAY_VIDEO_KEYS: readonly MiloVideoKey[] = [
  'greeting',
  'idle',
  'thinking',
];

type MoodStatusItem = {
  label: string;
  value: string;
  icon: IconName;
  color: string;
  backgroundColor: string;
};

type TaskWindow = {
  start: Date;
  end: Date;
};

type SituationItem = {
  task: Task;
  situation: MiloTaskSituation;
};

type CompanionPlannerSnapshot = {
  firstTask?: Task;
  firstSituation?: MiloTaskSituation;
  pendingCount: number;
  completedTodayCount: number;
  totalTodayCount: number;
  overdueCount: number;
  missedCount: number;
  happeningNowCount: number;
  startingSoonCount: number;
  dueTodayCount: number;
  meetingTodayCount: number;
  highFocusCount: number;
  startEarlyCount: number;
  acceptedOverlapCount: number;
  unacceptedOverlapCount: number;
};

type WeeklyFocusTrendItem = {
  dateKey: string;
  label: string;
  minutes: number;
};

type FocusAnalyticsSummary = {
  todayFocusMinutes: number;
  weekFocusMinutes: number;
  cleanSessions: number;
  distractedSessions: number;
  mostFocusedTask: string;
  weeklyTrend: WeeklyFocusTrendItem[];
  recentSessions: FocusSessionHistoryItem[];
  latestSession: FocusSessionHistoryItem | null;
  latestCompletedSession: FocusSessionHistoryItem | null;
  completedSessionCount: number;
  sessionsThisWeek: number;
  dayStreak: number;
  focusScore: number | null;
};

type TrendPlotPoint = {
  x: number;
  y: number;
};

const overlapTypes = [
  'same_time',
  'hard_overlap',
  'ongoing_overlap',
  'soft_overlap',
  'accepted_overlap',
];

function isPendingTask(task: Task) {
  return task.status !== 'completed';
}

function getTaskTitle(task?: Task) {
  const title = task?.title?.trim() || 'this planner item';

  if (title.length <= 34) return title;

  return `${title.slice(0, 31).trimEnd()}...`;
}

function parsePlannerDateTime(dueDate?: string, dueTime?: string) {
  if (!dueDate || !dueTime) return null;

  const dateMatch = dueDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = dueTime
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!dateMatch || !timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || '0');
  const meridian = timeMatch[3];

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  if (meridian === 'AM' && hour === 12) hour = 0;
  if (meridian === 'PM' && hour !== 12) hour += 12;

  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    minute
  );
}

function getTaskWindow(task: Task): TaskWindow | null {
  const start = parsePlannerDateTime(task.dueDate, task.dueTime);
  const duration = task.estimatedDurationMinutes || 0;

  if (!start || duration <= 0) return null;

  return {
    start,
    end: new Date(start.getTime() + duration * 60 * 1000),
  };
}

function hasAcceptedOverlap(task: Task) {
  return Boolean(
    task.conflictAccepted ||
      task.conflictInfo?.type === 'accepted_overlap' ||
      task.conflictInfo?.messageTone === 'accepted'
  );
}

function hasStoredOverlap(task: Task) {
  return Boolean(
    hasAcceptedOverlap(task) ||
      (task.conflictInfo?.type && overlapTypes.includes(task.conflictInfo.type))
  );
}

function countDirectOverlaps(tasks: Task[]) {
  let count = 0;

  for (let index = 0; index < tasks.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < tasks.length; nextIndex += 1) {
      const first = tasks[index];
      const second = tasks[nextIndex];

      if (isAllDayOrPlaceholder(first) || isAllDayOrPlaceholder(second)) {
        continue;
      }

      if (!first.dueDate || !second.dueDate || first.dueDate !== second.dueDate) {
        continue;
      }

      const firstTime = first.dueTime?.trim();
      const secondTime = second.dueTime?.trim();

      if (firstTime && secondTime && firstTime === secondTime) {
        count += 1;
        continue;
      }

      const firstWindow = getTaskWindow(first);
      const secondWindow = getTaskWindow(second);

      if (!firstWindow || !secondWindow) continue;

      const overlaps =
        firstWindow.start.getTime() < secondWindow.end.getTime() &&
        firstWindow.end.getTime() > secondWindow.start.getTime();

      if (overlaps) count += 1;
    }
  }

  return count;
}

function countSituations(items: SituationItem[], kinds: MiloSituationKind[]) {
  return items.filter((item) => kinds.includes(item.situation.kind)).length;
}

function pickRandomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function getTapHintStorageKey(userId?: string | null) {
  return `@focusmate/companion/tapHintSeen:${userId || 'anonymous'}`;
}

async function loadCompanionTapHintSeen(storageKey: string) {
  try {
    return (await AsyncStorage.getItem(storageKey)) === 'true';
  } catch (error) {
    console.log('Failed to load companion tap hint state:', error);
    return false;
  }
}

async function saveCompanionTapHintSeen(storageKey: string) {
  try {
    await AsyncStorage.setItem(storageKey, 'true');
  } catch (error) {
    console.log('Failed to save companion tap hint state:', error);
  }
}

async function loadReduceMotionPreference() {
  try {
    const stored = await AsyncStorage.getItem(LOCAL_PREFERENCES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;

    if (typeof parsed === 'object' && parsed !== null) {
      const reduceMotion =
        (parsed as Record<string, unknown>).reduceMotion ??
        (parsed as Record<string, unknown>).reducedMotion;

      return typeof reduceMotion === 'boolean' ? reduceMotion : false;
    }
  } catch (error) {
    console.log('Failed to load reduce motion preference:', error);
  }

  return false;
}

function getDefaultMiloMessage(
  displayName: string,
  snapshot: CompanionPlannerSnapshot
) {
  const taskTitle = getTaskTitle(snapshot.firstTask);

  if (snapshot.firstSituation?.kind === 'missed') {
    return `No panic, ${displayName}. We'll rescue "${taskTitle}" gently.`;
  }

  if (snapshot.firstSituation?.kind === 'overdue') {
    return `No panic, ${displayName}. "${taskTitle}" just needs one tiny step.`;
  }

  if (snapshot.firstSituation?.kind === 'happening_now') {
    return `"${taskTitle}" is happening now. Small step first, then continue.`;
  }

  if (snapshot.firstSituation?.kind === 'starting_soon') {
    return `Almost time, ${displayName}. Let's get "${taskTitle}" ready calmly.`;
  }

  if (snapshot.unacceptedOverlapCount > 0) {
    return `Hmm, these plans are close, ${displayName}. Let's protect your time.`;
  }

  if (snapshot.acceptedOverlapCount > 0) {
    return `Keep Both is okay, ${displayName}. I'll watch the timing.`;
  }

  if (
    snapshot.firstSituation &&
    ['due_today', 'due_tonight', 'all_day'].includes(
      snapshot.firstSituation.kind
    )
  ) {
    return `"${taskTitle}" needs your focus today. I'll stay with you.`;
  }

  if (snapshot.meetingTodayCount > 0) {
    return `You have a meeting today, ${displayName}. I'll help you arrive calm.`;
  }

  if (snapshot.highFocusCount > 0) {
    return `"${taskTitle}" needs deep focus. We'll make it feel smaller.`;
  }

  if (
    snapshot.completedTodayCount > 0 &&
    snapshot.completedTodayCount === snapshot.totalTodayCount
  ) {
    return `You finished today's plan, ${displayName}. Milo is proud of you.`;
  }

  if (snapshot.completedTodayCount > 0) {
    return `Nice work, ${displayName}. I saw that progress.`;
  }

  if (snapshot.startEarlyCount > 0) {
    return `One early step on "${taskTitle}" can help future you.`;
  }

  if (snapshot.pendingCount === 0) {
    return `Your planner is clear, ${displayName}. Want to plan something small?`;
  }

  return `Your planner looks calm, ${displayName}. Future you will thank you.`;
}

function getSituationMood(snapshot: CompanionPlannerSnapshot): MiloMood {
  if (snapshot.missedCount > 0 || snapshot.overdueCount > 0) return 'worried';
  if (snapshot.unacceptedOverlapCount > 0) return 'worried';
  if (
    snapshot.highFocusCount > 0 &&
    snapshot.dueTodayCount === 0 &&
    snapshot.meetingTodayCount === 0 &&
    snapshot.happeningNowCount === 0 &&
    snapshot.startingSoonCount === 0
  ) {
    return 'worried';
  }
  if (
    snapshot.dueTodayCount > 0 ||
    snapshot.meetingTodayCount > 0 ||
    snapshot.happeningNowCount > 0 ||
    snapshot.startingSoonCount > 0 ||
    snapshot.acceptedOverlapCount > 0
  ) {
    return 'focused';
  }
  if (snapshot.completedTodayCount > 0 || snapshot.pendingCount === 0) {
    return 'happy';
  }
  return 'waving';
}

const focusSessionStatusMeta: Record<
  FocusSessionStatus,
  {
    label: string;
    icon: IconName;
    color: string;
    backgroundColor: string;
  }
> = {
  completed: {
    label: 'Completed',
    icon: 'checkmark-circle',
    color: theme.colors.primaryDark,
    backgroundColor: theme.colors.successSoft,
  },
  stopped: {
    label: 'Stopped',
    icon: 'pause-circle',
    color: '#B7791F',
    backgroundColor: theme.colors.yellowSoft,
  },
  skipped: {
    label: 'Skipped',
    icon: 'play-skip-forward',
    color: theme.colors.muted,
    backgroundColor: theme.colors.input,
  },
};

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year, month - 1, day);
}

function getSessionDateKey(session: FocusSessionHistoryItem) {
  return getLocalDateKey(new Date(session.endedAt || session.date));
}

function getSessionTitle(session: FocusSessionHistoryItem) {
  return (
    session.taskTitle?.trim() ||
    session.selectedTaskTitle?.trim() ||
    'Focus session'
  );
}

function isRealFocusSession(session: FocusSessionHistoryItem) {
  return session.status !== 'skipped' && session.durationMinutes > 0;
}

function formatMinutesLabel(minutes: number) {
  const roundedMinutes = Math.max(0, Math.round(minutes));

  return `${roundedMinutes} min`;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  let hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';

  hours %= 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${suffix}`;
}

function formatSessionDate(value: string, todayDate: string) {
  const dateKey = getLocalDateKey(new Date(value));
  const today = getDateFromKey(todayDate);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dateKey === todayDate) return 'Today';
  if (dateKey === getLocalDateKey(yesterday)) return 'Yesterday';

  const date = new Date(value);
  const month = date.toLocaleString('en-US', { month: 'short' });

  return `${month} ${date.getDate()}`;
}

function formatSessionDateTime(value: string, todayDate: string) {
  return `${formatSessionDate(value, todayDate)}, ${formatSessionTime(value)}`;
}

function formatResourceDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Saved recently';
  }

  const month = date.toLocaleString('en-US', { month: 'short' });

  return `${month} ${date.getDate()}`;
}

function formatFocusQuality(value: FocusSessionHistoryItem['focusQuality']) {
  return value === 'clean' ? 'Clean' : 'Distracted';
}

function getOpenableResourceUrl(value: string) {
  const trimmedValue = value.trim();

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function getDerivedSessionScore(session: FocusSessionHistoryItem) {
  if (typeof session.focusScore === 'number') {
    return Math.round(Math.min(100, Math.max(0, session.focusScore)));
  }

  if (session.status === 'completed') {
    return session.focusQuality === 'clean' ? 94 : 76;
  }

  return session.status === 'stopped' ? 52 : 42;
}

function getFocusDayStreak(completedSessions: FocusSessionHistoryItem[], todayDate: string) {
  const completedDateKeys = new Set(completedSessions.map(getSessionDateKey));
  let streak = 0;
  const cursor = getDateFromKey(todayDate);

  while (completedDateKeys.has(getLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getNiceTrendMax(minutes: number[]) {
  const maxMinutes = Math.max(0, ...minutes);

  if (maxMinutes <= 10) return 10;
  if (maxMinutes <= 30) return Math.ceil(maxMinutes / 5) * 5;
  if (maxMinutes <= 60) return Math.ceil(maxMinutes / 10) * 10;

  return Math.ceil(maxMinutes / 15) * 15;
}

function getTrendAxisLabels(maxMinutes: number) {
  return Array.from({ length: TREND_AXIS_LABEL_COUNT }, (_, index) => {
    const ratio = index / (TREND_AXIS_LABEL_COUNT - 1);

    return Math.round(maxMinutes - maxMinutes * ratio);
  });
}

function formatTrendAxisLabel(minutes: number) {
  return `${minutes} min`;
}

function getCatmullRomValue(
  previous: number,
  current: number,
  next: number,
  following: number,
  amount: number
) {
  const squared = amount * amount;
  const cubed = squared * amount;

  return (
    0.5 *
    (2 * current +
      (-previous + next) * amount +
      (2 * previous - 5 * current + 4 * next - following) * squared +
      (-previous + 3 * current - 3 * next + following) * cubed)
  );
}

function getSmoothTrendPoints(points: TrendPlotPoint[]) {
  if (points.length < 3) return points;

  const smoothPoints: TrendPlotPoint[] = [];
  const stepsPerSegment = 8;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];

    for (let step = 0; step < stepsPerSegment; step += 1) {
      const amount = step / stepsPerSegment;

      smoothPoints.push({
        x: getCatmullRomValue(
          previous.x,
          current.x,
          next.x,
          following.x,
          amount
        ),
        y: getCatmullRomValue(
          previous.y,
          current.y,
          next.y,
          following.y,
          amount
        ),
      });
    }
  }

  smoothPoints.push(points[points.length - 1]);

  return smoothPoints;
}

function createPlaceholderRecentSessions(todayDate: string): FocusSessionHistoryItem[] {
  const today = getDateFromKey(todayDate);
  const makeDate = (daysAgo: number, hour: number, minute: number) => {
    const date = new Date(today);
    date.setDate(today.getDate() - daysAgo);
    date.setHours(hour, minute, 0, 0);

    return date.toISOString();
  };
  const createPlaceholderSession = (
    id: string,
    endedAt: string,
    durationMinutes: number,
    taskTitle: string,
    focusQuality: FocusSessionHistoryItem['focusQuality'],
    presetName: string,
    status: FocusSessionHistoryItem['status'],
    focusScore: number
  ): FocusSessionHistoryItem => {
    const startedAt = new Date(
      new Date(endedAt).getTime() - durationMinutes * 60 * 1000
    ).toISOString();

    return {
      id,
      date: endedAt,
      startedAt,
      endedAt,
      createdAt: endedAt,
      durationMinutes,
      taskTitle,
      selectedTaskTitle: taskTitle,
      focusQuality,
      presetName,
      status,
      focusScore,
    };
  };

  return [
    createPlaceholderSession(
      'placeholder-focus-1',
      makeDate(0, 10, 42),
      25,
      'Overdue Assignment',
      'clean',
      'Classic Pomodoro',
      'completed',
      96
    ),
    createPlaceholderSession(
      'placeholder-focus-2',
      makeDate(1, 15, 10),
      15,
      'Review notes',
      'distracted',
      'Quick Focus',
      'completed',
      78
    ),
    createPlaceholderSession(
      'placeholder-focus-3',
      makeDate(2, 9, 25),
      8,
      'Plan tiny steps',
      'clean',
      'Custom Rhythm',
      'stopped',
      55
    ),
  ];
}

function createFocusAnalytics(
  history: FocusSessionHistoryItem[],
  todayDate: string
): FocusAnalyticsSummary {
  const sortedHistory = history.filter(isRealFocusSession).sort(
    (first, second) =>
      new Date(second.endedAt || second.date).getTime() -
      new Date(first.endedAt || first.date).getTime()
  );
  const completedSessions = sortedHistory.filter(
    (session) => session.status === 'completed'
  );
  const todayFocusSessions = sortedHistory.filter(
    (session) => getSessionDateKey(session) === todayDate
  );
  const today = getDateFromKey(todayDate);
  const weekDateKeys = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    return getLocalDateKey(date);
  });
  const weekDateKeySet = new Set(weekDateKeys);
  const sessionsThisWeek = sortedHistory.filter((session) =>
    weekDateKeySet.has(getSessionDateKey(session))
  );
  const taskTotals = new Map<string, number>();

  sortedHistory.forEach((session) => {
    const title = getSessionTitle(session);
    taskTotals.set(title, (taskTotals.get(title) ?? 0) + session.durationMinutes);
  });

  let mostFocusedTask = 'No focus yet';
  let mostFocusedMinutes = 0;
  taskTotals.forEach((minutes, title) => {
    if (minutes > mostFocusedMinutes) {
      mostFocusedTask = title;
      mostFocusedMinutes = minutes;
    }
  });

  const weeklyTrend = weekDateKeys.map((dateKey) => {
    const date = getDateFromKey(dateKey);
    const label = date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
    const minutes = sessionsThisWeek
      .filter((session) => getSessionDateKey(session) === dateKey)
      .reduce((total, session) => total + session.durationMinutes, 0);

    return {
      dateKey,
      label,
      minutes,
    };
  });
  const scoredSessions =
    sessionsThisWeek.length > 0 ? sessionsThisWeek : sortedHistory;
  const focusScore =
    scoredSessions.length > 0
      ? Math.round(
          scoredSessions.reduce(
            (total, session) => total + getDerivedSessionScore(session),
            0
          ) / scoredSessions.length
        )
      : null;
  const weekFocusMinutes = sessionsThisWeek.reduce(
    (total, session) => total + session.durationMinutes,
    0
  );

  return {
    todayFocusMinutes: todayFocusSessions.reduce(
      (total, session) => total + session.durationMinutes,
      0
    ),
    weekFocusMinutes,
    cleanSessions: sortedHistory.filter(
      (session) => session.focusQuality === 'clean'
    ).length,
    distractedSessions: sortedHistory.filter(
      (session) => session.focusQuality === 'distracted'
    ).length,
    mostFocusedTask,
    weeklyTrend,
    recentSessions: sortedHistory.slice(0, 3),
    latestSession: sortedHistory[0] ?? null,
    latestCompletedSession: completedSessions[0] ?? null,
    completedSessionCount: sortedHistory.length,
    sessionsThisWeek: sessionsThisWeek.length,
    dayStreak: getFocusDayStreak(sortedHistory, todayDate),
    focusScore,
  };
}

function WeeklyFocusChart({
  data,
  style,
}: {
  data: WeeklyFocusTrendItem[];
  style?: StyleProp<ViewStyle>;
}) {
  const [plotWidth, setPlotWidth] = useState(0);
  const chartMaxMinutes = getNiceTrendMax(data.map((item) => item.minutes));
  const axisLabels = getTrendAxisLabels(chartMaxMinutes);
  const hasFocusData = data.some((item) => item.minutes > 0);
  const plotTop = TREND_CHART_VERTICAL_PADDING;
  const plotBottom = TREND_CHART_HEIGHT - TREND_CHART_VERTICAL_PADDING;
  const plotRange = plotBottom - plotTop;
  const stepX =
    plotWidth > 0 && data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const points = data.map((item, index) => {
    const ratio = Math.min(1, Math.max(0, item.minutes / chartMaxMinutes));

    return {
      ...item,
      x: stepX * index,
      y: plotTop + (1 - ratio) * plotRange,
    };
  });
  const smoothPoints =
    plotWidth > 0
      ? getSmoothTrendPoints(points).map((point) => ({
          x: Math.min(plotWidth, Math.max(0, point.x)),
          y: Math.min(plotBottom, Math.max(plotTop, point.y)),
        }))
      : [];
  const areaBarWidth =
    smoothPoints.length > 1
      ? Math.max(6, plotWidth / (smoothPoints.length - 1) + 2)
      : 18;

  return (
    <View pointerEvents="none" style={[styles.trendCard, style]}>
      <View style={styles.trendChartBody}>
        <View style={styles.trendYAxis}>
          {axisLabels.map((label, index) => {
            const y =
              plotTop +
              (plotRange * index) / Math.max(1, TREND_AXIS_LABEL_COUNT - 1);

            return (
              <Text
                key={`${label}-${index}`}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={[styles.trendYAxisLabel, { top: y - 7 }]}
              >
                {formatTrendAxisLabel(label)}
              </Text>
            );
          })}
        </View>

        <View style={styles.trendPlotWrap}>
          <View
            style={styles.trendPlot}
            onLayout={({ nativeEvent }) =>
              setPlotWidth(nativeEvent.layout.width)
            }
          >
            {axisLabels.map((label, index) => {
              const y =
                plotTop +
                (plotRange * index) / Math.max(1, TREND_AXIS_LABEL_COUNT - 1);

              return (
                <View
                  key={`${label}-${index}-grid`}
                  pointerEvents="none"
                  style={[styles.trendGridLine, { top: y }]}
                />
              );
            })}

            {smoothPoints.length > 0
              ? smoothPoints.map((point, index) => {
                  const areaHeight = Math.max(0, plotBottom - point.y);

                  if (areaHeight <= 0) return null;

                  return (
                    <LinearGradient
                      key={`area-${index}`}
                      pointerEvents="none"
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      colors={[
                        'rgba(45, 181, 105, 0.18)',
                        'rgba(45, 181, 105, 0.025)',
                      ]}
                      style={[
                        styles.trendAreaColumn,
                        {
                          left: point.x - areaBarWidth / 2,
                          top: point.y,
                          width: areaBarWidth,
                          height: areaHeight,
                        },
                      ]}
                    />
                  );
                })
              : null}

            {smoothPoints.length > 0
              ? smoothPoints.slice(0, -1).map((point, index) => {
                  const nextPoint = smoothPoints[index + 1];
                  const deltaX = nextPoint.x - point.x;
                  const deltaY = nextPoint.y - point.y;
                  const segmentLength = Math.sqrt(deltaX ** 2 + deltaY ** 2);
                  const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;

                  return (
                    <View
                      key={`segment-${index}`}
                      pointerEvents="none"
                      style={[
                        styles.trendSegment,
                        {
                          left: point.x + deltaX / 2 - segmentLength / 2,
                          top: point.y + deltaY / 2 - 1.5,
                          width: segmentLength,
                          transform: [{ rotate: `${angle}deg` }],
                        },
                      ]}
                    />
                  );
                })
              : null}

            {plotWidth > 0
              ? points.map((point) => (
                  <View
                    key={`${point.dateKey}-dot`}
                    pointerEvents="none"
                    style={[
                      styles.trendDot,
                      {
                        left: point.x - TREND_DOT_SIZE / 2,
                        top: point.y - TREND_DOT_SIZE / 2,
                      },
                    ]}
                  >
                    <View style={styles.trendDotCore} />
                  </View>
                ))
              : null}

            {!hasFocusData ? (
              <View pointerEvents="none" style={styles.trendEmptyHintWrap}>
                <Text numberOfLines={1} style={styles.trendEmptyHintText}>
                  No focus data yet
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.trendLabelRow}>
            {data.map((item) => (
              <Text key={item.dateKey} numberOfLines={1} style={styles.trendLabel}>
                {item.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function getMiloFocusReaction(analytics: FocusAnalyticsSummary) {
  if (
    analytics.latestSession?.status === 'stopped' ||
    analytics.latestSession?.status === 'skipped'
  ) {
    return "It's okay. Let's restart with a smaller focus block.";
  }

  if (analytics.sessionsThisWeek >= 5) {
    return "You're building a strong focus habit.";
  }

  const latestCompletedSession = analytics.latestCompletedSession;

  if (latestCompletedSession?.focusQuality === 'clean') {
    return 'Great job! You stayed focused.';
  }

  if (latestCompletedSession?.focusQuality === 'distracted') {
    return "You came back and finished. Let's try cleaner focus next time.";
  }

  return 'Start one focus block and Milo will cheer you on here.';
}

function getMiloProductivityInsight(analytics: FocusAnalyticsSummary) {
  if (!analytics.latestSession) {
    return 'Start one focus session and Milo will build your analytics here.';
  }

  if (analytics.sessionsThisWeek >= 5) {
    return "You're showing up often this week. Keep the habit gentle and repeatable.";
  }

  if (analytics.dayStreak >= 2) {
    return 'Your streak is growing. One calm block tomorrow can keep it alive.';
  }

  if (analytics.distractedSessions > analytics.cleanSessions) {
    return 'Distractions showed up, but finishing still counts. Try a shorter block next.';
  }

  if (analytics.todayFocusMinutes > 0) {
    return 'You gave today real focus. A short reset can help your next block stay calm.';
  }

  return 'Pick one small task and Milo will help you build momentum.';
}

function getMiloNextSessionSuggestion(analytics: FocusAnalyticsSummary) {
  const latestSession = analytics.latestSession;

  if (!latestSession) {
    return 'Try a 10 or 15 minute focus block with one clear task.';
  }

  if (latestSession.status === 'stopped' || latestSession.status === 'skipped') {
    return 'Restart with a smaller focus block and one tiny target.';
  }

  if (analytics.sessionsThisWeek >= 5) {
    return 'Protect the habit: one clean block is enough for the next step.';
  }

  if (latestSession.focusQuality === 'distracted') {
    return 'Before the next session, remove one distraction and choose a shorter preset.';
  }

  return 'Repeat this preset with your next important task.';
}

function getTimeAwareMiloLine(displayName: string) {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) {
    return `Good morning, ${displayName}. Start small and make the day lighter.`;
  }

  if (hour >= 11 && hour < 14) {
    return 'Did you have lunch already?';
  }

  if (hour >= 18 && hour < 23) {
    return `Evening check-in, ${displayName}. One calm block is enough.`;
  }

  if (hour >= 23 || hour < 5) {
    return `Late night, ${displayName}. Be kind to your energy too.`;
  }

  return `Keep going, ${displayName}. Your next tiny step is enough.`;
}

function getRotatingMiloMessages(
  displayName: string,
  snapshot: CompanionPlannerSnapshot,
  analytics: FocusAnalyticsSummary
) {
  const taskTitle = getTaskTitle(snapshot.firstTask);
  const greetingLine = snapshot.firstTask
    ? `"${taskTitle}" needs your focus today. I'll stay with you.`
    : "Pick one small focus step. I'll stay with you.";
  const habitLine =
    analytics.completedSessionCount >= 5
      ? "You're building a strong focus habit."
      : null;
  const lines = [
    greetingLine,
    "Aww, don't be stressed. Milo will help you!",
    getTimeAwareMiloLine(displayName),
    'Small focus today still counts. Milo is proud of you.',
    'One tiny step first. Then we win the day.',
    'If your brain has too many tabs open, choose one and park the rest.',
    getMiloFocusReaction(analytics),
    habitLine,
  ];

  return Array.from(
    new Set(lines.filter((line): line is string => Boolean(line)))
  );
}

function getTalkPreviewText(analytics: FocusAnalyticsSummary) {
  const latestSession = analytics.latestSession;

  if (!latestSession) {
    return 'Ask me what to focus on, what is urgent, or how to prepare.';
  }

  if (latestSession.status === 'completed') {
    const taskTitle = getSessionTitle(latestSession);

    return latestSession.focusQuality === 'clean'
      ? `Great job finishing your focus session for ${taskTitle}.`
      : `You finished ${taskTitle}, even after a distraction. Proud of you.`;
  }

  if (latestSession.status === 'stopped') {
    return 'You stopped the last block. We can restart with a gentler timer.';
  }

  return 'You skipped the last block. Want to try a smaller focus step next?';
}

function MoodStatusCard({ item }: { item: MoodStatusItem }) {
  return (
    <View style={styles.statusCard}>
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: item.backgroundColor },
        ]}
      >
        <Ionicons name={item.icon} size={13} color={item.color} />
      </View>
      <View style={styles.statusCopy}>
        <Text numberOfLines={1} style={styles.statusLabel}>
          {item.label}
        </Text>
        <Text numberOfLines={1} style={styles.statusValue}>
          {item.value}
        </Text>
      </View>
    </View>
  );
}

export default function CompanionScreen() {
  const { isDark } = useFocusMateTheme();

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const tabBarHeight = useBottomTabBarHeight();
  const { userName, user } = useAuth();
  const { tasks } = useTasks();
  const { width, height } = useWindowDimensions();

  const displayName = userName?.trim() || 'Student';
  const focusHistoryUserId = user?.id ?? null;
  const companionUserId = user?.id || 'anonymous';
  const todayDate = getTodayDate();
  const compactWidth = width < 380;
  const narrowContent = width < 520;
  const stackTalkCard = width < 430;
  const stackDashboardCards = width < 720;
  const compactReactsStrip = width < 430;
  const stackReactsStrip = width < 360;
  const shortScreen = height < 760;

  const speechBubbleMotion = useRef(new Animated.Value(1)).current;
  const tapMessageIndexRef = useRef(0);
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMiloVideoPlayingRef = useRef(false);
  const isCompanionFocusedRef = useRef(false);
  const playIdleMiloVideoRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);

  const [miloMessage, setMiloMessage] = useState<string | null>(null);
  const [miloMood, setMiloMood] = useState<MiloMood | null>(null);
  const [focusHistory, setFocusHistory] = useState<FocusSessionHistoryItem[]>(
    []
  );
  const [selectedFocusSession, setSelectedFocusSession] =
    useState<FocusSessionHistoryItem | null>(null);
  const [speechMessageIndex, setSpeechMessageIndex] = useState(0);
  const [activeMiloVideo, setActiveMiloVideo] = useState<MiloVideoKey | null>(
    null
  );
  const [isCompanionFocused, setIsCompanionFocused] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [tapHintSeen, setTapHintSeen] = useState<boolean | null>(null);
  const [activeDetailModal, setActiveDetailModal] =
    useState<CompanionDetailModal | null>(null);
  const [resourceFinderMode, setResourceFinderMode] =
    useState<ResourceFinderMode>('finder');
  const [selectedResourceTaskId, setSelectedResourceTaskId] = useState<
    string | null
  >(null);
  const [selectedResourceKeywords, setSelectedResourceKeywords] = useState<
    string[]
  >([]);
  const [savedResources, setSavedResources] = useState<SavedResource[]>([]);
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceNote, setResourceNote] = useState('');
  const [resourceFinderMessage, setResourceFinderMessage] = useState('');

  const tapHintStorageKey = useMemo(
    () => getTapHintStorageKey(companionUserId),
    [companionUserId]
  );
  const greetingPlayer = useVideoPlayer(miloGreetingVideo, (player) => {
    player.loop = false;
    player.muted = true;
  });
  const idlePlayer = useVideoPlayer(miloIdleVideo, (player) => {
    player.loop = false;
    player.muted = true;
  });
  const proudPlayer = useVideoPlayer(miloProudVideo, (player) => {
    player.loop = false;
    player.muted = true;
  });
  const sleepyPlayer = useVideoPlayer(miloSleepyVideo, (player) => {
    player.loop = false;
    player.muted = true;
  });
  const thinkingPlayer = useVideoPlayer(miloThinkingVideo, (player) => {
    player.loop = false;
    player.muted = true;
  });
  const worriedPlayer = useVideoPlayer(miloWorriedVideo, (player) => {
    player.loop = false;
    player.muted = true;
  });
  const getActivePlayer = useCallback(() => {
    if (activeMiloVideo === 'greeting') return greetingPlayer;
    if (activeMiloVideo === 'idle') return idlePlayer;
    if (activeMiloVideo === 'proud') return proudPlayer;
    if (activeMiloVideo === 'sleepy') return sleepyPlayer;
    if (activeMiloVideo === 'thinking') return thinkingPlayer;
    if (activeMiloVideo === 'worried') return worriedPlayer;
    return null;
  }, [
    activeMiloVideo,
    greetingPlayer,
    idlePlayer,
    proudPlayer,
    sleepyPlayer,
    thinkingPlayer,
    worriedPlayer,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      title: 'Companion',
    });
  }, [navigation]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (reactionTimeoutRef.current) {
        clearTimeout(reactionTimeoutRef.current);
        reactionTimeoutRef.current = null;
      }

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    setTapHintSeen(null);
    void loadCompanionTapHintSeen(tapHintStorageKey).then((seen) => {
      if (isActive && mountedRef.current) {
        setTapHintSeen(seen);
      }
    });

    return () => {
      isActive = false;
    };
  }, [tapHintStorageKey]);

  const refreshReduceMotionPreference = useCallback(async () => {
    const nextReduceMotion = await loadReduceMotionPreference();

    if (mountedRef.current) {
      setReduceMotionEnabled(nextReduceMotion);
    }
  }, []);

  const loadFocusHistory = useCallback(async () => {
    const nextHistory = await getFocusSessionHistory(focusHistoryUserId);

    if (mountedRef.current) {
      setFocusHistory(nextHistory);
    }
  }, [focusHistoryUserId]);

  const refreshSavedResources = useCallback(async () => {
    const nextResources = await loadSavedResources();

    if (mountedRef.current) {
      setSavedResources(nextResources);
    }
  }, []);

  const openDetailModal = useCallback(
    async (modal: CompanionDetailModal) => {
      try {
        await Haptics.selectionAsync();
      } catch {
        // Taps should still work on devices where haptics are unavailable.
      }

      if (!mountedRef.current) return;

      setActiveDetailModal(modal);
      void loadFocusHistory();
    },
    [loadFocusHistory]
  );

  const closeDetailModal = useCallback(async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Closing the modal should not depend on haptics support.
    }

    if (mountedRef.current) {
      setActiveDetailModal(null);
      setSelectedFocusSession(null);
    }
  }, []);

  const getLinkedTaskForSession = useCallback(
    (session: FocusSessionHistoryItem) => {
      const linkedTaskId =
        session.taskId || session.selectedTaskId || session.localTaskId || null;

      if (!linkedTaskId) return undefined;

      return tasks.find((task) => task.id === linkedTaskId);
    },
    [tasks]
  );

  const handleOpenFocusSession = useCallback(
    async (session: FocusSessionHistoryItem) => {
      const linkedTask = getLinkedTaskForSession(session);

      try {
        await Haptics.selectionAsync();
      } catch {
        // Row presses should still work on devices where haptics are unavailable.
      }

      if (linkedTask) {
        setActiveDetailModal(null);
        setSelectedFocusSession(null);
        navigation.navigate('TaskDetails', { taskId: linkedTask.id });
        return;
      }

      setSelectedFocusSession(session);
      setActiveDetailModal('sessionDetail');
      void loadFocusHistory();
    },
    [getLinkedTaskForSession, loadFocusHistory, navigation]
  );

  useEffect(() => {
    if (activeDetailModal === 'resources') {
      void refreshSavedResources();
    }
  }, [activeDetailModal, refreshSavedResources]);

  const companionData = useMemo(() => {
    const now = new Date();
    const pendingTasks = tasks.filter(isPendingTask);
    const recommendedTasks = getMiloRecommendedTasks(tasks, now);
    const firstTask = recommendedTasks[0];
    const firstSituation = firstTask
      ? getMiloSituationForTask(firstTask, now)
      : undefined;
    const situationItems = pendingTasks.map((task) => ({
      task,
      situation: getMiloSituationForTask(task, now),
    }));
    const completedTodayItems = tasks.filter(
      (task) => task.status === 'completed' && task.dueDate === todayDate
    );
    const overdueCount = countSituations(situationItems, ['overdue']);
    const missedCount = countSituations(situationItems, ['missed']);
    const happeningNowCount = countSituations(situationItems, ['happening_now']);
    const startingSoonCount = countSituations(situationItems, ['starting_soon']);
    const dueTodayCount = countSituations(situationItems, [
      'due_today',
      'due_tonight',
      'all_day',
    ]);
    const highFocusCount = countSituations(situationItems, ['high_focus']);
    const startEarlyCount = countSituations(situationItems, ['start_early']);
    const meetingTodayItems = pendingTasks.filter(
      (task) => task.plannerType === 'meeting' && task.dueDate === todayDate
    );
    const acceptedOverlapItems = situationItems.filter(
      (item) =>
        item.situation.kind === 'accepted_overlap' || hasAcceptedOverlap(item.task)
    );
    const storedOverlapItems = pendingTasks.filter(hasStoredOverlap);
    const directOverlapCount = countDirectOverlaps(pendingTasks);
    const scheduleOverlapCount = Math.max(
      storedOverlapItems.length,
      directOverlapCount
    );
    const unacceptedOverlapCount = Math.max(
      0,
      scheduleOverlapCount - acceptedOverlapItems.length
    );
    const snapshot: CompanionPlannerSnapshot = {
      firstTask,
      firstSituation,
      pendingCount: pendingTasks.length,
      completedTodayCount: completedTodayItems.length,
      totalTodayCount: tasks.filter((task) => task.dueDate === todayDate).length,
      overdueCount,
      missedCount,
      happeningNowCount,
      startingSoonCount,
      dueTodayCount,
      meetingTodayCount: meetingTodayItems.length,
      highFocusCount,
      startEarlyCount,
      acceptedOverlapCount: acceptedOverlapItems.length,
      unacceptedOverlapCount,
    };

    const defaultMessage = getDefaultMiloMessage(displayName, snapshot);
    const mood = getSituationMood(snapshot);

    return {
      ...snapshot,
      defaultMessage,
      mood,
    };
  }, [displayName, tasks, todayDate]);

  const resourceFinderTasks = useMemo(
    () =>
      [...tasks].sort((first, second) => {
        if (first.status !== second.status) {
          return first.status === 'pending' ? -1 : 1;
        }

        return first.title.localeCompare(second.title);
      }),
    [tasks]
  );
  const selectedResourceTask = useMemo(
    () =>
      resourceFinderTasks.find((task) => task.id === selectedResourceTaskId) ||
      null,
    [resourceFinderTasks, selectedResourceTaskId]
  );
  const resourceKeywords = useMemo(
    () =>
      selectedResourceTask
        ? generateResourceKeywords(selectedResourceTask)
        : [],
    [selectedResourceTask]
  );
  const selectedResourceKeywordSet = useMemo(
    () => new Set(selectedResourceKeywords),
    [selectedResourceKeywords]
  );
  const activeResourceKeywords = useMemo(
    () =>
      resourceKeywords.filter((keyword) =>
        selectedResourceKeywordSet.has(keyword)
      ),
    [resourceKeywords, selectedResourceKeywordSet]
  );

  useEffect(() => {
    if (
      selectedResourceTaskId &&
      !resourceFinderTasks.some((task) => task.id === selectedResourceTaskId)
    ) {
      setSelectedResourceTaskId(null);
    }
  }, [resourceFinderTasks, selectedResourceTaskId]);

  useEffect(() => {
    setSelectedResourceKeywords(resourceKeywords);
  }, [resourceKeywords]);

  useFocusEffect(
    useCallback(() => {
      const shouldOpenResourceFinder = Boolean(route.params?.openResourceFinder);
      const requestedTaskId =
        typeof route.params?.openResourceFinderForTaskId === 'string'
          ? route.params.openResourceFinderForTaskId
          : null;

      if (!shouldOpenResourceFinder && !requestedTaskId) {
        return undefined;
      }

      const requestedTask = requestedTaskId
        ? resourceFinderTasks.find((task) => task.id === requestedTaskId)
        : null;

      if (requestedTask) {
        setSelectedResourceTaskId(requestedTask.id);
        setSelectedResourceKeywords(generateResourceKeywords(requestedTask));
        setResourceFinderMessage(
          `Milo picked "${requestedTask.title}" for resource search.`
        );
      } else {
        setSelectedResourceTaskId(null);
        setSelectedResourceKeywords([]);
        setResourceFinderMessage('Choose a task and Milo will suggest keywords.');
      }

      setResourceFinderMode('finder');
      void openDetailModal('resources');
      navigation.setParams({
        openResourceFinder: undefined,
        openResourceFinderForTaskId: undefined,
      });

      return undefined;
    }, [
      navigation,
      openDetailModal,
      resourceFinderTasks,
      route.params?.openResourceFinder,
      route.params?.openResourceFinderForTaskId,
    ])
  );

  const focusAnalytics = useMemo(
    () => createFocusAnalytics(focusHistory, todayDate),
    [focusHistory, todayDate]
  );
  const rotatingMessages = useMemo(
    () => getRotatingMiloMessages(displayName, companionData, focusAnalytics),
    [companionData, displayName, focusAnalytics]
  );
  const activeMood = miloMood || companionData.mood;
  const activeMessage =
    miloMessage ||
    rotatingMessages[speechMessageIndex % Math.max(rotatingMessages.length, 1)] ||
    companionData.defaultMessage;
  const moodPanelWidth = compactWidth ? 98 : 118;
  const roomCardHeight = shortScreen ? 414 : compactWidth ? 430 : 456;
  const bottomContentPadding = tabBarHeight + (shortScreen ? 54 : 66);
  const stressSignals =
    companionData.overdueCount +
    companionData.missedCount +
    companionData.unacceptedOverlapCount;
  const statusItems: MoodStatusItem[] = [
    {
      label: 'Energy',
      value: companionData.completedTodayCount > 0 ? 'Bright' : 'Gentle',
      icon: 'battery-half',
      color: theme.colors.primaryDark,
      backgroundColor: theme.colors.primarySoft,
    },
    {
      label: 'Stress',
      value: stressSignals > 0 ? 'Needs care' : 'Low',
      icon: 'heart',
      color: stressSignals > 0 ? theme.colors.danger : theme.colors.primaryDark,
      backgroundColor:
        stressSignals > 0 ? theme.colors.dangerSoft : theme.colors.primarySoft,
    },
    {
      label: 'Focus',
      value:
        companionData.highFocusCount > 0 || companionData.dueTodayCount > 0
          ? 'On task'
          : 'Open',
      icon: 'sparkles',
      color: theme.colors.purple,
      backgroundColor: theme.colors.purpleSoft,
    },
    {
      label: 'About Milo',
      value: 'Kind planner',
      icon: 'leaf',
      color: theme.colors.blue,
      backgroundColor: theme.colors.blueSoft,
    },
  ];
  const latestChatPreview = getTalkPreviewText(focusAnalytics);
  const latestChatTime = focusAnalytics.latestSession
    ? formatSessionTime(focusAnalytics.latestSession.date)
    : formatSessionTime(new Date().toISOString());
  const latestReaction = getMiloFocusReaction(focusAnalytics);
  const latestReactionSession = focusAnalytics.latestSession;
  const latestReactionDuration =
    latestReactionSession?.durationMinutes ?? focusAnalytics.todayFocusMinutes;
  const latestReactionPreset = latestReactionSession?.presetName ?? 'Classic';
  const latestReactionPresetLabel = latestReactionPreset
    .replace(' Pomodoro', '')
    .replace(' Rhythm', '');
  const latestReactionQuality =
    latestReactionSession?.focusQuality === 'distracted'
      ? 'Distracted'
      : 'Clean';
  const recentSessionRows = focusAnalytics.recentSessions;
  const focusScoreLabel =
    focusAnalytics.focusScore === null ? '--' : `${focusAnalytics.focusScore}%`;

  const speechBubbleMotionStyle = {
    opacity: speechBubbleMotion,
    transform: reduceMotionEnabled
      ? undefined
      : [
          {
            scale: speechBubbleMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [0.97, 1],
            }),
          },
          {
            translateY: speechBubbleMotion.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 0],
            }),
          },
        ],
  };

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const stopMiloVideos = useCallback(() => {
    try {
      greetingPlayer.pause();
      idlePlayer.pause();
      proudPlayer.pause();
      sleepyPlayer.pause();
      thinkingPlayer.pause();
      worriedPlayer.pause();
    } catch (error) {
      console.warn('Unable to pause Milo videos:', error);
    }

    isMiloVideoPlayingRef.current = false;
    setActiveMiloVideo(null);
  }, [
    greetingPlayer,
    idlePlayer,
    proudPlayer,
    sleepyPlayer,
    thinkingPlayer,
    worriedPlayer,
  ]);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();

    if (
      !isCompanionFocusedRef.current ||
      reduceMotionEnabled ||
      isMiloVideoPlayingRef.current ||
      videoFailed
    ) {
      return;
    }

    inactivityTimerRef.current = setTimeout(() => {
      inactivityTimerRef.current = null;

      if (!isCompanionFocusedRef.current) {
        console.log('Skipped Milo video because Companion is not focused');
        return;
      }

      playIdleMiloVideoRef.current();
    }, MILO_INACTIVITY_AUTOPLAY_MS);
  }, [clearInactivityTimer, reduceMotionEnabled, videoFailed]);

  const finishMiloVideo = useCallback(() => {
    if (!isMiloVideoPlayingRef.current) {
      return;
    }

    console.log('Milo video ended');
    isMiloVideoPlayingRef.current = false;
    setActiveMiloVideo(null);
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const handleMiloVideoError = useCallback(
    (videoKey: MiloVideoKey, error: unknown) => {
      console.warn('Milo video error', error);
      console.warn(`Unable to play Milo ${videoKey} video:`, error);
      isMiloVideoPlayingRef.current = false;
      setActiveMiloVideo(null);
      setVideoFailed(true);
      resetInactivityTimer();
    },
    [resetInactivityTimer]
  );

  const playMiloVideo = useCallback(
    (videoKey: MiloVideoKey) => {
      if (!isCompanionFocusedRef.current) {
        console.log('Skipped Milo video because Companion is not focused');
        return;
      }

      if (reduceMotionEnabled) {
        console.log('Skipped Milo video because reduce motion is enabled');
        return;
      }

      if (isMiloVideoPlayingRef.current) {
        return;
      }

      if (videoFailed) return;

      clearInactivityTimer();

      const player =
        videoKey === 'greeting'
          ? greetingPlayer
          : videoKey === 'idle'
          ? idlePlayer
          : videoKey === 'proud'
          ? proudPlayer
          : videoKey === 'sleepy'
          ? sleepyPlayer
          : videoKey === 'thinking'
          ? thinkingPlayer
          : worriedPlayer;

      try {
        console.log(`Playing Milo ${videoKey} video`);
        isMiloVideoPlayingRef.current = true;
        setActiveMiloVideo(videoKey);

        requestAnimationFrame(() => {
          try {
            player.replay();
            player.play();
          } catch (error) {
            handleMiloVideoError(videoKey, error);
          }
        });
      } catch (error) {
        handleMiloVideoError(videoKey, error);
      }
    },
    [
      clearInactivityTimer,
      greetingPlayer,
      handleMiloVideoError,
      idlePlayer,
      proudPlayer,
      reduceMotionEnabled,
      sleepyPlayer,
      thinkingPlayer,
      videoFailed,
      worriedPlayer,
    ]
  );

  const playIdleMiloVideo = useCallback(() => {
    playMiloVideo(pickRandomItem(MILO_IDLE_AUTOPLAY_VIDEO_KEYS));
  }, [playMiloVideo]);

  const playTapMiloVideo = useCallback(() => {
    playMiloVideo(pickRandomItem(MILO_TAP_VIDEO_KEYS));
  }, [playMiloVideo]);

  useEffect(() => {
    if (!reduceMotionEnabled) {
      return;
    }

    clearInactivityTimer();
    stopMiloVideos();
    speechBubbleMotion.setValue(1);
  }, [
    clearInactivityTimer,
    reduceMotionEnabled,
    speechBubbleMotion,
    stopMiloVideos,
  ]);

  const tapMessages = useMemo(
    () => [
      `Boop. I'm here, ${displayName}. Pick one tiny step.`,
      "Tiny steps count. I'll stay close.",
      companionData.firstTask
        ? "I found the next step. Let's take it gently."
        : companionData.completedTodayCount > 0
        ? 'You made progress today. I noticed.'
        : 'Your planner is quiet. Want one tiny plan?',
      'Deep breath. Just the next useful action.',
    ],
    [companionData.completedTodayCount, companionData.firstTask, displayName]
  );

  useEffect(() => {
    tapMessageIndexRef.current = 0;
  }, [tapMessages]);

  useEffect(() => {
    setSpeechMessageIndex(0);
  }, [rotatingMessages]);

  useEffect(() => {
    if (!isCompanionFocused || miloMessage || rotatingMessages.length <= 1) {
      return undefined;
    }

    const interval = setInterval(() => {
      setSpeechMessageIndex((currentIndex) =>
        (currentIndex + 1) % rotatingMessages.length
      );
    }, SPEECH_ROTATION_MS);

    return () => clearInterval(interval);
  }, [isCompanionFocused, miloMessage, rotatingMessages.length]);

  useEffect(() => {
    playIdleMiloVideoRef.current = playIdleMiloVideo;
  }, [playIdleMiloVideo]);

  useFocusEffect(
    useCallback(() => {
      console.log('Companion focused');
      isCompanionFocusedRef.current = true;
      setIsCompanionFocused(true);
      setActiveMiloVideo(null);
      isMiloVideoPlayingRef.current = false;
      void refreshReduceMotionPreference();
      void loadFocusHistory();
      resetInactivityTimer();

      return () => {
        console.log('Companion blurred, stopping Milo videos');
        isCompanionFocusedRef.current = false;
        setIsCompanionFocused(false);
        clearInactivityTimer();
        stopMiloVideos();
      };
    }, [
      clearInactivityTimer,
      loadFocusHistory,
      refreshReduceMotionPreference,
      resetInactivityTimer,
      stopMiloVideos,
    ])
  );

  useEffect(() => {
    const miloVideoPlayers = [
      { key: 'greeting' as const, player: greetingPlayer },
      { key: 'idle' as const, player: idlePlayer },
      { key: 'proud' as const, player: proudPlayer },
      { key: 'sleepy' as const, player: sleepyPlayer },
      { key: 'thinking' as const, player: thinkingPlayer },
      { key: 'worried' as const, player: worriedPlayer },
    ];

    const subscriptions = miloVideoPlayers.flatMap(({ key, player }) => [
      player.addListener('playToEnd', finishMiloVideo),
      player.addListener('statusChange', ({ status, error }) => {
        if (status === 'error') {
          handleMiloVideoError(key, error);
        }
      }),
    ]);

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [
    finishMiloVideo,
    greetingPlayer,
    handleMiloVideoError,
    idlePlayer,
    proudPlayer,
    sleepyPlayer,
    thinkingPlayer,
    worriedPlayer,
  ]);

  useEffect(() => {
    if (reduceMotionEnabled) {
      speechBubbleMotion.setValue(1);
      return undefined;
    }

    speechBubbleMotion.setValue(0);

    const animation = Animated.spring(speechBubbleMotion, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [activeMessage, reduceMotionEnabled, speechBubbleMotion]);

  const clearReactionTimeout = () => {
    if (reactionTimeoutRef.current) {
      clearTimeout(reactionTimeoutRef.current);
      reactionTimeoutRef.current = null;
    }
  };

  const updateMiloSpeech = async (message: string, mood: MiloMood) => {
    clearReactionTimeout();

    await Haptics.selectionAsync();

    if (!mountedRef.current) return;

    setMiloMessage(message);
    setMiloMood(mood);

    reactionTimeoutRef.current = setTimeout(() => {
      setMiloMessage(null);
      setMiloMood(null);
      reactionTimeoutRef.current = null;
    }, TEMPORARY_MILO_REACTION_MS);
  };

  const handleContinueChat = async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Navigation should still work when haptics are unavailable.
    }

    navigation.navigate('MiloChat');
  };

  const handleOpenOldMessages = async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Navigation should still work when haptics are unavailable.
    }

    navigation.navigate('MiloChatHistory');
  };

  const handleMiloTap = async () => {
    const currentIndex = tapMessageIndexRef.current % tapMessages.length;
    tapMessageIndexRef.current = (currentIndex + 1) % tapMessages.length;

    await updateMiloSpeech(tapMessages[currentIndex], companionData.mood);
  };

  const markTapHintSeen = useCallback(() => {
    if (tapHintSeen === true) {
      return;
    }

    setTapHintSeen(true);
    void saveCompanionTapHintSeen(tapHintStorageKey);
  }, [tapHintSeen, tapHintStorageKey]);

  const handleMiloPress = () => {
    console.log('Milo tapped');

    if (isMiloVideoPlayingRef.current) {
      return;
    }

    resetInactivityTimer();
    playTapMiloVideo();
    markTapHintSeen();
    void handleMiloTap();
  };

  const handleSpeak = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Speech.stop();
    Speech.speak(activeMessage, {
      language: 'en-US',
      pitch: 1.1,
      rate: 0.92,
    });
  };

  const handleStartFocus = async () => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Navigation should still happen when haptics are unavailable.
    }

    if (mountedRef.current) {
      setActiveDetailModal(null);
    }

    navigation.navigate('FocusSession');
  };

  const handleSelectResourceTask = async (taskId: string) => {
    try {
      await Haptics.selectionAsync();
    } catch {
      // Task selection should still work on devices where haptics are unavailable.
    }

    const nextTask = resourceFinderTasks.find((task) => task.id === taskId);

    setSelectedResourceTaskId(taskId);
    setSelectedResourceKeywords(
      nextTask ? generateResourceKeywords(nextTask) : []
    );
    setResourceFinderMode('finder');
    setResourceFinderMessage('');
  };

  const handleToggleResourceKeyword = (keyword: string) => {
    const isSelected = selectedResourceKeywordSet.has(keyword);
    const nextKeywords = isSelected
      ? selectedResourceKeywords.filter(
          (currentKeyword) => currentKeyword !== keyword
        )
      : [...selectedResourceKeywords, keyword];

    setSelectedResourceKeywords(nextKeywords);
    setResourceFinderMessage(
      nextKeywords.length === 0
        ? 'Pick at least one keyword for Milo to search.'
        : ''
    );
  };

  const handleSearchResourceWeb = async () => {
    if (!selectedResourceTask) {
      setResourceFinderMessage('Choose a task first so Milo knows what to find.');
      return;
    }

    if (activeResourceKeywords.length === 0) {
      setResourceFinderMessage('Pick at least one keyword for Milo to search.');
      return;
    }

    const query = buildResourceSearchQuery(activeResourceKeywords);

    try {
      await Linking.openURL(buildGoogleSearchUrl(query));
      setResourceFinderMessage('Milo opened a Google search for this task.');
    } catch (error) {
      console.warn('Failed to open resource search:', error);
      setResourceFinderMessage('Milo could not open the web search right now.');
    }
  };

  const handleShowSaveResource = () => {
    setResourceFinderMode('save');
    setResourceFinderMessage('Paste a useful link and Milo will keep it here.');
  };

  const handleOpenSavedResources = async () => {
    setResourceFinderMode('saved');
    setResourceFinderMessage('');
    await refreshSavedResources();
  };

  const handleSaveResource = async () => {
    const trimmedTitle = resourceTitle.trim();
    const trimmedUrl = resourceUrl.trim();

    if (!trimmedTitle || !trimmedUrl) {
      setResourceFinderMessage('Add a resource title and URL before saving.');
      return;
    }

    const nextResources = await saveResource({
      taskId: selectedResourceTask?.id,
      taskTitle: selectedResourceTask?.title,
      resourceTitle: trimmedTitle,
      resourceUrl: getOpenableResourceUrl(trimmedUrl),
      note: resourceNote.trim() || undefined,
    });

    if (!mountedRef.current) return;

    setSavedResources(nextResources);
    setResourceTitle('');
    setResourceUrl('');
    setResourceNote('');
    setResourceFinderMode('saved');
    setResourceFinderMessage('Saved locally. Milo will remember this resource.');
  };

  const handleOpenResource = async (resource: SavedResource) => {
    try {
      await Linking.openURL(getOpenableResourceUrl(resource.resourceUrl));
    } catch (error) {
      console.warn('Failed to open saved resource:', error);
      setResourceFinderMessage('Milo could not open that resource right now.');
    }
  };

  const handleDeleteSavedResource = async (resourceId: string) => {
    const nextResources = await deleteSavedResource(resourceId);

    if (mountedRef.current) {
      setSavedResources(nextResources);
      setResourceFinderMessage('Resource removed from Milo Resource Finder.');
    }
  };

  const detailModalTitle =
    activeDetailModal === 'analytics'
      ? 'Focus Analytics'
      : activeDetailModal === 'sessions'
      ? 'Recent Sessions'
      : activeDetailModal === 'sessionDetail'
      ? 'Session Details'
      : activeDetailModal === 'reaction'
      ? "Milo's Focus Reaction"
      : activeDetailModal === 'resources'
      ? 'Milo Resource Finder'
      : '';
  const modalMaxHeight = Math.max(360, height - 72);

  const renderModalMetric = (
    label: string,
    value: string,
    icon: IconName,
    color = theme.colors.primaryDark,
    backgroundColor = theme.colors.primarySoft
  ) => (
    <View key={label} style={styles.modalMetricCard}>
      <View style={[styles.modalMetricIcon, { backgroundColor }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <View style={styles.modalMetricCopy}>
        <Text numberOfLines={1} style={styles.modalMetricLabel}>
          {label}
        </Text>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={styles.modalMetricValue}
        >
          {value}
        </Text>
      </View>
    </View>
  );

  const renderModalActions = ({
    primaryLabel,
    onPrimaryPress,
    secondaryLabel,
    onSecondaryPress,
    closeLabel,
  }: {
    primaryLabel?: string;
    onPrimaryPress?: () => void;
    secondaryLabel?: string;
    onSecondaryPress?: () => void;
    closeLabel?: string;
  }) => (
    <View style={styles.modalButtonRow}>
      {primaryLabel && onPrimaryPress ? (
        <TouchableOpacity
          activeOpacity={0.84}
          style={[styles.modalActionButton, styles.modalPrimaryButton]}
          onPress={onPrimaryPress}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={styles.modalPrimaryButtonText}
          >
            {primaryLabel}
          </Text>
        </TouchableOpacity>
      ) : null}

      {secondaryLabel && onSecondaryPress ? (
        <TouchableOpacity
          activeOpacity={0.84}
          style={[styles.modalActionButton, styles.modalSecondaryButton]}
          onPress={onSecondaryPress}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={styles.modalSecondaryButtonText}
          >
            {secondaryLabel}
          </Text>
        </TouchableOpacity>
      ) : null}

      {closeLabel ? (
        <TouchableOpacity
          activeOpacity={0.84}
          style={[styles.modalActionButton, styles.modalSecondaryButton]}
          onPress={() => void closeDetailModal()}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={styles.modalSecondaryButtonText}
          >
            {closeLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderEmptyState = (title: string, message: string) => (
    <View style={styles.modalEmptyState}>
      <View style={styles.modalEmptyIcon}>
        <MiloMoodImage mood="waving" size={62} />
      </View>
      <Text style={styles.modalEmptyTitle}>{title}</Text>
      <Text style={styles.modalEmptyText}>{message}</Text>
    </View>
  );

  const renderAnalyticsModalContent = () => {
    if (focusAnalytics.completedSessionCount === 0) {
      return (
        <>
          {renderEmptyState(
            'No analytics yet',
            'Start your first focus session and Milo will build your weekly focus report.'
          )}
          {renderModalActions({
            primaryLabel: 'Start FocusGuard Pomodoro',
            onPrimaryPress: () => void handleStartFocus(),
          })}
        </>
      );
    }

    return (
      <>
        <View style={styles.modalMetricGrid}>
          {renderModalMetric(
            'Focus minutes this week',
            formatMinutesLabel(focusAnalytics.weekFocusMinutes),
            'time-outline'
          )}
          {renderModalMetric(
            'Total sessions this week',
            `${focusAnalytics.sessionsThisWeek}`,
            'albums-outline',
            theme.colors.blue,
            theme.colors.blueSoft
          )}
          {renderModalMetric(
            'Clean sessions',
            `${focusAnalytics.cleanSessions}`,
            'checkmark-circle',
            theme.colors.primaryDark,
            theme.colors.successSoft
          )}
          {renderModalMetric(
            'Distracted sessions',
            `${focusAnalytics.distractedSessions}`,
            'alert-circle',
            '#B7791F',
            theme.colors.yellowSoft
          )}
          {renderModalMetric(
            'Day streak',
            `${focusAnalytics.dayStreak}`,
            'flame-outline',
            '#B7791F',
            theme.colors.yellowSoft
          )}
          {renderModalMetric(
            'Focus score',
            focusScoreLabel,
            'sparkles',
            theme.colors.purple,
            theme.colors.purpleSoft
          )}
          {renderModalMetric(
            'Most focused task',
            focusAnalytics.mostFocusedTask,
            'flag-outline',
            theme.colors.primaryDark,
            '#F1FAED'
          )}
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Weekly focus trend</Text>
          <WeeklyFocusChart
            data={focusAnalytics.weeklyTrend}
            style={styles.modalTrendCard}
          />
        </View>

        <View style={styles.modalInsightCard}>
          <View style={styles.modalInsightIcon}>
            <MiloMoodImage mood="happy" size={42} />
          </View>
          <View style={styles.modalInsightCopy}>
            <Text numberOfLines={1} style={styles.modalInsightTitle}>
              Milo productivity insight
            </Text>
            <Text style={styles.modalInsightText}>
              {getMiloProductivityInsight(focusAnalytics)}
            </Text>
          </View>
        </View>

        {renderModalActions({
          primaryLabel: 'Start another focus',
          onPrimaryPress: () => void handleStartFocus(),
          secondaryLabel: 'View recent sessions',
          onSecondaryPress: () => void openDetailModal('sessions'),
        })}
      </>
    );
  };

  const renderRecentSessionsModalContent = () => {
    const focusSessions = focusHistory.filter(isRealFocusSession);

    if (focusSessions.length === 0) {
      return (
        <>
          {renderEmptyState(
            'No sessions yet',
            'Your completed, stopped, and skipped focus sessions will appear here.'
          )}
          {renderModalActions({
            primaryLabel: 'Start first session',
            onPrimaryPress: () => void handleStartFocus(),
          })}
        </>
      );
    }

    return (
      <>
        <View style={styles.modalSessionList}>
          {focusSessions.map((session) => {
            const statusMeta = focusSessionStatusMeta[session.status];
            const isClean = session.focusQuality === 'clean';

            return (
              <TouchableOpacity
                key={session.id}
                activeOpacity={0.86}
                style={styles.modalSessionCard}
                onPress={() => void handleOpenFocusSession(session)}
                accessibilityRole="button"
                accessibilityLabel={`Open focus session ${getSessionTitle(session)}`}
              >
                <View style={styles.modalSessionHeader}>
                  <View style={styles.modalSessionTitleWrap}>
                    <Text numberOfLines={1} style={styles.modalSessionTitle}>
                      {getSessionTitle(session)}
                    </Text>
                    <Text numberOfLines={1} style={styles.modalSessionDate}>
                      {formatSessionDateTime(session.date, todayDate)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.modalStatusBadge,
                      { backgroundColor: statusMeta.backgroundColor },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.modalStatusText, { color: statusMeta.color }]}
                    >
                      {statusMeta.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalSessionDetailRow}>
                  <Text numberOfLines={1} style={styles.modalSessionDetail}>
                    {formatMinutesLabel(session.durationMinutes)}
                  </Text>
                  <Text numberOfLines={1} style={styles.modalSessionDetail}>
                    {session.presetName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.modalSessionDetail,
                      isClean
                        ? styles.modalSessionDetailClean
                        : styles.modalSessionDetailDistracted,
                    ]}
                  >
                    {formatFocusQuality(session.focusQuality)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {renderModalActions({
          primaryLabel: 'Start new focus',
          onPrimaryPress: () => void handleStartFocus(),
        })}
      </>
    );
  };

  const renderSessionDetailModalContent = () => {
    const session = selectedFocusSession;

    if (!session) {
      return renderEmptyState(
        'Session not found',
        'Milo could not find the focus session details right now.'
      );
    }

    const statusMeta = focusSessionStatusMeta[session.status];
    const linkedTask = getLinkedTaskForSession(session);

    return (
      <>
        <View style={styles.modalSummaryCard}>
          <View style={styles.modalSummaryTopRow}>
            <View style={styles.modalSessionTitleWrap}>
              <Text numberOfLines={2} style={styles.modalSessionTitle}>
                {getSessionTitle(session)}
              </Text>
              <Text numberOfLines={1} style={styles.modalSessionDate}>
                {formatSessionDateTime(session.endedAt || session.date, todayDate)}
              </Text>
            </View>
            <View
              style={[
                styles.modalStatusBadge,
                { backgroundColor: statusMeta.backgroundColor },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.modalStatusText, { color: statusMeta.color }]}
              >
                {statusMeta.label}
              </Text>
            </View>
          </View>

          <View style={styles.modalMetricGrid}>
            {renderModalMetric(
              'Focus duration',
              formatMinutesLabel(session.durationMinutes),
              'time-outline'
            )}
            {renderModalMetric(
              'Preset',
              session.presetName,
              'options-outline',
              theme.colors.purple,
              theme.colors.purpleSoft
            )}
            {renderModalMetric(
              'Started',
              formatSessionDateTime(session.startedAt, todayDate),
              'play-circle-outline',
              theme.colors.blue,
              theme.colors.blueSoft
            )}
            {renderModalMetric(
              'Ended',
              formatSessionDateTime(session.endedAt || session.date, todayDate),
              'stop-circle-outline',
              '#B7791F',
              theme.colors.yellowSoft
            )}
            {renderModalMetric(
              'Linked task',
              linkedTask?.title || 'No linked task',
              linkedTask ? 'document-text-outline' : 'unlink-outline',
              theme.colors.primaryDark,
              linkedTask ? theme.colors.successSoft : theme.colors.input
            )}
          </View>
        </View>

        {renderModalActions({
          closeLabel: 'Close',
        })}
      </>
    );
  };

  const renderReactionModalContent = () => {
    const latestSession = focusAnalytics.latestSession;

    if (!latestSession) {
      return (
        <>
          {renderEmptyState(
            'Milo is waiting to cheer you on 💚',
            'Finish one focus block and Milo will react to your progress.'
          )}
          {renderModalActions({
            primaryLabel: 'Start with Milo',
            onPrimaryPress: () => void handleStartFocus(),
          })}
        </>
      );
    }

    const statusMeta = focusSessionStatusMeta[latestSession.status];

    return (
      <>
        <View style={styles.modalInsightCard}>
          <View style={styles.modalInsightIcon}>
            <MiloMoodImage
              mood={latestSession.focusQuality === 'distracted' ? 'worried' : 'happy'}
              size={42}
            />
          </View>
          <View style={styles.modalInsightCopy}>
            <Text numberOfLines={1} style={styles.modalInsightTitle}>
              Milo reaction message
            </Text>
            <Text style={styles.modalInsightText}>{latestReaction}</Text>
          </View>
        </View>

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Latest session summary</Text>
          <View style={styles.modalSummaryCard}>
            <View style={styles.modalSummaryTopRow}>
              <View style={styles.modalSessionTitleWrap}>
                <Text numberOfLines={1} style={styles.modalSessionTitle}>
                  {getSessionTitle(latestSession)}
                </Text>
                <Text numberOfLines={1} style={styles.modalSessionDate}>
                  {formatSessionDateTime(latestSession.date, todayDate)}
                </Text>
              </View>
              <View
                style={[
                  styles.modalStatusBadge,
                  { backgroundColor: statusMeta.backgroundColor },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.modalStatusText, { color: statusMeta.color }]}
                >
                  {statusMeta.label}
                </Text>
              </View>
            </View>

            <View style={styles.modalMetricGrid}>
              {renderModalMetric(
                'Duration',
                formatMinutesLabel(latestSession.durationMinutes),
                'time-outline'
              )}
              {renderModalMetric(
                'Focus quality',
                formatFocusQuality(latestSession.focusQuality),
                latestSession.focusQuality === 'clean'
                  ? 'checkmark-circle'
                  : 'alert-circle',
                latestSession.focusQuality === 'clean'
                  ? theme.colors.primaryDark
                  : '#B7791F',
                latestSession.focusQuality === 'clean'
                  ? theme.colors.successSoft
                  : theme.colors.yellowSoft
              )}
              {renderModalMetric(
                'Preset used',
                latestSession.presetName,
                'options-outline',
                theme.colors.purple,
                theme.colors.purpleSoft
              )}
            </View>
          </View>
        </View>

        <View style={styles.modalSuggestionCard}>
          <Ionicons
            name="leaf-outline"
            size={18}
            color={theme.colors.primaryDark}
          />
          <Text style={styles.modalSuggestionText}>
            {getMiloNextSessionSuggestion(focusAnalytics)}
          </Text>
        </View>

        {renderModalActions({
          primaryLabel: 'Try another focus block',
          onPrimaryPress: () => void handleStartFocus(),
        })}
      </>
    );
  };

  const renderResourceTaskList = () => (
    <View style={styles.resourceTaskList}>
      {resourceFinderTasks.map((task) => {
        const isSelected = task.id === selectedResourceTaskId;

        return (
          <TouchableOpacity
            key={task.id}
            activeOpacity={0.84}
            style={[
              styles.resourceTaskChip,
              isSelected && styles.resourceTaskChipSelected,
            ]}
            onPress={() => void handleSelectResourceTask(task.id)}
            accessibilityRole="button"
            accessibilityLabel={`Choose ${task.title} for resource search`}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.resourceTaskTitle,
                isSelected && styles.resourceTaskTitleSelected,
              ]}
            >
              {task.title}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.resourceTaskMeta,
                isSelected && styles.resourceTaskMetaSelected,
              ]}
            >
              {task.plannerType} | {task.priority}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderResourceFinderActions = () => (
    <View style={styles.resourceActionGrid}>
      <TouchableOpacity
        activeOpacity={0.84}
        disabled={!selectedResourceTask || activeResourceKeywords.length === 0}
        style={[
          styles.resourceActionButton,
          styles.resourcePrimaryButton,
          (!selectedResourceTask || activeResourceKeywords.length === 0) &&
            styles.resourceDisabledButton,
        ]}
        onPress={() => void handleSearchResourceWeb()}
        accessibilityRole="button"
        accessibilityLabel="Search web for task resources"
      >
        <Text style={styles.resourcePrimaryButtonText}>Search Web</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.84}
        style={[styles.resourceActionButton, styles.resourceSecondaryButton]}
        onPress={handleShowSaveResource}
        accessibilityRole="button"
        accessibilityLabel="Save a resource"
      >
        <Text style={styles.resourceSecondaryButtonText}>Save Resource</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.84}
        style={[styles.resourceActionButton, styles.resourceSecondaryButton]}
        onPress={() => void handleOpenSavedResources()}
        accessibilityRole="button"
        accessibilityLabel="Open saved resources"
      >
        <Text style={styles.resourceSecondaryButtonText}>
          Open Saved Resources
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderResourceSaveForm = () => (
    <View style={styles.resourceSaveCard}>
      <Text style={styles.modalSectionTitle}>Save a resource</Text>
      <TextInput
        value={resourceTitle}
        onChangeText={setResourceTitle}
        placeholder="Resource title"
        placeholderTextColor={theme.colors.muted}
        style={styles.resourceInput}
      />
      <TextInput
        value={resourceUrl}
        onChangeText={setResourceUrl}
        placeholder="https://example.com"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="none"
        keyboardType="url"
        style={styles.resourceInput}
      />
      <TextInput
        value={resourceNote}
        onChangeText={setResourceNote}
        placeholder="Milo note (optional)"
        placeholderTextColor={theme.colors.muted}
        multiline
        textAlignVertical="top"
        style={[styles.resourceInput, styles.resourceNoteInput]}
      />
      <TouchableOpacity
        activeOpacity={0.84}
        style={[styles.modalActionButton, styles.modalPrimaryButton]}
        onPress={() => void handleSaveResource()}
        accessibilityRole="button"
        accessibilityLabel="Save resource locally"
      >
        <Text style={styles.modalPrimaryButtonText}>Save Resource</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSavedResourceList = () => (
    <View style={styles.modalSection}>
      <Text style={styles.modalSectionTitle}>Saved resources</Text>
      {savedResources.length === 0 ? (
        <View style={styles.resourceSavedEmpty}>
          <Ionicons
            name="bookmark-outline"
            size={24}
            color={theme.colors.primaryDark}
          />
          <Text style={styles.resourceSavedEmptyText}>
            No saved resources yet. Search the web, then paste the best links
            here.
          </Text>
        </View>
      ) : (
        <View style={styles.resourceSavedList}>
          {savedResources.map((resource) => (
            <View key={resource.id} style={styles.resourceSavedCard}>
              <View style={styles.resourceSavedHeader}>
                <View style={styles.resourceSavedCopy}>
                  <Text numberOfLines={2} style={styles.resourceSavedTitle}>
                    {resource.resourceTitle}
                  </Text>
                  <Text numberOfLines={1} style={styles.resourceSavedMeta}>
                    {resource.taskTitle
                      ? `For ${resource.taskTitle}`
                      : 'General resource'}{' '}
                    | {formatResourceDate(resource.createdAt)}
                  </Text>
                </View>
                <Ionicons
                  name="bookmark"
                  size={18}
                  color={theme.colors.primaryDark}
                />
              </View>

              {resource.note ? (
                <Text style={styles.resourceSavedNote}>{resource.note}</Text>
              ) : null}

              <View style={styles.resourceSavedActions}>
                <TouchableOpacity
                  activeOpacity={0.84}
                  style={[
                    styles.resourceSavedActionButton,
                    styles.resourceSavedOpenButton,
                  ]}
                  onPress={() => void handleOpenResource(resource)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${resource.resourceTitle}`}
                >
                  <Text style={styles.resourceSavedOpenText}>Open</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.84}
                  style={[
                    styles.resourceSavedActionButton,
                    styles.resourceSavedDeleteButton,
                  ]}
                  onPress={() => void handleDeleteSavedResource(resource.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${resource.resourceTitle}`}
                >
                  <Text style={styles.resourceSavedDeleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderResourceFinderModalContent = () => {
    if (resourceFinderTasks.length === 0) {
      return (
        <View>
          {renderEmptyState(
            'Choose a task',
            'Choose a task and Milo will suggest helpful links.'
          )}
          {resourceFinderMode === 'save' ? renderResourceSaveForm() : null}
          {resourceFinderMode === 'saved' ? renderSavedResourceList() : null}
          {renderResourceFinderActions()}
        </View>
      );
    }

    return (
      <View>
        {!selectedResourceTask ? (
          <View style={styles.resourceFinderHintCard}>
            <MiloMoodImage mood="waving" size={46} />
            <Text style={styles.resourceFinderHintText}>
              Choose a task and Milo will suggest helpful links.
            </Text>
          </View>
        ) : null}

        <View style={styles.modalSection}>
          <Text style={styles.modalSectionTitle}>Choose a task</Text>
          {renderResourceTaskList()}
        </View>

        {selectedResourceTask ? (
          <View style={styles.resourceSelectedCard}>
            <View style={styles.resourceSelectedIcon}>
              <Ionicons
                name="search-outline"
                size={20}
                color={theme.colors.primaryDark}
              />
            </View>
            <View style={styles.resourceSelectedCopy}>
              <Text numberOfLines={2} style={styles.resourceSelectedTitle}>
                {selectedResourceTask.title}
              </Text>
              <Text numberOfLines={1} style={styles.resourceSelectedMeta}>
                {selectedResourceTask.plannerType} |{' '}
                {selectedResourceTask.priority} priority
              </Text>
              {selectedResourceTask.description ? (
                <Text numberOfLines={2} style={styles.resourceSelectedText}>
                  {selectedResourceTask.description}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {resourceKeywords.length > 0 ? (
          <View style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Suggested keywords</Text>
            <View style={styles.resourceKeywordRow}>
              {resourceKeywords.map((keyword) => {
                const isKeywordSelected = selectedResourceKeywordSet.has(keyword);

                return (
                  <TouchableOpacity
                    key={keyword}
                    activeOpacity={0.82}
                    style={[
                      styles.resourceKeyword,
                      isKeywordSelected
                        ? styles.resourceKeywordSelected
                        : styles.resourceKeywordInactive,
                    ]}
                    onPress={() => handleToggleResourceKeyword(keyword)}
                    accessibilityRole="button"
                    accessibilityLabel={`${isKeywordSelected ? 'Remove' : 'Add'} ${keyword} keyword`}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.resourceKeywordText,
                        !isKeywordSelected && styles.resourceKeywordTextInactive,
                      ]}
                    >
                      {keyword}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {resourceFinderMessage ? (
          <Text style={styles.resourceFinderMessage}>{resourceFinderMessage}</Text>
        ) : null}

        {renderResourceFinderActions()}

        {resourceFinderMode === 'save' ? renderResourceSaveForm() : null}
        {resourceFinderMode === 'saved' ? renderSavedResourceList() : null}
      </View>
    );
  };

  const renderDetailModalContent = () => {
    if (activeDetailModal === 'analytics') return renderAnalyticsModalContent();
    if (activeDetailModal === 'sessions') return renderRecentSessionsModalContent();
    if (activeDetailModal === 'sessionDetail') {
      return renderSessionDetailModalContent();
    }
    if (activeDetailModal === 'reaction') return renderReactionModalContent();
    if (activeDetailModal === 'resources') return renderResourceFinderModalContent();

    return null;
  };

  const activePlayer = getActivePlayer();

  return (
    <ScreenContainer
      topPadding={14}
      bottomPadding={bottomContentPadding}
      style={styles.screen}
      contentStyle={styles.screenContent}
    >
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[
              styles.headerTitle,
              isDark && styles.headerTitleDark,
              compactWidth && styles.headerTitleCompact,
            ]}
          >
            Companion
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={[
              styles.headerSubtitle,
              isDark && styles.headerSubtitleDark,
              compactWidth && styles.headerSubtitleCompact,
            ]}
          >
            Chat and plan with Milo 💚
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.headerIconButton,
              isDark && styles.headerIconButtonDark,
              !isDark && styles.lightSurfaceDepthSmall,
              compactWidth && styles.headerIconButtonCompact,
            ]}
            onPress={() => navigation.navigate('ReminderCenter')}
            accessibilityRole="button"
            accessibilityLabel="Open Reminder Center"
          >
            <Ionicons
              name="notifications-outline"
              size={21}
              color={theme.colors.primaryDark}
            />
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>2</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.82}
            style={[
              styles.headerIconButton,
              isDark && styles.headerIconButtonDark,
              !isDark && styles.lightSurfaceDepthSmall,
              compactWidth && styles.headerIconButtonCompact,
            ]}
            onPress={() => navigation.navigate('Settings')}
            accessibilityRole="button"
            accessibilityLabel="Open Settings"
          >
            <Ionicons
              name="settings-outline"
              size={21}
              color={theme.colors.primaryDark}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.roomCard,
          isDark && styles.roomCardDark,
          !isDark && styles.lightSurfaceDepthLarge,
          styles.miloStage,
          { height: roomCardHeight },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={handleMiloPress}
          style={styles.miloStageMediaWrap}
          accessibilityRole="button"
          accessibilityLabel="Tap Milo"
        >
          <Image
            source={miloIdleScene}
            style={styles.miloStageMedia}
            resizeMode="cover"
          />

          {!reduceMotionEnabled &&
            isCompanionFocused &&
            activeMiloVideo &&
            activePlayer &&
            !videoFailed && (
              <VideoView
                player={activePlayer}
                style={[styles.miloStageMedia, styles.miloStageVideo]}
                nativeControls={false}
                contentFit="cover"
                surfaceType="textureView"
                useExoShutter={false}
              />
            )}

          <View pointerEvents="none" style={styles.miloStageSoftOverlay} />
          {isDark ? (
            <View pointerEvents="none" style={styles.miloStageDarkOverlay} />
          ) : null}
        </TouchableOpacity>

        <Animated.View
          style={[styles.speechBubble, speechBubbleMotionStyle]}
        >
          <Text numberOfLines={1} style={styles.speechGreeting}>
            Hi {displayName}! 👋
          </Text>
          <Text
            numberOfLines={5}
            adjustsFontSizeToFit
            minimumFontScale={0.88}
            style={styles.speechText}
          >
            {activeMessage}
          </Text>
          <View style={styles.speechTail} />
        </Animated.View>

        <View style={[styles.moodPanel, { width: moodPanelWidth }]}>
          <View style={styles.moodCard}>
            <View style={styles.moodCardTopRow}>
              <Text style={styles.moodCardTitle}>Milo's Mood</Text>
              <MiloMoodImage
                mood={activeMood}
                size={38}
                style={styles.moodCardMilo}
              />
            </View>
            <Text numberOfLines={1} style={styles.moodLabel}>
              Focused
            </Text>
            <Text numberOfLines={2} style={styles.moodSubtext}>
              Start small and keep going.
            </Text>
          </View>

          {statusItems.map((item) => (
            <MoodStatusCard key={item.label} item={item} />
          ))}
        </View>

        {tapHintSeen === false ? (
          <View style={styles.tapMiloCard}>
            <TouchableOpacity
              activeOpacity={0.82}
              style={styles.tapSpeakerButton}
              onPress={handleSpeak}
              accessibilityRole="button"
              accessibilityLabel="Hear Milo"
            >
              <Ionicons
                name="volume-medium"
                size={15}
                color={theme.colors.primaryDark}
              />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={handleMiloPress}
              accessibilityRole="button"
              accessibilityLabel="Tap Milo"
            >
              <Text style={styles.tapHint}>Tap me!</Text>
            </TouchableOpacity>
          </View>
        ) : null}

      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.talkCard, !isDark && styles.lightSurfaceDepthMedium]}
        onPress={handleContinueChat}
        accessibilityRole="button"
        accessibilityLabel="Open Talk with Milo"
      >
        <View style={styles.talkTitleRow}>
          <View style={styles.talkTitleIcon}>
            <Ionicons
              name="chatbubbles"
              size={19}
              color={theme.colors.primaryDark}
            />
          </View>
          <Text style={styles.talkTitle}>Talk with Milo</Text>
        </View>

        <View style={[styles.talkBody, stackTalkCard && styles.talkBodyCompact]}>
          <View style={styles.talkPreviewRow}>
            <View style={styles.talkAvatar}>
              <MiloMoodImage mood={activeMood} size={54} />
            </View>
            <View style={styles.talkPreviewBubble}>
              <View style={styles.talkPreviewHeader}>
              <Text numberOfLines={1} style={styles.talkPreviewSender}>
                Milo
              </Text>
              <Text numberOfLines={1} style={styles.talkPreviewTime}>
                {latestChatTime}
              </Text>
            </View>
              <Text numberOfLines={2} style={styles.talkPreviewText}>
                {latestChatPreview}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.talkActions,
              narrowContent && styles.talkActionsNarrow,
              stackTalkCard && styles.talkActionsCompact,
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.84}
              style={[
                styles.continueChatButton,
                stackTalkCard && styles.talkActionButtonCompact,
              ]}
              onPress={handleContinueChat}
              accessibilityRole="button"
              accessibilityLabel="Continue chat with Milo"
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={styles.continueChatText}
              >
                Continue chat
              </Text>
              <Ionicons name="arrow-forward" size={18} color={theme.colors.white} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.84}
              style={[
                styles.oldMessagesButton,
                stackTalkCard && styles.talkActionButtonCompact,
              ]}
              onPress={handleOpenOldMessages}
              accessibilityRole="button"
              accessibilityLabel="Open old Milo messages"
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={styles.oldMessagesText}
              >
                Old messages
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.focusGuardCard, !isDark && styles.lightSurfaceDepthMedium]}
        onPress={() => void handleStartFocus()}
        accessibilityRole="button"
        accessibilityLabel="Start FocusGuard Pomodoro"
      >
        <View style={styles.focusGuardIconWrap}>
          <Ionicons
            name="shield-checkmark-outline"
            size={25}
            color={theme.colors.primaryDark}
          />
        </View>
        <View style={styles.focusGuardCopy}>
          <View style={styles.focusGuardTitleRow}>
            <Text numberOfLines={1} style={styles.focusGuardTitle}>
              FocusGuard Pomodoro
            </Text>
            <View style={styles.focusGuardBadge}>
              <Text numberOfLines={1} style={styles.focusGuardBadgeText}>
                NEW
              </Text>
            </View>
          </View>
          <Text numberOfLines={1} style={styles.focusGuardSubtitle}>
            Start a protected focus block with Milo.
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.84}
          style={styles.focusGuardButton}
          onPress={() => void handleStartFocus()}
          accessibilityRole="button"
          accessibilityLabel="Start Focus"
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={styles.focusGuardButtonText}
          >
            Start Focus
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        style={[
          styles.focusGuardCard,
          styles.resourceFinderCard,
          !isDark && styles.lightSurfaceDepthMedium,
        ]}
        onPress={() => {
          setResourceFinderMode('finder');
          setResourceFinderMessage('');
          void openDetailModal('resources');
        }}
        accessibilityRole="button"
        accessibilityLabel="Open Milo Resource Finder"
      >
        <View style={styles.focusGuardIconWrap}>
          <Ionicons
            name="library-outline"
            size={25}
            color={theme.colors.primaryDark}
          />
        </View>
        <View style={styles.focusGuardCopy}>
          <View style={styles.focusGuardTitleRow}>
            <Text numberOfLines={1} style={styles.focusGuardTitle}>
              Milo Resource Finder
            </Text>
            <View style={styles.focusGuardBadge}>
              <Text numberOfLines={1} style={styles.focusGuardBadgeText}>
                LOCAL
              </Text>
            </View>
          </View>
          <Text numberOfLines={1} style={styles.focusGuardSubtitle}>
            Find helpful links for your tasks.
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.84}
          style={styles.focusGuardButton}
          onPress={() => {
            setResourceFinderMode('finder');
            setResourceFinderMessage('');
            void openDetailModal('resources');
          }}
          accessibilityRole="button"
          accessibilityLabel="Find Resources"
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            style={styles.focusGuardButtonText}
          >
            Find Resources
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>

      <View
        style={[
          styles.analyticsDashboard,
          stackDashboardCards && styles.analyticsDashboardCompact,
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.focusAnalyticsCard}
          onPress={() => void openDetailModal('analytics')}
          accessibilityRole="button"
          accessibilityLabel="Open Focus Analytics details"
        >
          <View style={styles.analyticsHeader}>
            <Text style={styles.dashboardCardTitle}>Focus Analytics</Text>
            <View style={styles.periodPill}>
              <Text style={styles.periodPillText}>This week</Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={theme.colors.primaryDark}
              />
            </View>
          </View>

          <View style={styles.analyticsStatGrid}>
            <View style={styles.analyticsStatItem}>
              <View style={styles.analyticsStatIcon}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={theme.colors.primaryDark}
                />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={styles.analyticsStatValue}
              >
                {formatMinutesLabel(focusAnalytics.weekFocusMinutes)}
              </Text>
              <Text numberOfLines={1} style={styles.analyticsStatLabel}>
                Focus time
              </Text>
            </View>
            <View style={styles.analyticsStatDivider} />
            <View style={styles.analyticsStatItem}>
              <View style={[styles.analyticsStatIcon, styles.analyticsStatIconBlue]}>
                <Ionicons name="albums-outline" size={18} color={theme.colors.blue} />
              </View>
              <Text numberOfLines={1} style={styles.analyticsStatValue}>
                {focusAnalytics.sessionsThisWeek}
              </Text>
              <Text numberOfLines={1} style={styles.analyticsStatLabel}>
                Sessions
              </Text>
            </View>
            <View style={styles.analyticsStatDivider} />
            <View style={styles.analyticsStatItem}>
              <View
                style={[styles.analyticsStatIcon, styles.analyticsStatIconYellow]}
              >
                <Ionicons name="flame-outline" size={18} color="#B7791F" />
              </View>
              <Text numberOfLines={1} style={styles.analyticsStatValue}>
                {focusAnalytics.dayStreak}
              </Text>
              <Text numberOfLines={1} style={styles.analyticsStatLabel}>
                Day streak
              </Text>
            </View>
            <View style={styles.analyticsStatDivider} />
            <View style={styles.analyticsStatItem}>
              <View
                style={[styles.analyticsStatIcon, styles.analyticsStatIconPurple]}
              >
                <Ionicons name="sparkles" size={18} color={theme.colors.purple} />
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={styles.analyticsStatValue}
              >
                {focusScoreLabel}
              </Text>
              <Text numberOfLines={1} style={styles.analyticsStatLabel}>
                Focus score
              </Text>
            </View>
          </View>

          <WeeklyFocusChart data={focusAnalytics.weeklyTrend} />
        </TouchableOpacity>

        <View style={styles.recentSessionsCard}>
          <View style={styles.analyticsHeader}>
            <Text style={styles.dashboardCardTitle}>Recent Sessions</Text>
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => void openDetailModal('sessions')}
              accessibilityRole="button"
              accessibilityLabel="See all focus sessions"
            >
              <Text style={styles.seeAllText}>See all &gt;</Text>
            </TouchableOpacity>
          </View>

          {recentSessionRows.length > 0 ? (
            recentSessionRows.map((session) => {
              const statusMeta = focusSessionStatusMeta[session.status];

              return (
                <TouchableOpacity
                  key={session.id}
                  activeOpacity={0.86}
                  style={styles.sessionRow}
                  onPress={() => void handleOpenFocusSession(session)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open focus session ${getSessionTitle(session)}`}
                >
                  <View
                    style={[
                      styles.sessionIcon,
                      { backgroundColor: statusMeta.backgroundColor },
                    ]}
                  >
                    <Ionicons
                      name={statusMeta.icon}
                      size={22}
                      color={statusMeta.color}
                    />
                  </View>
                  <View style={styles.sessionCopy}>
                    <Text numberOfLines={1} style={styles.sessionTitle}>
                      {getSessionTitle(session)}
                    </Text>
                    <Text numberOfLines={1} style={styles.sessionMeta}>
                      {formatSessionDate(session.endedAt || session.date, todayDate)} -{' '}
                      {formatMinutesLabel(session.durationMinutes)}
                    </Text>
                  </View>
                  <View style={styles.sessionStatusWrap}>
                    <View
                      style={[
                        styles.sessionStatusPill,
                        { backgroundColor: statusMeta.backgroundColor },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.82}
                        style={[
                          styles.sessionStatusText,
                          { color: statusMeta.color },
                        ]}
                      >
                        {statusMeta.label}
                      </Text>
                    </View>
                    <View style={styles.sessionTimeRow}>
                      <Text numberOfLines={1} style={styles.sessionTime}>
                        {formatSessionTime(session.endedAt || session.date)}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={12}
                        color={theme.colors.muted}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.sessionEmptyState}>
              <View style={styles.sessionEmptyIcon}>
                <Ionicons
                  name="timer-outline"
                  size={20}
                  color={theme.colors.primaryDark}
                />
              </View>
              <View style={styles.sessionCopy}>
                <Text style={styles.sessionTitle}>No sessions yet</Text>
                <Text style={styles.sessionMeta}>
                  Start a Pomodoro and Milo will save it here.
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => void openDetailModal('reaction')}
        accessibilityRole="button"
        accessibilityLabel="Open Milo's Focus Reaction"
        style={[
          styles.reactsStrip,
          compactReactsStrip && styles.reactsStripPhone,
          stackReactsStrip && styles.reactsStripCompact,
        ]}
      >
        <View style={styles.reactsIntro}>
          <View
            style={[
              styles.reactsAvatar,
              compactReactsStrip && styles.reactsAvatarPhone,
            ]}
          >
            <MiloMoodImage
              mood={
                latestReactionSession?.focusQuality === 'distracted'
                  ? 'worried'
                  : 'happy'
              }
              size={compactReactsStrip ? 46 : 58}
            />
          </View>
          <View
            style={[
              styles.reactsCopy,
              compactReactsStrip && styles.reactsCopyPhone,
            ]}
          >
            <Text numberOfLines={1} style={styles.reactsTitle}>
              Milo reacts
            </Text>
            <Text numberOfLines={3} style={styles.reactsText}>
              {latestReaction}
            </Text>
          </View>

          {!narrowContent ? (
            <View style={styles.reactsCelebration}>
              <MiloMoodImage mood="celebrating" size={64} />
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.reactsChips,
            compactReactsStrip && styles.reactsChipsPhone,
            stackReactsStrip && styles.reactsChipsCompact,
          ]}
        >
          <View
            style={[
              styles.reactChip,
              compactReactsStrip && styles.reactChipPhone,
            ]}
          >
            <Ionicons
              name="time-outline"
              size={20}
              color={theme.colors.primaryDark}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={styles.reactChipValue}
            >
              {formatMinutesLabel(latestReactionDuration)}
            </Text>
            <Text style={styles.reactChipLabel}>Duration</Text>
          </View>
          <View
            style={[
              styles.reactChip,
              compactReactsStrip && styles.reactChipPhone,
            ]}
          >
            <Ionicons
              name={
                latestReactionQuality === 'Clean'
                  ? 'checkmark-circle'
                  : 'alert-circle'
              }
              size={20}
              color={
                latestReactionQuality === 'Clean'
                  ? theme.colors.primaryDark
                  : '#B7791F'
              }
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={styles.reactChipValue}
            >
              {latestReactionQuality}
            </Text>
            <Text style={styles.reactChipLabel}>Session</Text>
          </View>
          <View
            style={[
              styles.reactChip,
              compactReactsStrip && styles.reactChipPhone,
            ]}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={theme.colors.purple}
            />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={styles.reactChipValue}
            >
              {latestReactionPresetLabel}
            </Text>
            <Text style={styles.reactChipLabel}>Preset</Text>
          </View>
        </View>
      </TouchableOpacity>

      <Modal
        visible={activeDetailModal !== null}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => void closeDetailModal()}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: modalMaxHeight }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text numberOfLines={1} style={styles.modalTitle}>
                  {detailModalTitle}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.modalCloseButton}
                onPress={() => void closeDetailModal()}
                accessibilityRole="button"
                accessibilityLabel={`Close ${detailModalTitle}`}
              >
                <Ionicons name="close" size={20} color={theme.colors.primaryDark} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailModalContent()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.background,
  },
  screenContent: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerTitleDark: {
    color: '#F4FFF7',
  },
  headerTitleCompact: {
    fontSize: 34,
  },
  headerSubtitle: {
    marginTop: 5,
    color: theme.colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    lineHeight: 20,
  },
  headerSubtitleDark: {
    color: '#B9D1C5',
  },
  headerSubtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginLeft: 10,
    ...theme.shadowSoft,
  },
  headerIconButtonDark: {
    backgroundColor: '#182A26',
    borderColor: '#33574C',
  },
  headerIconButtonCompact: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
  },
  notificationBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '900',
  },
  roomCard: {
    position: 'relative',
    backgroundColor: theme.colors.card,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 18,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 5,
  },
  lightSurfaceDepthSmall: {
    shadowColor: '#1F8A4C',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  lightSurfaceDepthMedium: {
    shadowColor: '#1F8A4C',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.11,
    shadowRadius: 18,
    elevation: 6,
  },
  lightSurfaceDepthLarge: {
    shadowColor: '#1F8A4C',
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.13,
    shadowRadius: 22,
    elevation: 7,
  },
  roomCardDark: {
    backgroundColor: '#0B3328',
    borderColor: '#33574C',
    shadowColor: '#000',
    shadowOpacity: 0.28,
  },
  roomBackWall: {
    position: 'absolute',
    top: 0,
    left: -2,
    right: -2,
    height: '72%',
    backgroundColor: theme.colors.cardSoft,
    zIndex: 0,
    overflow: 'hidden',
  },
  wallLightGlow: {
    position: 'absolute',
    top: -36,
    right: -38,
    width: 214,
    height: 166,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
  },
  roomWindowGlow: {
    position: 'absolute',
    top: 64,
    left: 62,
    right: 82,
    height: 154,
    borderRadius: 74,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(226, 237, 218, 0.8)',
  },
  windowLightBeam: {
    position: 'absolute',
    top: 76,
    right: -16,
    width: 244,
    height: 140,
    borderRadius: 52,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    transform: [{ rotate: '-15deg' }],
  },
  windowFrame: {
    position: 'absolute',
    top: 28,
    right: 28,
    width: 92,
    height: 70,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1.5,
    borderColor: theme.colors.inputBorder,
    padding: 7,
    flexDirection: 'row',
    zIndex: 2,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 1,
  },
  windowPane: {
    flex: 1,
    backgroundColor: theme.colors.blueSoft,
    borderRadius: 11,
    marginHorizontal: 2,
  },
  windowDivider: {
    position: 'absolute',
    top: 9,
    bottom: 9,
    left: '50%',
    width: 1,
    backgroundColor: '#CFE4F3',
  },
  windowSill: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: -9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#D7EEDC',
  },
  wallPoster: {
    position: 'absolute',
    left: 30,
    top: 154,
    width: 58,
    height: 54,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  posterSun: {
    position: 'absolute',
    right: 10,
    top: 9,
    width: 13,
    height: 13,
    borderRadius: 999,
    backgroundColor: '#F5C75B',
  },
  posterHill: {
    position: 'absolute',
    left: -8,
    right: -8,
    bottom: -8,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#BEE5C3',
  },
  wallShelf: {
    position: 'absolute',
    left: 24,
    top: 96,
    width: 96,
    height: 32,
    borderBottomWidth: 4,
    borderBottomColor: '#B7DDAE',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 4,
    paddingHorizontal: 8,
  },
  shelfBook: {
    width: 10,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#2F8A3B',
    marginRight: 5,
  },
  shelfBookShort: {
    width: 10,
    height: 16,
    borderRadius: 5,
    backgroundColor: '#F4C542',
    marginRight: 10,
  },
  shelfPlant: {
    width: 21,
    height: 13,
    borderRadius: 6,
    backgroundColor: '#8FDFA7',
    position: 'relative',
  },
  plantLeafLeft: {
    position: 'absolute',
    left: 2,
    top: -9,
    width: 14,
    height: 11,
    borderRadius: 999,
    backgroundColor: '#55C878',
    transform: [{ rotate: '-28deg' }],
  },
  plantLeafRight: {
    position: 'absolute',
    right: 1,
    top: -10,
    width: 14,
    height: 11,
    borderRadius: 999,
    backgroundColor: '#2F8A3B',
    transform: [{ rotate: '28deg' }],
  },
  wallBaseboard: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 11,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
  },
  speechBubble: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: '52%',
    minWidth: 156,
    maxWidth: 210,
    backgroundColor: theme.colors.card,
    borderRadius: 26,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  speechGreeting: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginBottom: 4,
    zIndex: 2,
  },
  speechText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    zIndex: 2,
  },
  speechTail: {
    position: 'absolute',
    right: 38,
    bottom: -8,
    width: 17,
    height: 17,
    backgroundColor: theme.colors.card,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ rotate: '45deg' }],
  },
  moodPanel: {
    position: 'absolute',
    top: 18,
    right: 12,
    zIndex: 10,
  },
  moodCard: {
    minHeight: 108,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.52)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  moodCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moodCardTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 13,
  },
  moodCardMilo: {
    marginRight: -5,
    marginTop: -5,
  },
  moodLabel: {
    marginTop: 2,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  moodSubtext: {
    marginTop: 4,
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  statusCard: {
    minHeight: 49,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.48)',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.055,
    shadowRadius: 10,
    elevation: 2,
  },
  statusIcon: {
    width: 25,
    height: 25,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusLabel: {
    color: theme.colors.subtleText,
    fontSize: 9,
    fontWeight: '800',
  },
  statusValue: {
    marginTop: 1,
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
  },
  roomFloor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 174,
    backgroundColor: theme.colors.cardSoft,
    zIndex: 1,
    overflow: 'visible',
  },
  floorBackCurve: {
    position: 'absolute',
    top: -34,
    left: -34,
    right: -34,
    height: 74,
    borderRadius: 999,
    backgroundColor: theme.colors.cardSoft,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  floorJunctionShadow: {
    position: 'absolute',
    top: -11,
    left: 22,
    right: 22,
    height: 26,
    borderRadius: 999,
    backgroundColor: 'rgba(76, 103, 45, 0.08)',
  },
  floorLine: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: 17,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(69, 120, 52, 0.18)',
  },
  floorPerspectiveLeft: {
    position: 'absolute',
    left: 28,
    top: 46,
    width: 126,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(69, 120, 52, 0.11)',
    transform: [{ rotate: '17deg' }],
  },
  floorPerspectiveCenter: {
    position: 'absolute',
    alignSelf: 'center',
    top: 34,
    width: 2,
    height: 94,
    borderRadius: 999,
    backgroundColor: 'rgba(69, 120, 52, 0.08)',
  },
  floorPerspectiveRight: {
    position: 'absolute',
    right: 28,
    top: 46,
    width: 126,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(69, 120, 52, 0.11)',
    transform: [{ rotate: '-17deg' }],
  },
  floorBoardLeft: {
    position: 'absolute',
    left: 22,
    bottom: 40,
    width: 80,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(69, 120, 52, 0.13)',
    transform: [{ rotate: '-12deg' }],
  },
  floorBoardRight: {
    position: 'absolute',
    right: 24,
    bottom: 60,
    width: 94,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(69, 120, 52, 0.12)',
    transform: [{ rotate: '10deg' }],
  },
  floorPlant: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 46,
    height: 66,
    zIndex: 1,
  },
  floorPlantPot: {
    position: 'absolute',
    left: 12,
    right: 10,
    bottom: 0,
    height: 22,
    borderRadius: 10,
    backgroundColor: '#F2CF8F',
    borderWidth: 1,
    borderColor: '#E1B96D',
  },
  floorPlantLeafOne: {
    position: 'absolute',
    left: 11,
    bottom: 20,
    width: 20,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#55C878',
    transform: [{ rotate: '-26deg' }],
  },
  floorPlantLeafTwo: {
    position: 'absolute',
    right: 7,
    bottom: 18,
    width: 20,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#2F8A3B',
    transform: [{ rotate: '22deg' }],
  },
  floorPlantLeafThree: {
    position: 'absolute',
    left: 18,
    bottom: 24,
    width: 18,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#7ED889',
  },
  floorContactShadow: {
    position: 'absolute',
    left: 54,
    right: 102,
    bottom: 48,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 91, 45, 0.25)',
    zIndex: 4,
  },
  floorRug: {
    position: 'absolute',
    left: 48,
    right: 98,
    bottom: 35,
    height: 58,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 3,
  },
  floorRugCenter: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 14,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  tapMiloCard: {
    position: 'absolute',
    left: 16,
    bottom: 18,
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    paddingVertical: 6,
    paddingLeft: 7,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.52)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  tapSpeakerButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  tapHint: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  miloStage: {
    width: '100%',
    height: 360,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  miloStageMediaWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: 'hidden',
    zIndex: 0,
    elevation: 0,
  },
  miloStageMedia: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  miloStageVideo: {
    zIndex: 2,
    elevation: 2,
  },
  miloStageSoftOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  miloStageDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  talkCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 16,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
  },
  talkTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  talkTitleIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkTitle: {
    marginLeft: 10,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
    flexShrink: 1,
  },
  talkBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  talkBodyCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  talkPreviewRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  talkAvatar: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  talkPreviewBubble: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  talkPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  talkPreviewSender: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  talkPreviewTime: {
    flexShrink: 0,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  talkPreviewText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    flexShrink: 1,
  },
  talkActions: {
    width: 226,
    gap: 10,
  },
  talkActionsNarrow: {
    width: 150,
  },
  talkActionsCompact: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  talkActionButtonCompact: {
    flex: 1,
    minWidth: 0,
  },
  continueChatButton: {
    minWidth: 0,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
  continueChatText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '900',
    marginRight: 8,
    flexShrink: 1,
  },
  oldMessagesButton: {
    minWidth: 0,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  oldMessagesButtonDisabled: {
    backgroundColor: theme.colors.input,
    borderColor: theme.colors.inputBorder,
    opacity: 0.78,
  },
  oldMessagesText: {
    marginLeft: 7,
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
    flexShrink: 1,
  },
  oldMessagesTextDisabled: {
    color: theme.colors.muted,
    fontSize: 11,
  },
  focusGuardCard: {
    minHeight: 86,
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.065,
    shadowRadius: 16,
    elevation: 3,
  },
  focusGuardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    flexShrink: 0,
  },
  focusGuardCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  focusGuardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  focusGuardTitle: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  focusGuardBadge: {
    flexShrink: 0,
    marginLeft: 8,
    minHeight: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusGuardBadgeText: {
    color: theme.colors.primaryDark,
    fontSize: 9,
    fontWeight: '900',
  },
  focusGuardSubtitle: {
    marginTop: 5,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  focusGuardButton: {
    minWidth: 104,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    flexShrink: 0,
  },
  focusGuardButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  resourceFinderCard: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  analyticsDashboard: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  analyticsDashboardCompact: {
    flexDirection: 'column',
    gap: 14,
  },
  focusAnalyticsCard: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.065,
    shadowRadius: 16,
    elevation: 3,
  },
  recentSessionsCard: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.065,
    shadowRadius: 16,
    elevation: 3,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 18,
  },
  dashboardCardTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  periodPill: {
    flexShrink: 0,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  periodPillText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    marginRight: 4,
  },
  analyticsStatGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 2,
    marginBottom: 8,
  },
  analyticsStatItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
  },
  analyticsStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 16,
    backgroundColor: theme.colors.divider,
  },
  analyticsStatIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  analyticsStatIconBlue: {
    backgroundColor: theme.colors.blueSoft,
  },
  analyticsStatIconYellow: {
    backgroundColor: theme.colors.yellowSoft,
  },
  analyticsStatIconPurple: {
    backgroundColor: theme.colors.purpleSoft,
  },
  analyticsStatValue: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  analyticsStatLabel: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  trendCard: {
    marginTop: 10,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingTop: 13,
    paddingBottom: 11,
    overflow: 'hidden',
  },
  trendChartBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  trendYAxis: {
    width: 38,
    height: TREND_CHART_HEIGHT,
    position: 'relative',
    marginRight: 6,
  },
  trendYAxisLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: theme.colors.subtleText,
    fontSize: 8.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  trendPlotWrap: {
    flex: 1,
    minWidth: 0,
  },
  trendPlot: {
    height: TREND_CHART_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  trendGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  trendAreaColumn: {
    position: 'absolute',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  trendSegment: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 999,
    backgroundColor: '#25A95F',
  },
  trendDot: {
    position: 'absolute',
    width: TREND_DOT_SIZE,
    height: TREND_DOT_SIZE,
    borderRadius: TREND_DOT_SIZE / 2,
    backgroundColor: theme.colors.card,
    borderWidth: 2,
    borderColor: '#25A95F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendDotCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#25A95F',
  },
  trendEmptyHintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 13,
    alignItems: 'center',
  },
  trendEmptyHintText: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: theme.colors.cardSoft,
    color: theme.colors.textSoft,
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  trendLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  trendLabel: {
    flex: 1,
    color: theme.colors.subtleText,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
  },
  sessionRow: {
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 9,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.035,
    shadowRadius: 8,
    elevation: 1,
  },
  sessionEmptyState: {
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  sessionEmptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sessionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  sessionMeta: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  sessionStatusWrap: {
    alignItems: 'flex-end',
    marginLeft: 8,
    minWidth: 80,
    flexShrink: 0,
  },
  sessionStatusPill: {
    minHeight: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sessionStatusText: {
    fontSize: 9,
    fontWeight: '900',
  },
  sessionTimeRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  sessionTime: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '800',
  },
  reactsStrip: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.065,
    shadowRadius: 16,
    elevation: 3,
  },
  reactsStripCompact: {
    alignItems: 'stretch',
  },
  reactsStripPhone: {
    padding: 10,
    gap: 8,
  },
  reactsIntro: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reactsAvatar: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  reactsAvatarPhone: {
    width: 48,
    height: 48,
    borderRadius: 18,
  },
  reactsCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
    paddingRight: 0,
  },
  reactsCopyPhone: {
    marginLeft: 8,
  },
  reactsTitle: {
    color: theme.colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
    flexShrink: 1,
  },
  reactsText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    flexShrink: 1,
  },
  reactsChips: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  reactsChipsCompact: {
    justifyContent: 'flex-start',
  },
  reactsChipsPhone: {
    gap: 6,
  },
  reactChip: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 84,
    minWidth: 74,
    maxWidth: 128,
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  reactChipPhone: {
    flexBasis: 82,
    minWidth: 72,
    minHeight: 66,
    paddingHorizontal: 4,
  },
  reactChipValue: {
    marginTop: 5,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  reactChipLabel: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  reactsCelebration: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    marginLeft: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    paddingHorizontal: 16,
    paddingVertical: 28,
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 18,
    },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 10,
    zIndex: 10000,
  },
  modalHeader: {
    minHeight: 64,
    paddingLeft: 18,
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    width: '100%',
  },
  modalScrollContent: {
    padding: 18,
    paddingBottom: 22,
  },
  modalMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalMetricCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 138,
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalMetricIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  modalMetricCopy: {
    flex: 1,
    minWidth: 0,
  },
  modalMetricLabel: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  modalMetricValue: {
    marginTop: 4,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  modalEmptyState: {
    minHeight: 220,
    borderRadius: 24,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  modalEmptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 28,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalEmptyTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  modalEmptyText: {
    marginTop: 8,
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  modalSection: {
    marginTop: 16,
  },
  modalSectionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 10,
  },
  modalTrendCard: {
    marginTop: 0,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalInsightCard: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalInsightIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  modalInsightCopy: {
    flex: 1,
    minWidth: 0,
  },
  modalInsightTitle: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  modalInsightText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  modalSessionList: {
    gap: 10,
  },
  modalSessionCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  modalSessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalSessionTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalSessionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  modalSessionDate: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  modalStatusBadge: {
    minHeight: 25,
    minWidth: 74,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    flexShrink: 0,
  },
  modalStatusText: {
    fontSize: 10,
    fontWeight: '900',
  },
  modalSessionDetailRow: {
    marginTop: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  modalSessionDetail: {
    maxWidth: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  modalSessionDetailClean: {
    color: theme.colors.primaryDark,
    backgroundColor: theme.colors.successSoft,
    borderColor: '#D6F5DE',
  },
  modalSessionDetailDistracted: {
    color: '#B7791F',
    backgroundColor: theme.colors.yellowSoft,
    borderColor: '#F4E7B7',
  },
  modalSummaryCard: {
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  modalSummaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  modalSuggestionCard: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalSuggestionText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 9,
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  resourceFinderHintCard: {
    minHeight: 78,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resourceFinderHintText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  resourceTaskList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  resourceTaskChip: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 132,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 11,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  resourceTaskChipSelected: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primaryDark,
  },
  resourceTaskTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  resourceTaskTitleSelected: {
    color: theme.colors.white,
  },
  resourceTaskMeta: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  resourceTaskMetaSelected: {
    color: '#DDF8E4',
  },
  resourceSelectedCard: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  resourceSelectedIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    flexShrink: 0,
  },
  resourceSelectedCopy: {
    flex: 1,
    minWidth: 0,
  },
  resourceSelectedTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  resourceSelectedMeta: {
    marginTop: 4,
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  resourceSelectedText: {
    marginTop: 6,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  resourceKeywordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  resourceKeyword: {
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  resourceKeywordSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: '#D6F5DE',
  },
  resourceKeywordInactive: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
  },
  resourceKeywordText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  resourceKeywordTextInactive: {
    color: '#6B7B6C',
  },
  resourceFinderMessage: {
    marginTop: 14,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  resourceActionGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  resourceActionButton: {
    flexGrow: 1,
    flexBasis: '31%',
    minWidth: 132,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  resourcePrimaryButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  resourceSecondaryButton: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resourceDisabledButton: {
    backgroundColor: '#BFD4C4',
  },
  resourcePrimaryButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  resourceSecondaryButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  resourceSaveCard: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 9,
  },
  resourceInput: {
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  resourceNoteInput: {
    minHeight: 76,
    paddingTop: 11,
  },
  resourceSavedEmpty: {
    minHeight: 92,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  resourceSavedEmptyText: {
    marginTop: 8,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  resourceSavedList: {
    gap: 10,
  },
  resourceSavedCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  resourceSavedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  resourceSavedCopy: {
    flex: 1,
    minWidth: 0,
  },
  resourceSavedTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  resourceSavedMeta: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  resourceSavedNote: {
    marginTop: 9,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  resourceSavedActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  resourceSavedActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  resourceSavedOpenButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  resourceSavedDeleteButton: {
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#FBD1D1',
  },
  resourceSavedOpenText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  resourceSavedDeleteText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  modalButtonRow: {
    width: '100%',
    flexDirection: 'column',
    gap: 10,
    marginTop: 18,
  },
  modalActionButton: {
    width: '100%',
    minHeight: 46,
    minWidth: 0,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalPrimaryButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  modalSecondaryButton: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalPrimaryButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '900',
  },
  modalSecondaryButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  seeAllText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
});
