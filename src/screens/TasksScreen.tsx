import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Image,
  ScrollView,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { PlannerType, Task } from '../types/task';
import { getTaskUrgency } from '../lib/taskUrgency';

const miloFocusedImage = require('../../assets/mascot/milo_focused.png');
const miloWavingImage = require('../../assets/mascot/milo_waving.png');
const miloWorriedImage = require('../../assets/mascot/milo_worried.png');

type FilterType =
  | 'all'
  | 'pending'
  | 'completed'
  | 'task'
  | 'meeting'
  | 'date'
  | 'today'
  | 'upcoming'
  | 'high';

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isUpcomingDate(dateValue?: string) {
  if (!dateValue) return false;

  const today = getTodayDate();
  return dateValue > today;
}

function getTypeConfig(type: PlannerType) {
  if (type === 'meeting') {
    return {
      label: 'Meeting',
      color: theme.colors.purple,
      background: theme.colors.purpleSoft,
      icon: 'people' as const,
    };
  }

  if (type === 'date') {
    return {
      label: 'Date',
      color: theme.colors.yellow,
      background: theme.colors.yellowSoft,
      icon: 'heart' as const,
    };
  }

  return {
    label: 'Task',
    color: theme.colors.primary,
    background: theme.colors.primarySoft,
    icon: 'checkmark-done' as const,
  };
}

