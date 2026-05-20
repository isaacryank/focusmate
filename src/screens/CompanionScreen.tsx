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
import {
  getMiloEncouragement,
  getMiloMoodLabel,
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

function getMiloSays(snapshot: CompanionPlannerSnapshot) {
  if (snapshot.missedCount > 0 || snapshot.overdueCount > 0) {
    return 'No panic. We can rescue this one gently.';
  }

  if (snapshot.unacceptedOverlapCount > 0) {
    return "Hmm, plans are close. Let's protect your time.";
  }

  if (snapshot.acceptedOverlapCount > 0) {
    return "Keep Both is okay. I'll watch the timing.";
  }

  if (snapshot.happeningNowCount > 0 || snapshot.startingSoonCount > 0) {
    return "Almost time. Let's get ready calmly.";
  }

  if (snapshot.dueTodayCount > 0 || snapshot.meetingTodayCount > 0) {
    return "This needs today's focus. I'll stay with you.";
  }

  if (snapshot.highFocusCount > 0) {
    return 'Big focus task. Tiny first step.';
  }

  if (snapshot.completedTodayCount > 0) {
    return 'Nice work. I saw that progress.';
  }

  if (snapshot.pendingCount === 0) {
    return 'Your planner is clear. Want one small plan?';
  }

  if (snapshot.startEarlyCount > 0) {
    return 'Future you will like one early step.';
  }

  return 'Your planner looks calm. One small step is enough.';
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

function InsightPill({
  item,
  showDivider,
}: {
  item: InsightItem;
  showDivider: boolean;
}) {
  return (
    <View style={styles.insightPill}>
      {showDivider ? <View style={styles.insightDivider} /> : null}
      <View style={styles.insightMetricRow}>
        <View style={[styles.insightIcon, { backgroundColor: `${item.color}16` }]}>
          <Ionicons name={item.icon} size={12} color={item.color} />
        </View>
        <Text style={[styles.insightValue, { color: item.color }]}>
          {item.value}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.86}
        style={styles.insightLabel}
      >
        {item.label}
      </Text>
    </View>
  );
}

function QuickActionButton({
  title,
  icon,
  onPress,
  backgroundColor,
  iconColor = theme.colors.primaryDark,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
  backgroundColor: string;
  iconColor?: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      style={[styles.quickActionButton, { backgroundColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Ionicons
        name={icon}
        size={20}
        color={iconColor}
        style={styles.quickActionIcon}
      />
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.84}
        style={styles.quickActionText}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
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
        label: 'Due today',
        value: dueTodayCount + happeningNowCount + startingSoonCount,
        icon: 'time',
        color: '#D97706',
        backgroundColor: '#FFF7ED',
      },
      {
        label: 'Start early',
        value: startEarlyCount,
        icon: 'airplane',
        color: theme.colors.primaryDark,
        backgroundColor: theme.colors.primarySoft,
      },
      {
        label: 'Meeting today',
        value: meetingTodayItems.length,
        icon: 'people',
        color: theme.colors.purple,
        backgroundColor: theme.colors.purpleSoft,
      },
      {
        label: 'Accepted overlap',
        value: acceptedOverlapItems.length,
        icon: 'heart',
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
  const heroInnerWidth = Math.max(width - 40, 300);
  const moodPanelWidth = compactWidth ? 104 : 118;
  const roomCardHeight = shortScreen ? 414 : compactWidth ? 430 : 456;
  const miloSize = Math.min(
    shortScreen ? 202 : compactWidth ? 208 : 228,
    Math.max(compactWidth ? 184 : 204, heroInnerWidth - moodPanelWidth - 32)
  );
  const bottomContentPadding = tabBarHeight + (shortScreen ? 54 : 66);
  const moodLabel = getMiloMoodLabel(activeMood);
  const moodCareText = getMiloEncouragement(activeMood);
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
          'Your planner is clear. Want to add one small thing?',
          'happy'
        );
        return;
      }

      const title = getTaskTitle(firstTask);
      await updateMiloSpeech(
        `"${title}" first. Just 10 calm minutes.`,
        getTaskMood(companionData.firstSituation)
      );
      return;
    }

    if (action === 'plan') {
      if (!firstTask) {
        await updateMiloSpeech(
          "Add one small planner item, then I'll help make it easy.",
          'happy'
        );
        return;
      }

      await updateMiloSpeech(
        `Let's make "${getTaskTitle(
          firstTask
        )}" tiny. Open it and choose one action.`,
        'focused'
      );
      return;
    }

    if (action === 'calm') {
      await updateMiloSpeech(
        "Deep breath. You're safe here. Just one tiny next step.",
        'sleepy'
      );
      return;
    }

    if (companionData.unacceptedOverlapCount > 0) {
      await updateMiloSpeech(
        `Hmm, I found ${companionData.unacceptedOverlapCount} possible overlap${
          companionData.unacceptedOverlapCount === 1 ? '' : 's'
        }. Let's add a buffer or move one item.`,
        'worried'
      );
      return;
    }

    if (companionData.acceptedOverlapCount > 0) {
      await updateMiloSpeech(
        "Keep Both is okay. I'll keep an eye on the timing.",
        'focused'
      );
      return;
    }

    await updateMiloSpeech(
      'Your schedule looks calm. Keep a tiny buffer before meetings.',
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
      'I heard you. I can help with first steps, tiny plans, calm breaks, or timing.',
      'waving'
    );
  };

  return (
    <ScreenContainer
      topPadding={14}
      bottomPadding={bottomContentPadding}
      style={styles.screen}
      contentStyle={styles.screenContent}
    >
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Companion</Text>
          <Text style={styles.headerSubtitle}>Chat and plan with Milo 💚</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            activeOpacity={0.82}
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
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>2</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.headerIconButton}
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
          <View style={styles.wallPoster}>
            <View style={styles.posterSun} />
            <View style={styles.posterHill} />
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
          style={[styles.speechBubble, speechBubbleMotionStyle]}
        >
          <Text style={styles.speechGreeting}>Hi {displayName}! 👋</Text>
          <Text
            numberOfLines={4}
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
              {moodLabel}
            </Text>
            <Text numberOfLines={2} style={styles.moodSubtext}>
              {moodCareText}
            </Text>
          </View>

          {statusItems.map((item) => (
            <MoodStatusCard key={item.label} item={item} />
          ))}
        </View>

        <Animated.View style={[styles.roomFloor, roomFloorParallaxStyle]}>
          <View style={styles.floorBackCurve} />
          <View style={styles.floorJunctionShadow} />
          <View style={styles.floorLine} />
          <View style={styles.floorPerspectiveLeft} />
          <View style={styles.floorPerspectiveCenter} />
          <View style={styles.floorPerspectiveRight} />
          <View style={styles.floorBoardLeft} />
          <View style={styles.floorBoardRight} />
          <View style={styles.floorPlant}>
            <View style={styles.floorPlantPot} />
            <View style={styles.floorPlantLeafOne} />
            <View style={styles.floorPlantLeafTwo} />
            <View style={styles.floorPlantLeafThree} />
          </View>
          <Animated.View style={[styles.floorRug, floorRugMotionStyle]}>
            <View style={styles.floorRugCenter} />
          </Animated.View>
          <Animated.View
            style={[styles.floorContactShadow, floorShadowMotionStyle]}
          />
        </Animated.View>

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
            onPress={handleMiloTap}
            accessibilityRole="button"
            accessibilityLabel="Tap Milo to talk"
          >
            <Text style={styles.tapHint}>Tap Milo to talk!</Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.miloStage,
            { right: moodPanelWidth + (compactWidth ? 18 : 26) },
          ]}
        >
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

      <View style={styles.askCard}>
        <View style={styles.askHeader}>
          <Text style={styles.askTitle}>Ask Milo anything</Text>
          <Text style={styles.seeAllText}>See all &gt;</Text>
        </View>

        <View style={styles.quickActionGrid}>
          <QuickActionButton
            title="What should I do first?"
            icon="chatbubble-ellipses-outline"
            backgroundColor="#ECF8EF"
            onPress={() => handleQuickAction('first')}
          />
          <QuickActionButton
            title="Generate my plan"
            icon="color-wand-outline"
            backgroundColor="#F3EEFF"
            iconColor={theme.colors.purple}
            onPress={() => handleQuickAction('plan')}
          />
          <QuickActionButton
            title="Calm me down"
            icon="flower-outline"
            backgroundColor="#FFF6DB"
            iconColor="#B7791F"
            onPress={() => handleQuickAction('calm')}
          />
          <QuickActionButton
            title="Fix my schedule"
            icon="calendar-outline"
            backgroundColor="#EAF4FF"
            iconColor={theme.colors.blue}
            onPress={() => handleQuickAction('schedule')}
          />
        </View>
      </View>

      <View style={styles.insightCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.insightTitle}>💡 Milos Insight</Text>
        </View>

        <View style={styles.insightGrid}>
          {companionData.insights.map((item, index) => (
            <InsightPill
              key={item.label}
              item={item}
              showDivider={index > 0}
            />
          ))}
        </View>
      </View>

      <View style={styles.miloSaysCard}>
        <View style={styles.miloSaysAvatar}>
          <MiloMoodImage
            mood={activeMood}
            size={54}
            style={styles.miloSaysImage}
          />
        </View>
        <View style={styles.miloSaysCopy}>
          <Text style={styles.miloSaysTitle}>Milo says</Text>
          <Text style={styles.miloSaysText}>{companionData.says}</Text>
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.encourageButton}
            onPress={() => handleQuickAction('calm')}
            accessibilityRole="button"
            accessibilityLabel="Encourage me"
          >
            <Text style={styles.encourageButtonText}>Encourage me</Text>
          </TouchableOpacity>
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
  screen: {
    backgroundColor: '#F7F8F1',
  },
  screenContent: {
    backgroundColor: '#F7F8F1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerSubtitle: {
    marginTop: 5,
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEF1EA',
    marginLeft: 10,
    ...theme.shadowSoft,
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
    backgroundColor: '#F8F4E9',
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8E5D8',
    marginBottom: 18,
    shadowColor: '#233B23',
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 5,
  },
  roomBackWall: {
    position: 'absolute',
    top: 0,
    left: -2,
    right: -2,
    height: '72%',
    backgroundColor: '#F7F2E5',
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
    backgroundColor: 'rgba(232, 246, 255, 0.82)',
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
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: '#D6E8F1',
    padding: 7,
    flexDirection: 'row',
    zIndex: 2,
    shadowColor: '#4D9DE0',
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
    backgroundColor: '#EAF7FF',
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
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#E7E2CE',
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
    backgroundColor: '#D6E7C7',
  },
  speechBubble: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: '52%',
    maxWidth: 210,
    backgroundColor: theme.colors.white,
    borderRadius: 26,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#EEF1EA',
    zIndex: 8,
    shadowColor: '#243024',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  speechGreeting: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    marginBottom: 4,
  },
  speechText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  speechTail: {
    position: 'absolute',
    right: 38,
    bottom: -8,
    width: 17,
    height: 17,
    backgroundColor: theme.colors.white,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EEF1EA',
    transform: [{ rotate: '45deg' }],
  },
  moodPanel: {
    position: 'absolute',
    top: 18,
    right: 12,
    zIndex: 7,
  },
  moodCard: {
    minHeight: 108,
    borderRadius: 22,
    backgroundColor: theme.colors.white,
    padding: 10,
    borderWidth: 1,
    borderColor: '#EEF1EA',
    shadowColor: '#223322',
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
    color: '#247A3E',
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
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  moodSubtext: {
    marginTop: 4,
    color: '#5B6658',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  statusCard: {
    minHeight: 49,
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#EEF1EA',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
    shadowColor: '#223322',
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
  },
  statusLabel: {
    color: '#6B7280',
    fontSize: 9,
    fontWeight: '800',
  },
  statusValue: {
    marginTop: 1,
    color: '#111827',
    fontSize: 10,
    fontWeight: '900',
  },
  roomFloor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 174,
    backgroundColor: '#EAF5D8',
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
    backgroundColor: '#EAF5D8',
    borderTopWidth: 1,
    borderTopColor: '#CFE3B1',
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
    backgroundColor: 'rgba(255, 248, 219, 0.98)',
    borderWidth: 1,
    borderColor: '#EEDC9B',
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
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingVertical: 6,
    paddingLeft: 7,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 8,
    borderWidth: 1,
    borderColor: '#EEF1EA',
    shadowColor: '#223322',
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
    color: '#247A3E',
    fontSize: 11,
    fontWeight: '900',
  },
  miloStage: {
    position: 'absolute',
    left: 6,
    bottom: 38,
    height: 288,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 5,
  },
  miloFloat: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miloImage: {
    marginBottom: -2,
  },
  askCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#ECEFE8',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 13,
    marginBottom: 16,
    shadowColor: '#223322',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
  },
  askHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  askTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
  },
  seeAllText: {
    color: '#247A3E',
    fontSize: 12,
    fontWeight: '500',
  },
  quickActionGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  quickActionButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 40, 49, 0.04)',
    paddingHorizontal: 7,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  quickActionIcon: {
    marginRight: 5,
    flexShrink: 0,
  },
  quickActionText: {
    flex: 1,
    color: '#111827',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 14,
    textAlign: 'left',
  },
  insightCard: {
    backgroundColor: '#F3FBF0',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#DAEFD6',
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 12,
    marginBottom: 14,
    shadowColor: '#223322',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  insightTitle: {
    color: '#247A3E',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  insightGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(214, 222, 210, 0.58)',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  insightPill: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
    position: 'relative',
  },
  insightDivider: {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 3,
    width: 1,
    backgroundColor: '#D6DED2',
  },
  insightMetricRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 4,
  },
  insightIcon: {
    width: 19,
    height: 19,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightValue: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  insightLabel: {
    width: '100%',
    color: '#485247',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    textAlign: 'center',
  },
  miloSaysCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ECEFE8',
    padding: 14,
    marginBottom: 16,
    shadowColor: '#223322',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.065,
    shadowRadius: 16,
    elevation: 3,
  },
  miloSaysAvatar: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: '#ECF8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  miloSaysImage: {
    marginBottom: -5,
  },
  miloSaysCopy: {
    flex: 1,
  },
  miloSaysTitle: {
    color: '#247A3E',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
  },
  miloSaysText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  encourageButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: '#ECF8EF',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  encourageButtonText: {
    color: '#247A3E',
    fontSize: 12,
    fontWeight: '900',
  },
  chatBar: {
    minHeight: 60,
    backgroundColor: theme.colors.white,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 7,
    paddingLeft: 18,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#223322',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.065,
    shadowRadius: 16,
    elevation: 3,
  },
  chatInput: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 10,
    paddingRight: 10,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#247A3E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#247A3E',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.muted,
    opacity: 0.6,
  },
});
