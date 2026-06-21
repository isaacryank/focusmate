import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { useTasks } from '../lib/TaskContext';
import { PlannerType, Task } from '../types/task';
import { getTaskUrgency } from '../lib/taskUrgency';
import { openLocationInMaps } from '../lib/mapUtils';
import {
  deleteOnlineMeetingLinkForTask,
  loadOnlineMeetingLinks,
} from '../lib/meetingLinkStorage';
import type { OnlineMeetingLink } from '../lib/meetingLinkStorage';
import { openMeetingLink } from '../lib/meetingLinkUtils';

const miloFocusedImage = require('../../assets/mascot/milo_focused.png');
const miloWavingImage = require('../../assets/mascot/milo_waving.png');
const miloWorriedImage = require('../../assets/mascot/milo_worried.png');
const miloCelebratingImage = require('../../assets/mascot/milo_celebrating.png');

type IconName = React.ComponentProps<typeof Ionicons>['name'];

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

function buildMeetingLinksByTaskId(meetingLinks: OnlineMeetingLink[]) {
  return meetingLinks.reduce<Record<string, OnlineMeetingLink>>(
    (lookup, meetingLink) => ({
      ...lookup,
      [meetingLink.taskId]: meetingLink,
    }),
    {}
  );
}

const filterOptions: { label: string; value: FilterType; iconName: IconName }[] = [
  { label: 'All', value: 'all', iconName: 'sparkles' },
  { label: 'Tasks', value: 'task', iconName: 'checkbox-outline' },
  { label: 'Meetings', value: 'meeting', iconName: 'people-outline' },
  { label: 'Dates', value: 'date', iconName: 'heart-outline' },
  { label: 'High Focus', value: 'high', iconName: 'flame-outline' },
];

function getTaskMiloImage(task: Task): ImageSourcePropType {
  if (task.status === 'completed') return miloCelebratingImage;
  if (task.priority === 'high') return miloWorriedImage;
  if (task.plannerType === 'meeting') return miloFocusedImage;
  if (task.plannerType === 'date') return miloWavingImage;

  return miloFocusedImage;
}

function getPriorityTone(priority: Task['priority'], fallbackColor: string) {
  if (priority === 'high') {
    return {
      color: theme.colors.warning,
      backgroundColor: theme.colors.warningSoft,
      borderColor: `${theme.colors.warning}45`,
    };
  }

  if (priority === 'medium') {
    return {
      color: fallbackColor,
      backgroundColor: `${fallbackColor}18`,
      borderColor: `${fallbackColor}36`,
    };
  }

  return {
    color: theme.colors.blue,
    backgroundColor: theme.colors.blueSoft,
    borderColor: `${theme.colors.blue}35`,
  };
}

function getMeetingChipLabel(meetingLink: OnlineMeetingLink) {
  if (meetingLink.provider === 'Custom') {
    return meetingLink.label ? `Online (${meetingLink.label})` : 'Online Meeting';
  }

  return `Online (${meetingLink.provider})`;
}

function FilterChip({
  label,
  iconName,
  active,
  onPress,
}: {
  label: string;
  iconName: IconName;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Ionicons
        name={iconName}
        size={13}
        color={active ? theme.colors.white : theme.colors.primaryDark}
      />
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function StatSummaryCard({
  label,
  value,
  iconName,
  color,
  backgroundColor,
}: {
  label: string;
  value: number;
  iconName: IconName;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor }]}>
      <View style={[styles.summaryIconWrap, { backgroundColor: `${color}18` }]}>
        <Ionicons name={iconName} size={16} color={color} />
      </View>
      <Text style={[styles.summaryNumber, { color }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.summaryLabel}>
        {label}
      </Text>
    </View>
  );
}