function FilterChip({
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
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function TaskCard({
  task,
  onToggle,
  onDelete,
  onOpen,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const isCompleted = task.status === 'completed';
  const typeConfig = getTypeConfig(task.plannerType);
  const urgency = getTaskUrgency(task);
  const urgencyColor = theme.colors[urgency.colorKey];

  const accentColor =
    urgency.level === 'overdue' || urgency.level === 'urgent'
      ? theme.colors.danger
      : urgency.level === 'high'
      ? theme.colors.yellow
      : task.priority === 'high'
      ? theme.colors.yellow
      : task.priority === 'medium'
      ? typeConfig.color
      : theme.colors.blue;

  const checklistCount = task.subtasks?.length || 0;
  const completedChecklistCount =
    task.subtasks?.filter((subtask) => subtask.completed).length || 0;

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.taskCard} onPress={onOpen}>
      <View style={[styles.accentBar, { backgroundColor: typeConfig.color }]} />

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onToggle}
        style={styles.checkboxArea}
      >
        <View style={[styles.checkbox, isCompleted && styles.checkboxCompleted]}>
          {isCompleted && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>

      <View style={styles.taskContent}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={[styles.taskTitle, isCompleted && styles.completedTitle]}
          >
            {task.title}
          </Text>

          <View style={[styles.typeBadge, { backgroundColor: typeConfig.background }]}>
            <Ionicons name={typeConfig.icon} size={11} color={typeConfig.color} />
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>
        </View>

        <Text numberOfLines={2} style={styles.taskDescription}>
          {task.description || 'No description added'}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.priorityPill, { backgroundColor: `${accentColor}22` }]}>
            <Text style={[styles.priorityText, { color: accentColor }]}>
              {task.priority}
            </Text>
          </View>

          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: `${urgencyColor}18`,
                borderColor: `${urgencyColor}45`,
              },
            ]}
          >
            <Text style={[styles.statusPillText, { color: urgencyColor }]}>
              {urgency.label}
            </Text>
          </View>

          <View style={styles.datePill}>
            <Ionicons name="calendar-outline" size={13} color={theme.colors.muted} />
            <Text style={styles.dateText}>{task.dueDate || 'No date'}</Text>
          </View>

          {task.dueTime ? (
            <View style={styles.datePill}>
              <Ionicons name="time-outline" size={13} color={theme.colors.muted} />
              <Text style={styles.dateText}>{task.dueTime}</Text>
            </View>
          ) : null}

          {checklistCount > 0 ? (
            <View style={styles.datePill}>
              <Ionicons name="list-outline" size={13} color={theme.colors.muted} />
              <Text style={styles.dateText}>
                {completedChecklistCount}/{checklistCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.75}
        style={styles.deleteButton}
        onPress={onDelete}
      >
        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function TasksScreen() {
  const navigation = useNavigation<any>();
  const { tasks, toggleTask, deleteTask } = useTasks();

  const [filter, setFilter] = useState<FilterType>('all');
  const [searchText, setSearchText] = useState('');

  const todayDate = getTodayDate();

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (filter === 'pending') {
      result = result.filter((task) => task.status === 'pending');
    }

    if (filter === 'completed') {
      result = result.filter((task) => task.status === 'completed');
    }

    if (filter === 'task' || filter === 'meeting' || filter === 'date') {
      result = result.filter((task) => task.plannerType === filter);
    }

    if (filter === 'today') {
      result = result.filter((task) => task.dueDate === todayDate);
    }

    if (filter === 'upcoming') {
      result = result.filter((task) => isUpcomingDate(task.dueDate));
    }

    if (filter === 'high') {
      result = result.filter((task) => task.priority === 'high');
    }

    if (searchText.trim()) {
      const keyword = searchText.trim().toLowerCase();

      result = result.filter((task) => {
        const title = task.title.toLowerCase();
        const description = task.description?.toLowerCase() || '';
        const location = task.location?.toLowerCase() || '';

        return (
          title.includes(keyword) ||
          description.includes(keyword) ||
          location.includes(keyword)
        );
      });
    }

    return result;
  }, [filter, searchText, tasks, todayDate]);

  const taskStats = useMemo(() => {
    const pending = tasks.filter((task) => task.status === 'pending').length;
    const completed = tasks.filter((task) => task.status === 'completed').length;
    const meetings = tasks.filter((task) => task.plannerType === 'meeting').length;
    const today = tasks.filter((task) => task.dueDate === todayDate).length;

    return {
      total: tasks.length,
      pending,
      completed,
      meetings,
      today,
    };
  }, [tasks, todayDate]);

  const confirmDelete = (task: Task) => {
    Alert.alert(
      'Delete item?',
      `Are you sure you want to delete "${task.title}"?`,
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
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#F9FFFB', '#DDF8E7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        <View style={styles.headerTextArea}>
          <Text style={styles.headerLabel}>Planner Items</Text>
          <Text style={styles.headerTitle}>Manage your focus</Text>
          <Text style={styles.headerSubtitle}>
            Search, filter, and ask Milo to plan your tasks.
          </Text>
        </View>

        <View style={styles.headerMiloCircle}>
          <Image source={miloFocusedImage} style={styles.headerMiloImage} resizeMode="contain" />
        </View>
      </LinearGradient>

      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={20} color={theme.colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks, meetings, dates..."
          placeholderTextColor={theme.colors.muted}
          value={searchText}
          onChangeText={setSearchText}
        />

        {searchText ? (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={20} color={theme.colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{taskStats.total}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: theme.colors.yellow }]}>
            {taskStats.pending}
          </Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: theme.colors.blue }]}>
            {taskStats.completed}
          </Text>
          <Text style={styles.summaryLabel}>Done</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: theme.colors.purple }]}>
            {taskStats.today}
          </Text>
          <Text style={styles.summaryLabel}>Today</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip label="Today" active={filter === 'today'} onPress={() => setFilter('today')} />
        <FilterChip label="Upcoming" active={filter === 'upcoming'} onPress={() => setFilter('upcoming')} />
        <FilterChip label="High" active={filter === 'high'} onPress={() => setFilter('high')} />
        <FilterChip label="Pending" active={filter === 'pending'} onPress={() => setFilter('pending')} />
        <FilterChip label="Done" active={filter === 'completed'} onPress={() => setFilter('completed')} />
        <FilterChip label="Tasks" active={filter === 'task'} onPress={() => setFilter('task')} />
        <FilterChip label="Meetings" active={filter === 'meeting'} onPress={() => setFilter('meeting')} />
        <FilterChip label="Dates" active={filter === 'date'} onPress={() => setFilter('date')} />
      </ScrollView>

      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onToggle={() => toggleTask(item.id)}
            onDelete={() => confirmDelete(item)}
            onOpen={() => navigation.navigate('TaskDetails', { taskId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Image
              source={searchText || filter !== 'all' ? miloWorriedImage : miloWavingImage}
              style={styles.emptyMiloImage}
              resizeMode="contain"
            />

            <Text style={styles.emptyTitle}>No items found</Text>
            <Text style={styles.emptyText}>
              Try another search or filter, or create a new planner item.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.emptyButton}
              onPress={() => navigation.navigate('AddTask')}
            >
              <Text style={styles.emptyButtonText}>Create Item</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  headerCard: {
    borderRadius: theme.radius.xl,
    padding: 18,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...theme.shadow,
  },
  headerTextArea: {
    flex: 1,
    paddingRight: 8,
  },
  headerLabel: {
    fontSize: 13,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 19,
  },
  headerMiloCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -4,
  },
  headerMiloImage: {
    width: 112,
    height: 112,
  },
  searchWrapper: {
    height: 54,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    ...theme.shadow,
  },
  searchInput: {
    flex: 1,
    marginLeft: 9,
    marginRight: 9,
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.primaryDark,
  },
  summaryLabel: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.muted,
  },
  filterRow: {
    paddingBottom: 15,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 10,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontWeight: '800',
    color: theme.colors.muted,
    fontSize: 13,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 130,
  },
  taskCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingVertical: 15,
    paddingHorizontal: 14,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  checkboxArea: {
    marginRight: 12,
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCD4DD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxCompleted: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  taskContent: {
    flex: 1,
    paddingRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  taskTitle: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '900',
    paddingRight: 8,
  },
  completedTitle: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 3,
  },
  taskDescription: {
    marginTop: 4,
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    flexWrap: 'wrap',
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginRight: 9,
    marginBottom: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 9,
    marginBottom: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 9,
    marginBottom: 4,
  },
  dateText: {
    marginLeft: 4,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCard: {
    marginTop: 28,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  emptyMiloImage: {
    width: 135,
    height: 135,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.text,
  },
  emptyText: {
    marginTop: 6,
    color: theme.colors.muted,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 18,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});
