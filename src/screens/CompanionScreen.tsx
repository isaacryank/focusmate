import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { theme } from '../theme';
import { useAuth } from '../lib/AuthContext';
import { useTasks } from '../lib/TaskContext';
import { getTodayDate, MiloMood } from '../lib/miloPersonality';
import {
  getMiloRecommendedTasks,
  getMiloSituationForTask,
  isAllDayOrPlaceholder,
  type MiloSituationKind,
  type MiloTaskSituation,
} from '../lib/miloSituationIntelligence';
import { Task } from '../types/task';

import ScreenContainer from '../components/ui/ScreenContainer';
import MiloMoodImage from '../components/milo/MiloMoodImage';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type QuickActionKey = 'first' | 'plan' | 'calm' | 'schedule';

const TEMPORARY_MILO_REACTION_MS = 6500;

type InsightItem = {
  label: string;
  value: number;
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
  return task?.title?.trim() || 'this planner item';
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

function getTaskMood(situation?: MiloTaskSituation): MiloMood {
  if (!situation) return 'focused';

  if (['overdue', 'missed'].includes(situation.kind)) return 'worried';

  if (situation.kind === 'high_focus' && situation.urgency.level === 'high') {
    return 'worried';
  }

  if (
    [
      'happening_now',
      'starting_soon',
      'accepted_overlap',
      'due_today',
      'due_tonight',
      'all_day',
      'high_focus',
    ].includes(situation.kind)
  ) {
    return 'focused';
  }

  return 'waving';
}

function getDefaultMiloMessage(
  displayName: string,
  snapshot: CompanionPlannerSnapshot
) {
  const taskTitle = getTaskTitle(snapshot.firstTask);

  if (snapshot.firstSituation?.kind === 'missed') {
    return `I'm here, ${displayName}. "${taskTitle}" slipped, so let's recover gently.`;
  }

  if (snapshot.firstSituation?.kind === 'overdue') {
    return `I'm here, ${displayName}. "${taskTitle}" needs a small recovery step.`;
  }

  if (snapshot.firstSituation?.kind === 'happening_now') {
    return `"${taskTitle}" is happening now, ${displayName}. Stay with this one.`;
  }

  if (snapshot.firstSituation?.kind === 'starting_soon') {
    return `"${taskTitle}" starts soon, ${displayName}. Let's get ready.`;
  }

  if (snapshot.unacceptedOverlapCount > 0) {
    return `I see a schedule overlap, ${displayName}. Let's make a little space.`;
  }

  if (snapshot.acceptedOverlapCount > 0) {
    return `You kept both items, ${displayName}. We'll handle them one at a time.`;
  }

  if (
    snapshot.firstSituation &&
    ['due_today', 'due_tonight', 'all_day'].includes(
      snapshot.firstSituation.kind
    )
  ) {
    return `Today's plan needs focus, ${displayName}. Start with "${taskTitle}".`;
  }

  if (snapshot.meetingTodayCount > 0) {
    return `You have a meeting today, ${displayName}. Milo is staying ready.`;
  }

  if (snapshot.highFocusCount > 0) {
    return `"${taskTitle}" needs strong focus, ${displayName}. We'll keep it tiny.`;
  }

  if (
    snapshot.completedTodayCount > 0 &&
    snapshot.completedTodayCount === snapshot.totalTodayCount
  ) {
    return `You finished today's plan, ${displayName}. Milo is proud.`;
  }

  if (snapshot.completedTodayCount > 0) {
    return `Nice progress today, ${displayName}. The next step can stay tiny.`;
  }

  if (snapshot.startEarlyCount > 0) {
    return `"${taskTitle}" can feel easier with one early step.`;
  }

  if (snapshot.pendingCount === 0) {
    return `Your planner is clear, ${displayName}. Milo is happy with you.`;
  }

  return `Your plan looks calm, ${displayName}. Milo is keeping watch.`;
}

function getMiloSays(snapshot: CompanionPlannerSnapshot) {
  if (snapshot.missedCount > 0 || snapshot.overdueCount > 0) {
    return 'Something slipped. We can recover one tiny step.';
  }

  if (snapshot.unacceptedOverlapCount > 0) {
    return 'I see an overlap. A small buffer can help.';
  }

  if (snapshot.acceptedOverlapCount > 0) {
    return 'Keep Both is on. One item at a time.';
  }

  if (snapshot.happeningNowCount > 0 || snapshot.startingSoonCount > 0) {
    return "This is close. Let's stay ready.";
  }

  if (snapshot.dueTodayCount > 0 || snapshot.meetingTodayCount > 0) {
    return "Today's plan needs focus.";
  }

  if (snapshot.highFocusCount > 0) {
    return 'This needs stronger focus, but not all at once.';
  }

  if (snapshot.completedTodayCount > 0) {
    return 'Nice progress today. Milo is proud.';
  }

  if (snapshot.pendingCount === 0) {
    return 'Your planner is clear right now.';
  }

  if (snapshot.startEarlyCount > 0) {
    return 'Starting early can make later easier.';
  }

  return 'Your plan looks manageable. One small step is enough.';
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

function InsightPill({ item }: { item: InsightItem }) {
  return (
    <View style={[styles.insightPill, { backgroundColor: item.backgroundColor }]}>
      <View style={[styles.insightIcon, { backgroundColor: `${item.color}18` }]}>
        <Ionicons name={item.icon} size={15} color={item.color} />
      </View>
      <Text style={[styles.insightValue, { color: item.color }]}>
        {item.value}
      </Text>
      <Text numberOfLines={1} style={styles.insightLabel}>
        {item.label}
      </Text>
    </View>
  );
}

function QuickActionButton({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      style={styles.quickActionButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={19} color={theme.colors.primaryDark} />
      </View>
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.9}
        style={styles.quickActionText}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export default function CompanionScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useBottomTabBarHeight();
  const { userName } = useAuth();
  const { tasks } = useTasks();
  const { width, height } = useWindowDimensions();

  const displayName = userName?.trim() || 'Student';
  const todayDate = getTodayDate();
  const compactWidth = width < 380;
  const shortScreen = height < 760;

  const floatMotion = useRef(new Animated.Value(0)).current;
  const tapScale = useRef(new Animated.Value(1)).current;
  const speechBubbleMotion = useRef(new Animated.Value(1)).current;
  const tapMessageIndexRef = useRef(0);
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const [miloMessage, setMiloMessage] = useState<string | null>(null);
  const [miloMood, setMiloMood] = useState<MiloMood | null>(null);
  const [draftMessage, setDraftMessage] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      title: 'Companion',
    });
  }, [navigation]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatMotion, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatMotion, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [floatMotion]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (reactionTimeoutRef.current) {
        clearTimeout(reactionTimeoutRef.current);
        reactionTimeoutRef.current = null;
      }
    };
  }, []);

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
    const says = getMiloSays(snapshot);
    const mood = getSituationMood(snapshot);

    const insights: InsightItem[] = [
      {
        label: 'Overdue',
        value: overdueCount + missedCount,
        icon: 'alert-circle',
        color: theme.colors.danger,
        backgroundColor: theme.colors.dangerSoft,
      },
      {
        label: 'Today',
        value: dueTodayCount + happeningNowCount + startingSoonCount,
        icon: 'today',
        color: '#D97706',
        backgroundColor: '#FFF7ED',
      },
      {
        label: 'Start early',
        value: startEarlyCount,
        icon: 'leaf',
        color: theme.colors.primaryDark,
        backgroundColor: theme.colors.primarySoft,
      },
      {
        label: 'Meeting',
        value: meetingTodayItems.length,
        icon: 'people',
        color: theme.colors.purple,
        backgroundColor: theme.colors.purpleSoft,
      },
      {
        label: 'Keep Both',
        value: acceptedOverlapItems.length,
        icon: 'git-compare',
        color: theme.colors.blue,
        backgroundColor: theme.colors.blueSoft,
      },
    ];

    return {
      ...snapshot,
      defaultMessage,
      says,
      mood,
      insights,
    };
  }, [displayName, tasks, todayDate]);

  const activeMood = miloMood || companionData.mood;
  const activeMessage = miloMessage || companionData.defaultMessage;
  const roomCardHeight = shortScreen ? 306 : compactWidth ? 322 : 340;
  const miloSize = Math.min(
    shortScreen ? 190 : compactWidth ? 202 : 220,
    width * 0.58
  );
  const bottomContentPadding = tabBarHeight + (shortScreen ? 48 : 60);

  const floatingStyle = {
    transform: [
      {
        translateY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6],
        }),
      },
    ],
  };

  const roomBackParallaxStyle = {
    transform: [
      {
        translateX: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -0.8],
        }),
      },
      {
        translateY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -1],
        }),
      },
    ],
  };

  const roomFloorParallaxStyle = {
    transform: [
      {
        translateY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.8],
        }),
      },
    ],
  };

  const floorRugMotionStyle = {
    transform: [
      {
        translateY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1.5],
        }),
      },
      {
        scaleX: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.98],
        }),
      },
      {
        scaleY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.98],
        }),
      },
    ],
  };

  const floorShadowMotionStyle = {
    opacity: floatMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.42, 0.28],
    }),
    transform: [
      {
        translateY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1.5],
        }),
      },
      {
        scaleX: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.94],
        }),
      },
      {
        scaleY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.94],
        }),
      },
    ],
  };

  const speechBubbleMotionStyle = {
    opacity: speechBubbleMotion,
    transform: [
      {
        scale: speechBubbleMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0.97, 1],
        }),
      },
    ],
  };

  const tapMessages = useMemo(
    () => [
      `I'm awake, ${displayName}. Let's pick one small step.`,
      'Tiny steps count. Milo is right here.',
      companionData.firstTask
        ? `Milo noticed "${getTaskTitle(companionData.firstTask)}" is ${
            companionData.firstSituation?.label.toLowerCase() || 'important'
          }.`
        : companionData.completedTodayCount > 0
        ? 'You made progress today. Milo noticed.'
        : 'Your planner is quiet. We can add one thing later.',
      'Deep breath. We only need the next useful action.',
    ],
    [
      companionData.completedTodayCount,
      companionData.firstSituation?.label,
      companionData.firstTask,
      displayName,
    ]
  );

  useEffect(() => {
    tapMessageIndexRef.current = 0;
  }, [tapMessages]);

  useEffect(() => {
    speechBubbleMotion.setValue(0);

    const animation = Animated.spring(speechBubbleMotion, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [activeMessage, speechBubbleMotion]);

  const animateTap = () => {
    tapScale.setValue(1);

    Animated.sequence([
      Animated.timing(tapScale, {
        toValue: 1.08,
        duration: 130,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(tapScale, {
        toValue: 1,
        friction: 4,
        tension: 110,
        useNativeDriver: true,
      }),
    ]).start();
  };

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

  const handleMiloTap = async () => {
    animateTap();

    const currentIndex = tapMessageIndexRef.current % tapMessages.length;
    tapMessageIndexRef.current = (currentIndex + 1) % tapMessages.length;

    await updateMiloSpeech(tapMessages[currentIndex], companionData.mood);
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

  const handleQuickAction = async (action: QuickActionKey) => {
    const firstTask = companionData.firstTask;

    if (action === 'first') {
      if (!firstTask) {
        await updateMiloSpeech(
          'Your planner is clear. Add one task when you want help choosing.',
          'happy'
        );
        return;
      }

      const title = getTaskTitle(firstTask);
      await updateMiloSpeech(
        `Start with "${title}". Try only 10 quiet minutes first.`,
        getTaskMood(companionData.firstSituation)
      );
      return;
    }

    if (action === 'plan') {
      if (!firstTask) {
        await updateMiloSpeech(
          'Add one planner item, then I can break it into tiny steps.',
          'happy'
        );
        return;
      }

      await updateMiloSpeech(
        `Let's make "${getTaskTitle(
          firstTask
        )}" tiny: open it, choose one useful action, then continue.`,
        'focused'
      );
      return;
    }

    if (action === 'calm') {
      await updateMiloSpeech(
        'Deep breath. We only need the next useful action.',
        'sleepy'
      );
      return;
    }

    if (companionData.unacceptedOverlapCount > 0) {
      await updateMiloSpeech(
        `I found ${companionData.unacceptedOverlapCount} possible overlap${
          companionData.unacceptedOverlapCount === 1 ? '' : 's'
        }. Add a buffer or move one item.`,
        'worried'
      );
      return;
    }

    if (companionData.acceptedOverlapCount > 0) {
      await updateMiloSpeech(
        `I see ${companionData.acceptedOverlapCount} Keep Both overlap${
          companionData.acceptedOverlapCount === 1 ? '' : 's'
        }. Let's give each one a little space.`,
        'focused'
      );
      return;
    }

    await updateMiloSpeech(
      'Your schedule looks manageable. Keep a tiny buffer before meetings.',
      'happy'
    );
  };

  const handleSendMessage = async () => {
    const trimmedMessage = draftMessage.trim();

    if (!trimmedMessage) return;

    setDraftMessage('');

    const lowerMessage = trimmedMessage.toLowerCase();

    if (lowerMessage.includes('first') || lowerMessage.includes('start')) {
      await handleQuickAction('first');
      return;
    }

    if (lowerMessage.includes('plan') || lowerMessage.includes('step')) {
      await handleQuickAction('plan');
      return;
    }

    if (
      lowerMessage.includes('calm') ||
      lowerMessage.includes('stress') ||
      lowerMessage.includes('overwhelm')
    ) {
      await handleQuickAction('calm');
      return;
    }

    if (
      lowerMessage.includes('schedule') ||
      lowerMessage.includes('conflict') ||
      lowerMessage.includes('overlap')
    ) {
      await handleQuickAction('schedule');
      return;
    }

    await updateMiloSpeech(
      `I heard you. I can help with priorities, tiny plans, calm breaks, and schedule checks.`,
      'waving'
    );
  };

  return (
    <ScreenContainer topPadding={8} bottomPadding={bottomContentPadding}>
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Companion</Text>
          <Text style={styles.headerSubtitle}>Chat and plan with Milo</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.headerIconButton}
          onPress={() => navigation.navigate('ReminderCenter')}
          accessibilityRole="button"
          accessibilityLabel="Open Reminder Center"
        >
          <Ionicons
            name="notifications-outline"
            size={21}
            color={theme.colors.primaryDark}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.roomCard, { height: roomCardHeight }]}>
        <Animated.View style={[styles.roomBackWall, roomBackParallaxStyle]}>
          <View style={styles.wallLightGlow} />
          <View style={styles.roomWindowGlow} />
          <View style={styles.windowLightBeam} />
          <View style={styles.windowFrame}>
            <View style={styles.windowPane} />
            <View style={styles.windowPane} />
            <View style={styles.windowDivider} />
            <View style={styles.windowSill} />
          </View>
          <View style={styles.wallShelf}>
            <View style={styles.shelfBook} />
            <View style={styles.shelfBookShort} />
            <View style={styles.shelfPlant}>
              <View style={styles.plantLeafLeft} />
              <View style={styles.plantLeafRight} />
            </View>
          </View>
          <View style={styles.wallBaseboard} />
        </Animated.View>

        <Animated.View
          style={[
            styles.speechBubble,
            { right: compactWidth ? 108 : 120 },
            speechBubbleMotionStyle,
          ]}
        >
          <View style={styles.speechHeader}>
            <Ionicons
              name="chatbubble-ellipses"
              size={14}
              color={theme.colors.primaryDark}
            />
            <Text style={styles.speechName}>Milo</Text>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.speakButton}
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
          </View>
          <Text
            numberOfLines={4}
            adjustsFontSizeToFit
            minimumFontScale={0.9}
            style={styles.speechText}
          >
            {activeMessage}
          </Text>
          <View style={styles.speechTail} />
        </Animated.View>

        <Animated.View style={[styles.roomFloor, roomFloorParallaxStyle]}>
          <View style={styles.floorBackCurve} />
          <View style={styles.floorJunctionShadow} />
          <View style={styles.floorLine} />
          <View style={styles.floorPerspectiveLeft} />
          <View style={styles.floorPerspectiveCenter} />
          <View style={styles.floorPerspectiveRight} />
          <View style={styles.floorBoardLeft} />
          <View style={styles.floorBoardRight} />
          <Animated.View style={[styles.floorRug, floorRugMotionStyle]}>
            <View style={styles.floorRugCenter} />
          </Animated.View>
          <Animated.View
            style={[styles.floorContactShadow, floorShadowMotionStyle]}
          />
        </Animated.View>

        <View style={styles.miloStage}>
          <Animated.View style={[styles.miloFloat, floatingStyle]}>
            <Animated.View style={{ transform: [{ scale: tapScale }] }}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleMiloTap}
                accessibilityRole="button"
                accessibilityLabel="Tap Milo"
              >
                <MiloMoodImage
                  mood={activeMood}
                  size={miloSize}
                  style={styles.miloImage}
                />
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      </View>

      <Text style={styles.tapHint}>Tap Milo to chat</Text>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>Ask Milo anything</Text>
        <View style={styles.quickActionGrid}>
          <QuickActionButton
            title="What should I do first?"
            icon="flag"
            onPress={() => handleQuickAction('first')}
          />
          <QuickActionButton
            title="Generate my plan"
            icon="sparkles"
            onPress={() => handleQuickAction('plan')}
          />
          <QuickActionButton
            title="Calm me down"
            icon="heart"
            onPress={() => handleQuickAction('calm')}
          />
          <QuickActionButton
            title="Fix my schedule"
            icon="calendar"
            onPress={() => handleQuickAction('schedule')}
          />
        </View>
      </View>

      <View style={styles.insightCard}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardEyebrow}>MILO INSIGHT</Text>
            <Text style={styles.cardTitle}>What Milo noticed</Text>
          </View>
          <Text style={styles.pendingCount}>{companionData.pendingCount} pending</Text>
        </View>

        <View style={styles.insightGrid}>
          {companionData.insights.map((item) => (
            <InsightPill key={item.label} item={item} />
          ))}
        </View>
      </View>

      <View style={styles.miloSaysCard}>
        <View style={styles.miloSaysIcon}>
          <Ionicons
            name="heart-circle"
            size={24}
            color={theme.colors.primaryDark}
          />
        </View>
        <View style={styles.miloSaysCopy}>
          <Text style={styles.cardEyebrow}>Milo says</Text>
          <Text style={styles.miloSaysText}>{companionData.says}</Text>
        </View>
      </View>

      <View style={styles.chatBar}>
        <TextInput
          value={draftMessage}
          onChangeText={setDraftMessage}
          placeholder="Type your message to Milo..."
          placeholderTextColor={theme.colors.muted}
          style={styles.chatInput}
          returnKeyType="send"
          onSubmitEditing={handleSendMessage}
        />
        <TouchableOpacity
          activeOpacity={0.82}
          style={[
            styles.sendButton,
            !draftMessage.trim() && styles.sendButtonDisabled,
          ]}
          onPress={handleSendMessage}
          disabled={!draftMessage.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message to Milo"
        >
          <Ionicons name="send" size={18} color={theme.colors.white} />
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerSubtitle: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBEED8',
  },
  roomCard: {
    position: 'relative',
    backgroundColor: '#F4FBF6',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D3EDDD',
    marginBottom: 6,
    ...theme.shadowSoft,
  },
  roomBackWall: {
    position: 'absolute',
    top: 0,
    left: -2,
    right: -2,
    height: '72%',
    backgroundColor: '#EEF9F2',
    zIndex: 0,
    overflow: 'hidden',
  },
  wallLightGlow: {
    position: 'absolute',
    top: -26,
    right: -24,
    width: 182,
    height: 146,
    borderRadius: 999,
    backgroundColor: 'rgba(232, 246, 255, 0.74)',
  },
  roomWindowGlow: {
    position: 'absolute',
    top: 56,
    left: 70,
    right: 70,
    height: 124,
    borderRadius: 58,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(213, 239, 222, 0.72)',
  },
  windowLightBeam: {
    position: 'absolute',
    top: 70,
    right: -2,
    width: 206,
    height: 116,
    borderRadius: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    transform: [{ rotate: '-14deg' }],
  },
  windowFrame: {
    position: 'absolute',
    top: 24,
    right: 34,
    width: 88,
    height: 64,
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: '#D7EAF7',
    padding: 7,
    flexDirection: 'row',
    zIndex: 2,
    shadowColor: '#4D9DE0',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 1,
  },
  windowPane: {
    flex: 1,
    backgroundColor: '#EAF7FF',
    borderRadius: 11,
    marginHorizontal: 2,
  },
  windowDivider: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: '50%',
    width: 1,
    backgroundColor: '#CFE4F3',
  },
  windowSill: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: -8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#D6EFE0',
  },
  wallShelf: {
    position: 'absolute',
    left: 26,
    top: 106,
    width: 92,
    height: 28,
    borderBottomWidth: 3,
    borderBottomColor: '#B9E3C7',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 3,
    paddingHorizontal: 8,
  },
  shelfBook: {
    width: 9,
    height: 20,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginRight: 5,
  },
  shelfBookShort: {
    width: 9,
    height: 15,
    borderRadius: 4,
    backgroundColor: theme.colors.yellow,
    marginRight: 9,
  },
  shelfPlant: {
    width: 20,
    height: 12,
    borderRadius: 5,
    backgroundColor: '#8FDFA7',
    position: 'relative',
  },
  plantLeafLeft: {
    position: 'absolute',
    left: 2,
    top: -8,
    width: 13,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    transform: [{ rotate: '-28deg' }],
  },
  plantLeafRight: {
    position: 'absolute',
    right: 1,
    top: -9,
    width: 13,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryDark,
    transform: [{ rotate: '28deg' }],
  },
  wallBaseboard: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#CFEBD8',
  },
  speechBubble: {
    position: 'absolute',
    top: 13,
    left: 14,
    backgroundColor: theme.colors.white,
    borderRadius: 17,
    padding: 9,
    borderWidth: 1,
    borderColor: '#DCEFE4',
    zIndex: 5,
    ...theme.shadowSoft,
  },
  speechHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  speechName: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  speakButton: {
    marginLeft: 'auto',
    width: 25,
    height: 25,
    borderRadius: 9,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speechText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  speechTail: {
    position: 'absolute',
    right: 28,
    bottom: -7,
    width: 14,
    height: 14,
    backgroundColor: theme.colors.white,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DCEFE4',
    transform: [{ rotate: '45deg' }],
  },
  miloStage: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    height: 238,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 3,
  },
  miloFloat: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miloImage: {
    marginBottom: -4,
  },
  roomFloor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 126,
    backgroundColor: '#FFF6DE',
    zIndex: 1,
    overflow: 'visible',
  },
  floorBackCurve: {
    position: 'absolute',
    top: -24,
    left: -28,
    right: -28,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#FFF6DE',
    borderTopWidth: 1,
    borderTopColor: '#EED59A',
  },
  floorJunctionShadow: {
    position: 'absolute',
    top: -8,
    left: 24,
    right: 24,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(173, 124, 39, 0.08)',
  },
  floorLine: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: 14,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(199, 151, 63, 0.3)',
  },
  floorPerspectiveLeft: {
    position: 'absolute',
    left: 32,
    top: 34,
    width: 118,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(194, 145, 61, 0.13)',
    transform: [{ rotate: '17deg' }],
  },
  floorPerspectiveCenter: {
    position: 'absolute',
    alignSelf: 'center',
    top: 24,
    width: 2,
    height: 76,
    borderRadius: 999,
    backgroundColor: 'rgba(194, 145, 61, 0.1)',
  },
  floorPerspectiveRight: {
    position: 'absolute',
    right: 32,
    top: 34,
    width: 118,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(194, 145, 61, 0.13)',
    transform: [{ rotate: '-17deg' }],
  },
  floorBoardLeft: {
    position: 'absolute',
    left: 22,
    bottom: 30,
    width: 78,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(194, 145, 61, 0.16)',
    transform: [{ rotate: '-12deg' }],
  },
  floorBoardRight: {
    position: 'absolute',
    right: 24,
    bottom: 48,
    width: 92,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(194, 145, 61, 0.15)',
    transform: [{ rotate: '10deg' }],
  },
  floorContactShadow: {
    position: 'absolute',
    left: 54,
    right: 54,
    bottom: 21,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(40, 125, 72, 0.25)',
    zIndex: 3,
  },
  floorRug: {
    position: 'absolute',
    left: 54,
    right: 54,
    bottom: 18,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(219, 243, 229, 0.96)',
    borderWidth: 1,
    borderColor: '#BDE8CE',
    zIndex: 2,
  },
  floorRugCenter: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 9,
    height: 17,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
  },
  tapHint: {
    marginBottom: 10,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionBlock: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 9,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickActionButton: {
    width: '48.5%',
    minHeight: 58,
    borderRadius: 15,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 9,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  quickActionIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  quickActionText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
  },
  insightCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
    ...theme.shadowSoft,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardEyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  cardTitle: {
    marginTop: 2,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  pendingCount: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -3,
  },
  insightPill: {
    minWidth: '30.5%',
    flexGrow: 1,
    borderRadius: 14,
    padding: 8,
    margin: 3,
    borderWidth: 1,
    borderColor: 'rgba(34, 40, 49, 0.05)',
  },
  insightIcon: {
    width: 24,
    height: 24,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  insightValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  insightLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  miloSaysCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FFF9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D9F1E2',
    padding: 11,
    marginBottom: 10,
    ...theme.shadowSoft,
  },
  miloSaysIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  miloSaysCopy: {
    flex: 1,
  },
  miloSaysText: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  chatBar: {
    minHeight: 52,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 7,
    paddingLeft: 12,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  chatInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 7,
    paddingRight: 10,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.muted,
    opacity: 0.6,
  },
});