function TaskMetaChip({
  iconName,
  label,
  color,
  backgroundColor,
  borderColor,
}: {
  iconName?: IconName;
  label: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <View style={[styles.metaChip, { backgroundColor, borderColor }]}>
      {iconName ? <Ionicons name={iconName} size={12} color={color} /> : null}
      <Text
        numberOfLines={1}
        style={[styles.metaChipText, !iconName && styles.metaChipTextSolo, { color }]}
      >
        {label}
      </Text>
    </View>
  );
}

function TaskInfoPill({
  iconName,
  label,
  tone,
}: {
  iconName: IconName;
  label: string;
  tone: 'location' | 'meeting';
}) {
  const color = tone === 'location' ? theme.colors.primaryDark : theme.colors.purple;
  const containerStyle =
    tone === 'location' ? styles.locationInfoPill : styles.meetingInfoPill;

  return (
    <View style={[styles.infoPill, containerStyle]}>
      <Ionicons name={iconName} size={14} color={color} />
      <Text numberOfLines={1} style={[styles.infoPillText, { color }]}>
        {label}
      </Text>
    </View>
  );
}

function TaskActionButton({
  label,
  iconName,
  tone,
  onPress,
}: {
  label: string;
  iconName: IconName;
  tone: 'maps' | 'join';
  onPress: () => void;
}) {
  const colors =
    tone === 'join'
      ? {
          backgroundColor: theme.colors.primaryDark,
          borderColor: theme.colors.primaryDark,
          color: theme.colors.white,
        }
      : {
          backgroundColor: theme.colors.surface,
          borderColor: '#CFEFDA',
          color: theme.colors.primaryDark,
        };

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={[
        styles.taskActionButton,
        {
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
        },
      ]}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={iconName} size={13} color={colors.color} />
      <Text numberOfLines={1} style={[styles.taskActionText, { color: colors.color }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function TaskCard({
  task,
  meetingLink,
  onToggle,
  onDelete,
  onOpen,
  onOpenMaps,
  onJoinMeeting,
}: {
  task: Task;
  meetingLink?: OnlineMeetingLink;
  onToggle: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onOpenMaps: () => void;
  onJoinMeeting: () => void;
}) {
  const { isDark } = useFocusMateTheme();
  const isCompleted = task.status === 'completed';
  const typeConfig = getTypeConfig(task.plannerType);
  const urgency = getTaskUrgency(task);
  const urgencyColor = theme.colors[urgency.colorKey];
  const priorityTone = getPriorityTone(task.priority, typeConfig.color);
  const neutralChipBackground = isDark ? theme.colors.input : '#F9FBFA';
  const neutralChipBorder = isDark ? theme.colors.border : '#E2EEE7';

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
  const description = task.description?.trim();
  const location = task.location?.trim();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.taskCard,
        isCompleted && styles.taskCardCompleted,
        pressed && styles.taskCardPressed,
      ]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open details for ${task.title}`}
    >
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      <View style={styles.taskTopRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          style={styles.checkboxArea}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isCompleted }}
          accessibilityLabel={`Mark ${task.title} as ${
            isCompleted ? 'pending' : 'completed'
          }`}
        >
          <View style={[styles.checkbox, isCompleted && styles.checkboxCompleted]}>
            {isCompleted && <Ionicons name="checkmark" size={17} color="#FFFFFF" />}
          </View>
        </TouchableOpacity>

        <View
          style={[
            styles.taskMiloBubble,
            { backgroundColor: typeConfig.background },
          ]}
        >
          <Image
            source={getTaskMiloImage(task)}
            style={styles.taskMiloImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.taskContent}>
          <Text
            numberOfLines={1}
            style={[styles.taskTitle, isCompleted && styles.completedTitle]}
          >
            {task.title}
          </Text>

          {description ? (
            <Text numberOfLines={1} style={styles.taskDescription}>
              {description}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardRightRail}>
          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: typeConfig.background,
                borderColor: `${typeConfig.color}30`,
              },
            ]}
          >
            <Ionicons name={typeConfig.icon} size={11} color={typeConfig.color} />
            <Text
              numberOfLines={1}
              style={[styles.typeBadgeText, { color: typeConfig.color }]}
            >
              {typeConfig.label}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.deleteButton}
            onPress={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${task.title}`}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.metaRow}>
        <TaskMetaChip
          label={`${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)}`}
          color={priorityTone.color}
          backgroundColor={priorityTone.backgroundColor}
          borderColor={priorityTone.borderColor}
        />
        <TaskMetaChip
          label={urgency.label}
          color={urgencyColor}
          backgroundColor={`${urgencyColor}14`}
          borderColor={`${urgencyColor}35`}
        />
        <TaskMetaChip
          iconName="calendar-outline"
          label={task.dueDate || 'Any day'}
          color={theme.colors.textSoft}
          backgroundColor={neutralChipBackground}
          borderColor={neutralChipBorder}
        />
        {task.dueTime ? (
          <TaskMetaChip
            iconName="time-outline"
            label={task.dueTime}
            color={theme.colors.textSoft}
            backgroundColor={neutralChipBackground}
            borderColor={neutralChipBorder}
          />
        ) : null}
        {checklistCount > 0 ? (
          <TaskMetaChip
            iconName="list-outline"
            label={`${completedChecklistCount}/${checklistCount}`}
            color={theme.colors.textSoft}
            backgroundColor={neutralChipBackground}
            borderColor={neutralChipBorder}
          />
        ) : null}
      </View>

      {location || meetingLink ? (
        <View style={styles.utilityRow}>
          <View style={styles.utilityPillRow}>
            {location ? (
              <TaskInfoPill
                iconName="location-outline"
                label={location}
                tone="location"
              />
            ) : null}

            {meetingLink ? (
              <TaskInfoPill
                iconName="videocam-outline"
                label={getMeetingChipLabel(meetingLink)}
                tone="meeting"
              />
            ) : null}
          </View>

          <View style={styles.utilityActionRow}>
            {location ? (
              <TaskActionButton
                label="Open Maps"
                iconName="navigate-outline"
                tone="maps"
                onPress={onOpenMaps}
              />
            ) : null}

            {meetingLink ? (
              <TaskActionButton
                label="Join"
                iconName="videocam"
                tone="join"
                onPress={onJoinMeeting}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function TasksScreen() {
  const { isDark } = useFocusMateTheme();

  const navigation = useNavigation<any>();
  const { tasks, toggleTask, deleteTask } = useTasks();

  const [filter, setFilter] = useState<FilterType>('all');
  const [searchText, setSearchText] = useState('');
  const [meetingLinksByTaskId, setMeetingLinksByTaskId] = useState<
    Record<string, OnlineMeetingLink>
  >({});

  const todayDate = getTodayDate();

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      loadOnlineMeetingLinks()
        .then((meetingLinks) => {
          if (isActive) {
            setMeetingLinksByTaskId(buildMeetingLinksByTaskId(meetingLinks));
          }
        })
        .catch((error) => {
          console.warn('Failed to load online meeting links:', error);

          if (isActive) {
            setMeetingLinksByTaskId({});
          }
        });

      return () => {
        isActive = false;
      };
    }, [])
  );

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
        const meetingLink = meetingLinksByTaskId[task.id];
        const meetingLinkText = [
          meetingLink?.provider,
          meetingLink?.label,
          meetingLink?.url,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return (
          title.includes(keyword) ||
          description.includes(keyword) ||
          location.includes(keyword) ||
          meetingLinkText.includes(keyword)
        );
      });
    }

    return result;
  }, [filter, meetingLinksByTaskId, searchText, tasks, todayDate]);

  const taskStats = useMemo(() => {
    const pending = tasks.filter((task) => task.status === 'pending').length;
    const completed = tasks.filter((task) => task.status === 'completed').length;
    const today = tasks.filter((task) => task.dueDate === todayDate).length;

    return {
      total: tasks.length,
      pending,
      completed,
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
            await deleteOnlineMeetingLinkForTask(task.id).catch(() => undefined);
            await deleteTask(task.id);
          },
        },
      ]
    );
  };

  const confirmJoinMeeting = (meetingLink?: OnlineMeetingLink) => {
    if (!meetingLink?.url) {
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
          onPress: () => void openMeetingLink(meetingLink.url),
        },
      ]
    );
  };

  const confirmOpenMaps = (location?: string) => {
    const trimmedLocation = location?.trim();

    if (!trimmedLocation) {
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
          onPress: () => void openLocationInMaps(trimmedLocation),
        },
      ]
    );
  };

  const hasActiveFilters = filter !== 'all' || Boolean(searchText.trim());
  const heroGradientColors = isDark
    ? (['#12362E', '#111B21'] as const)
    : (['#F8FFF9', '#DDF7E6'] as const);
  const summaryBackgrounds = {
    total: isDark ? theme.colors.card : '#F5FCF7',
    pending: isDark ? theme.colors.warningSoft : '#FFF9EB',
    completed: isDark ? theme.colors.blueSoft : '#F4FAFF',
    today: isDark ? theme.colors.purpleSoft : '#F8F5FF',
  };

  const resetSearchAndFilters = () => {
    setSearchText('');
    setFilter('all');
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        style={styles.taskList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <LinearGradient
              colors={heroGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerCard}
            >
              <View style={styles.heroGlowLarge} />
              <View style={styles.heroGlowSmall} />

              <View style={styles.headerTextArea}>
                <Text style={styles.headerLabel}>Milo Planner</Text>
                <Text style={styles.headerTitle}>Let's plan your best focus day!</Text>
                <Text style={styles.headerSubtitle}>
                  Search, filter, and ask Milo to plan your tasks.
                </Text>
              </View>

              <View style={styles.headerMiloCircle}>
                <Image
                  source={miloFocusedImage}
                  style={styles.headerMiloImage}
                  resizeMode="contain"
                />
              </View>
            </LinearGradient>

            <View style={styles.searchRow}>
              <View style={styles.searchWrapper}>
                <Ionicons name="search-outline" size={18} color={theme.colors.muted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search tasks, meetings, dates..."
                  placeholderTextColor={theme.colors.muted}
                  value={searchText}
                  onChangeText={setSearchText}
                />

                {searchText ? (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setSearchText('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons name="close-circle" size={18} color={theme.colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.filterIconButton,
                  hasActiveFilters && styles.filterIconButtonActive,
                ]}
                onPress={resetSearchAndFilters}
                accessibilityRole="button"
                accessibilityLabel="Reset search and filters"
              >
                <Ionicons
                  name="options-outline"
                  size={19}
                  color={hasActiveFilters ? theme.colors.white : theme.colors.primaryDark}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.summaryRow}>
              <StatSummaryCard
                label="Total"
                value={taskStats.total}
                iconName="albums-outline"
                color={theme.colors.primaryDark}
                backgroundColor={summaryBackgrounds.total}
              />
              <StatSummaryCard
                label="Pending"
                value={taskStats.pending}
                iconName="hourglass-outline"
                color={theme.colors.warning}
                backgroundColor={summaryBackgrounds.pending}
              />
              <StatSummaryCard
                label="Done"
                value={taskStats.completed}
                iconName="checkmark-circle-outline"
                color={theme.colors.blue}
                backgroundColor={summaryBackgrounds.completed}
              />
              <StatSummaryCard
                label="Today"
                value={taskStats.today}
                iconName="today-outline"
                color={theme.colors.purple}
                backgroundColor={summaryBackgrounds.today}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroller}
              contentContainerStyle={styles.filterRow}
            >
              {filterOptions.map((option) => (
                <FilterChip
                  key={option.value}
                  label={option.label}
                  iconName={option.iconName}
                  active={filter === option.value}
                  onPress={() => setFilter(option.value)}
                />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            meetingLink={meetingLinksByTaskId[item.id]}
            onToggle={() => toggleTask(item.id)}
            onDelete={() => confirmDelete(item)}
            onOpen={() => navigation.navigate('TaskDetails', { taskId: item.id })}
            onOpenMaps={() => confirmOpenMaps(item.location)}
            onJoinMeeting={() => confirmJoinMeeting(meetingLinksByTaskId[item.id])}
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
  },
  taskList: {
    flex: 1,
  },
  listHeader: {
    marginBottom: 2,
  },
  headerCard: {
    minHeight: 128,
    borderRadius: 26,
    padding: 15,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  heroGlowLarge: {
    position: 'absolute',
    right: -48,
    top: -46,
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: 'rgba(255,255,255,0.46)',
  },
  heroGlowSmall: {
    position: 'absolute',
    right: 96,
    bottom: 22,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  headerTextArea: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
    zIndex: 2,
  },
  headerLabel: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    color: theme.colors.primaryDark,
    fontWeight: '900',
    marginBottom: 6,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },
  headerSubtitle: {
    marginTop: 5,
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  headerMiloCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -6,
    zIndex: 2,
  },
  headerMiloImage: {
    width: 102,
    height: 102,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
  },
  searchWrapper: {
    flex: 1,
    minWidth: 0,
    height: 46,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadowSoft,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  filterIconButton: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
    ...theme.shadowSoft,
  },
  filterIconButtonActive: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primaryDark,
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryIconWrap: {
    width: 25,
    height: 25,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  summaryNumber: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: '900',
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '900',
    color: theme.colors.textSoft,
  },
  filterScroller: {
    marginBottom: 14,
  },
  filterRow: {
    paddingRight: 18,
  },
  filterChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primaryDark,
  },
  filterText: {
    marginLeft: 5,
    fontWeight: '900',
    color: theme.colors.primaryDark,
    fontSize: 12,
  },
  filterTextActive: {
    color: theme.colors.white,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 130,
  },
  taskCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    paddingVertical: 10,
    paddingLeft: 13,
    paddingRight: 10,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  taskCardPressed: {
    opacity: 0.88,
  },
  taskCardCompleted: {
    backgroundColor: theme.colors.cardSoft,
    opacity: 0.88,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxArea: {
    marginRight: 8,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.input,
  },
  checkboxCompleted: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  taskMiloBubble: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  taskMiloImage: {
    width: 52,
    height: 52,
  },
  taskContent: {
    flex: 1,
    minWidth: 0,
  },
  taskTitle: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  completedTitle: {
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  taskDescription: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  cardRightRail: {
    width: 70,
    marginLeft: 7,
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  typeBadge: {
    maxWidth: 70,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    marginLeft: 3,
  },
  deleteButton: {
    width: 31,
    height: 31,
    borderRadius: 15.5,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: `${theme.colors.danger}35`,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  metaChip: {
    minHeight: 24,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
    marginRight: 5,
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaChipText: {
    marginLeft: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },
  metaChipTextSolo: {
    marginLeft: 0,
  },
  utilityRow: {
    marginTop: 7,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  utilityPillRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  utilityActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 6,
  },
  infoPill: {
    maxWidth: 150,
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginRight: 5,
    marginBottom: 4,
  },
  locationInfoPill: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: `${theme.colors.primary}40`,
  },
  meetingInfoPill: {
    backgroundColor: theme.colors.purpleSoft,
    borderColor: `${theme.colors.purple}40`,
  },
  infoPillText: {
    maxWidth: 112,
    minWidth: 0,
    marginLeft: 4,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  taskActionButton: {
    minWidth: 58,
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 8,
    marginLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskActionText: {
    marginLeft: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
  },
  emptyCard: {
    marginTop: 26,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.xl,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
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
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 18,
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
  },
  emptyButtonText: {
    color: theme.colors.white,
    fontWeight: '900',
  },
});
