import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { secondaryHeader } from '../constants/header';
import { useTasks } from '../lib/TaskContext';
import { openLocationInMaps } from '../lib/mapUtils';
import {
  deleteOnlineMeetingLinkForTask,
  getOnlineMeetingLinkForTask,
  saveOnlineMeetingLink,
} from '../lib/meetingLinkStorage';
import type { OnlineMeetingLink } from '../lib/meetingLinkStorage';
import {
  buildMeetingDisplayLabel,
  detectMeetingProvider,
  isLikelyMeetingUrl,
  normalizeMeetingUrl,
  openMeetingLink,
} from '../lib/meetingLinkUtils';
import { calculateMiloUrgency } from '../lib/miloSmartPlan';
import { loadMiloAiSettings } from '../lib/miloAiSettings';
import { generateMiloTaskSmartPlan } from '../lib/miloTaskPlanClient';
import {
  createLocalTaskPlan,
  loadMiloTaskPlan,
  saveMiloTaskPlan,
  type MiloTaskPlan,
  type MiloTaskPlanStep,
  type MiloTaskPlanTimelineItem,
} from '../lib/miloTaskPlanStorage';

import ScreenContainer from '../components/ui/ScreenContainer';
import EmptyState from '../components/ui/EmptyState';
import FocusMateConfirmModal from '../components/ui/FocusMateConfirmModal';
import NoticeCard from '../components/ui/NoticeCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskDetails'>;

type DisplayPlanItem = {
  id: string;
  title: string;
  detail?: string | null;
  completed: boolean;
  status: MiloTaskPlanStep['status'];
  source: 'smart';
};

type DetailTab = 'plan' | 'nudges' | 'timeline';

function formatReminder(reminder?: string, manualReminderMinutes?: number) {
  if (!reminder || reminder === 'none') return 'None';
  if (reminder === 'atTime') return 'At time';
  if (reminder === '10min') return '10 min before';
  if (reminder === '30min') return '30 min before';
  if (reminder === '1hour') return '1 hour before';
  if (reminder === '1day') return '1 day before';
  if (reminder === 'custom' && manualReminderMinutes) {
    return `${manualReminderMinutes} min before`;
  }
  if (reminder === 'custom') return 'Custom';
  return reminder;
}

