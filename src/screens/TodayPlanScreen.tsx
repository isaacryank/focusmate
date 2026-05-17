import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import {
  getMiloRecommendedTasks,
  getMiloSituationForTask,
} from '../lib/miloSituationIntelligence';
import { Task } from '../types/task';

const miloFocusedImage = require('../../assets/mascot/milo_focused.png');
const miloHappyImage = require('../../assets/mascot/milo_happy.png');
const miloWorriedImage = require('../../assets/mascot/milo_worried.png');
const miloWavingImage = require('../../assets/mascot/milo_waving.png');

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, '0');
  const day = `${today.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getReadableToday() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getPrioritySortRank(priority: Task['priority']) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

function compareByPriorityAndTime(a: Task, b: Task) {
  const firstPriority = getPrioritySortRank(a.priority);
  const secondPriority = getPrioritySortRank(b.priority);

  if (firstPriority !== secondPriority) {
    return firstPriority - secondPriority;
  }

  return (a.dueTime || '').localeCompare(b.dueTime || '');
}

function getTypeConfig(task: Task) {
  if (task.plannerType === 'meeting') {
    return {
      label: 'Meeting',
      color: theme.colors.purple,
      background: theme.colors.purpleSoft,
      icon: 'people' as const,
    };
  }

  if (task.plannerType === 'date') {
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

function TodayItemCard({
  task,
  onPress,
}: {
  task: Task;
  onPress: () => void;
}) {
  const typeConfig = getTypeConfig(task);
  const checklistCount = task.subtasks?.length || 0;
  const checklistDone = task.subtasks?.filter((item) => item.completed).length || 0;
  const isCompleted = task.status === 'completed';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.itemCard, isCompleted && styles.itemCardCompleted]}
      onPress={onPress}
    >
      <View
        style={[
          styles.itemAccent,
          { backgroundColor: isCompleted ? theme.colors.success : typeConfig.color },
        ]}
      />

      <View
        style={[
          styles.itemIcon,
          {
            backgroundColor: isCompleted
              ? theme.colors.successSoft
              : typeConfig.background,
          },
        ]}
      >
        <Ionicons
          name={isCompleted ? 'checkmark-circle' : typeConfig.icon}
          size={20}
          color={isCompleted ? theme.colors.success : typeConfig.color}
        />
      </View>

      <View style={styles.itemTextArea}>
        <View style={styles.itemTopRow}>
          <Text
            style={[styles.itemTitle, isCompleted && styles.itemTitleCompleted]}
            numberOfLines={1}
          >
            {task.title}
          </Text>

          <View style={[styles.typePill, { backgroundColor: typeConfig.background }]}>
            <Text style={[styles.typePillText, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
          </View>

          {isCompleted ? (
            <View style={styles.donePill}>
              <Text style={styles.donePillText}>Done</Text>
            </View>
          ) : null}
        </View>

        <Text
          style={[styles.itemDescription, isCompleted && styles.itemDescriptionCompleted]}
          numberOfLines={2}
        >
          {task.description || 'No description added'}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={theme.colors.muted} />
            <Text style={styles.metaText}>{task.dueTime || 'No time'}</Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons name="flag-outline" size={13} color={theme.colors.muted} />
            <Text style={styles.metaText}>{task.priority}</Text>
          </View>

          {checklistCount > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="list-outline" size={13} color={theme.colors.muted} />
              <Text style={styles.metaText}>
                {checklistDone}/{checklistCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

function EmptyTodayCard({
  onAdd,
}: {
  onAdd: () => void;
}) {
  return (
    <View style={styles.emptyCard}>
      <Image source={miloHappyImage} style={styles.emptyMiloImage} resizeMode="contain" />

      <Text style={styles.emptyTitle}>No item planned today</Text>
      <Text style={styles.emptyText}>
        Your day is free. Add a task, meeting, or important date if Milo should remember something.
      </Text>

      <TouchableOpacity activeOpacity={0.85} style={styles.emptyButton} onPress={onAdd}>
        <Text style={styles.emptyButtonText}>Add Today's Item</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TodayPlanScreen() {
  const navigation = useNavigation<any>();
  const { tasks } = useTasks();

  const todayDate = getTodayDate();

  const planInsights = useMemo(() => {
    const now = new Date();
    const todaysTasks = tasks.filter((task) => task.dueDate === todayDate);
    const sortedPendingToday = getMiloRecommendedTasks(todaysTasks, now);
    const sortedCompletedToday = todaysTasks
      .filter((task) => task.status === 'completed')
      .sort(compareByPriorityAndTime);
    const recommendedTask = sortedPendingToday[0];

    return {
      todayItems: [...sortedPendingToday, ...sortedCompletedToday],
      recommendedTask,
      recommendedSituation: recommendedTask
        ? getMiloSituationForTask(recommendedTask, now)
        : undefined,
    };
  }, [tasks, todayDate]);

  const todayItems = planInsights.todayItems;
  const pendingTodayItems = todayItems.filter((task) => task.status === 'pending');
  const completedTodayItems = todayItems.filter((task) => task.status === 'completed');

  const meetingsToday = todayItems.filter((task) => task.plannerType === 'meeting').length;
  const datesToday = todayItems.filter((task) => task.plannerType === 'date').length;
  const highPriorityToday = pendingTodayItems.filter((task) => task.priority === 'high').length;
  const recommendedTask = planInsights.recommendedTask;
  const recommendedSituation = planInsights.recommendedSituation;
  const hasActiveRecommendation = Boolean(recommendedTask);
  const recommendedNeedsRecovery = recommendedSituation
    ? ['overdue', 'missed'].includes(recommendedSituation.kind)
    : false;

  const miloImage =
    !hasActiveRecommendation && pendingTodayItems.length === 0 && todayItems.length > 0
      ? miloHappyImage
      : recommendedNeedsRecovery
      ? miloWorriedImage
      : highPriorityToday > 0
      ? miloWorriedImage
      : todayItems.length > 0 || hasActiveRecommendation
      ? miloFocusedImage
      : miloWavingImage;

  const miloMessage =
    recommendedTask
      ? `Start with "${recommendedTask.title}". Milo thinks this should come first.`
      : pendingTodayItems.length === 0 && todayItems.length > 0
      ? 'Great job! Everything planned for today is completed.'
      : 'Milo sees a calm day. Nothing active needs focus right now.';

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
            <Text style={styles.heroLabel}>Today's Plan</Text>
            <Text style={styles.heroTitle}>{getReadableToday()}</Text>
            <Text style={styles.heroSubtitle}>{miloMessage}</Text>
          </View>

          <View style={styles.miloBubble}>
            <Image source={miloImage} style={styles.miloImage} resizeMode="contain" />
          </View>
        </LinearGradient>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{todayItems.length}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={[styles.summaryNumber, { color: theme.colors.yellow }]}>
              {pendingTodayItems.length}
            </Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={[styles.summaryNumber, { color: theme.colors.purple }]}>
              {meetingsToday}
            </Text>
            <Text style={styles.summaryLabel}>Meetings</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={[styles.summaryNumber, { color: theme.colors.blue }]}>
              {completedTodayItems.length}
            </Text>
            <Text style={styles.summaryLabel}>Done</Text>
          </View>
        </View>

        {recommendedTask ? (
          <View style={styles.recommendCard}>
            <View style={styles.recommendHeader}>
              <View style={styles.recommendIcon}>
                <Ionicons name="sparkles" size={22} color="#FFFFFF" />
              </View>

              <View style={styles.recommendTextArea}>
                <Text style={styles.recommendLabel}>Milo recommends</Text>
                <Text style={styles.recommendTitle} numberOfLines={2}>
                  {recommendedTask.title}
                </Text>
                <Text style={styles.recommendText}>
                  Milo sorted this first using timing, urgency, and focus needs.
                </Text>
              </View>
            </View>

            <View style={styles.recommendButtons}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.focusButton}
                onPress={() =>
                  navigation.navigate('FocusSession', { taskId: recommendedTask.id })
                }
              >
                <MaterialCommunityIcons name="target" size={20} color="#FFFFFF" />
                <Text style={styles.focusButtonText}>Focus on This</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.detailsButton}
                onPress={() =>
                  navigation.navigate('TaskDetails', { taskId: recommendedTask.id })
                }
              >
                <Text style={styles.detailsButtonText}>Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.quickRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.quickButton}
            onPress={() => navigation.navigate('AddTask')}
          >
            <Ionicons name="add-circle" size={21} color={theme.colors.primaryDark} />
            <Text style={styles.quickButtonText}>Add Item</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.quickButton}
            onPress={() => navigation.navigate('FocusSession')}
          >
            <MaterialCommunityIcons name="target" size={21} color={theme.colors.primaryDark} />
            <Text style={styles.quickButtonText}>Focus Mode</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Agenda</Text>

          <Text style={styles.sectionSubText}>
            {todayItems.length} item(s)
          </Text>
        </View>

        {todayItems.length > 0 ? (
          <View style={styles.itemList}>
            {todayItems.map((task) => (
              <TodayItemCard
                key={task.id}
                task={task}
                onPress={() => navigation.navigate('TaskDetails', { taskId: task.id })}
              />
            ))}
          </View>
        ) : (
          <EmptyTodayCard onAdd={() => navigation.navigate('AddTask')} />
        )}

        <View style={styles.noteCard}>
          <Image source={miloFocusedImage} style={styles.noteMiloImage} resizeMode="contain" />

          <View style={styles.noteTextArea}>
            <Text style={styles.noteTitle}>Why this helps your FYP</Text>
            <Text style={styles.noteText}>
              This screen shows Milo acting as a daily planning assistant. It summarizes the day,
              recommends what to start first, and connects planning with focus mode.
            </Text>
          </View>
        </View>

        <View style={{ height: 110 }} />
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
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  heroSubtitle: {
    marginTop: 7,
    color: theme.colors.textSoft,
    fontWeight: '700',
    lineHeight: 20,
  },
  miloBubble: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
  },
  miloImage: {
    width: 134,
    height: 134,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 18,
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
    color: theme.colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
  },
  summaryLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  recommendCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  recommendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recommendIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recommendTextArea: {
    flex: 1,
  },
  recommendLabel: {
    color: theme.colors.purple,
    fontSize: 12,
    fontWeight: '900',
  },
  recommendTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  recommendText: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 18,
  },
  recommendButtons: {
    flexDirection: 'row',
    marginTop: 15,
  },
  focusButton: {
    flex: 1,
    height: 50,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: 10,
  },
  focusButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginLeft: 7,
  },
  detailsButton: {
    width: 100,
    height: 50,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.purpleSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsButtonText: {
    color: theme.colors.purple,
    fontWeight: '900',
  },
  quickRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  quickButton: {
    flex: 1,
    height: 54,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: 10,
  },
  quickButtonText: {
    marginLeft: 7,
    color: theme.colors.primaryDark,
    fontWeight: '900',
  },
  sectionRow: {
    marginBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 21,
  },
  sectionSubText: {
    color: theme.colors.muted,
    fontWeight: '800',
  },
  itemList: {
    marginBottom: 18,
  },
  itemCard: {
    minHeight: 88,
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 15,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  itemCardCompleted: {
    opacity: 0.72,
  },
  itemAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemTextArea: {
    flex: 1,
    paddingRight: 8,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTitle: {
    flex: 1,
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 15,
    paddingRight: 8,
  },
  itemTitleCompleted: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  typePillText: {
    fontWeight: '900',
    fontSize: 11,
  },
  donePill: {
    borderRadius: 999,
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 6,
  },
  donePillText: {
    color: theme.colors.success,
    fontWeight: '900',
    fontSize: 11,
  },
  itemDescription: {
    marginTop: 5,
    color: theme.colors.muted,
    fontWeight: '600',
    lineHeight: 18,
    fontSize: 13,
  },
  itemDescriptionCompleted: {
    color: theme.colors.muted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 11,
    marginBottom: 3,
  },
  metaText: {
    marginLeft: 4,
    color: theme.colors.textSoft,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 18,
    ...theme.shadow,
  },
  emptyMiloImage: {
    width: 130,
    height: 130,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 21,
  },
  emptyText: {
    marginTop: 7,
    color: theme.colors.muted,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 17,
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  noteCard: {
    backgroundColor: theme.colors.yellowSoft,
    borderRadius: theme.radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteMiloImage: {
    width: 70,
    height: 70,
    marginRight: 10,
  },
  noteTextArea: {
    flex: 1,
  },
  noteTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    marginBottom: 5,
  },
  noteText: {
    color: theme.colors.textSoft,
    fontWeight: '600',
    lineHeight: 20,
  },
});
