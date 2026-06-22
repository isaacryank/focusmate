import React, { useLayoutEffect, useMemo } from 'react';
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
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
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

function getPriorityColor(priority: Task['priority']) {
  if (priority === 'high') return theme.colors.danger;
  if (priority === 'medium') return theme.colors.yellow;
  return theme.colors.primary;
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
  const priorityColor = getPriorityColor(task.priority);

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
            borderColor: isCompleted ? '#B7E6C3' : typeConfig.background,
          },
        ]}
      >
        <Ionicons
          name={isCompleted ? 'checkmark-circle' : typeConfig.icon}
          size={22}
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

          <View
            style={[
              styles.typePill,
              {
                backgroundColor: typeConfig.background,
                borderColor: typeConfig.color,
              },
            ]}
          >
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
            <Ionicons name="time-outline" size={14} color={theme.colors.textSoft} />
            <Text style={styles.metaText}>{task.dueTime || 'No time'}</Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons name="flag-outline" size={14} color={priorityColor} />
            <Text style={[styles.metaText, { color: priorityColor }]}>{task.priority}</Text>
          </View>

          {checklistCount > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="list-outline" size={14} color={theme.colors.textSoft} />
              <Text style={styles.metaText}>
                {checklistDone}/{checklistCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.itemChevron}>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

function SummaryMetric({
  value,
  label,
  color,
  iconFamily = 'ion',
  iconName,
}: {
  value: number;
  label: string;
  color: string;
  iconFamily?: 'ion' | 'material';
  iconName: any;
}) {
  return (
    <View style={styles.summaryMetric}>
      <View
        style={[
          styles.summaryIconBubble,
          { backgroundColor: `${color}18`, borderColor: `${color}42` },
        ]}
      >
        {iconFamily === 'material' ? (
          <MaterialCommunityIcons name={iconName} size={21} color={color} />
        ) : (
          <Ionicons name={iconName} size={21} color={color} />
        )}
      </View>
      <Text style={[styles.summaryNumber, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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
        <Ionicons name="add" size={17} color="#FFFFFF" />
        <Text style={styles.emptyButtonText}>Add Today's Item</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TodayPlanScreen() {
  const { isDark } = useFocusMateTheme();

  const navigation = useNavigation<any>();
  const { tasks } = useTasks();

  useLayoutEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  const openCalendar = () => {
    const routeNames = navigation.getState?.()?.routeNames || [];

    if (routeNames.includes('Calendar')) {
      navigation.navigate('Calendar');
      return;
    }

    if (routeNames.includes('CalendarScreen')) {
      navigation.navigate('CalendarScreen');
    }
  };

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
  const heroGradientColors = isDark
    ? ([
        theme.colors.card,
        theme.colors.surface,
        theme.colors.backgroundSoft,
      ] as const)
    : (['#FBFFFC', '#E7FBEF', '#D9F5E5'] as const);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundBlobTop} />
      <View style={styles.backgroundBlobBottom} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.customHeader}>
          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.headerButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={23} color={theme.colors.text} />
          </TouchableOpacity>

          <Text style={styles.customHeaderTitle}>Today&apos;s Plan</Text>

          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.headerButton}
            onPress={openCalendar}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
          >
            <Ionicons name="calendar-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <LinearGradient
          colors={heroGradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, isDark && styles.heroCardDark]}
        >
          <View style={[styles.heroCircle, isDark && styles.heroCircleDark]} />
          <View style={[styles.heroGround, isDark && styles.heroGroundDark]} />
          <View style={[styles.sparkleDot, styles.sparkleDotOne]} />
          <View style={[styles.sparkleDot, styles.sparkleDotTwo]} />
          <View style={[styles.sparkleDot, styles.sparkleDotThree]} />

          <View style={styles.heroTextArea}>
            <View style={[styles.heroLabelPill, isDark && styles.heroLabelPillDark]}>
              <Ionicons name="calendar-outline" size={14} color={theme.colors.primaryDark} />
              <Text style={styles.heroLabel}>Today's Plan</Text>
            </View>

            <Text style={styles.heroTitle}>{getReadableToday()}</Text>
            <Text style={styles.heroSubtitle}>{miloMessage}</Text>
          </View>

          <View style={[styles.miloBubble, isDark && styles.miloBubbleDark]}>
            <Image source={miloImage} style={styles.miloImage} resizeMode="contain" />
          </View>
        </LinearGradient>

        <View style={styles.summaryStrip}>
          <SummaryMetric
            value={todayItems.length}
            label="Total"
            color={theme.colors.primaryDark}
            iconName="calendar-outline"
          />
          <View style={styles.summaryDivider} />
          <SummaryMetric
            value={pendingTodayItems.length}
            label="Pending"
            color={theme.colors.yellow}
            iconFamily="material"
            iconName="timer-sand"
          />
          <View style={styles.summaryDivider} />
          <SummaryMetric
            value={meetingsToday}
            label="Meetings"
            color={theme.colors.purple}
            iconName="people-outline"
          />
          <View style={styles.summaryDivider} />
          <SummaryMetric
            value={completedTodayItems.length}
            label="Done"
            color={theme.colors.blue}
            iconName="checkmark-circle-outline"
          />
        </View>

        {recommendedTask ? (
          <View style={styles.recommendCard}>
            <View style={styles.recommendTopLine} />
            <View style={styles.recommendContentRow}>
              <View style={styles.recommendIcon}>
                <Ionicons name="sparkles" size={24} color="#FFFFFF" />
              </View>

              <View style={styles.recommendTextArea}>
                <Text style={styles.recommendLabel}>Milo recommends</Text>
                <Text style={styles.recommendTitle} numberOfLines={1}>
                  {recommendedTask.title}
                </Text>
                <Text style={styles.recommendText} numberOfLines={2}>
                  Milo sorted this first using timing, urgency, and focus needs.
                </Text>
              </View>

              <View style={styles.targetMark}>
                <View style={styles.targetRingOuter}>
                  <View style={styles.targetRingMiddle}>
                    <View style={styles.targetRingInner} />
                  </View>
                </View>
                <MaterialCommunityIcons
                  name="arrow-top-right-thick"
                  size={24}
                  color={theme.colors.primary}
                  style={styles.targetArrow}
                />
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
                <MaterialCommunityIcons name="target" size={18} color="#FFFFFF" />
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
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primaryDark} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.agendaDivider} />

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Agenda</Text>

          <Text style={styles.sectionSubText}>{todayItems.length} item(s)</Text>
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

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5FCF6',
  },
  backgroundBlobTop: {
    position: 'absolute',
    right: -64,
    top: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(88, 176, 106, 0.12)',
  },
  backgroundBlobBottom: {
    position: 'absolute',
    left: -72,
    bottom: 120,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(44, 150, 78, 0.08)',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  customHeader: {
    height: 78,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.15,
    borderColor: '#DDEDE0',
    borderBottomWidth: 2.4,
    shadowColor: '#1A7D3D',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  customHeaderTitle: {
    position: 'absolute',
    left: 76,
    right: 76,
    textAlign: 'center',
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: -0.3,
  },
  heroCard: {
    minHeight: 238,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 18,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  heroCardDark: {
    borderRadius: 28,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 8,
  },
  heroCircle: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(213,238,220,0.92)',
  },
  heroCircleDark: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
  },
  heroGround: {
    position: 'absolute',
    right: -38,
    bottom: 6,
    width: 300,
    height: 48,
    borderRadius: 60,
    backgroundColor: 'rgba(123, 198, 115, 0.24)',
  },
  heroGroundDark: {
    backgroundColor: theme.colors.cardSoft,
  },
  sparkleDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(55, 166, 83, 0.32)',
  },
  sparkleDotOne: {
    right: 150,
    top: 42,
  },
  sparkleDotTwo: {
    right: 90,
    top: 28,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  sparkleDotThree: {
    right: 132,
    bottom: 44,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  heroTextArea: {
    flex: 1,
    paddingLeft: 2,
    paddingRight: 6,
    zIndex: 2,
  },
  heroLabelPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginBottom: 13,
    backgroundColor: 'rgba(221, 247, 229, 0.96)',
    borderWidth: 1.2,
    borderColor: '#C4EBCD',
  },
  heroLabelPillDark: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
  },
  heroLabel: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 6,
  },
  heroTitle: {
    color: theme.colors.primaryDark,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 46,
  },
  heroSubtitle: {
    marginTop: 14,
    color: theme.colors.textSoft,
    fontWeight: '800',
    lineHeight: 22,
    maxWidth: 250,
    fontSize: 15,
  },
  miloBubble: {
    width: 176,
    height: 176,
    borderRadius: 88,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -8,
    zIndex: 2,
  },
  miloBubbleDark: {
    backgroundColor: theme.colors.cardSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  miloImage: {
    width: 184,
    height: 184,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#DDEDE0',
    borderBottomWidth: 2.5,
    shadowColor: '#1A7D3D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 11,
    elevation: 4,
  },
  summaryCardSpacing: {
    marginRight: 9,
  },
  summaryNumber: {
    color: theme.colors.primaryDark,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  summaryLabel: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 1,
  },
  recommendTopLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  recommendContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  targetMark: {
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  targetRingOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 7,
    borderColor: 'rgba(72, 171, 91, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(72, 171, 91, 0.06)',
  },
  targetRingMiddle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 5,
    borderColor: 'rgba(72, 171, 91, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetRingInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(72, 171, 91, 0.36)',
  },
  targetArrow: {
    position: 'absolute',
    right: 15,
    top: 15,
    transform: [{ rotate: '-8deg' }],
  },
  recommendCard: {
    paddingVertical: 17,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(193, 216, 198, 0.65)',
  },
  recommendGlow: {
    position: 'absolute',
    right: -30,
    top: -36,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(136, 99, 224, 0.1)',
  },
  recommendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recommendIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
    borderWidth: 1.3,
    borderColor: '#6BBE7D',
    borderBottomWidth: 3,
    shadowColor: '#1A7D3D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  recommendTextArea: {
    flex: 1,
    paddingRight: 10,
  },
  recommendLabel: {
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  recommendTitle: {
    marginTop: 3,
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  recommendText: {
    marginTop: 4,
    color: theme.colors.muted,
    fontWeight: '700',
    lineHeight: 18,
    fontSize: 13,
  },
  recommendButtons: {
    flexDirection: 'row',
    marginTop: 15,
    marginLeft: 71,
  },
  focusButton: {
    flex: 1,
    height: 46,
    borderRadius: 17,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: 10,
    borderWidth: 1.2,
    borderColor: '#4AA463',
    borderBottomWidth: 3,
    shadowColor: '#1A7D3D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  focusButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginLeft: 7,
  },
  detailsButton: {
    width: 98,
    height: 46,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1.2,
    borderColor: '#DAE9DE',
    borderBottomWidth: 2.5,
    shadowColor: '#1A7D3D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  detailsButtonText: {
    color: theme.colors.primaryDark,
    fontWeight: '900',
    marginRight: 4,
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    marginBottom: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(193, 216, 198, 0.65)',
  },
  summaryMetric: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.2,
    marginBottom: 7,
  },
  summaryDivider: {
    width: 1,
    height: 54,
    backgroundColor: 'rgba(193, 216, 198, 0.82)',
  },
  agendaDivider: {
    height: 1,
    backgroundColor: 'rgba(193, 216, 198, 0.65)',
    marginTop: 8,
    marginBottom: 20,
  },
  sectionRow: {
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: -0.2,
  },
  sectionSubText: {
    color: theme.colors.muted,
    fontWeight: '800',
  },
  itemList: {
    marginBottom: 18,
  },
  itemCard: {
    minHeight: 82,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    padding: 13,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.1,
    borderColor: '#DCEBDF',
    borderBottomWidth: 2,
    shadowColor: '#1A7D3D',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
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
    width: 50,
    height: 50,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.1,
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
    fontSize: 16,
    paddingRight: 8,
  },
  itemTitleCompleted: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
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
    borderWidth: 1,
    borderColor: '#BCE9C7',
  },
  donePillText: {
    color: theme.colors.success,
    fontWeight: '900',
    fontSize: 11,
  },
  itemDescription: {
    marginTop: 5,
    color: theme.colors.muted,
    fontWeight: '700',
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
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  itemChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F6FBF7',
    borderWidth: 1,
    borderColor: '#E1EEE4',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.xl,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#DDEDE0',
    borderBottomWidth: 2.5,
    marginBottom: 18,
    shadowColor: '#1A7D3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
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
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#72C184',
    borderBottomWidth: 3,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginLeft: 6,
  },
});
