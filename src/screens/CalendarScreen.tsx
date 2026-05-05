import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../theme';
import { useTasks } from '../lib/TaskContext';
import { Task } from '../types/task';
import { getTodayDate } from '../lib/miloPersonality';
import { getMiloReaction } from '../lib/miloReaction';
import { getTaskUrgency } from '../lib/taskUrgency';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import PlannerItemCard from '../components/ui/PlannerItemCard';
import EmptyState from '../components/ui/EmptyState';
import AppButton from '../components/ui/AppButton';
import MiloMessageCard from '../components/milo/MiloMessageCard';
import { getMiloImageSource } from '../components/milo/MiloMoodImage';

type DateItem = {
  dateKey: string;
  dayName: string;
  dayNumber: string;
  monthName: string;
  isToday: boolean;
};

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getReadableFullDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function createDateStrip() {
  const today = new Date();

  return Array.from({ length: 14 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index - 3);

    return {
      dateKey: formatDateKey(date),
      dayName: date.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNumber: `${date.getDate()}`,
      monthName: date.toLocaleDateString(undefined, { month: 'short' }),
      isToday: formatDateKey(date) === getTodayDate(),
    };
  });
}

function sortItems(items: Task[]) {
  return [...items].sort((a, b) => {
    const timeA = a.dueTime || '';
    const timeB = b.dueTime || '';

    if (timeA && timeB) {
      return timeA.localeCompare(timeB);
    }

    if (timeA) return -1;
    if (timeB) return 1;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function TypeSummaryCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}22` }]}>
        {icon}
      </View>

      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.summaryTitle}>
        {title}
      </Text>
    </View>
  );
}

function DateStripItem({
  item,
  selected,
  onPress,
}: {
  item: DateItem;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.dateItem,
        selected && styles.dateItemSelected,
        item.isToday && !selected && styles.dateItemToday,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.dayName} ${item.monthName} ${item.dayNumber}`}
    >
      <Text
        style={[
          styles.dateDay,
          selected && styles.dateTextSelected,
        ]}
      >
        {item.dayName}
      </Text>

      <Text
        style={[
          styles.dateNumber,
          selected && styles.dateTextSelected,
        ]}
      >
        {item.dayNumber}
      </Text>

      <Text
        style={[
          styles.dateMonth,
          selected && styles.dateTextSelected,
        ]}
      >
        {item.monthName}
      </Text>

      {item.isToday ? <View style={styles.todayDot} /> : null}
    </TouchableOpacity>
  );
}

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const { tasks, toggleTask } = useTasks();

  const [selectedDate, setSelectedDate] = useState(getTodayDate());

  const dateStrip = useMemo(() => createDateStrip(), []);

  const selectedItems = useMemo(() => {
    return sortItems(tasks.filter((task) => task.dueDate === selectedDate));
  }, [tasks, selectedDate]);

  const reaction = useMemo(() => {
    return getMiloReaction(tasks, { date: selectedDate });
  }, [tasks, selectedDate]);

  const selectedStats = useMemo(() => {
    return {
      tasks: selectedItems.filter((item) => item.plannerType === 'task').length,
      meetings: selectedItems.filter((item) => item.plannerType === 'meeting').length,
      dates: selectedItems.filter((item) => item.plannerType === 'date').length,
      completed: selectedItems.filter((item) => item.status === 'completed').length,
      urgent: selectedItems.filter((item) =>
        ['overdue', 'urgent', 'high'].includes(getTaskUrgency(item).level)
      ).length,
    };
  }, [selectedItems]);

  return (
    <ScreenContainer topPadding={0} bottomPadding={124} includeTopInset={false}>
      <MiloMessageCard
        compact
        mood={reaction.assetKey}
        title={reaction.title}
        message={reaction.message}
        tagline={reaction.secondaryMessage}
        primaryActionLabel={reaction.suggestedActionLabel}
        onPrimaryActionPress={() =>
          reaction.reason === 'high_priority_due_today'
          || reaction.reason === 'dynamic_urgency_due_soon'
            ? navigation.navigate('FocusSession')
            : reaction.reason === 'all_target_day_items_completed'
            ? navigation.navigate('Analytics')
            : reaction.reason === 'no_planner_items'
            ? navigation.navigate('AddTask')
            : navigation.navigate('Tasks')
        }
        secondaryActionLabel="Today"
        onSecondaryActionPress={() => setSelectedDate(getTodayDate())}
      />

      <View style={styles.dateHeader}>
        <View>
          <Text style={styles.dateHeaderTitle}>Selected Day</Text>
          <Text style={styles.dateHeaderSubtitle}>
            {getReadableFullDate(selectedDate)}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.todayButton}
          onPress={() => setSelectedDate(getTodayDate())}
          accessibilityRole="button"
          accessibilityLabel="Jump to today"
        >
          <Ionicons name="today-outline" size={15} color={theme.colors.primaryDark} />
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStrip}
      >
        {dateStrip.map((item) => (
          <DateStripItem
            key={item.dateKey}
            item={item}
            selected={selectedDate === item.dateKey}
            onPress={() => setSelectedDate(item.dateKey)}
          />
        ))}
      </ScrollView>

      <View style={styles.summaryGrid}>
        <TypeSummaryCard
          title="Tasks"
          value={selectedStats.tasks}
          color={theme.colors.primaryDark}
          icon={
            <Ionicons
              name="checkmark-circle-outline"
              size={19}
              color={theme.colors.primaryDark}
            />
          }
        />

        <TypeSummaryCard
          title="Meetings"
          value={selectedStats.meetings}
          color={theme.colors.purple}
          icon={
            <Ionicons
              name="people-outline"
              size={19}
              color={theme.colors.purple}
            />
          }
        />

        <TypeSummaryCard
          title="Dates"
          value={selectedStats.dates}
          color={theme.colors.yellow}
          icon={
            <Ionicons
              name="calendar-outline"
              size={19}
              color={theme.colors.yellow}
            />
          }
        />

        <TypeSummaryCard
          title="Done"
          value={selectedStats.completed}
          color={theme.colors.blue}
          icon={
            <Ionicons
              name="checkmark-done-outline"
              size={19}
              color={theme.colors.blue}
            />
          }
        />
      </View>

      {selectedStats.urgent > 0 ? (
        <View style={styles.urgencyNotice}>
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={theme.colors.danger}
          />
          <Text style={styles.urgencyNoticeText}>
            {selectedStats.urgent} urgent item(s) need an early step.
          </Text>
        </View>
      ) : null}

      <SectionHeader
        title="Planner Items"
        subtitle={
          selectedItems.length > 0
            ? `${selectedItems.length} item(s) scheduled`
            : 'Nothing planned yet.'
        }
      />

      {selectedItems.length > 0 ? (
        <View style={styles.itemList}>
          {selectedItems.map((task) => (
            <PlannerItemCard
              key={task.id}
              task={task}
              onToggle={() => toggleTask(task.id)}
              onPress={() =>
                navigation.navigate('TaskDetails', {
                  taskId: task.id,
                })
              }
            />
          ))}
        </View>
      ) : (
        <EmptyState
          imageSource={getMiloImageSource('happy')}
          title="No plan for this day"
          message="Add something for this day."
          actionLabel="Create planner item"
          onActionPress={() => navigation.navigate('AddTask')}
        />
      )}

      <View style={styles.bottomActions}>
        <View style={styles.bottomButton}>
          <AppButton
            title="Add Item"
            onPress={() => navigation.navigate('AddTask')}
            icon={<Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />}
          />
        </View>

        <View style={styles.bottomButton}>
          <AppButton
            title="Focus"
            variant="secondary"
            onPress={() => navigation.navigate('FocusSession')}
            icon={
              <MaterialCommunityIcons
                name="target"
                size={18}
                color={theme.colors.primaryDark}
              />
            }
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  dateHeader: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateHeaderTitle: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  dateHeaderSubtitle: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  todayButton: {
    marginLeft: 'auto',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayButtonText: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  dateStrip: {
    paddingBottom: 12,
  },
  dateItem: {
    width: 66,
    minHeight: 82,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadowSoft,
  },
  dateItemSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  dateItemToday: {
    borderColor: theme.colors.primary,
  },
  dateDay: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  dateNumber: {
    marginTop: 4,
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  dateMonth: {
    marginTop: 1,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  dateTextSelected: {
    color: '#FFFFFF',
  },
  todayDot: {
    marginTop: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.yellow,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  summaryTitle: {
    marginTop: 1,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  urgencyNotice: {
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD6D6',
  },
  urgencyNoticeText: {
    flex: 1,
    marginLeft: 8,
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  itemList: {
    marginBottom: 14,
  },
  bottomActions: {
    flexDirection: 'row',
    marginTop: 4,
  },
  bottomButton: {
    flex: 1,
    marginRight: 10,
  },
});
