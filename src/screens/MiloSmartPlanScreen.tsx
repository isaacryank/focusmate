import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useTasks } from '../lib/TaskContext';
import { loadMiloAiSettings, type MiloAiSettings } from '../lib/miloAiSettings';
import { generateMiloTaskSmartPlan } from '../lib/miloTaskPlanClient';
import {
  createLocalTaskPlan,
  loadMiloTaskPlan,
  saveMiloTaskPlan,
  type MiloTaskPlan,
  type MiloTaskPlanStep,
  type MiloTaskPlanTimelineItem,
} from '../lib/miloTaskPlanStorage';
import {
  getOnlineMeetingLinkForTask,
  type OnlineMeetingLink,
} from '../lib/meetingLinkStorage';

import ScreenContainer from '../components/ui/ScreenContainer';
import EmptyState from '../components/ui/EmptyState';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMoodImage, { getMiloImageSource } from '../components/milo/MiloMoodImage';

type Props = NativeStackScreenProps<RootStackParamList, 'MiloSmartPlan'>;

type DetailTab = 'plan' | 'nudges' | 'timeline';

type DisplayPlanItem = {
  id: string;
  title: string;
  detail?: string | null;
  completed: boolean;
  status: MiloTaskPlanStep['status'];
};

function getPlanStatusLabel(status: MiloTaskPlanStep['status']) {
  if (status === 'done') return 'Done';
  if (status === 'in_progress') return 'In progress';
  return 'To do';
}

function trimShortCue(value: string) {
  const firstSentence = value.split(/[.!?]/)[0]?.trim() || value.trim();
  return firstSentence.length > 54
    ? `${firstSentence.slice(0, 53)}...`
    : firstSentence;
}

function getNudgeCue(nudge: { timingLabel?: string | null; message: string }) {
  return trimShortCue(nudge.timingLabel || nudge.message);
}

function getCompletedNudgeCue(index: number) {
  const cues = ['All set', 'Ready', 'Good to go'];
  return cues[index % cues.length];
}

function getCompletedNudgeMessage() {
  return 'All plan steps are done. Milo thinks you are prepared.';
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findDirectMatchingPlanItem({
  id,
  planItems,
  title,
}: {
  id?: string;
  planItems: DisplayPlanItem[];
  title: string;
}) {
  if (id) {
    const idMatch = planItems.find((item) => item.id === id);
    if (idMatch) return idMatch;
  }

  const normalizedTitle = normalizeMatchText(title);

  if (!normalizedTitle) {
    return undefined;
  }

  return planItems.find((item) => {
    const normalizedItemTitle = normalizeMatchText(item.title);
    return (
      normalizedItemTitle === normalizedTitle ||
      normalizedItemTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(normalizedItemTitle)
    );
  });
}

function findMatchingPlanItem({
  id,
  index,
  planItems,
  title,
}: {
  id?: string;
  index: number;
  planItems: DisplayPlanItem[];
  title: string;
}) {
  return (
    findDirectMatchingPlanItem({ id, planItems, title }) || planItems[index]
  );
}

function normalizeTimelineStatusLabel(value?: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'done') return 'Done';
  if (normalized === 'next') return 'Next';
  if (normalized === 'final') return 'Final';
  return 'Upcoming';
}

function deriveTimelineFromPlanSteps(
  planItems: DisplayPlanItem[]
): MiloTaskPlanTimelineItem[] {
  return planItems.slice(0, 6).map((item, index) => ({
    id: item.id,
    label: item.title,
    detail:
      item.detail ||
      (index === 0 ? 'Start with this step' : 'Keep the flow gentle'),
    statusLabel: index === 0 ? 'Next' : 'Upcoming',
  }));
}

function isGeneratedTimelineUseful(
  timeline: MiloTaskPlanTimelineItem[],
  planItems: DisplayPlanItem[]
) {
  if (timeline.length === 0 || planItems.length === 0) {
    return false;
  }

  return timeline.some((item) =>
    Boolean(
      findDirectMatchingPlanItem({
        id: item.id,
        planItems,
        title: item.label,
      })
    )
  );
}

