import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { RootStackParamList } from '../types/navigation';
import { Subtask } from '../types/task';
import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { MiloMood, getTodayDate } from '../lib/miloPersonality';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import AppButton from '../components/ui/AppButton';
import EmptyState from '../components/ui/EmptyState';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type Props = NativeStackScreenProps<RootStackParamList, 'TaskDetails'>;

function getTaskMood(taskStatus: string, dueDate?: string, priority?: string): MiloMood {
  const todayDate = getTodayDate();

  if (taskStatus === 'completed') return 'celebrating';

  if (dueDate && dueDate < todayDate) return 'worried';

  if (priority === 'high') return 'focused';

  return 'waving';
}

function getTaskMiloText({
  status,
  title,
  dueDate,
  priority,
}: {
  status: string;
  title: string;
  dueDate?: string;
  priority?: string;
}) {
  const todayDate = getTodayDate();

  if (status === 'completed') {
    return {
      title: 'Milo is celebrating',
      message: `Great job completing "${title}". Milo is proud of your progress.`,
      tagline: 'One step completed.',
    };
  }

  if (dueDate && dueDate < todayDate) {
    return {
      title: 'Milo is checking in',
      message: `This item looks overdue. Do not stress. Start with one small action and continue from there.`,
      tagline: 'Small recovery steps count.',
    };
  }

  if (priority === 'high') {
    return {
      title: 'Milo is focused',
      message: `This is a high-priority item. Milo suggests breaking it into smaller checklist steps.`,
      tagline: 'Protect your focus.',
    };
  }

  return {
    title: 'Milo is ready',
    message: `Milo can help you manage this item and turn it into a clear plan.`,
    tagline: 'Planning feels lighter together.',
  };
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>{icon}</View>

      <View style={styles.detailTextArea}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function ChecklistItem({
  item,
  onToggle,
}: {
  item: Subtask;
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
          item.completed && {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
          },
        ]}
      >
        {item.completed ? (
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
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
    </TouchableOpacity>
  );
}

export default function TaskDetailsScreen({ navigation, route }: Props) {
  const { tasks, toggleTask, deleteTask, updateTask } = useTasks();
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

    const mood = getTaskMood(task.status, task.dueDate, task.priority);
    const text = getTaskMiloText({
      status: task.status,
      title: task.title,
      dueDate: task.dueDate,
      priority: task.priority,
    });

    return {
      mood,
      ...text,
    };
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
  const completedSubtasks = subtasks.filter((item) => item.completed).length;

  const handleDelete = () => {
    Alert.alert(
      'Delete planner item?',
      'Milo will remove this item from your planner.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
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
          : 'Nice work. Milo marked this item as completed.',
    });
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    const nextSubtasks = subtasks.map((item) =>
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
        mood={miloData.mood}
        title={miloData.title}
        message={miloData.message}
        tagline={miloData.tagline}
        primaryActionLabel={
          task.status === 'completed' ? 'View Analytics' : 'Smart Plan'
        }
        onPrimaryActionPress={() =>
          task.status === 'completed'
            ? navigation.navigate('Analytics')
            : navigation.navigate('MiloPlan', {
                taskId: task.id,
              })
        }
        secondaryActionLabel="Edit"
        onSecondaryActionPress={() =>
          navigation.navigate('EditTask', {
            taskId: task.id,
          })
        }
      />

      <View style={styles.mainCard}>
        <View style={styles.titleRow}>
          <View style={styles.titleArea}>
            <Text style={styles.typeText}>
              {task.plannerType.toUpperCase()} • {task.priority.toUpperCase()}
            </Text>
            <Text style={styles.title}>{task.title}</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.statusButton,
              task.status === 'completed' && styles.statusButtonDone,
            ]}
            onPress={handleToggleTask}
            accessibilityRole="button"
            accessibilityLabel={
              task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'
            }
          >
            <Ionicons
              name={task.status === 'completed' ? 'checkmark' : 'ellipse-outline'}
              size={18}
              color={task.status === 'completed' ? '#FFFFFF' : theme.colors.primaryDark}
            />
          </TouchableOpacity>
        </View>

        {task.description ? (
          <Text style={styles.description}>{task.description}</Text>
        ) : (
          <Text style={styles.descriptionMuted}>
            No description added yet.
          </Text>
        )}

        <View style={styles.detailBox}>
          <DetailRow
            label="Date"
            value={task.dueDate || 'No date selected'}
            icon={
              <Ionicons
                name="calendar-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />

          <DetailRow
            label="Time"
            value={task.dueTime || 'No time selected'}
            icon={
              <Ionicons
                name="time-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />

          <DetailRow
            label="Location"
            value={task.location || 'No location added'}
            icon={
              <Ionicons
                name="location-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />

          <DetailRow
            label="Reminder"
            value={task.reminder || 'none'}
            icon={
              <Ionicons
                name="notifications-outline"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />
        </View>
      </View>

      <SectionHeader
        title="Milo Checklist"
        subtitle={
          subtasks.length > 0
            ? `${completedSubtasks}/${subtasks.length} steps completed`
            : 'Create a smart checklist with Milo.'
        }
        actionLabel={subtasks.length > 0 ? 'Smart Plan' : undefined}
        onActionPress={
          subtasks.length > 0
            ? () =>
                navigation.navigate('MiloPlan', {
                  taskId: task.id,
                })
            : undefined
        }
      />

      {subtasks.length > 0 ? (
        <View style={styles.checklistCard}>
          {subtasks.map((item) => (
            <ChecklistItem
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
          message="Let Milo break this planner item into smaller, easier steps."
          actionLabel="Generate Milo plan"
          onActionPress={() =>
            navigation.navigate('MiloPlan', {
              taskId: task.id,
            })
          }
        />
      )}

      <View style={styles.actionRow}>
        <View style={styles.actionButton}>
          <AppButton
            title={task.status === 'completed' ? 'Mark Pending' : 'Mark Done'}
            onPress={handleToggleTask}
            variant={task.status === 'completed' ? 'secondary' : 'primary'}
            icon={
              <Ionicons
                name={task.status === 'completed' ? 'refresh' : 'checkmark'}
                size={18}
                color={task.status === 'completed' ? theme.colors.primaryDark : '#FFFFFF'}
              />
            }
          />
        </View>

        <View style={styles.actionButton}>
          <AppButton
            title="Delete"
            onPress={handleDelete}
            variant="danger"
            icon={<Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  mainCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleArea: {
    flex: 1,
    paddingRight: 12,
  },
  typeText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 5,
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  statusButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusButtonDone: {
    backgroundColor: theme.colors.primary,
  },
  description: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 14,
  },
  descriptionMuted: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 14,
  },
  detailBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.lg,
    padding: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
  },
  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  detailTextArea: {
    flex: 1,
  },
  detailLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  detailValue: {
    marginTop: 2,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  checklistCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  checklistItem: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  checkCircle: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCD4DD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },
  checklistText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  checklistTextDone: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    marginRight: 10,
  },
});