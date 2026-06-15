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
} from 'react-native';
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

const POMODORO_MODES = {
  focus: {
    label: 'Focus',
    minutes: 25,
    shortLabel: '25 min',
    title: 'Focus block',
    runningTitle: 'Focusing now',
    readyTitle: 'Ready to focus',
    accentColor: theme.colors.primary,
    softColor: theme.colors.primarySoft,
    startSpeech: 'Focus mode started. Choose one task and stay with it.',
  },
  shortBreak: {
    label: 'Short Break',
    minutes: 5,
    shortLabel: '5 min',
    title: 'Short break',
    runningTitle: 'Breathing break',
    readyTitle: 'Ready to rest',
    accentColor: theme.colors.blue,
    softColor: theme.colors.blueSoft,
    startSpeech: 'Short break started. Take a gentle reset.',
  },
  longBreak: {
    label: 'Long Break',
    minutes: 15,
    shortLabel: '15 min',
    title: 'Long break',
    runningTitle: 'Deep reset',
    readyTitle: 'Long break ready',
    accentColor: theme.colors.purple,
    softColor: theme.colors.purpleSoft,
    startSpeech: 'Long break started. Milo says you earned this rest.',
  },
} as const;

type PomodoroMode = keyof typeof POMODORO_MODES;

const pomodoroModeOrder: PomodoroMode[] = ['focus', 'shortBreak', 'longBreak'];

function getModeSeconds(mode: PomodoroMode) {
  return POMODORO_MODES[mode].minutes * 60;
}

function getSuggestedBreakMode(completedFocusCount: number): PomodoroMode {
  return completedFocusCount % 4 === 0 ? 'longBreak' : 'shortBreak';
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

function ModeButton({
  mode,
  selected,
  onPress,
}: {
  mode: PomodoroMode;
  selected: boolean;
  onPress: () => void;
}) {
  const modeConfig = POMODORO_MODES[mode];

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
        {modeConfig.shortLabel}
      </Text>
    </TouchableOpacity>
  );
}

