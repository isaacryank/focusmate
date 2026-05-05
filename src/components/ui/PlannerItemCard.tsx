import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../../theme';
import { Task } from '../../types/task';
import { getTaskUrgency } from '../../lib/taskUrgency';

type PlannerItemCardProps = {
  task: Task;
  onPress: () => void;
  onToggle?: () => void;
  compact?: boolean;
};

function getTypeAccent(task: Task) {
  if (task.plannerType === 'meeting') return theme.colors.purple;
  if (task.plannerType === 'date') return theme.colors.yellow;
  return theme.colors.primary;
}

function getStatusAccent(task: Task) {
  const urgency = getTaskUrgency(task);

  if (urgency.level === 'overdue' || urgency.level === 'urgent') {
    return theme.colors.danger;
  }

  if (urgency.level === 'high') {
    return theme.colors.yellow;
  }

  if (urgency.level === 'medium') return theme.colors.blue;
  if (urgency.level === 'done') return theme.colors.success;
  if (task.priority === 'high') return theme.colors.yellow;
  if (task.priority === 'low') return theme.colors.blue;
  return theme.colors.primary;
}

function getTypeLabel(task: Task) {
  if (task.plannerType === 'meeting') return 'Meeting';
  if (task.plannerType === 'date') return 'Date';
  return 'Task';
}

function getIcon(task: Task) {
  if (task.plannerType === 'meeting') return 'people-outline';
  if (task.plannerType === 'date') return 'calendar-outline';
  return 'checkmark-circle-outline';
}

export default function PlannerItemCard({
  task,
  onPress,
  onToggle,
  compact = false,
}: PlannerItemCardProps) {
  const typeAccent = getTypeAccent(task);
  const statusAccent = getStatusAccent(task);
  const urgency = getTaskUrgency(task);
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter((item) => item.completed).length;
  const dueText = [task.dueDate, task.dueTime].filter(Boolean).join(' • ');

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.card, compact && styles.compactCard]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
    >
      <View style={[styles.accentBar, { backgroundColor: statusAccent }]} />

      <TouchableOpacity
        activeOpacity={onToggle ? 0.7 : 1}
        style={[
          styles.checkCircle,
          task.status === 'completed' && {
            backgroundColor: statusAccent,
            borderColor: statusAccent,
          },
        ]}
        onPress={onToggle}
        disabled={!onToggle}
        accessibilityRole="button"
        accessibilityLabel={
          task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'
        }
      >
        {task.status === 'completed' ? (
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
        ) : null}
      </TouchableOpacity>

      <View style={styles.textArea}>
        <Text numberOfLines={1} style={styles.title}>
          {task.title}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.typePill, { backgroundColor: `${typeAccent}20` }]}>
            <Ionicons name={getIcon(task) as any} size={12} color={typeAccent} />
            <Text style={[styles.typeText, { color: typeAccent }]}>
              {getTypeLabel(task)}
            </Text>
          </View>

          <View
            style={[
              styles.urgencyPill,
              {
                backgroundColor: `${statusAccent}18`,
                borderColor: `${statusAccent}40`,
              },
            ]}
          >
            <Text style={[styles.urgencyText, { color: statusAccent }]}>
              {urgency.label}
            </Text>
          </View>

          {dueText ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={theme.colors.muted} />
              <Text numberOfLines={1} style={styles.metaText}>
                {dueText}
              </Text>
            </View>
          ) : null}

          {subtasks.length > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="list-outline" size={12} color={theme.colors.muted} />
              <Text style={styles.metaText}>
                {completedSubtasks}/{subtasks.length}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.muted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 72,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginBottom: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  compactCard: {
    minHeight: 66,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  checkCircle: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCD4DD',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  title: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  typePill: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeText: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: '900',
  },
  urgencyPill: {
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 7,
  },
  urgencyText: {
    fontSize: 10,
    fontWeight: '900',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 7,
    maxWidth: 150,
  },
  metaText: {
    marginLeft: 4,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
});
