import React, { useEffect, useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';

const miloFocusedImage = require('../../assets/mascot/milo_focused.png');
const miloHappyImage = require('../../assets/mascot/milo_happy.png');
const miloSleepyImage = require('../../assets/mascot/milo_sleepy.png');

const focusOptions = [5, 15, 25, 45];

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

function OptionButton({
  minutes,
  selected,
  onPress,
}: {
  minutes: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.optionButton, selected && styles.optionButtonActive]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextActive]}>
        {minutes} min
      </Text>
    </TouchableOpacity>
  );
}

export default function FocusSessionScreen() {
  const navigation = useNavigation<any>();
  const { tasks } = useTasks();
  const { focusSessions, addFocusSession, totalFocusMinutes } = useFocus();

  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  const totalSeconds = selectedMinutes * 60;
  const todayDate = getTodayDate();

  const todayFocusSessions = useMemo(() => {
    return focusSessions.filter(
      (session) => session.completedAt.slice(0, 10) === todayDate
    );
  }, [focusSessions, todayDate]);

  const todayFocusMinutes = useMemo(() => {
    return todayFocusSessions.reduce((total, session) => total + session.minutes, 0);
  }, [todayFocusSessions]);

  const pendingTasks = useMemo(() => {
    return tasks.filter((task) => task.status === 'pending');
  }, [tasks]);

  const suggestedTask = useMemo(() => {
    const highPriorityTask = pendingTasks.find((task) => task.priority === 'high');

    if (highPriorityTask) {
      return highPriorityTask;
    }

    return pendingTasks[0];
  }, [pendingTasks]);

  const progress = totalSeconds === 0 ? 0 : 1 - remainingSeconds / totalSeconds;
  const progressPercent = Math.round(progress * 100);

  const miloImage =
    remainingSeconds === 0
      ? miloHappyImage
      : isRunning
      ? miloFocusedImage
      : miloSleepyImage;

  const miloMessage = isRunning
    ? 'Milo is focusing with you. Stay with one task only.'
    : todayFocusSessions.length > 0
    ? `Nice work! You completed ${todayFocusSessions.length} focus session(s) today.`
    : 'Choose a timer and let Milo help you focus.';

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || remainingSeconds !== 0) return;

    setIsRunning(false);
    addFocusSession(selectedMinutes);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak('Focus session completed. Great work!', {
      rate: 0.95,
      pitch: 1.08,
    });

    Alert.alert(
      'Focus session complete',
      'Milo is proud of you. This session has been saved in your analytics.'
    );
  }, [isRunning, remainingSeconds, selectedMinutes, addFocusSession]);

  const handleSelectMinutes = (minutes: number) => {
    if (isRunning) {
      Alert.alert(
        'Timer is running',
        'Pause or reset the current focus session before changing the duration.'
      );
      return;
    }

    setSelectedMinutes(minutes);
    setRemainingSeconds(minutes * 60);
  };

  const handleStartPause = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (remainingSeconds === 0) {
      setRemainingSeconds(totalSeconds);
    }

    if (!isRunning) {
      Speech.speak('Focus mode started. Choose one task and stay with it.', {
        rate: 0.95,
        pitch: 1.08,
      });
    }

    setIsRunning((current) => !current);
  };

  const handleReset = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
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
            <Text style={styles.heroTitle}>Stay focused</Text>
            <Text style={styles.heroSubtitle}>
              Pick one task, start the timer, and let Milo keep you company.
            </Text>
          </View>

          <View style={styles.miloBubble}>
            <Image source={miloImage} style={styles.miloImage} resizeMode="contain" />
          </View>
        </LinearGradient>

        <View style={styles.analyticsRow}>
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsNumber}>{todayFocusSessions.length}</Text>
            <Text style={styles.analyticsLabel}>Today Sessions</Text>
          </View>

          <View style={styles.analyticsCard}>
            <Text style={[styles.analyticsNumber, { color: theme.colors.blue }]}>
              {todayFocusMinutes}
            </Text>
            <Text style={styles.analyticsLabel}>Today Minutes</Text>
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
              <Text style={styles.timerLabel}>Current Session</Text>
              <Text style={styles.timerTitle}>
                {isRunning ? 'Focusing now' : 'Ready to focus'}
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

          <View style={styles.timerCircle}>
            <Text style={styles.timerText}>{formatSeconds(remainingSeconds)}</Text>
            <Text style={styles.timerSubText}>{progressPercent}% complete</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
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
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose Focus Duration</Text>

        <View style={styles.optionsRow}>
          {focusOptions.map((minutes) => (
            <OptionButton
              key={minutes}
              minutes={minutes}
              selected={selectedMinutes === minutes}
              onPress={() => handleSelectMinutes(minutes)}
            />
          ))}
        </View>

        <View style={styles.miloMessageCard}>
          <Image source={miloFocusedImage} style={styles.messageMiloImage} resizeMode="contain" />

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
                  ? 'Milo recommends focusing on this item first.'
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
            <Text style={styles.tipText}>After the timer ends, take a short break.</Text>
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
    width: 116,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  resetButtonText: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontWeight: '900',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 13,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 10,
    marginBottom: 10,
  },
  optionButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  optionText: {
    color: theme.colors.muted,
    fontWeight: '900',
    fontSize: 13,
  },
  optionTextActive: {
    color: '#FFFFFF',
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