export default function FocusSessionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tasks } = useTasks();
  const { focusSessions, addFocusSession, totalFocusMinutes } = useFocus();

  const [currentMode, setCurrentMode] = useState<PomodoroMode>('focus');
  const [remainingSeconds, setRemainingSeconds] = useState(getModeSeconds('focus'));
  const [isRunning, setIsRunning] = useState(false);
  const endTimestampRef = useRef<number | null>(null);
  const remainingMsRef = useRef(getModeSeconds('focus') * 1000);
  const completionHandledRef = useRef(false);

  const currentModeConfig = POMODORO_MODES[currentMode];
  const totalSeconds = getModeSeconds(currentMode);
  const todayDate = getTodayDate();

  const todayFocusSessions = useMemo(() => {
    return focusSessions.filter(
      (session) => session.completedAt.slice(0, 10) === todayDate
    );
  }, [focusSessions, todayDate]);

  const todayFocusMinutes = useMemo(() => {
    return todayFocusSessions.reduce((total, session) => total + session.minutes, 0);
  }, [todayFocusSessions]);
  const completedFocusCount = todayFocusSessions.length;
  const nextBreakAfterFocusMode = getSuggestedBreakMode(completedFocusCount + 1);
  const focusBlocksInCycle = completedFocusCount % 4;
  const cycleProgressCount =
    focusBlocksInCycle === 0 && completedFocusCount > 0 && currentMode === 'longBreak'
      ? 4
      : focusBlocksInCycle;
  const displayedBreakMode =
    currentMode === 'focus' ? nextBreakAfterFocusMode : currentMode;
  const breakSuggestionPrefix = currentMode === 'focus' ? 'Next' : 'Suggested';

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
    ? `${POMODORO_MODES[nextBreakAfterFocusMode].label} comes after this focus block.`
    : `${currentModeConfig.label} is ready. Press start when you want to rest.`;

  const resetTimerForMode = useCallback((mode: PomodoroMode) => {
    const nextSeconds = getModeSeconds(mode);

    endTimestampRef.current = null;
    remainingMsRef.current = nextSeconds * 1000;
    completionHandledRef.current = false;
    setIsRunning(false);
    setRemainingSeconds(nextSeconds);
  }, []);

  const changeMode = useCallback(
    (mode: PomodoroMode) => {
      setCurrentMode(mode);
      resetTimerForMode(mode);
    },
    [resetTimerForMode]
  );

  const completeCurrentMode = useCallback(() => {
    if (completionHandledRef.current) return;

    completionHandledRef.current = true;
    endTimestampRef.current = null;
    remainingMsRef.current = 0;
    setIsRunning(false);
    setRemainingSeconds(0);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (currentMode === 'focus') {
      const nextCompletedFocusCount = completedFocusCount + 1;
      const suggestedBreakMode = getSuggestedBreakMode(nextCompletedFocusCount);
      const suggestedBreak = POMODORO_MODES[suggestedBreakMode];

      addFocusSession(POMODORO_MODES.focus.minutes);
      Speech.speak(
        `Focus session completed. Great work. Milo suggests a ${suggestedBreak.label}.`,
        {
          rate: 0.95,
          pitch: 1.08,
        }
      );
      changeMode(suggestedBreakMode);

      Alert.alert(
        'Focus block complete',
        `Milo logged 25 focus minutes. ${
          suggestedBreakMode === 'longBreak'
            ? 'That makes 4 focus blocks, so take a Long Break.'
            : 'Take a Short Break before the next block.'
        }`
      );
      return;
    }

    Speech.speak('Break completed. Milo is ready for the next focus block.', {
      rate: 0.95,
      pitch: 1.08,
    });
    changeMode('focus');

    Alert.alert(
      'Break complete',
      'Nice reset. Milo is ready when you want to start another focus block.'
    );
  }, [addFocusSession, changeMode, completedFocusCount, currentMode]);

  useEffect(() => {
    if (!isRunning) return;

    const syncRemainingTime = () => {
      if (!endTimestampRef.current) return;

      const nextRemainingMs = Math.max(endTimestampRef.current - Date.now(), 0);
      remainingMsRef.current = nextRemainingMs;
      setRemainingSeconds(Math.ceil(nextRemainingMs / 1000));

      if (nextRemainingMs === 0) {
        completeCurrentMode();
      }
    };

    syncRemainingTime();
    const timer = setInterval(syncRemainingTime, 250);

    return () => clearInterval(timer);
  }, [completeCurrentMode, isRunning]);

  const handleSelectMode = (mode: PomodoroMode) => {
    if (mode === currentMode) return;

    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current timer before changing Pomodoro modes.'
      );
      return;
    }

    changeMode(mode);
  };

  const handleStartPause = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isRunning) {
      const pausedRemainingMs = endTimestampRef.current
        ? Math.max(endTimestampRef.current - Date.now(), 0)
        : remainingMsRef.current;

      remainingMsRef.current = pausedRemainingMs;
      endTimestampRef.current = null;
      setRemainingSeconds(Math.ceil(pausedRemainingMs / 1000));
      setIsRunning(false);
      return;
    }

    if (remainingMsRef.current <= 0 || remainingSeconds === 0) {
      remainingMsRef.current = totalSeconds * 1000;
      setRemainingSeconds(totalSeconds);
    }

    completionHandledRef.current = false;
    endTimestampRef.current = Date.now() + remainingMsRef.current;
    setIsRunning(true);

    Speech.speak(currentModeConfig.startSpeech, {
      rate: 0.95,
      pitch: 1.08,
    });
  };

  const handleReset = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetTimerForMode(currentMode);
  };

  const handleSkip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const nextMode = currentMode === 'focus' ? 'shortBreak' : 'focus';
    changeMode(nextMode);

    Speech.speak(
      currentMode === 'focus'
        ? 'Focus block skipped. Milo will not count this one.'
        : 'Break skipped. Milo is ready for focus.',
      {
        rate: 0.95,
        pitch: 1.08,
      }
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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
              Focus for 25 minutes, then let Milo guide the right break.
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

        <Text style={styles.sectionTitle}>Pomodoro Mode</Text>

        <View style={styles.modeRow}>
          {pomodoroModeOrder.map((mode) => (
            <ModeButton
              key={mode}
              mode={mode}
              selected={currentMode === mode}
              onPress={() => handleSelectMode(mode)}
            />
          ))}
        </View>

        <View style={styles.cycleCard}>
          <View style={styles.cycleTopRow}>
            <View>
              <Text style={styles.cycleLabel}>Cycle Progress</Text>
              <Text style={styles.cycleTitle}>{cycleProgressCount}/4 focus blocks</Text>
            </View>

            <View style={styles.breakSuggestionBadge}>
              <Ionicons name="leaf" size={16} color={theme.colors.primaryDark} />
              <Text style={styles.breakSuggestionText}>
                {breakSuggestionPrefix}: {POMODORO_MODES[displayedBreakMode].label}
              </Text>
            </View>
          </View>

          <View style={styles.cycleDotsRow}>
            {[0, 1, 2, 3].map((index) => (
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
            <Text style={styles.tipText}>After 4 focus blocks, take a long break.</Text>
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
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 13,
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
