import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { Subtask } from '../types/task';
import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useTasks } from '../lib/TaskContext';
import { generateMiloPlan } from '../lib/miloPlanner';
import {
  buildMiloSmartData,
  calculateMiloUrgency,
  generateMiloSmartNudges,
  generateMiloSmartPlan,
} from '../lib/miloSmartPlan';
import { MiloMood, getTodayDate } from '../lib/miloPersonality';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import AppButton from '../components/ui/AppButton';
import EmptyState from '../components/ui/EmptyState';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type Props = NativeStackScreenProps<RootStackParamList, 'MiloPlan'>;

function getPlanMood(taskStatus: string, dueDate?: string, priority?: string): MiloMood {
  const todayDate = getTodayDate();

  if (taskStatus === 'completed') return 'celebrating';
  if (dueDate && dueDate < todayDate) return 'worried';
  if (priority === 'high') return 'focused';

  return 'waving';
}

function PlanStep({
  index,
  text,
}: {
  index: number;
  text: string;
}) {
  return (
    <View style={styles.planStep}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{index + 1}</Text>
      </View>

      <Text style={styles.planStepText}>{text}</Text>
    </View>
  );
}

function ExistingChecklistItem({
  item,
  onToggle,
}: {
  item: Subtask;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.existingItem}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={item.completed ? 'Mark step as pending' : 'Mark step as done'}
    >
      <View
        style={[
          styles.checkCircle,
          item.completed && {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
          },
        ]}
      >
        {item.completed ? (
          <Ionicons name="checkmark" size={15} color="#FFFFFF" />
        ) : null}
      </View>

      <Text
        style={[
          styles.existingText,
          item.completed && styles.existingTextDone,
        ]}
      >
        {item.title}
      </Text>
    </TouchableOpacity>
  );
}