function normalizePlanStepStatuses(
  steps: MiloTaskPlanStep[]
): MiloTaskPlanStep[] {
  let hasActiveStep = false;

  return steps.map((step) => {
    if (step.status === 'done') {
      return step;
    }

    if (!hasActiveStep) {
      hasActiveStep = true;
      return {
        ...step,
        status: 'in_progress',
      };
    }

    return {
      ...step,
      status: 'todo',
    };
  });
}

function TabButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TimelineStatusChip({ label }: { label: string }) {
  const normalized = label.toLowerCase();
  const isDone = normalized === 'done';
  const isNext = normalized === 'next';
  const isFinal = normalized === 'final';

  return (
    <View
      style={[
        styles.timelineChip,
        isDone && styles.timelineChipDone,
        isNext && styles.timelineChipNext,
        isFinal && styles.timelineChipFinal,
      ]}
    >
      <Text
        style={[
          styles.timelineChipText,
          isDone && styles.timelineChipTextDone,
          isNext && styles.timelineChipTextNext,
          isFinal && styles.timelineChipTextFinal,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function ChecklistItem({
  item,
  onToggle,
}: {
  item: DisplayPlanItem;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.checklistItem}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={item.completed ? 'Mark step as pending' : 'Mark step as done'}
    >
      <View style={[styles.checkCircle, item.completed && styles.checkCircleDone]}>
        {item.completed ? (
          <Ionicons name="checkmark" size={15} color="#FFFFFF" />
        ) : null}
      </View>

      <View style={styles.checklistCopy}>
        <Text
          numberOfLines={2}
          style={[
            styles.checklistText,
            item.completed && styles.checklistTextDone,
          ]}
        >
          {item.title}
        </Text>
        {item.detail ? (
          <Text numberOfLines={2} style={styles.checklistDetail}>
            {item.detail}
          </Text>
        ) : null}
      </View>

      <Text style={styles.stepStatusText}>{getPlanStatusLabel(item.status)}</Text>
    </TouchableOpacity>
  );
}

export default function MiloSmartPlanScreen({ navigation, route }: Props) {
  useFocusMateTheme();

  const { tasks } = useTasks();
  const [activeTab, setActiveTab] = useState<DetailTab>('plan');
  const [showAllPlanSteps, setShowAllPlanSteps] = useState(false);
  const [generatedTaskPlan, setGeneratedTaskPlan] =
    useState<MiloTaskPlan | null>(null);
  const [miloAiSettings, setMiloAiSettings] =
    useState<MiloAiSettings | null>(null);
  const [onlineMeetingLink, setOnlineMeetingLink] =
    useState<OnlineMeetingLink | null>(null);
  const [isGeneratingTaskPlan, setIsGeneratingTaskPlan] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const task = tasks.find((item) => item.id === route.params.taskId);

  const loadSavedTaskPlan = useCallback(() => {
    let isMounted = true;

    setShowAllPlanSteps(false);

    if (!task?.id) {
      setGeneratedTaskPlan(null);
      return () => {
        isMounted = false;
      };
    }

    loadMiloTaskPlan(task.id)
      .then((savedPlan) => {
        if (isMounted) {
          setGeneratedTaskPlan(savedPlan);
        }
      })
      .catch((error) => {
        console.warn('Failed to load Milo task plan:', error);

        if (isMounted) {
          setGeneratedTaskPlan(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [task?.id]);

  useEffect(loadSavedTaskPlan, [loadSavedTaskPlan]);
  useFocusEffect(loadSavedTaskPlan);

  useEffect(() => {
    let isMounted = true;

    loadMiloAiSettings()
      .then((settings) => {
        if (isMounted) {
          setMiloAiSettings(settings);
        }
      })
      .catch((error) => {
        console.warn('Failed to load Milo AI settings:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!task?.id) {
      setOnlineMeetingLink(null);
      return () => {
        isMounted = false;
      };
    }

    getOnlineMeetingLinkForTask(task.id)
      .then((meetingLink) => {
        if (isMounted) {
          setOnlineMeetingLink(meetingLink);
        }
      })
      .catch((error) => {
        console.warn('Failed to load online meeting link:', error);

        if (isMounted) {
          setOnlineMeetingLink(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [task?.id]);

  const hasOnlineMeetingLink = Boolean(onlineMeetingLink);
  const localPreviewPlan = useMemo(() => {
    if (!task) return null;
    return createLocalTaskPlan(task, { hasMeetingLink: hasOnlineMeetingLink });
  }, [hasOnlineMeetingLink, task]);
  const displayTaskPlan =
    generatedTaskPlan?.taskId === task?.id ? generatedTaskPlan : null;
  const canUseAi = miloAiSettings?.aiMode === 'online';

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

  const planItems: DisplayPlanItem[] =
    displayTaskPlan?.plan.steps.map((item) => ({
      id: item.id,
      title: item.label,
      detail: item.detail,
      completed: item.status === 'done',
      status: item.status,
    })) || [];
  const completedPlanItems = planItems.filter((item) => item.completed).length;
  const progress =
    planItems.length > 0 ? Math.round((completedPlanItems / planItems.length) * 100) : 0;
  const isPlanFullyCompleted =
    planItems.length > 0 && completedPlanItems === planItems.length;
  const smartNudges = displayTaskPlan?.nudges || [];
  const miloInsight = displayTaskPlan?.insight;
  const insightMessage = isPlanFullyCompleted
    ? "All steps are done. You're good to go."
    : miloInsight?.message || 'Small steps, big results.';
  const insightChips = isPlanFullyCompleted
    ? ['All set', 'Ready', 'Good to go']
    : miloInsight?.chips || ['Break task down', 'Prep early', 'Check-in tomorrow'];
  const planSourceLabel =
    displayTaskPlan?.source === 'ai' ? 'AI generated' : 'Local plan';
  const generatedTimelineItems = displayTaskPlan?.timeline || [];
  const shouldUseGeneratedTimeline = isGeneratedTimelineUseful(
    generatedTimelineItems,
    planItems
  );
  const sourceTimelineItems =
    shouldUseGeneratedTimeline || planItems.length === 0
      ? generatedTimelineItems
      : deriveTimelineFromPlanSteps(planItems);
  const baseTimelineItems = sourceTimelineItems.map((item) => ({
    id: item.id,
    title: item.label,
    detail: item.detail || 'When ready',
    statusLabel: item.statusLabel || 'Upcoming',
  }));
  const nextTimelineItemIndex = baseTimelineItems.findIndex((item, index) => {
    const matchingPlanItem = findMatchingPlanItem({
      id: item.id,
      index,
      planItems,
      title: item.title,
    });
    return !matchingPlanItem?.completed;
  });
  const timelineItems = baseTimelineItems.map((item, index) => {
    const matchingPlanItem = findMatchingPlanItem({
      id: item.id,
      index,
      planItems,
      title: item.title,
    });
    const normalizedStatus = normalizeTimelineStatusLabel(item.statusLabel);

    return {
      ...item,
      statusLabel: isPlanFullyCompleted
        ? 'Done'
        : matchingPlanItem?.completed
        ? 'Done'
        : index === nextTimelineItemIndex
        ? 'Next'
        : normalizedStatus === 'Final'
        ? 'Final'
        : 'Upcoming',
    };
  });
  const displayPlanItems = showAllPlanSteps ? planItems : planItems.slice(0, 3);
  const hiddenPlanCount = Math.max(planItems.length - 3, 0);

  const handleSavePlan = async (plan: MiloTaskPlan) => {
    const savedPlan = await saveMiloTaskPlan(task.id, plan);
    setGeneratedTaskPlan(savedPlan);
    setShowAllPlanSteps(false);
    return savedPlan;
  };

  const handleUseLocalPlan = async () => {
    if (!localPreviewPlan) return;

    const savedPlan = await handleSavePlan(localPreviewPlan);
    setNotice({
      type: 'success',
      title: 'Local plan ready',
      message: `${savedPlan.plan.steps.length} small prep steps are ready.`,
    });
  };

  const handleGenerateAiPlan = async () => {
    if (!miloAiSettings || miloAiSettings.aiMode !== 'online') {
      setNotice({
        type: 'info',
        title: 'AI is local-only right now',
        message: 'Use the local plan, or turn AI Online on in Milo settings.',
      });
      return;
    }

    if (isGeneratingTaskPlan) return;

    setIsGeneratingTaskPlan(true);

    try {
      const nextPlan = await generateMiloTaskSmartPlan({
        task,
        aiSettings: miloAiSettings,
        relatedTasks: tasks.filter((item) => item.id !== task.id),
        hasMeetingLink: hasOnlineMeetingLink,
      });
      const savedPlan = await handleSavePlan(nextPlan);

      setNotice({
        type: savedPlan.source === 'ai' ? 'success' : 'info',
        title:
          savedPlan.source === 'ai'
            ? 'AI plan ready'
            : 'Milo used a local plan',
        message:
          savedPlan.source === 'ai'
            ? 'Milo generated prep steps, nudges, and a timeline.'
            : 'AI was not available, so Milo used the safe local plan.',
      });
    } catch (error) {
      console.warn('Failed to generate Milo smart plan:', error);
      setNotice({
        type: 'error',
        title: 'Milo could not refresh',
        message: 'Try the local plan for now.',
      });
    } finally {
      setIsGeneratingTaskPlan(false);
    }
  };

  const handleTogglePlanItem = async (item: DisplayPlanItem) => {
    if (!displayTaskPlan) return;

    const nextSteps = normalizePlanStepStatuses(
      displayTaskPlan.plan.steps.map((step) =>
        step.id === item.id
          ? {
              ...step,
              status: step.status === 'done' ? 'todo' : 'done',
            }
          : step
      )
    );
    const savedPlan = await saveMiloTaskPlan(task.id, {
      ...displayTaskPlan,
      generatedAt: new Date().toISOString(),
      plan: {
        ...displayTaskPlan.plan,
        steps: nextSteps,
      },
    });

    setGeneratedTaskPlan(savedPlan);
  };

  const handleAddChecklistItem = async () => {
    if (!displayTaskPlan) return;

    const savedPlan = await saveMiloTaskPlan(task.id, {
      ...displayTaskPlan,
      generatedAt: new Date().toISOString(),
      plan: {
        ...displayTaskPlan.plan,
        steps: normalizePlanStepStatuses([
          ...displayTaskPlan.plan.steps,
          {
            id: `${task.id}-manual-step-${Date.now()}`,
            label: `New small step ${displayTaskPlan.plan.steps.length + 1}`,
            detail: 'Add your own tiny next move.',
            status: 'todo',
          },
        ]),
      },
    });

    setGeneratedTaskPlan(savedPlan);
    setShowAllPlanSteps(true);
  };

  return (
    <ScreenContainer topPadding={12} bottomPadding={96}>
      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <View style={styles.heroCard}>
        <View style={styles.heroMiloBubble}>
          <MiloMoodImage mood="happy" size={72} style={styles.heroMiloImage} />
        </View>
        <View style={styles.heroTextArea}>
          <Text style={styles.heroEyebrow}>Plan Prep Workspace</Text>
          <Text style={styles.heroTitle}>{task.title}</Text>
          <Text style={styles.heroText}>
            Plan what to do, when Milo should nudge, and the prep flow.
          </Text>
        </View>
      </View>

      {!displayTaskPlan ? (
        <View style={styles.emptyPlanCard}>
          <Text style={styles.cardTitle}>Milo Smart Plan</Text>
          <Text style={styles.emptyPlanText}>
            No saved smart plan yet. Use a local plan for free, or generate with
            AI only when you need extra help.
          </Text>

          {localPreviewPlan ? (
            <View style={styles.localPreviewList}>
              {localPreviewPlan.plan.steps.slice(0, 3).map((step, index) => (
                <View key={step.id} style={styles.localPreviewRow}>
                  <View style={styles.localPreviewNumber}>
                    <Text style={styles.localPreviewNumberText}>{index + 1}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.localPreviewText}>
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.planActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.planActionButton, styles.planActionSecondary]}
              onPress={handleUseLocalPlan}
            >
              <Ionicons name="list-outline" size={16} color={theme.colors.primaryDark} />
              <Text style={styles.planActionText}>Use Local Plan</Text>
            </TouchableOpacity>

            {canUseAi ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.planActionButton,
                  styles.planActionPrimary,
                  isGeneratingTaskPlan && styles.planActionButtonDisabled,
                ]}
                onPress={handleGenerateAiPlan}
                disabled={isGeneratingTaskPlan}
              >
                <Ionicons
                  name={isGeneratingTaskPlan ? 'hourglass-outline' : 'sparkles-outline'}
                  size={16}
                  color={theme.colors.primaryDark}
                />
                <Text style={styles.planActionText}>
                  {isGeneratingTaskPlan ? 'Generating...' : 'Generate with AI'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.tabControl}>
            <TabButton label="Plan" active={activeTab === 'plan'} onPress={() => setActiveTab('plan')} />
            <TabButton label="Nudges" active={activeTab === 'nudges'} onPress={() => setActiveTab('nudges')} />
            <TabButton label="Timeline" active={activeTab === 'timeline'} onPress={() => setActiveTab('timeline')} />
          </View>

          {activeTab === 'plan' ? (
            <View style={styles.planCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle}>Milo Smart Plan</Text>
                  <Text style={styles.planSourceText}>{planSourceLabel}</Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{planItems.length} steps</Text>
                </View>
              </View>

              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Progress</Text>
                  <Text style={styles.progressPercent}>{progress}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>

              <View style={styles.checklistList}>
                {displayPlanItems.map((item) => (
                  <View key={item.id} style={styles.planStepWrap}>
                    <ChecklistItem
                      item={item}
                      onToggle={() => handleTogglePlanItem(item)}
                    />
                  </View>
                ))}
              </View>

              {hiddenPlanCount > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.82}
                  style={styles.viewAllStepsButton}
                  onPress={() => setShowAllPlanSteps((current) => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={showAllPlanSteps ? 'Show fewer plan steps' : `View all ${planItems.length} steps`}
                >
                  <Text style={styles.viewAllStepsText}>
                    {showAllPlanSteps ? 'Show fewer steps' : `View all ${planItems.length} steps`}
                  </Text>
                  <Ionicons
                    name={showAllPlanSteps ? 'chevron-up' : 'chevron-forward'}
                    size={14}
                    color={theme.colors.primaryDark}
                  />
                </TouchableOpacity>
              ) : null}

              <View style={styles.planActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.planActionButton, styles.planActionSecondary]}
                  onPress={handleAddChecklistItem}
                  disabled={isGeneratingTaskPlan}
                >
                  <Ionicons name="add" size={16} color={theme.colors.primaryDark} />
                  <Text style={styles.planActionText}>Add step</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.planActionButton, styles.planActionSecondary]}
                  onPress={handleUseLocalPlan}
                  disabled={isGeneratingTaskPlan}
                >
                  <MaterialCommunityIcons
                    name="playlist-check"
                    size={16}
                    color={theme.colors.primaryDark}
                  />
                  <Text style={styles.planActionText}>Use Local</Text>
                </TouchableOpacity>

                {canUseAi ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.planActionButton,
                      styles.planActionPrimary,
                      isGeneratingTaskPlan && styles.planActionButtonDisabled,
                    ]}
                    onPress={handleGenerateAiPlan}
                    disabled={isGeneratingTaskPlan}
                  >
                    <Ionicons
                      name={isGeneratingTaskPlan ? 'hourglass-outline' : 'sparkles-outline'}
                      size={16}
                      color={theme.colors.primaryDark}
                    />
                    <Text style={styles.planActionText}>
                      {isGeneratingTaskPlan ? 'Generating...' : 'Regenerate AI'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {activeTab === 'nudges' ? (
            <View style={styles.nudgeCard}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle}>Milo Smart Nudges</Text>
                  <Text style={styles.nudgeHelperText}>
                    Warm Milo reminders for helpful moments.
                  </Text>
                </View>
              </View>
              <View style={styles.nudgeRow}>
                {smartNudges.slice(0, 3).map((nudge, index) => (
                  <View key={nudge.id} style={styles.nudgeChip}>
                    <View style={styles.nudgeIconWrap}>
                      <Ionicons
                        name={index === 0 ? 'sunny-outline' : index === 1 ? 'time-outline' : 'alarm-outline'}
                        size={15}
                        color={theme.colors.primaryDark}
                      />
                    </View>
                    <Text style={styles.nudgeLabel}>{nudge.title}</Text>
                    <Text numberOfLines={1} style={styles.nudgeTiming}>
                      {isPlanFullyCompleted
                        ? getCompletedNudgeCue(index)
                        : getNudgeCue(nudge)}
                    </Text>
                    <Text numberOfLines={2} style={styles.nudgeMessage}>
                      {isPlanFullyCompleted
                        ? getCompletedNudgeMessage()
                        : trimShortCue(nudge.message)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {activeTab === 'timeline' ? (
            <View style={styles.timelineCard}>
              <Text style={styles.cardTitle}>Timeline</Text>
              <View style={styles.timelineList}>
                {timelineItems.map((item, index) => (
                  <View key={item.id} style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View
                        style={[
                          styles.timelineNode,
                          item.statusLabel === 'Done' && styles.timelineNodeDone,
                          item.statusLabel === 'Next' && styles.timelineNodeActive,
                        ]}
                      >
                        {item.statusLabel === 'Done' ? (
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        ) : (
                          <Text
                            style={[
                              styles.timelineNodeText,
                              item.statusLabel === 'Next' && styles.timelineNodeTextActive,
                            ]}
                          >
                            {index + 1}
                          </Text>
                        )}
                      </View>
                      {index < timelineItems.length - 1 ? (
                        <View style={styles.timelineVerticalLine} />
                      ) : null}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text numberOfLines={1} style={styles.timelineTitle}>{item.title}</Text>
                      <View style={styles.timelineMetaRow}>
                        <Text numberOfLines={1} style={styles.timelineDetail}>
                          {item.detail}
                        </Text>
                        <TimelineStatusChip label={item.statusLabel} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.insightCard}>
            <Text style={styles.insightTitle}>{miloInsight?.title || 'Milo Insight'}</Text>
            <Text numberOfLines={2} style={styles.insightText}>
              {insightMessage}
            </Text>
            <View style={styles.insightChips}>
              {insightChips.slice(0, 3).map((chip) => (
                <View key={chip} style={styles.insightChip}>
                  <Text style={styles.insightChipText}>{chip}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF8EE',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CDEFD7',
    ...theme.shadowSoft,
  },
  heroMiloBubble: {
    width: 72,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F6FFF8',
    overflow: 'hidden',
  },
  heroMiloImage: {
    marginTop: 7,
  },
  heroTextArea: {
    flex: 1,
    marginLeft: 11,
  },
  heroEyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  heroText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 4,
  },
  emptyPlanCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E1E8DF',
    ...theme.shadowSoft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  cardTitleBlock: {
    flex: 1,
    paddingRight: 10,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyPlanText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 6,
  },
  localPreviewList: {
    marginTop: 12,
    backgroundColor: '#FBFDF9',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E7EFE4',
  },
  localPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 35,
  },
  localPreviewNumber: {
    width: 22,
    height: 22,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  localPreviewNumberText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  localPreviewText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  tabControl: {
    flexDirection: 'row',
    backgroundColor: '#F7FAF5',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2ECDD',
    marginBottom: 11,
  },
  tabButton: {
    flex: 1,
    minHeight: 32,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primary,
    ...theme.shadowSoft,
  },
  tabText: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 14,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#E1E8DF',
    ...theme.shadowSoft,
  },
  planSourceText: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 3,
  },
  countBadge: {
    backgroundColor: '#EEF8EE',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#D7EFD8',
  },
  countBadgeText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  progressCard: {
    backgroundColor: '#F5FBF4',
    borderRadius: 17,
    padding: 11,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DDEFD9',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  progressPercent: {
    color: theme.colors.primaryDark,
    fontSize: 15,
    fontWeight: '900',
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: '#E8F3E5',
    overflow: 'hidden',
  },
  progressFill: {
    height: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  checklistList: {
    backgroundColor: '#FBFDF9',
    borderRadius: 18,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E7EFE4',
  },
  planStepWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#EAF0E7',
  },
  checklistItem: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#C9D8C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkCircleDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checklistCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  checklistText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  checklistTextDone: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  checklistDetail: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
    marginTop: 3,
  },
  stepStatusText: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'right',
    maxWidth: 68,
  },
  planActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 11,
    marginRight: -8,
    marginBottom: -8,
  },
  planActionButton: {
    flexGrow: 1,
    minHeight: 38,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  planActionSecondary: {
    backgroundColor: '#FAFCF8',
    borderWidth: 1,
    borderColor: '#DDE9D9',
  },
  planActionPrimary: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: '#CFEFDA',
  },
  planActionButtonDisabled: {
    opacity: 0.72,
  },
  planActionText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 5,
  },
  viewAllStepsButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 9,
    paddingHorizontal: 3,
  },
  viewAllStepsText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  nudgeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 14,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#E1E8DF',
    ...theme.shadowSoft,
  },
  nudgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -8,
    marginBottom: -8,
  },
  nudgeChip: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#F5FBF4',
    borderRadius: 18,
    padding: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DDEFD9',
  },
  nudgeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  nudgeLabel: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  nudgeHelperText: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  nudgeTiming: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
    marginTop: 5,
  },
  nudgeMessage: {
    color: theme.colors.textSoft,
    fontSize: 9.5,
    fontWeight: '800',
    lineHeight: 13,
    marginTop: 4,
  },
  timelineCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 14,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: '#E1E8DF',
    ...theme.shadowSoft,
  },
  timelineList: {
    marginTop: 10,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 52,
  },
  timelineRail: {
    width: 32,
    alignItems: 'center',
  },
  timelineNode: {
    width: 24,
    height: 24,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CFEFDA',
  },
  timelineNodeActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  timelineNodeDone: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  timelineNodeText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  timelineNodeTextActive: {
    color: '#FFFFFF',
  },
  timelineVerticalLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#E1EEDD',
  },
  timelineContent: {
    flex: 1,
    backgroundColor: '#FBFDF9',
    borderWidth: 1,
    borderColor: '#EAF0E7',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginLeft: 8,
    marginBottom: 9,
  },
  timelineTitle: {
    color: theme.colors.text,
    fontSize: 12.5,
    fontWeight: '900',
  },
  timelineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  timelineDetail: {
    color: theme.colors.textSoft,
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    marginRight: 8,
  },
  timelineChip: {
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timelineChipDone: {
    backgroundColor: theme.colors.successSoft,
    borderColor: '#C7F3D4',
  },
  timelineChipNext: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: '#CFEFDA',
  },
  timelineChipFinal: {
    backgroundColor: '#FFF7E8',
    borderColor: '#FDE3B0',
  },
  timelineChipText: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
  },
  timelineChipTextDone: {
    color: theme.colors.success,
  },
  timelineChipTextNext: {
    color: theme.colors.primaryDark,
  },
  timelineChipTextFinal: {
    color: '#A16207',
  },
  insightCard: {
    backgroundColor: '#F5FBF4',
    borderRadius: 22,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DDEFD9',
  },
  insightTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  insightText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 4,
  },
  insightChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  insightChip: {
    borderRadius: 15,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginRight: 7,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2ECDD',
  },
  insightChipText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
});
