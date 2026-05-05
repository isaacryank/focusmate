import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { useFocus } from '../lib/FocusContext';
import {
  MiloMood,
  getMiloEncouragement,
  getMiloPlannerStats,
  getMiloRecommendedTasks,
  getMiloState,
} from '../lib/miloPersonality';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import PlannerItemCard from '../components/ui/PlannerItemCard';
import EmptyState from '../components/ui/EmptyState';
import AppButton from '../components/ui/AppButton';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import MiloMoodImage, {
  getMiloImageSource,
} from '../components/milo/MiloMoodImage';

function StatTile({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${color}22` }]}>
        {icon}
      </View>

      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

function ActionCard({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.actionCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.actionIcon}>{icon}</View>

      <View style={styles.actionTextArea}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

function MoodChip({
  mood,
  label,
  selected,
  onPress,
}: {
  mood: MiloMood;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.moodChip, selected && styles.moodChipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MiloMoodImage mood={mood} size={46} />
      <Text
        numberOfLines={1}
        style={[styles.moodChipText, selected && styles.moodChipTextSelected]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function CompanionScreen() {
  const navigation = useNavigation<any>();
  const { tasks, toggleTask } = useTasks();
  const { totalFocusMinutes } = useFocus();

  const miloState = useMemo(() => {
    return getMiloState(tasks, totalFocusMinutes);
  }, [tasks, totalFocusMinutes]);

  const plannerStats = useMemo(() => {
    return getMiloPlannerStats(tasks);
  }, [tasks]);

  const recommendedTasks = useMemo(() => {
    return getMiloRecommendedTasks(tasks, 3);
  }, [tasks]);

  const [manualMood, setManualMood] = useState<MiloMood | null>(null);
  const [customMessage, setCustomMessage] = useState<string | null>(null);

  const activeMood = manualMood || miloState.mood;
  const activeTitle = manualMood ? 'Milo changed mood' : miloState.title;
  const activeMessage = customMessage || miloState.message;

  const handleSpeak = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Speech.stop();

    Speech.speak(`${activeTitle}. ${activeMessage}`, {
      language: 'en-US',
      pitch: 1.08,
      rate: 0.9,
    });
  };

  const handleEncourage = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const encouragement = getMiloEncouragement(activeMood);
    setCustomMessage(encouragement);

    Speech.stop();

    Speech.speak(encouragement, {
      language: 'en-US',
      pitch: 1.12,
      rate: 0.92,
    });
  };

  const handleMoodPress = async (mood: MiloMood) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Selection);
    setManualMood(mood);
    setCustomMessage(getMiloEncouragement(mood));
  };

  const handlePrimaryAction = () => {
    navigation.navigate(miloState.primaryActionTarget);
  };

  return (
    <ScreenContainer topPadding={16} bottomPadding={124}>
      <MiloMessageCard
        mood={activeMood}
        title={activeTitle}
        message={activeMessage}
        tagline={miloState.tagline}
        primaryActionLabel={miloState.primaryActionLabel}
        onPrimaryActionPress={handlePrimaryAction}
        secondaryActionLabel="Hear Milo"
        onSecondaryActionPress={handleSpeak}
      />

      <View style={styles.buttonRow}>
        <View style={styles.buttonHalf}>
          <AppButton
            title="Encourage Me"
            variant="secondary"
            onPress={handleEncourage}
            icon={
              <Ionicons
                name="heart"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />
        </View>

        <View style={styles.buttonHalf}>
          <AppButton
            title="Focus Mode"
            variant="ghost"
            onPress={() => navigation.navigate('FocusSession')}
            icon={
              <MaterialCommunityIcons
                name="target"
                size={18}
                color={theme.colors.text}
              />
            }
          />
        </View>
      </View>

      <SectionHeader
        title="Milo Mood"
        subtitle="Milo reacts to your planner, but you can tap a mood too."
      />

      <View style={styles.moodRow}>
        <MoodChip
          mood="happy"
          label="Happy"
          selected={activeMood === 'happy'}
          onPress={() => handleMoodPress('happy')}
        />
        <MoodChip
          mood="focused"
          label="Focus"
          selected={activeMood === 'focused'}
          onPress={() => handleMoodPress('focused')}
        />
        <MoodChip
          mood="worried"
          label="Worry"
          selected={activeMood === 'worried'}
          onPress={() => handleMoodPress('worried')}
        />
        <MoodChip
          mood="celebrating"
          label="Proud"
          selected={activeMood === 'celebrating'}
          onPress={() => handleMoodPress('celebrating')}
        />
      </View>

      <SectionHeader title="Planner Mood Check" />

      <View style={styles.statsGrid}>
        <StatTile
          label="Pending"
          value={plannerStats.pending.length}
          color={theme.colors.yellow}
          icon={<Ionicons name="time" size={18} color={theme.colors.yellow} />}
        />

        <StatTile
          label="Today"
          value={plannerStats.today.length}
          color={theme.colors.primaryDark}
          icon={
            <Ionicons
              name="today"
              size={18}
              color={theme.colors.primaryDark}
            />
          }
        />

        <StatTile
          label="Overdue"
          value={plannerStats.overdue.length}
          color={theme.colors.danger}
          icon={
            <Ionicons
              name="alert-circle"
              size={18}
              color={theme.colors.danger}
            />
          }
        />

        <StatTile
          label="Focus"
          value={totalFocusMinutes}
          color={theme.colors.blue}
          icon={
            <MaterialCommunityIcons
              name="timer-outline"
              size={18}
              color={theme.colors.blue}
            />
          }
        />
      </View>

      <SectionHeader
        title="Milo Suggests"
        subtitle="These are the items Milo thinks you should handle first."
        actionLabel="View All"
        onActionPress={() => navigation.navigate('Tasks')}
      />

      {recommendedTasks.length > 0 ? (
        <View style={styles.taskList}>
          {recommendedTasks.map((task) => (
            <PlannerItemCard
              key={task.id}
              task={task}
              onPress={() => navigation.navigate('TaskDetails', { taskId: task.id })}
              onToggle={() => toggleTask(task.id)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          imageSource={getMiloImageSource('happy')}
          title="Milo has no urgent suggestions"
          message="Your planner looks calm. Add a new item or start a focus session when you are ready."
          actionLabel="Create planner item"
          onActionPress={() => navigation.navigate('AddTask')}
        />
      )}

      <SectionHeader title="Companion Actions" />

      <ActionCard
        title="Plan Today"
        subtitle="See what Milo thinks you should do today."
        icon={
          <Ionicons
            name="calendar-outline"
            size={22}
            color={theme.colors.primaryDark}
          />
        }
        onPress={() => navigation.navigate('TodayPlan')}
      />

      <ActionCard
        title="Reminder Center"
        subtitle="Check tasks, meetings, dates, and reminder status."
        icon={
          <Ionicons
            name="notifications-outline"
            size={22}
            color={theme.colors.primaryDark}
          />
        }
        onPress={() => navigation.navigate('ReminderCenter')}
      />

      <ActionCard
        title="Progress Analytics"
        subtitle="Review completed tasks and focus progress."
        icon={
          <Ionicons
            name="stats-chart-outline"
            size={22}
            color={theme.colors.primaryDark}
          />
        }
        onPress={() => navigation.navigate('Analytics')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  buttonHalf: {
    flex: 1,
    marginRight: 10,
  },
  moodRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  moodChip: {
    flex: 1,
    minHeight: 86,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  moodChipSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  moodChipText: {
    marginTop: 4,
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },
  moodChipTextSelected: {
    color: theme.colors.primaryDark,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statTile: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    marginTop: 1,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  taskList: {
    marginBottom: 12,
  },
  actionCard: {
    minHeight: 76,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionTextArea: {
    flex: 1,
    paddingRight: 10,
  },
  actionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  actionSubtitle: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
});