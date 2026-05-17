import React, { useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { MiloSmartPlanStep, Subtask } from '../types/task';
import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { getMiloReaction } from '../lib/miloReaction';
import {
  calculateMiloUrgency,
  generateMiloSmartNudges,
  generateMiloSmartPlan,
} from '../lib/miloSmartPlan';

import ScreenContainer from '../components/ui/ScreenContainer';
import EmptyState from '../components/ui/EmptyState';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMoodImage, { getMiloImageSource } from '../components/milo/MiloMoodImage';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskDetails'>;

type DisplayPlanItem = {
  id: string;
  title: string;
  completed: boolean;
  source: 'subtask' | 'smart';
};

type DetailTab = 'plan' | 'nudges' | 'timeline';

function extractUrl(...values: Array<string | undefined>) {
  const text = values.filter(Boolean).join(' ');
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match?.[0];
}

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

  return (
    <View
      style={[
        styles.timelineChip,
        isDone && styles.timelineChipDone,
        isNext && styles.timelineChipNext,
      ]}
    >
      <Text
        style={[
          styles.timelineChipText,
          isDone && styles.timelineChipTextDone,
          isNext && styles.timelineChipTextNext,
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

      <Text
        style={[
          styles.checklistText,
          item.completed && styles.checklistTextDone,
        ]}
      >
        {item.title}
      </Text>

      <Ionicons name="ellipsis-vertical" size={16} color={theme.colors.muted} />
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
  const { tasks, toggleTask, deleteTask, updateTask } = useTasks();
  const [activeTab, setActiveTab] = useState<DetailTab>('plan');
  const [showAllPlanSteps, setShowAllPlanSteps] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const task = tasks.find((item) => item.id === route.params.taskId);

  const miloData = useMemo(() => {
    if (!task) {
      return null;
    }

    return getMiloReaction([task]);
  }, [task]);

  const suggestedSmartPlan = useMemo(() => {
    if (!task) return [];
    return task.miloSmartPlan && task.miloSmartPlan.length > 0
      ? task.miloSmartPlan
      : generateMiloSmartPlan(task);
  }, [task]);

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

  const subtasks = task.subtasks || [];
  const hasSubtasks = subtasks.length > 0;
  const planItems: DisplayPlanItem[] = hasSubtasks
    ? subtasks.map((item) => ({
        id: item.id,
        title: item.title,
        completed: item.completed,
        source: 'subtask',
      }))
    : suggestedSmartPlan.map((item) => ({
        id: item.id,
        title: item.title,
        completed: false,
        source: 'smart',
      }));

  const completedPlanItems = planItems.filter((item) => item.completed).length;
  const progress =
    planItems.length > 0 ? Math.round((completedPlanItems / planItems.length) * 100) : 0;
  const miloUrgency = task.miloUrgency || calculateMiloUrgency(task);
  const smartNudges = task.miloSmartNudges || generateMiloSmartNudges(task);
  const joinUrl = extractUrl(task.description, task.location);

  const heroMessage =
    task.status === 'completed'
      ? 'You did it. Milo is proud'
      : smartNudges.length > 1
      ? 'Your smart plan is ready. Milo can nudge you too.'
      : task.miloSmartPlan?.length
      ? 'Milo made a plan and a few nudges for you.'
      : 'I made a little plan for you';

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

  const timelineItems = [
    ...smartNudges.slice(0, 3).map((nudge) => ({
      id: `nudge-${nudge.id}`,
      title: nudge.label,
      detail: nudge.timing,
    })),
    ...planItems.slice(0, 3).map((item) => ({
      id: `plan-${item.id}`,
      title: item.title,
      detail: item.completed ? 'Done' : 'Upcoming',
    })),
  ].slice(0, 5);

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

  const createSubtasksFromPlan = (
    plan: MiloSmartPlanStep[],
    toggledId?: string
  ): Subtask[] =>
    plan.map((step, index) => ({
      id: `${Date.now()}-${index}`,
      title: step.title,
      completed: step.id === toggledId,
      createdAt: new Date().toISOString(),
    }));

  const handleTogglePlanItem = async (item: DisplayPlanItem) => {
    if (item.source === 'smart') {
      await updateTask(task.id, {
        subtasks: createSubtasksFromPlan(suggestedSmartPlan, item.id),
        miloSmartPlan: suggestedSmartPlan,
      });
      return;
    }

    const nextSubtasks = subtasks.map((subtask) =>
      subtask.id === item.id
        ? {
            ...subtask,
            completed: !subtask.completed,
          }
        : subtask
    );

    await updateTask(task.id, {
      subtasks: nextSubtasks,
    });
  };

  const handleRegeneratePlan = async () => {
    const nextPlan = generateMiloSmartPlan(task);
    const nextSubtasks: Subtask[] = nextPlan.map((step, index) => {
      const existing = subtasks.find(
        (item) => item.title.trim().toLowerCase() === step.title.trim().toLowerCase()
      );

      return (
        existing || {
          id: `${Date.now()}-${index}`,
          title: step.title,
          completed: false,
          createdAt: new Date().toISOString(),
        }
      );
    });

    await updateTask(task.id, {
      subtasks: nextSubtasks,
      miloSmartPlan: nextPlan,
      miloSmartNudges: generateMiloSmartNudges(task),
      miloUrgency: calculateMiloUrgency(task),
    });

    setNotice({
      type: 'success',
      title: 'Milo refreshed the plan',
      message: 'Milo found a few tiny steps to make this easier.',
    });
  };

  const handleAddChecklistItem = async () => {
    const baseSubtasks = hasSubtasks
      ? subtasks
      : createSubtasksFromPlan(suggestedSmartPlan);

    const nextItem: Subtask = {
      id: `${Date.now()}`,
      title: `New small step ${baseSubtasks.length + 1}`,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    await updateTask(task.id, {
      subtasks: [...baseSubtasks, nextItem],
      miloSmartPlan: suggestedSmartPlan,
    });
  };

  const handlePrimaryAction = () => {
    if (task.plannerType === 'meeting' && joinUrl) {
      Linking.openURL(joinUrl);
      return;
    }

    if (task.plannerType === 'task') {
      navigation.navigate('FocusSession');
      return;
    }

    navigation.navigate('MiloPlan', { taskId: task.id });
  };

  const handleMiddleAction = () => {
    handleToggleTask();
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

      {task.conflictAccepted ? (
        <View style={styles.conflictFocusCard}>
          <Ionicons name="eye-outline" size={17} color="#92400E" />
          <Text style={styles.conflictFocusText}>
            Milo noted an overlap. Extra focus is on.
          </Text>
        </View>
      ) : null}

      <View style={styles.tabControl}>
        <TabButton label="Plan" active={activeTab === 'plan'} onPress={() => setActiveTab('plan')} />
        <TabButton label="Nudges" active={activeTab === 'nudges'} onPress={() => setActiveTab('nudges')} />
        <TabButton label="Timeline" active={activeTab === 'timeline'} onPress={() => setActiveTab('timeline')} />
      </View>

      {activeTab === 'plan' ? (
        <View style={styles.planCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Milo Smart Plan</Text>
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
            {displayPlanItems.map((item, index) => (
              <View key={`${item.source}-${item.id}`} style={styles.planStepWrap}>
                <ChecklistItem item={item} onToggle={() => handleTogglePlanItem(item)} />
                <Text style={styles.planStepStatus}>
                  {item.completed ? 'Done' : index === completedPlanItems ? 'In progress' : 'To do'}
                </Text>
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
              style={styles.planActionButton}
              onPress={handleAddChecklistItem}
            >
              <Ionicons name="add" size={16} color={theme.colors.primaryDark} />
              <Text style={styles.planActionText}>Add step</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.planActionButton}
              onPress={handleRegeneratePlan}
            >
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.primaryDark} />
              <Text style={styles.planActionText}>Regenerate</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {activeTab === 'nudges' ? (
        <View style={styles.nudgeCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Milo Smart Nudges</Text>
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
                <Text style={styles.nudgeLabel}>{nudge.label}</Text>
                <Text numberOfLines={1} style={styles.nudgeTiming}>{nudge.timing}</Text>
              </View>
            ))}
          </View>
          {task.conflictAccepted ? (
            <Text style={styles.extraFocusText}>Extra focus is on.</Text>
          ) : null}
        </View>
      ) : null}

      {activeTab === 'timeline' ? (
        <View style={styles.timelineCard}>
          <Text style={styles.cardTitle}>Timeline</Text>
          <View style={styles.timelineList}>
            {timelineItems.map((item, index) => (
              <View key={item.id} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineNode, index === 0 && styles.timelineNodeActive]}>
                    <Text style={styles.timelineNodeText}>{index + 1}</Text>
                  </View>
                  {index < timelineItems.length - 1 ? <View style={styles.timelineVerticalLine} /> : null}
                </View>
                <View style={styles.timelineContent}>
                  <Text numberOfLines={1} style={styles.timelineTitle}>{item.title}</Text>
                  <View style={styles.timelineMetaRow}>
                    <Text numberOfLines={1} style={styles.timelineDetail}>
                      {item.detail}
                    </Text>
                    <TimelineStatusChip
                      label={item.detail === 'Done' ? 'Done' : index === 0 ? 'Next' : 'Upcoming'}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.insightCard}>
        <Text style={styles.insightTitle}>Milo Insight</Text>
        <Text style={styles.insightText}>Small steps, big results.</Text>
        <View style={styles.insightChips}>
          {['Break task down', 'Prep early', 'Check-in tomorrow'].map((chip) => (
            <View key={chip} style={styles.insightChip}>
              <Text style={styles.insightChipText}>{chip}</Text>
            </View>
          ))}
        </View>
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
  tabControl: {
    flexDirection: 'row',
    backgroundColor: '#F2F6F4',
    borderRadius: 17,
    padding: 3,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    color: theme.colors.textSoft,
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
  progressCard: {
    backgroundColor: theme.colors.backgroundSoft,
    borderRadius: 15,
    padding: 9,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  progressPercent: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 13,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  countBadge: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  countBadgeText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  checklistList: {
    backgroundColor: theme.colors.backgroundSoft,
    borderRadius: 16,
    paddingHorizontal: 9,
  },
  planStepWrap: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  planStepStatus: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 35,
    marginTop: -8,
    marginBottom: 8,
  },
  checklistItem: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCD4DD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkCircleDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checklistText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    paddingVertical: 9,
  },
  checklistTextDone: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
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
    marginTop: 10,
  },
  planActionButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 8,
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
    paddingTop: 8,
    paddingHorizontal: 3,
  },
  viewAllStepsText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  nudgeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 13,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  nudgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -7,
  },
  nudgeChip: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 16,
    padding: 9,
    marginRight: 7,
    borderWidth: 1,
    borderColor: '#D7F1DE',
  },
  nudgeIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
  nudgeTiming: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '800',
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
    borderRadius: 22,
    padding: 13,
    marginBottom: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  timelineList: {
    marginTop: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 48,
  },
  timelineRail: {
    width: 30,
    alignItems: 'center',
  },
  timelineNode: {
    width: 23,
    height: 23,
    borderRadius: 12,
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
  timelineNodeText: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
  },
  timelineVerticalLine: {
    flex: 1,
    width: 2,
    backgroundColor: theme.colors.primarySoft,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 8,
    paddingBottom: 12,
  },
  timelineTitle: {
    color: theme.colors.text,
    fontSize: 12,
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
  insightCard: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CFEFDA',
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
});