function formatDue(dueDate?: string, dueTime?: string) {
  if (!dueDate && !dueTime) return 'Not set';

  if (!dueDate) return dueTime || 'Not set';

  const date = new Date(`${dueDate}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? dueDate
    : date.toLocaleDateString('en-MY', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

  return dueTime ? [dateLabel, dueTime] : [dateLabel];
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toneColor(value: string) {
  const normalized = value.toLowerCase();

  if (normalized === 'high') return theme.colors.danger;
  if (normalized === 'medium') return '#F59E0B';
  return theme.colors.primaryDark;
}

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
  return 'All plan steps are done. You are prepared.';
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

    if (idMatch) {
      return idMatch;
    }
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

function Header({
  onBack,
  onMenu,
}: {
  onBack: () => void;
  onMenu: () => void;
}) {
  return (
    <View style={styles.headerWrap}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.headerButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons
            name="chevron-back"
            size={secondaryHeader.iconSize}
            color={theme.colors.text}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            FocusMate
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.headerButton}
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={secondaryHeader.iconSize}
            color={theme.colors.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatusSection({
  icon,
  label,
  value,
  color,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | string[];
  color?: string;
  last?: boolean;
}) {
  const lines = Array.isArray(value) ? value : [value];
  const statusIconTint =
    label === 'Priority'
      ? styles.statusIconBoxWarning
      : label === 'Urgency'
      ? styles.statusIconBoxDanger
      : null;

  return (
    <View style={[styles.statusSection, !last && styles.statusDivider]}>
      <View style={styles.statusTextBlock}>
        <View style={[styles.statusIconBox, statusIconTint]}>
          <Ionicons
            name={icon}
            size={19}
            color={color || theme.colors.primaryDark}
          />
        </View>
        <View style={styles.statusCopy}>
          <Text numberOfLines={1} style={styles.statusLabel}>{label}</Text>
          <View style={styles.statusValueWrap}>
            {lines.slice(0, 2).map((line, index) => (
              <Text
                key={`${line}-${index}`}
                numberOfLines={1}
                style={[
                  styles.statusValue,
                  color && (label !== 'Due' || index === 0) ? { color } : null,
                ]}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
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

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
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
      <View
        style={[
          styles.checkCircle,
          item.completed && styles.checkCircleDone,
        ]}
      >
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

function CompactButton({
  title,
  icon,
  variant,
  onPress,
}: {
  title: string;
  icon: React.ReactNode;
  variant: 'primary' | 'soft' | 'ghost';
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[
        styles.compactButton,
        variant === 'primary' && styles.compactButtonPrimary,
        variant === 'soft' && styles.compactButtonSoft,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {icon}
      <Text
        numberOfLines={1}
        style={[
          styles.compactButtonText,
          variant === 'primary' && styles.compactButtonTextPrimary,
          variant === 'soft' && styles.compactButtonTextSoft,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export default function TaskDetailsScreen({ navigation, route }: Props) {
  useFocusMateTheme();

  const { tasks, toggleTask, deleteTask } = useTasks();
  const [activeTab, setActiveTab] = useState<DetailTab>('plan');
  const [showAllPlanSteps, setShowAllPlanSteps] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const [onlineMeetingLink, setOnlineMeetingLink] =
    useState<OnlineMeetingLink | null>(null);
  const [isMeetingModalVisible, setIsMeetingModalVisible] = useState(false);
  const [meetingLinkInput, setMeetingLinkInput] = useState('');
  const [meetingLinkError, setMeetingLinkError] = useState('');
  const [isSavingMeetingLink, setIsSavingMeetingLink] = useState(false);
  const [generatedTaskPlan, setGeneratedTaskPlan] =
    useState<MiloTaskPlan | null>(null);
  const [isGeneratingTaskPlan, setIsGeneratingTaskPlan] = useState(false);
  const [mapsPrompt, setMapsPrompt] = useState<{ location: string } | null>(
    null
  );
  const [mapsError, setMapsError] = useState<{
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

  const loadSavedMeetingLink = useCallback(() => {
    let isMounted = true;

    if (!task?.id) {
      setOnlineMeetingLink(null);
      return () => {
        isMounted = false;
      };
    }

    getOnlineMeetingLinkForTask(task.id)
      .then((savedMeetingLink) => {
        if (isMounted) {
          setOnlineMeetingLink(savedMeetingLink);
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

  useEffect(loadSavedTaskPlan, [loadSavedTaskPlan]);
  useFocusEffect(loadSavedTaskPlan);
  useEffect(loadSavedMeetingLink, [loadSavedMeetingLink]);
  useFocusEffect(loadSavedMeetingLink);

  const detectedMeetingProvider = useMemo(() => {
    if (!meetingLinkInput.trim()) {
      return null;
    }

    return detectMeetingProvider(meetingLinkInput);
  }, [meetingLinkInput]);

  const hasOnlineMeetingLink = Boolean(onlineMeetingLink);
  const displayTaskPlan = useMemo(() => {
    if (!task) {
      return null;
    }

    return generatedTaskPlan?.taskId === task.id ? generatedTaskPlan : null;
  }, [generatedTaskPlan, task]);

  if (!task) {
    return (
      <ScreenContainer>
        <EmptyState
          imageSource={getMiloImageSource('worried')}
          title="Planner item not found"
          message="This planner item may have been deleted."
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
      source: 'smart',
    })) || [];

  const completedPlanItems = planItems.filter((item) => item.completed).length;
  const progress =
    planItems.length > 0 ? Math.round((completedPlanItems / planItems.length) * 100) : 0;
  const isPlanFullyCompleted =
    planItems.length > 0 && completedPlanItems === planItems.length;
  const miloUrgency = task.miloUrgency || calculateMiloUrgency(task);
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
  const joinUrl = onlineMeetingLink?.url;
  const onlineMeetingLabel =
    onlineMeetingLink?.label ||
    (onlineMeetingLink ? buildMeetingDisplayLabel(onlineMeetingLink.url) : '');
  const taskLocation = task.location?.trim() || '';

  const heroMessage =
    task.status === 'completed'
      ? 'This planner item is completed.'
      : displayTaskPlan
      ? 'Your smart plan is ready when you want to prepare.'
      : 'Task details are ready. Focus and take action.';

  const focusActionLabel =
    task.plannerType === 'meeting'
      ? joinUrl
        ? 'Join Meeting'
        : 'Prepare'
      : task.plannerType === 'date'
      ? 'Plan Prep'
      : 'Start Focus';

  const doneActionLabel =
    task.status === 'completed'
      ? 'Pending'
      : task.plannerType === 'task'
      ? 'Mark Done'
      : 'Mark Ready';

  const generatedTimelineItems = displayTaskPlan?.timeline || [];
  const shouldUseGeneratedTimeline = isGeneratedTimelineUseful(
    generatedTimelineItems,
    planItems
  );
  const sourceTimelineItems =
    shouldUseGeneratedTimeline || planItems.length === 0
      ? generatedTimelineItems
      : deriveTimelineFromPlanSteps(planItems);
  const baseTimelineItems =
    sourceTimelineItems.map((item) => ({
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

  const handleDelete = () => {
    Alert.alert(
      'Delete planner item?',
      'This item will be removed from your planner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteOnlineMeetingLinkForTask(task.id).catch(() => undefined);
            await deleteTask(task.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleMenu = () => {
    Alert.alert(task.title, 'Choose an action.', [
      {
        text: 'Edit',
        onPress: () => navigation.navigate('EditTask', { taskId: task.id }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: handleDelete,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleToggleTask = () => {
    toggleTask(task.id);

    setNotice({
      type: task.status === 'completed' ? 'info' : 'success',
      title:
        task.status === 'completed'
          ? 'Moved back to pending'
          : 'Marked as completed!',
      message:
        task.status === 'completed'
          ? 'This item is now pending again.'
          : 'This planner item is now completed.',
    });
  };

  const handleTogglePlanItem = async (item: DisplayPlanItem) => {
    if (!displayTaskPlan) {
      return;
    }

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

  const handleRegeneratePlan = async () => {
    if (isGeneratingTaskPlan) {
      return;
    }

    setIsGeneratingTaskPlan(true);

    try {
      const aiSettings = await loadMiloAiSettings();
      const nextPlan = await generateMiloTaskSmartPlan({
        task,
        aiSettings,
        relatedTasks: tasks.filter((item) => item.id !== task.id),
        hasMeetingLink: hasOnlineMeetingLink,
      });
      const savedPlan = await saveMiloTaskPlan(task.id, nextPlan);

      setGeneratedTaskPlan(savedPlan);
      setShowAllPlanSteps(false);
      setNotice({
        type: 'success',
        title:
          savedPlan.source === 'ai'
            ? 'Plan refreshed with AI'
            : 'Plan refreshed locally',
        message:
          aiSettings.aiMode === 'online' && savedPlan.source === 'local'
            ? 'AI was not available, so FocusMate used the local safety plan.'
            : 'FocusMate found a few tiny steps to make this easier.',
      });
    } catch (error) {
      console.warn('Failed to regenerate Milo task plan:', error);

      const localPlan = createLocalTaskPlan(task, {
        hasMeetingLink: hasOnlineMeetingLink,
      });
      const savedPlan = await saveMiloTaskPlan(task.id, localPlan);

      setGeneratedTaskPlan(savedPlan);
      setNotice({
        type: 'info',
        title: 'Local plan created',
        message: 'The safe local plan is ready on this device.',
      });
    } finally {
      setIsGeneratingTaskPlan(false);
    }
  };

  const handleAddChecklistItem = async () => {
    if (!displayTaskPlan) {
      return;
    }

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

  const closeMeetingModal = () => {
    if (isSavingMeetingLink) {
      return;
    }

    setIsMeetingModalVisible(false);
    setMeetingLinkError('');
  };

  const openMeetingModal = () => {
    setMeetingLinkInput(onlineMeetingLink?.url || '');
    setMeetingLinkError('');
    setIsMeetingModalVisible(true);
  };

  const confirmOpenMeetingLink = (url?: string) => {
    const normalizedUrl = normalizeMeetingUrl(url || '');

    if (!isLikelyMeetingUrl(normalizedUrl)) {
      Alert.alert(
        'Meeting link unavailable',
        'This online meeting link does not look valid yet.'
      );
      return;
    }

    Alert.alert(
      'Join online meeting?',
      'FocusMate will open this link outside the app.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Join',
          onPress: () => void openMeetingLink(normalizedUrl),
        },
      ]
    );
  };

  const handleSaveMeetingLink = async () => {
    const normalizedUrl = normalizeMeetingUrl(meetingLinkInput);

    if (!normalizedUrl) {
      setMeetingLinkError('Paste a meeting link first.');
      return;
    }

    if (!isLikelyMeetingUrl(normalizedUrl)) {
      setMeetingLinkError('This does not look like a valid meeting link.');
      return;
    }

    setIsSavingMeetingLink(true);
    setMeetingLinkError('');

    try {
      const savedMeetingLink = await saveOnlineMeetingLink({
        taskId: task.id,
        taskTitle: task.title,
        url: normalizedUrl,
      });

      setOnlineMeetingLink(savedMeetingLink);
      setIsMeetingModalVisible(false);
      setNotice({
        type: 'success',
        title: 'Online meeting saved',
        message: `${savedMeetingLink.provider} is linked to this planner item.`,
      });
    } catch (error) {
      console.warn('Failed to save online meeting link:', error);
      setMeetingLinkError('FocusMate could not save this link. Please try again.');
    } finally {
      setIsSavingMeetingLink(false);
    }
  };

  const handleRemoveMeetingLink = () => {
    Alert.alert(
      'Remove online meeting link?',
      'This keeps the planner item and only removes the saved meeting link.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOnlineMeetingLinkForTask(task.id);
              setOnlineMeetingLink(null);
              setMeetingLinkInput('');
              setNotice({
                type: 'info',
                title: 'Online meeting removed',
                message: 'This planner item no longer has a meeting link.',
              });
            } catch (error) {
              console.warn('Failed to remove online meeting link:', error);
              setNotice({
                type: 'error',
                title: 'Could not remove link',
                message: 'Please try again in a moment.',
              });
            }
          },
        },
      ]
    );
  };

  const handlePrimaryAction = () => {
    if (task.plannerType === 'meeting' && joinUrl) {
      confirmOpenMeetingLink(joinUrl);
      return;
    }

    if (task.plannerType === 'task') {
      navigation.navigate('FocusSession');
      return;
    }

    navigation.navigate('MiloSmartPlan', { taskId: task.id });
  };

  const handleOpenMaps = () => {
    if (!taskLocation) {
      setMapsError({
        title: 'Location not ready',
        message: 'Milo does not see a saved place for this item yet.',
      });
      return;
    }

    setMapsPrompt({ location: taskLocation });
  };

  const handleConfirmOpenMaps = async () => {
    const location = mapsPrompt?.location;
    setMapsPrompt(null);

    if (!location) {
      setMapsError({
        title: 'Location not ready',
        message: 'Milo does not see a saved place for this item yet.',
      });
      return;
    }

    const result = await openLocationInMaps(location);

    if (!result.ok) {
      setMapsError({
        title: 'Maps could not open',
        message: result.reason,
      });
    }
  };

  const handleMiddleAction = () => {
    handleToggleTask();
  };

  const handleOpenSmartPlan = () => {
    navigation.navigate('MiloSmartPlan', { taskId: task.id });
  };

  const displayPlanItems = showAllPlanSteps ? planItems : planItems.slice(0, 3);
  const hiddenPlanCount = Math.max(planItems.length - 3, 0);
  const plannerTypeIcon =
    task.plannerType === 'meeting'
      ? 'people-outline'
      : task.plannerType === 'date'
      ? 'calendar-outline'
      : 'checkbox-outline';

  return (
    <ScreenContainer
      topPadding={8}
      bottomPadding={52}
      contentStyle={styles.detailScreenContent}
    >
      <View style={styles.detailHero}>
        <Header onBack={() => navigation.goBack()} onMenu={handleMenu} />

        <View style={styles.taskOverviewCard}>
          <View style={styles.taskOverviewIconBox}>
            <Ionicons
              name={plannerTypeIcon}
              size={29}
              color={theme.colors.primaryDark}
            />
          </View>

          <View style={styles.taskOverviewCopy}>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.detailTaskTitle}
            >
              {task.title}
            </Text>
            <Text numberOfLines={1} style={styles.detailTaskMeta}>
              {titleCase(task.plannerType)} plan
            </Text>
          </View>
        </View>
      </View>

      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <View style={styles.heroCard}>
        <View style={styles.smartPlanIconBox}>
          <Ionicons name="sparkles" size={25} color={theme.colors.primaryDark} />
        </View>
        <View style={styles.heroTextArea}>
          <Text style={styles.heroEyebrow}>Smart Plan</Text>
          <Text style={styles.heroText}>{heroMessage}</Text>
        </View>
        <Ionicons name="heart" size={18} color={theme.colors.primary} />
      </View>

      <View style={styles.statusOverviewCard}>
        <StatusSection
          icon="flag-outline"
          label="Priority"
          value={titleCase(task.priority)}
          color={toneColor(task.priority)}
        />
        <StatusSection
          icon="flame-outline"
          label="Urgency"
          value={titleCase(miloUrgency)}
          color={toneColor(miloUrgency)}
        />
        <StatusSection
          icon="calendar-outline"
          label="Due"
          value={formatDue(task.dueDate, task.dueTime)}
          color={theme.colors.primaryDark}
        />
        <StatusSection
          icon="notifications-outline"
          label="Reminder"
          value={formatReminder(task.reminder, task.manualReminderMinutes)}
          color={theme.colors.primaryDark}
          last
        />
      </View>

      {taskLocation ? (
        <View style={styles.locationCard}>
          <View style={styles.locationIconWrap}>
            <Ionicons
              name="location-outline"
              size={17}
              color={theme.colors.primaryDark}
            />
          </View>
          <View style={styles.locationCopy}>
            <Text numberOfLines={1} style={styles.locationLabel}>
              Place
            </Text>
            <Text numberOfLines={2} style={styles.locationValue}>
              {taskLocation}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.openMapsButton}
            onPress={handleOpenMaps}
            accessibilityRole="button"
            accessibilityLabel={`Open ${taskLocation} in Maps`}
          >
            <Text numberOfLines={1} style={styles.openMapsButtonText}>
              Open Maps
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.onlineMeetingCard}>
        <View style={styles.onlineMeetingHeader}>
          <View style={styles.onlineMeetingIconWrap}>
            <MaterialCommunityIcons
              name="video-outline"
              size={22}
              color={theme.colors.purple}
            />
          </View>
          <View style={styles.onlineMeetingCopy}>
            <Text numberOfLines={1} style={styles.onlineMeetingLabel}>
              Online Meeting
            </Text>
            {onlineMeetingLink ? (
              <Text numberOfLines={1} style={styles.onlineMeetingProvider}>
                {onlineMeetingLink.provider}
              </Text>
            ) : (
              <Text style={styles.onlineMeetingEmptyText}>
                No online meeting link added yet.
              </Text>
            )}
          </View>

          {!onlineMeetingLink ? (
            <TouchableOpacity
              activeOpacity={0.84}
              style={styles.addMeetingButton}
              onPress={openMeetingModal}
              accessibilityRole="button"
              accessibilityLabel="Add online meeting link"
            >
              <Ionicons name="add" size={18} color={theme.colors.purple} />
              <Text style={styles.addMeetingButtonText}>Add Link</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {onlineMeetingLink ? (
          <>
            <View style={styles.onlineMeetingLinkBox}>
              <Ionicons name="link-outline" size={14} color={theme.colors.purple} />
              <Text numberOfLines={1} style={styles.onlineMeetingLinkText}>
                {onlineMeetingLabel}
              </Text>
            </View>

            <View style={styles.onlineMeetingActionRow}>
              <TouchableOpacity
                activeOpacity={0.84}
                style={styles.meetingPrimaryButton}
                onPress={() => confirmOpenMeetingLink(onlineMeetingLink.url)}
                accessibilityRole="button"
                accessibilityLabel="Join online meeting"
              >
                <Text style={styles.meetingPrimaryButtonText}>Join Meeting</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.84}
                style={styles.meetingSecondaryButton}
                onPress={openMeetingModal}
                accessibilityRole="button"
                accessibilityLabel="Edit online meeting link"
              >
                <Text style={styles.meetingSecondaryButtonText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.84}
                style={styles.meetingDangerButton}
                onPress={handleRemoveMeetingLink}
                accessibilityRole="button"
                accessibilityLabel="Remove online meeting link"
              >
                <Text style={styles.meetingDangerButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>

      {task.conflictAccepted ? (
        <View style={styles.conflictFocusCard}>
          <Ionicons name="eye-outline" size={17} color="#92400E" />
          <Text style={styles.conflictFocusText}>
            Overlap noted. Extra focus is on.
          </Text>
        </View>
      ) : null}

      <View style={styles.smartPlanPreviewCard}>
        <View style={styles.smartPlanPreviewIcon}>
          <Ionicons
            name={displayTaskPlan ? 'sparkles' : 'sparkles-outline'}
            size={22}
            color={theme.colors.primaryDark}
          />
        </View>

        <View style={styles.smartPlanPreviewCopy}>
          <Text style={styles.smartPlanPreviewTitle}>Plan Prep</Text>
          <Text style={styles.smartPlanPreviewText}>
            Prepare this task with small steps, nudges, and a timeline.
          </Text>

          {displayTaskPlan ? (
            <View style={styles.smartPlanMiniProgress}>
              <View style={styles.smartPlanMiniProgressHeader}>
                <Text style={styles.smartPlanMiniProgressText}>
                  {progress}% prepared
                </Text>
                <Text style={styles.smartPlanMiniSourceText}>{planSourceLabel}</Text>
              </View>
              <View style={styles.smartPlanMiniTrack}>
                <View
                  style={[
                    styles.smartPlanMiniFill,
                    { width: `${progress}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.smartPlanPreviewButton}
          onPress={handleOpenSmartPlan}
          accessibilityRole="button"
          accessibilityLabel="Plan Prep"
        >
          <Text style={styles.smartPlanPreviewButtonText}>Plan Prep</Text>
          <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.actionRow}>
        <CompactButton
          title="Edit"
          variant="ghost"
          onPress={() => navigation.navigate('EditTask', { taskId: task.id })}
          icon={<Ionicons name="create-outline" size={20} color={theme.colors.text} />}
        />
        <CompactButton
          title={doneActionLabel}
          variant="soft"
          onPress={handleMiddleAction}
          icon={
            <Ionicons
              name="checkmark"
              size={21}
              color={theme.colors.primaryDark}
            />
          }
        />
        <CompactButton
          title={focusActionLabel}
          variant="primary"
          onPress={handlePrimaryAction}
          icon={
            <MaterialCommunityIcons
              name={task.plannerType === 'task' ? 'target' : task.plannerType === 'meeting' && joinUrl ? 'video-outline' : 'playlist-check'}
              size={21}
              color="#FFFFFF"
            />
          }
        />
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.deleteLink}
        onPress={handleDelete}
      >
        <Ionicons name="trash-outline" size={15} color={theme.colors.danger} />
        <Text style={styles.deleteLinkText}>Delete planner item</Text>
      </TouchableOpacity>

      <Modal
        visible={isMeetingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMeetingModal}
      >
        <View style={styles.meetingModalOverlay}>
          <View style={styles.meetingModalCard}>
            <View style={styles.meetingModalHeader}>
              <Text style={styles.meetingModalTitle}>Set Online Meeting</Text>
              <TouchableOpacity
                activeOpacity={0.82}
                style={styles.meetingModalClose}
                onPress={closeMeetingModal}
                accessibilityRole="button"
                accessibilityLabel="Close online meeting editor"
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.meetingModalHelper}>
              Paste a Google Meet, Teams, Zoom, or other meeting link.
            </Text>

            <TextInput
              value={meetingLinkInput}
              onChangeText={(value) => {
                setMeetingLinkInput(value);
                setMeetingLinkError('');
              }}
              placeholder="https://meet.google.com/abc-defg-hij"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.meetingInput,
                meetingLinkError ? styles.meetingInputInvalid : null,
              ]}
            />

            {meetingLinkInput.trim() ? (
              <View style={styles.detectedProviderPill}>
                <Ionicons name="sparkles-outline" size={13} color={theme.colors.purple} />
                <Text style={styles.detectedProviderText}>
                  Detected: {detectedMeetingProvider || 'Custom'}
                </Text>
              </View>
            ) : null}

            {meetingLinkError ? (
              <Text style={styles.meetingErrorText}>{meetingLinkError}</Text>
            ) : null}

            <View style={styles.meetingModalActions}>
              <TouchableOpacity
                activeOpacity={0.84}
                style={styles.meetingModalCancel}
                onPress={closeMeetingModal}
                disabled={isSavingMeetingLink}
                accessibilityRole="button"
                accessibilityLabel="Cancel online meeting editor"
              >
                <Text style={styles.meetingModalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.84}
                style={[
                  styles.meetingModalSave,
                  isSavingMeetingLink && styles.meetingModalSaveDisabled,
                ]}
                onPress={handleSaveMeetingLink}
                disabled={isSavingMeetingLink}
                accessibilityRole="button"
                accessibilityLabel="Save online meeting link"
              >
                <Text style={styles.meetingModalSaveText}>
                  {isSavingMeetingLink ? 'Saving...' : 'Save Link'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <FocusMateConfirmModal
        visible={Boolean(mapsPrompt)}
        title="Open location?"
        message="Milo will open this place in Maps. You can come back to FocusMate anytime."
        primaryLabel="Open Maps"
        secondaryLabel="Cancel"
        icon="navigate-outline"
        onClose={() => setMapsPrompt(null)}
        onPrimary={() => void handleConfirmOpenMaps()}
      />

      <FocusMateConfirmModal
        visible={Boolean(mapsError)}
        title={mapsError?.title || 'Maps not ready'}
        message={mapsError?.message || 'Milo could not open that location right now.'}
        primaryLabel="OK"
        secondaryLabel="Close"
        icon="location-outline"
        tone="warning"
        onClose={() => setMapsError(null)}
        onPrimary={() => setMapsError(null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  detailScreenContent: {
    paddingHorizontal: 12,
  },
  detailHero: {
    marginBottom: 12,
  },
  taskOverviewCard: {
    minHeight: 104,
    borderRadius: 26,
    backgroundColor: theme.colors.card,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.1,
    shadowRadius: 13,
    elevation: 4,
    overflow: 'visible',
  },
  taskOverviewIconBox: {
    width: 66,
    height: 66,
    borderRadius: 24,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1.2,
    borderBottomWidth: 1.7,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.22)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  taskOverviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailScenery: {
    ...StyleSheet.absoluteFillObject,
  },
  detailHeroSpotlight: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    top: -82,
    right: -28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  detailHeroBlob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
  },
  detailHeroBlobLarge: {
    width: 210,
    height: 210,
    top: -78,
    right: -62,
  },
  detailHeroBlobSmall: {
    width: 106,
    height: 106,
    top: 84,
    left: -36,
    backgroundColor: 'rgba(47, 143, 70, 0.14)',
  },
  detailHeroBlobAccent: {
    width: 62,
    height: 62,
    top: 128,
    right: 18,
    backgroundColor: 'rgba(255, 246, 217, 0.3)',
  },
  detailHeroCloud: {
    position: 'absolute',
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  detailHeroCloudLeft: {
    top: 86,
    left: 26,
    width: 68,
  },
  detailHeroCloudRight: {
    top: 58,
    right: 74,
    width: 82,
  },
  detailHeroCloudLower: {
    top: 154,
    left: '38%',
    width: 74,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  detailHeroHill: {
    position: 'absolute',
    left: -34,
    right: -34,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  detailHeroHillBack: {
    height: 88,
    bottom: -20,
    backgroundColor: 'rgba(47, 143, 70, 0.16)',
  },
  detailHeroHillMid: {
    height: 72,
    bottom: -22,
    left: -86,
    right: 66,
    backgroundColor: 'rgba(35, 107, 53, 0.13)',
  },
  detailHeroHillFront: {
    height: 64,
    bottom: -32,
    left: 70,
    backgroundColor: 'rgba(47, 143, 70, 0.26)',
  },
  detailHeroLeaf: {
    position: 'absolute',
    width: 10,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(35, 107, 53, 0.35)',
  },
  detailHeroLeafOne: {
    top: 103,
    right: 118,
    transform: [{ rotate: '-24deg' }],
  },
  detailHeroLeafTwo: {
    top: 139,
    right: 146,
    width: 8,
    backgroundColor: 'rgba(47, 143, 70, 0.3)',
    transform: [{ rotate: '30deg' }],
  },
  detailHeroLeafThree: {
    top: 166,
    left: 88,
    width: 9,
    backgroundColor: 'rgba(35, 107, 53, 0.24)',
    transform: [{ rotate: '-18deg' }],
  },
  detailHeroSparkle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(47, 143, 70, 0.32)',
  },
  detailHeroSparkleOne: {
    top: 118,
    left: '44%',
  },
  detailHeroSparkleTwo: {
    top: 146,
    right: 42,
    width: 4,
    height: 4,
  },
  detailHeroSparkleThree: {
    top: 64,
    left: 116,
    width: 5,
    height: 5,
  },
  detailHeroSparkleFour: {
    top: 112,
    right: 96,
    width: 4,
    height: 4,
    backgroundColor: 'rgba(244, 197, 66, 0.44)',
  },
  headerWrap: {
    marginBottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: secondaryHeader.minHeight,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  headerButton: {
    width: secondaryHeader.buttonSize,
    height: secondaryHeader.buttonSize,
    borderRadius: secondaryHeader.buttonRadius,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.22)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: secondaryHeader.sideGap,
    minWidth: 0,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: secondaryHeader.titleFontSize,
    lineHeight: secondaryHeader.titleLineHeight,
    fontWeight: secondaryHeader.titleFontWeight,
    textAlign: 'center',
    maxWidth: '100%',
  },
  suggestedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  suggestedText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 3,
  },
  detailHeroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
  },
  detailHeroCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  detailSuggestedPill: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: 999,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 9,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  detailSuggestedText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 4,
  },
  detailTaskTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  detailTaskMeta: {
    color: theme.colors.textSoft,
    fontSize: 12.5,
    fontWeight: '900',
    marginTop: 4,
  },
  detailHeroMiloStage: {
    width: 118,
    height: 118,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomColor: 'rgba(35, 107, 53, 0.12)',
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 9,
    },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  detailHeroMiloGround: {
    position: 'absolute',
    bottom: 9,
    width: 80,
    height: 17,
    borderRadius: 999,
    backgroundColor: 'rgba(35, 107, 53, 0.18)',
  },
  detailHeroMiloImage: {
    marginBottom: -6,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    minHeight: 80,
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'visible',
  },
  smartPlanIconBox: {
    width: 54,
    height: 54,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.7,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 2,
  },
  heroMiloImage: {
    marginTop: 7,
  },
  heroTextArea: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },
  heroEyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 13.5,
    fontWeight: '900',
    marginBottom: 5,
  },
  heroText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  statusOverviewCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 8,
  },
  statusSection: {
    width: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  statusDivider: {
    borderRightWidth: 0,
  },
  statusIcon: {
    marginRight: 4,
  },
  statusTextBlock: {
    minHeight: 76,
    alignSelf: 'stretch',
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'visible',
  },
  statusIconBox: {
    width: 42,
    height: 42,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  statusIconBoxWarning: {
    backgroundColor: theme.colors.yellowSoft,
    borderColor: '#F7D391',
    borderBottomColor: 'rgba(245, 158, 11, 0.24)',
  },
  statusIconBoxDanger: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: '#F3B7B7',
    borderBottomColor: 'rgba(220, 38, 38, 0.24)',
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    flexShrink: 1,
  },
  statusValueWrap: {
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 3,
  },
  statusValue: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
    textAlign: 'left',
  },
  locationCard: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 9,
    marginBottom: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'visible',
  },
  locationIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  locationLabel: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  locationValue: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 11.5,
    fontWeight: '900',
    lineHeight: 16,
  },
  openMapsButton: {
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: '#BFE6C9',
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  openMapsButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  onlineMeetingCard: {
    minHeight: 84,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: '#D8CDF9',
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(139, 111, 217, 0.24)',
    padding: 13,
    marginBottom: 12,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'visible',
  },
  onlineMeetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineMeetingIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 19,
    backgroundColor: theme.colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: '#D4C8FF',
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(139, 111, 217, 0.24)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  onlineMeetingCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  onlineMeetingLabel: {
    color: theme.colors.purple,
    fontSize: 13.5,
    fontWeight: '900',
  },
  onlineMeetingProvider: {
    marginTop: 5,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  onlineMeetingEmptyText: {
    marginTop: 5,
    color: theme.colors.textSoft,
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 18,
  },
  onlineMeetingLinkBox: {
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1.2,
    borderColor: '#D8CDF9',
    borderTopColor: theme.colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
  },
  onlineMeetingLinkText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 5,
  },
  onlineMeetingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  meetingPrimaryButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginRight: 7,
    borderWidth: 1.2,
    borderBottomWidth: 1.7,
    borderColor: '#A891EA',
    borderTopColor: '#D8CEFF',
    borderBottomColor: '#6D56B8',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  meetingPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  meetingSecondaryButton: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.purpleSoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: '#D4C8FF',
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(139, 111, 217, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginRight: 7,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  meetingSecondaryButtonText: {
    color: theme.colors.purple,
    fontSize: 11,
    fontWeight: '900',
  },
  meetingDangerButton: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: '#F3B7B7',
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(220, 38, 38, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  meetingDangerButtonText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '900',
  },
  addMeetingButton: {
    alignSelf: 'center',
    minHeight: 38,
    borderRadius: 20,
    backgroundColor: theme.colors.purpleSoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: '#D4C8FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexShrink: 0,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(139, 111, 217, 0.16)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.07,
    shadowRadius: 7,
    elevation: 2,
  },
  addMeetingButtonText: {
    color: theme.colors.purple,
    fontSize: 12.5,
    fontWeight: '900',
    marginLeft: 5,
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
  conflictFocusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderTopColor: '#FFF7ED',
    ...theme.shadowSoft,
  },
  conflictFocusText: {
    flex: 1,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 8,
  },
  smartPlanPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    minHeight: 88,
    borderRadius: 24,
    padding: 13,
    marginBottom: 14,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'visible',
  },
  smartPlanPreviewIcon: {
    width: 50,
    height: 50,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  smartPlanPreviewCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  smartPlanPreviewTitle: {
    color: theme.colors.text,
    fontSize: 14.5,
    fontWeight: '900',
  },
  smartPlanPreviewText: {
    color: theme.colors.textSoft,
    fontSize: 12.5,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 5,
  },
  smartPlanMiniProgress: {
    marginTop: 7,
  },
  smartPlanMiniProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  smartPlanMiniProgressText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  smartPlanMiniSourceText: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: '900',
  },
  smartPlanMiniTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E8F3E5',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  smartPlanMiniFill: {
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  smartPlanPreviewButton: {
    minHeight: 46,
    minWidth: 112,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1.2,
    borderBottomWidth: 2,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  smartPlanPreviewButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginRight: 6,
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
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 14,
    marginBottom: 11,
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
  emptyPlanText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    backgroundColor: theme.colors.backgroundSoft,
    borderRadius: 18,
    padding: 12,
  },
  planActions: {
    flexDirection: 'row',
    marginTop: 11,
  },
  planActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 8,
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
  extraFocusText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 10,
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
  },
  compactButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 7,
    paddingHorizontal: 6,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  compactButtonPrimary: {
    flex: 1.18,
    marginRight: 0,
    backgroundColor: theme.colors.primary,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.15,
    shadowRadius: 11,
    elevation: 5,
  },
  compactButtonSoft: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.22)',
  },
  compactButtonText: {
    color: theme.colors.text,
    fontSize: 11.5,
    fontWeight: '900',
    marginTop: 5,
  },
  compactButtonTextPrimary: {
    color: '#FFFFFF',
  },
  compactButtonTextSoft: {
    color: theme.colors.primaryDark,
  },
  deleteLink: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
  },
  deleteLinkText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 7,
  },
  meetingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(34, 40, 49, 0.28)',
    justifyContent: 'flex-end',
    padding: 14,
  },
  meetingModalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.surface,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.13,
    shadowRadius: 15,
    elevation: 5,
  },
  meetingModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  meetingModalTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  meetingModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.surface,
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  meetingModalHelper: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 10,
  },
  meetingInput: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.surface,
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 13,
  },
  meetingInputInvalid: {
    backgroundColor: '#FFFAFA',
    borderColor: '#F8CACA',
  },
  detectedProviderPill: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.purpleSoft,
    borderWidth: 1.2,
    borderColor: '#D4C8FF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginTop: 10,
  },
  detectedProviderText: {
    color: theme.colors.purple,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 5,
  },
  meetingErrorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 9,
  },
  meetingModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
  },
  meetingModalCancel: {
    flex: 1,
    minHeight: 44,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.surface,
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  meetingModalCancelText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  meetingModalSave: {
    flex: 1,
    minHeight: 44,
    borderRadius: 17,
    backgroundColor: theme.colors.primary,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingModalSaveDisabled: {
    opacity: 0.65,
  },
  meetingModalSaveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
