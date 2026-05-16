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
import { compareTasksByUrgency, getTaskUrgency } from '../lib/taskUrgency';
import { Task } from '../types/task';

import ScreenContainer from '../components/ui/ScreenContainer';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type QuickActionKey = 'first' | 'plan' | 'calm' | 'schedule';

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

const overlapTypes = [
  'same_time',
  'hard_overlap',
  'ongoing_overlap',
  'soft_overlap',
  'whole_day',
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

function getDefaultMiloMessage(
  displayName: string,
  overdueCount: number,
  dueTodayCount: number,
  acceptedOverlapCount: number
) {
  if (overdueCount > 0) {
    return `I'm awake, ${displayName}. One thing slipped, but we can recover it gently.`;
  }

  if (dueTodayCount > 0) {
    return `I'm awake, ${displayName}. Let's pick one small step.`;
  }

  if (acceptedOverlapCount > 0) {
    return `I'm here, ${displayName}. We'll handle one overlap calmly.`;
  }

  return `I'm awake, ${displayName}. Let's pick one small step.`;
}

function getMiloSays(
  overdueCount: number,
  dueTodayCount: number,
  acceptedOverlapCount: number,
  pendingCount: number
) {
  if (overdueCount > 0) {
    return 'One thing slipped, but we can recover it gently.';
  }

  if (acceptedOverlapCount > 0) {
    return "We kept both items. Let's give each one a little space.";
  }

  if (dueTodayCount > 0) {
    return "Let's start with what matters today.";
  }

  if (pendingCount === 0) {
    return 'Your plan looks calm right now.';
  }

  return 'Your plan looks manageable. One small step is enough.';
}

function getSituationMood(
  overdueCount: number,
  dueTodayCount: number,
  acceptedOverlapCount: number,
  pendingCount: number
): MiloMood {
  if (overdueCount > 0) return 'worried';
  if (dueTodayCount > 0 || acceptedOverlapCount > 0) return 'focused';
  if (pendingCount === 0) return 'happy';
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

  const [miloMessage, setMiloMessage] = useState<string | null>(null);
  const [miloMood, setMiloMood] = useState<MiloMood | null>(null);
  const [tapIndex, setTapIndex] = useState(0);
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

  const companionData = useMemo(() => {
    const now = new Date();
    const pendingTasks = tasks.filter(isPendingTask);
    const rankedTasks = [...pendingTasks].sort(compareTasksByUrgency);
    const firstTask = rankedTasks[0];
    const overdueItems = pendingTasks.filter(
      (task) => getTaskUrgency(task, now).level === 'overdue'
    );
    const dueTodayItems = pendingTasks.filter(
      (task) => getTaskUrgency(task, now).level === 'urgent'
    );
    const startEarlyItems = pendingTasks.filter(
      (task) => getTaskUrgency(task, now).level === 'medium'
    );
    const meetingTodayItems = pendingTasks.filter(
      (task) => task.plannerType === 'meeting' && task.dueDate === todayDate
    );
    const acceptedOverlapItems = pendingTasks.filter(hasAcceptedOverlap);
    const storedOverlapItems = pendingTasks.filter(hasStoredOverlap);
    const directOverlapCount = countDirectOverlaps(pendingTasks);
    const scheduleOverlapCount = Math.max(
      storedOverlapItems.length,
      directOverlapCount
    );

    const defaultMessage = getDefaultMiloMessage(
      displayName,
      overdueItems.length,
      dueTodayItems.length,
      acceptedOverlapItems.length
    );
    const says = getMiloSays(
      overdueItems.length,
      dueTodayItems.length,
      acceptedOverlapItems.length,
      pendingTasks.length
    );
    const mood = getSituationMood(
      overdueItems.length,
      dueTodayItems.length,
      acceptedOverlapItems.length,
      pendingTasks.length
    );

    const insights: InsightItem[] = [
      {
        label: 'Overdue',
        value: overdueItems.length,
        icon: 'alert-circle',
        color: theme.colors.danger,
        backgroundColor: theme.colors.dangerSoft,
      },
      {
        label: 'Today',
        value: dueTodayItems.length,
        icon: 'today',
        color: '#D97706',
        backgroundColor: '#FFF7ED',
      },
      {
        label: 'Start early',
        value: startEarlyItems.length,
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
      pendingCount: pendingTasks.length,
      firstTask,
      overdueCount: overdueItems.length,
      dueTodayCount: dueTodayItems.length,
      acceptedOverlapCount: acceptedOverlapItems.length,
      scheduleOverlapCount,
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
    shortScreen ? 178 : compactWidth ? 188 : 204,
    width * 0.54
  );
  const bottomContentPadding = tabBarHeight + (shortScreen ? 48 : 60);

  const floatingStyle = {
    transform: [
      {
        translateY: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -9],
        }),
      },
      {
        scale: floatMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.025],
        }),
      },
    ],
  };

  const tapMessages = useMemo(
    () => [
      `I'm awake, ${displayName}. Let's pick one small step.`,
      'Tiny steps count. Milo is right here.',
      companionData.firstTask
        ? `I'm looking at "${getTaskTitle(companionData.firstTask)}" with you.`
        : 'Your planner is quiet. We can add one thing later.',
      'Deep breath. We only need the next useful action.',
    ],
    [companionData.firstTask, displayName]
  );

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

  const updateMiloSpeech = async (message: string, mood: MiloMood) => {
    await Haptics.selectionAsync();
    setMiloMessage(message);
    setMiloMood(mood);
  };

  const handleMiloTap = async () => {
    animateTap();

    const nextIndex = (tapIndex + 1) % tapMessages.length;
    setTapIndex(nextIndex);
    await updateMiloSpeech(tapMessages[nextIndex], 'waving');
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
        getTaskUrgency(firstTask).level === 'overdue' ? 'worried' : 'focused'
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

    if (companionData.acceptedOverlapCount > 0) {
      await updateMiloSpeech(
        `I see ${companionData.acceptedOverlapCount} Keep Both overlap${
          companionData.acceptedOverlapCount === 1 ? '' : 's'
        }. Let's give each one a little space.`,
        'focused'
      );
      return;
    }

    if (companionData.scheduleOverlapCount > 0) {
      await updateMiloSpeech(
        `I found ${companionData.scheduleOverlapCount} possible overlap${
          companionData.scheduleOverlapCount === 1 ? '' : 's'
        }. Add a buffer or move one item.`,
        'worried'
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
          <Text style={styles.headerSubtitle}>Chat and plan with Milo 💚</Text>
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
        <View style={styles.roomBackWall}>
          <View style={styles.wallPanel} />
          <View style={styles.windowFrame}>
            <View style={styles.windowPane} />
            <View style={styles.windowPane} />
          </View>
          <View style={styles.wallShelf}>
            <View style={styles.shelfBook} />
            <View style={styles.shelfBookShort} />
            <View style={styles.shelfPlant} />
          </View>
        </View>

        <View style={styles.speechBubble}>
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
          <Text style={styles.speechText}>{activeMessage}</Text>
          <View style={styles.speechTail} />
        </View>

        <View style={styles.roomFloor}>
          <View style={styles.floorLine} />
          <View style={styles.floorRug} />
        </View>

        <View style={styles.miloStage}>
          <Animated.View style={[styles.miloFloat, floatingStyle]}>
            <Animated.View style={{ transform: [{ scale: tapScale }] }}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleMiloTap}
                accessibilityRole="button"
                accessibilityLabel="Tap Milo"
              >
                <Animated.Image
                  source={getMiloImageSource(activeMood)}
                  resizeMode="contain"
                  style={[
                    styles.miloImage,
                    {
                      width: miloSize,
                      height: miloSize,
                    },
                  ]}
                />
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      </View>

      <Text style={styles.tapHint}>Tap Milo to chat 💚</Text>

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
    backgroundColor: '#F3FBF6',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D7EFDF',
    marginBottom: 6,
    ...theme.shadowSoft,
  },
  roomBackWall: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '64%',
    backgroundColor: '#ECF9F1',
    zIndex: 0,
  },
  wallPanel: {
    position: 'absolute',
    left: 18,
    top: 16,
    width: 118,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
    borderWidth: 1,
    borderColor: '#D9F0E1',
  },
  windowFrame: {
    position: 'absolute',
    top: 18,
    right: 20,
    width: 68,
    height: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: '#D7EAF7',
    padding: 6,
    flexDirection: 'row',
  },
  windowPane: {
    flex: 1,
    backgroundColor: theme.colors.blueSoft,
    borderRadius: 10,
    marginHorizontal: 2,
  },
  wallShelf: {
    position: 'absolute',
    left: 24,
    top: 84,
    width: 98,
    height: 28,
    borderBottomWidth: 3,
    borderBottomColor: '#BFE6CC',
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
  },
  speechBubble: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 96,
    backgroundColor: theme.colors.white,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1,
    borderColor: '#DCEFE4',
    zIndex: 3,
    ...theme.shadowSoft,
  },
  speechHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  speechName: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  speakButton: {
    marginLeft: 'auto',
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speechText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  speechTail: {
    position: 'absolute',
    left: 34,
    bottom: -8,
    width: 15,
    height: 15,
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
    bottom: 18,
    height: 226,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  miloFloat: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  miloImage: {
    marginTop: 0,
  },
  roomFloor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    backgroundColor: '#FFF8DF',
    borderTopWidth: 1,
    borderTopColor: '#F3D9A8',
    zIndex: 1,
  },
  floorLine: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: 23,
    height: 2,
    borderRadius: 999,
    backgroundColor: '#E7C780',
  },
  floorRug: {
    position: 'absolute',
    left: 86,
    right: 86,
    bottom: 12,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#DDF3E5',
    borderWidth: 1,
    borderColor: '#C5EBD4',
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
