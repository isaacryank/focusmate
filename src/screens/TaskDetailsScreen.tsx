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
import { useTasks } from '../lib/TaskContext';
import { getMiloReaction } from '../lib/miloReaction';
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
import NoticeCard from '../components/ui/NoticeCard';
import MiloMoodImage, { getMiloImageSource } from '../components/milo/MiloMoodImage';

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
  title,
  onBack,
  onMenu,
}: {
  title: string;
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
          <Ionicons name="chevron-back" size={21} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
          <View style={styles.suggestedPill}>
            <Ionicons name="sparkles" size={10} color={theme.colors.primaryDark} />
            <Text style={styles.suggestedText}>Suggested by Milo</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.headerButton}
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.text} />
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

  return (
    <View style={[styles.statusSection, !last && styles.statusDivider]}>
      <View style={styles.statusTextBlock}>
        <View style={styles.statusLabelRow}>
          <Ionicons
            name={icon}
            size={13}
            color={color || theme.colors.primaryDark}
            style={styles.statusIcon}
          />
          <Text numberOfLines={1} style={styles.statusLabel}>{label}</Text>
        </View>
        <View style={styles.statusValueWrap}>
          {lines.slice(0, 2).map((line, index) => (
            <Text
              key={`${line}-${index}`}
              style={[styles.statusValue, color ? { color } : null]}
            >
              {line}
            </Text>
          ))}
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

  useEffect(() => {
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

  const detectedMeetingProvider = useMemo(() => {
    if (!meetingLinkInput.trim()) {
      return null;
    }

    return detectMeetingProvider(meetingLinkInput);
  }, [meetingLinkInput]);

  const miloData = useMemo(() => {
    if (!task) {
      return null;
    }

    return getMiloReaction([task]);
  }, [task]);

  const hasOnlineMeetingLink = Boolean(onlineMeetingLink);
  const displayTaskPlan = useMemo(() => {
    if (!task) {
      return null;
    }

    return generatedTaskPlan?.taskId === task.id ? generatedTaskPlan : null;
  }, [generatedTaskPlan, task]);

  if (!task || !miloData) {
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
      ? 'You did it. Milo is proud'
      : displayTaskPlan
      ? 'Your smart plan is ready when you want to prep.'
      : 'Task details are ready. Milo can help you prep when needed.';

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
      'Milo will remove this item from your planner.',
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
          : 'Milo is celebrating!',
      message:
        task.status === 'completed'
          ? 'This item is now pending again.'
          : 'You did it. Milo is proud.',
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
            ? 'Milo refreshed with AI'
            : 'Milo refreshed locally',
        message:
          aiSettings.aiMode === 'online' && savedPlan.source === 'local'
            ? 'AI was not available, so Milo used the local safety plan.'
            : 'Milo found a few tiny steps to make this easier.',
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
        title: 'Milo used a local plan',
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
      return;
    }

    Alert.alert(
      'Open in Google Maps?',
      'FocusMate will open this location outside the app.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Open Maps',
          onPress: () => void openLocationInMaps(taskLocation),
        },
      ]
    );
  };

  const handleMiddleAction = () => {
    handleToggleTask();
  };

  const handleOpenSmartPlan = () => {
    navigation.navigate('MiloSmartPlan', { taskId: task.id });
  };

  const displayPlanItems = showAllPlanSteps ? planItems : planItems.slice(0, 3);
  const hiddenPlanCount = Math.max(planItems.length - 3, 0);

  return (
    <ScreenContainer topPadding={8} bottomPadding={52}>
      <Header title={task.title} onBack={() => navigation.goBack()} onMenu={handleMenu} />

      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <View style={styles.heroCard}>
        <View style={styles.heroMiloBubble}>
          <MiloMoodImage
            mood={task.status === 'completed' ? 'celebrating' : 'happy'}
            size={80}
            style={styles.heroMiloImage}
          />
        </View>
        <View style={styles.heroTextArea}>
          <Text style={styles.heroEyebrow}>Milo Smart Plan</Text>
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
        />
        <StatusSection
          icon="notifications-outline"
          label="Reminder"
          value={formatReminder(task.reminder, task.manualReminderMinutes)}
          last
        />
      </View>

      {taskLocation ? (
        <View style={styles.locationCard}>
          <View style={styles.locationIconWrap}>
            <Ionicons
              name="location-outline"
              size={18}
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
              size={18}
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
        ) : (
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.addMeetingButton}
            onPress={openMeetingModal}
            accessibilityRole="button"
            accessibilityLabel="Add online meeting link"
          >
            <Ionicons name="add" size={16} color={theme.colors.purple} />
            <Text style={styles.addMeetingButtonText}>Add Link</Text>
          </TouchableOpacity>
        )}
      </View>

      {task.conflictAccepted ? (
        <View style={styles.conflictFocusCard}>
          <Ionicons name="eye-outline" size={17} color="#92400E" />
          <Text style={styles.conflictFocusText}>
            Milo noted an overlap. Extra focus is on.
          </Text>
        </View>
      ) : null}

      <View style={styles.smartPlanPreviewCard}>
        <View style={styles.smartPlanPreviewIcon}>
          <Ionicons
            name={displayTaskPlan ? 'sparkles' : 'sparkles-outline'}
            size={18}
            color={theme.colors.primaryDark}
          />
        </View>

        <View style={styles.smartPlanPreviewCopy}>
          <Text style={styles.smartPlanPreviewTitle}>
            {displayTaskPlan ? 'Milo Smart Plan Ready' : 'Milo Smart Plan'}
          </Text>
          <Text style={styles.smartPlanPreviewText}>
            {displayTaskPlan
              ? `${planItems.length} steps - ${smartNudges.length} nudges - timeline ready`
              : 'Prepare this task with small steps, nudges, and a timeline.'}
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
          accessibilityLabel={displayTaskPlan ? 'Open Plan Prep' : 'Plan Prep'}
        >
          <Text style={styles.smartPlanPreviewButtonText}>
            {displayTaskPlan ? 'Open Plan Prep' : 'Plan Prep'}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.actionRow}>
        <CompactButton
          title="Edit"
          variant="ghost"
          onPress={() => navigation.navigate('EditTask', { taskId: task.id })}
          icon={<Ionicons name="create-outline" size={17} color={theme.colors.text} />}
        />
        <CompactButton
          title={doneActionLabel}
          variant="soft"
          onPress={handleMiddleAction}
          icon={
            <Ionicons
              name="checkmark"
              size={17}
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
              size={17}
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 10,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
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
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF8EE',
    borderRadius: 24,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: '#CDEFD7',
    ...theme.shadowSoft,
  },
  heroMiloBubble: {
    width: 78,
    height: 74,
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
    paddingRight: 8,
  },
  heroEyebrow: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 3,
  },
  heroText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  statusOverviewCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
    minHeight: 88,
    overflow: 'hidden',
    ...theme.shadowSoft,
  },
  statusSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 10,
  },
  statusDivider: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  statusIcon: {
    marginRight: 4,
  },
  statusTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  statusLabel: {
    color: theme.colors.text,
    fontSize: 10.5,
    fontWeight: '800',
    flexShrink: 1,
  },
  statusValueWrap: {
    minHeight: 33,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  statusValue: {
    color: theme.colors.textSoft,
    fontSize: 10.5,
    fontWeight: '800',
    lineHeight: 15,
    textAlign: 'center',
  },
  locationCard: {
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginBottom: 10,
    ...theme.shadowSoft,
  },
  locationIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
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
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  openMapsButton: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: '#CFEFDA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  openMapsButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  onlineMeetingCard: {
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 11,
    marginBottom: 10,
    ...theme.shadowSoft,
  },
  onlineMeetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineMeetingIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 15,
    backgroundColor: theme.colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  onlineMeetingCopy: {
    flex: 1,
    minWidth: 0,
  },
  onlineMeetingLabel: {
    color: theme.colors.purple,
    fontSize: 10,
    fontWeight: '900',
  },
  onlineMeetingProvider: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  onlineMeetingEmptyText: {
    marginTop: 3,
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  onlineMeetingLinkBox: {
    minHeight: 34,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
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
    marginTop: 10,
  },
  meetingPrimaryButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 17,
    backgroundColor: theme.colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginRight: 7,
  },
  meetingPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  meetingSecondaryButton: {
    minHeight: 36,
    borderRadius: 17,
    backgroundColor: theme.colors.purpleSoft,
    borderWidth: 1,
    borderColor: '#DDD4FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginRight: 7,
  },
  meetingSecondaryButtonText: {
    color: theme.colors.purple,
    fontSize: 11,
    fontWeight: '900',
  },
  meetingDangerButton: {
    minHeight: 36,
    borderRadius: 17,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#F8CACA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  meetingDangerButtonText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontWeight: '900',
  },
  addMeetingButton: {
    alignSelf: 'flex-start',
    minHeight: 35,
    borderRadius: 17,
    backgroundColor: theme.colors.purpleSoft,
    borderWidth: 1,
    borderColor: '#DDD4FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 10,
  },
  addMeetingButtonText: {
    color: theme.colors.purple,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 4,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E1E8DF',
    ...theme.shadowSoft,
  },
  smartPlanPreviewIcon: {
    width: 42,
    height: 42,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  smartPlanPreviewCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  smartPlanPreviewTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  smartPlanPreviewText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 4,
  },
  smartPlanMiniProgress: {
    marginTop: 9,
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
  },
  smartPlanMiniFill: {
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  smartPlanPreviewButton: {
    minHeight: 38,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  smartPlanPreviewButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    marginRight: 4,
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
    marginTop: 2,
  },
  compactButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 17,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    paddingHorizontal: 6,
  },
  compactButtonPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  compactButtonSoft: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: '#CFEFDA',
  },
  compactButtonText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 4,
  },
  compactButtonTextPrimary: {
    color: '#FFFFFF',
  },
  compactButtonTextSoft: {
    color: theme.colors.primaryDark,
  },
  deleteLink: {
    alignSelf: 'center',
    paddingVertical: 16,
  },
  deleteLinkText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '900',
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderWidth: 1,
    borderColor: '#DDD4FF',
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
    borderWidth: 1,
    borderColor: theme.colors.border,
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