export default function MiloPlanScreen({ navigation, route }: Props) {
  useFocusMateTheme();

  const { tasks, updateTask } = useTasks();

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const task = tasks.find((item) => item.id === route.params.taskId);

  const planSteps = useMemo(() => {
    if (!task) return [];
    return generateMiloPlan(task);
  }, [task]);

  const smartData = useMemo(() => {
    if (!task) return null;
    return buildMiloSmartData(task);
  }, [task]);

  if (!task) {
    return (
      <ScreenContainer>
        <EmptyState
          imageSource={getMiloImageSource('worried')}
          title="Planner item not found"
          message="Milo could not find this item. It may have been deleted."
          actionLabel="Go back"
          onActionPress={() => navigation.goBack()}
        />
      </ScreenContainer>
    );
  }

  const existingSubtasks = task.subtasks || [];
  const completedSubtasks = existingSubtasks.filter((item) => item.completed).length;
  const mood = getPlanMood(task.status, task.dueDate, task.priority);

  const handleAddPlanToChecklist = async () => {
    const currentTitles = existingSubtasks.map((item) =>
      item.title.trim().toLowerCase()
    );

    const newSteps = planSteps.filter(
      (step) => !currentTitles.includes(step.trim().toLowerCase())
    );

    if (newSteps.length === 0) {
      setNotice({
        type: 'info',
        title: 'Checklist already updated',
        message: 'Milo has already added these suggested steps to your checklist.',
      });
      return;
    }

    const generatedSubtasks: Subtask[] = newSteps.map((step, index) => ({
      id: `${Date.now()}-${index}`,
      title: step,
      completed: false,
      createdAt: new Date().toISOString(),
    }));

    await updateTask(task.id, {
      subtasks: [...existingSubtasks, ...generatedSubtasks],
      miloSmartPlan: generateMiloSmartPlan(task),
      miloSmartNudges: generateMiloSmartNudges(task),
      miloUrgency: calculateMiloUrgency(task),
    });

    setNotice({
      type: 'success',
      title: 'Milo added the checklist!',
      message: `${generatedSubtasks.length} step(s) were added to this planner item.`,
    });
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    const nextSubtasks = existingSubtasks.map((item) =>
      item.id === subtaskId
        ? {
            ...item,
            completed: !item.completed,
          }
        : item
    );

    await updateTask(task.id, {
      subtasks: nextSubtasks,
    });
  };

  return (
    <ScreenContainer topPadding={12} bottomPadding={124}>
      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <MiloMessageCard
        compact
        mood={mood}
        title="Milo Smart Plan"
        message="Milo found a few tiny steps to make this easier."
        tagline="This plan can be adjusted."
        primaryActionLabel="Add Checklist"
        onPrimaryActionPress={handleAddPlanToChecklist}
        secondaryActionLabel="Back"
        onSecondaryActionPress={() => navigation.goBack()}
      />

      <View style={styles.aiNoteCard}>
        <View style={styles.aiIcon}>
          <Ionicons name="sparkles" size={20} color={theme.colors.primaryDark} />
        </View>

        <View style={styles.aiTextArea}>
          <Text style={styles.aiTitle}>Milo's gentle plan</Text>
          <Text style={styles.aiText}>
            Milo noticed this may need preparation before the deadline.
          </Text>
        </View>
      </View>

      {smartData ? (
        <View style={styles.chipCard}>
          {smartData.chips.map((chip) => (
            <View key={chip} style={styles.smartChip}>
              <Text style={styles.smartChipText}>{chip}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <SectionHeader
        title="Suggested Milo Smart Plan"
        subtitle="Situation-aware steps for this planner item."
      />

      <View style={styles.planCard}>
        {planSteps.map((step, index) => (
          <PlanStep key={`${step}-${index}`} index={index} text={step} />
        ))}
      </View>

      <View style={styles.buttonArea}>
        <AppButton
          title="Add to Smart Plan"
          onPress={handleAddPlanToChecklist}
          icon={
            <MaterialCommunityIcons
              name="playlist-plus"
              size={20}
              color="#FFFFFF"
            />
          }
        />
      </View>

      {smartData ? (
        <>
          <SectionHeader
            title="Smart Nudges"
            subtitle="These are planning suggestions, separate from the final reminder."
          />

          <View style={styles.nudgeCard}>
            {smartData.nudges.map((nudge) => (
              <View key={nudge.id} style={styles.nudgeItem}>
                <Text style={styles.nudgeTitle}>{nudge.label}</Text>
                <Text style={styles.nudgeText}>
                  {nudge.timing} - {nudge.message}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader
        title="Current Milo Smart Plan"
        subtitle={
          existingSubtasks.length > 0
            ? `${completedSubtasks}/${existingSubtasks.length} completed`
            : 'No checklist yet'
        }
      />

      {existingSubtasks.length > 0 ? (
        <View style={styles.existingCard}>
          {existingSubtasks.map((item) => (
            <ExistingChecklistItem
              key={item.id}
              item={item}
              onToggle={() => handleToggleSubtask(item.id)}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          imageSource={getMiloImageSource('focused')}
          title="No checklist yet"
          message="Add these steps when ready."
          actionLabel="Add checklist"
          onActionPress={handleAddPlanToChecklist}
        />
      )}

      <View style={styles.footerButtons}>
        <View style={styles.footerButton}>
          <AppButton
            title="View Details"
            variant="secondary"
            onPress={() =>
              navigation.navigate('TaskDetails', {
                taskId: task.id,
              })
            }
            icon={
              <Ionicons
                name="document-text-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />
        </View>

        <View style={styles.footerButton}>
          <AppButton
            title="Focus"
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  aiNoteCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 18,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  aiIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  aiTextArea: {
    flex: 1,
  },
  aiTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  aiText: {
    marginTop: 4,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  chipCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  smartChip: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  smartChipText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  planStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  stepNumber: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  planStepText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  buttonArea: {
    marginBottom: 20,
  },
  nudgeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  nudgeItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  nudgeTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  nudgeText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  existingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  existingItem: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  checkCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#CCD4DD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  existingText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  existingTextDone: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  footerButtons: {
    flexDirection: 'row',
    marginTop: 4,
  },
  footerButton: {
    flex: 1,
    marginRight: 10,
  },
});
