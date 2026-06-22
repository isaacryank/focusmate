import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../types/navigation';
import {
  PlannerType,
  ReminderOption,
  TaskPriority,
} from '../types/task';
import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { secondaryHeader } from '../constants/header';
import { useTasks } from '../lib/TaskContext';
import { schedulePlannerReminder } from '../lib/notificationUtils';
import {
  dateFromStorage,
  formatDateForStorage,
  formatTimeForStorage,
  timeFromStorage,
} from '../lib/dateTimeUtils';
import {
  deleteOnlineMeetingLinkForTask,
  getOnlineMeetingLinkForTask,
  saveOnlineMeetingLink,
} from '../lib/meetingLinkStorage';
import {
  isLikelyMeetingUrl,
  normalizeMeetingUrl,
} from '../lib/meetingLinkUtils';
import { isPhysicalLocationLikeValue } from '../lib/locationPickerUtils';

import ScreenContainer from '../components/ui/ScreenContainer';
import NoticeCard from '../components/ui/NoticeCard';
import SmartLocationPickerModal from '../components/SmartLocationPickerModal';

type Props = NativeStackScreenProps<RootStackParamList, 'EditTask'>;

type PickerMode = 'date' | 'time' | null;
type ChoicePanel = 'duration' | 'reminder' | null;

const MAX_RECENT_LOCATION_CHIPS = 3;

const plannerTypes: {
  value: PlannerType;
  label: string;
}[] = [
  {
    value: 'task',
    label: 'Task',
  },
  {
    value: 'meeting',
    label: 'Meeting',
  },
  {
    value: 'date',
    label: 'Date',
  },
];

const priorities: {
  value: TaskPriority;
  label: string;
}[] = [
  {
    value: 'low',
    label: 'Low',
  },
  {
    value: 'medium',
    label: 'Medium',
  },
  {
    value: 'high',
    label: 'High',
  },
];

const durationOptions: {
  value?: number;
  label: string;
}[] = [
  {
    value: undefined,
    label: 'No fixed duration',
  },
  {
    value: 30,
    label: '30 min',
  },
  {
    value: 60,
    label: '1 hour',
  },
  {
    value: 120,
    label: '2 hours',
  },
  {
    value: 240,
    label: 'Half day',
  },
  {
    value: 1440,
    label: 'Whole day',
  },
];

const reminderOptions: {
  value: ReminderOption;
  label: string;
}[] = [
  {
    value: 'none',
    label: 'No reminder',
  },
  {
    value: 'atTime',
    label: 'At time',
  },
  {
    value: '10min',
    label: '10 min before',
  },
  {
    value: '30min',
    label: '30 min before',
  },
  {
    value: '1hour',
    label: '1 hour before',
  },
  {
    value: '1day',
    label: '1 day before',
  },
];

function formatDurationLabel(minutes?: number) {
  if (minutes === undefined) return 'No fixed duration';
  if (!minutes) return 'No fixed duration';
  if (minutes >= 24 * 60) return 'Whole day';
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${minutes} min`;
}

function formatReminderLabel(
  reminder?: ReminderOption,
  manualReminderMinutes?: number
) {
  if (!reminder || reminder === 'none') return 'No reminder';
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

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        activeOpacity={0.82}
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons
          name="arrow-back"
          size={secondaryHeader.iconSize}
          color={theme.colors.text}
        />
      </TouchableOpacity>

      <Text numberOfLines={1} style={styles.headerTitle}>
        FocusMate
      </Text>

      <View style={styles.headerSpacer} />
    </View>
  );
}

function CardHeader({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardHeaderIcon}>
        <Ionicons name={icon} size={22} color={theme.colors.primaryDark} />
      </View>
      <Text style={styles.cardHeaderTitle}>{title}</Text>
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function SelectPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.selectPill, selected && styles.selectPillActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.selectPillText,
          selected && styles.selectPillTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SetupRow({
  icon,
  label,
  children,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  helper?: string;
}) {
  return (
    <View style={styles.setupRow}>
      <View style={styles.setupLabelSide}>
        <View style={styles.setupIconBox}>{icon}</View>
        <Text numberOfLines={2} style={styles.setupLabel}>
          {label}
        </Text>
      </View>

      <View style={styles.setupControlSide}>
        {children}
        {helper ? <Text style={styles.setupHelper}>{helper}</Text> : null}
      </View>
    </View>
  );
}

function ValueButton({
  value,
  placeholder,
  onPress,
  onClear,
  rightIcon = 'chevron-down',
}: {
  value?: string;
  placeholder: string;
  onPress: () => void;
  onClear?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const hasValue = Boolean(value);

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.valueBox}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value || placeholder}
    >
      <Text
        numberOfLines={1}
        style={[styles.valueText, !hasValue && styles.placeholderText]}
      >
        {value || placeholder}
      </Text>

      {hasValue && onClear ? (
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.clearButton}
          onPress={(event) => {
            event.stopPropagation();
            onClear();
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear value"
        >
          <Ionicons name="close" size={18} color={theme.colors.muted} />
        </TouchableOpacity>
      ) : (
        <Ionicons name={rightIcon} size={19} color={theme.colors.muted} />
      )}
    </TouchableOpacity>
  );
}

export default function EditTaskScreen({ navigation, route }: Props) {
  useFocusMateTheme();

  const { tasks, updateTask } = useTasks();
  const task = tasks.find((item) => item.id === route.params.taskId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [plannerType, setPlannerType] = useState<PlannerType>('task');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState<
    number | undefined
  >(undefined);
  const [location, setLocation] = useState('');
  const [onlineMeetingLink, setOnlineMeetingLink] = useState('');
  const [reminder, setReminder] = useState<ReminderOption>('none');
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [choicePanel, setChoicePanel] = useState<ChoicePanel>(null);
  const [isLocationPickerVisible, setIsLocationPickerVisible] =
    useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    if (!task) return;

    setTitle(task.title || '');
    setDescription(task.description || '');
    setPlannerType(task.plannerType || 'task');
    setPriority(task.priority || 'medium');
    setDueDate(task.dueDate || '');
    setDueTime(task.dueTime || '');
    setEstimatedDurationMinutes(task.estimatedDurationMinutes);
    setLocation(task.location || '');
    setReminder(task.reminder || 'none');
  }, [task]);

  useEffect(() => {
    let isMounted = true;

    if (!task?.id) {
      setOnlineMeetingLink('');
      return () => {
        isMounted = false;
      };
    }

    getOnlineMeetingLinkForTask(task.id)
      .then((savedMeetingLink) => {
        if (isMounted) {
          setOnlineMeetingLink(savedMeetingLink?.url || '');
        }
      })
      .catch((error) => {
        console.warn('Failed to load online meeting link for edit:', error);

        if (isMounted) {
          setOnlineMeetingLink('');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [task?.id]);

  const reminderChoices = useMemo(() => {
    if (reminder !== 'custom') {
      return reminderOptions;
    }

    return [
      ...reminderOptions,
      {
        value: 'custom' as ReminderOption,
        label: formatReminderLabel('custom', task?.manualReminderMinutes),
      },
    ];
  }, [reminder, task?.manualReminderMinutes]);

  const recentLocations = useMemo(() => {
    const seenLocations = new Set<string>();

    return tasks
      .map((item) => item.location?.trim())
      .filter((taskLocation): taskLocation is string => {
        if (!taskLocation) {
          return false;
        }

        if (!isPhysicalLocationLikeValue(taskLocation)) {
          return false;
        }

        const normalizedLocation = taskLocation.toLowerCase();

        if (seenLocations.has(normalizedLocation)) {
          return false;
        }

        seenLocations.add(normalizedLocation);
        return true;
      })
      .slice(0, MAX_RECENT_LOCATION_CHIPS);
  }, [tasks]);

  if (!task) {
    return (
      <ScreenContainer topPadding={18} bottomPadding={56}>
        <View style={styles.missingCard}>
          <View style={styles.missingIcon}>
            <Ionicons
              name="alert-circle-outline"
              size={30}
              color={theme.colors.primaryDark}
            />
          </View>
          <Text style={styles.missingTitle}>Planner item not found</Text>
          <Text style={styles.missingText}>
            This planner item may have been deleted.
          </Text>
          <TouchableOpacity
            activeOpacity={0.86}
            style={styles.missingButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.missingButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const toggleChoicePanel = (panel: ChoicePanel) => {
    setChoicePanel((current) => (current === panel ? null : panel));
  };

  const openLocationPicker = () => {
    setChoicePanel(null);
    setPickerMode(null);
    setIsLocationPickerVisible(true);
  };

  const applyLocation = (selectedLocation: string) => {
    setLocation(selectedLocation.trim());
    setIsLocationPickerVisible(false);
  };

  const handlePickerChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (Platform.OS === 'android') {
      setPickerMode(null);
    }

    if (!selectedDate) return;

    if (pickerMode === 'date') {
      setDueDate(formatDateForStorage(selectedDate));
      return;
    }

    if (pickerMode === 'time') {
      setDueTime(formatTimeForStorage(selectedDate));
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    const trimmedMeetingLink = onlineMeetingLink.trim();
    const normalizedMeetingLink = normalizeMeetingUrl(trimmedMeetingLink);

    if (!trimmedTitle) {
      setNotice({
        type: 'error',
        title: 'Planner title needed',
        message: 'Please fill in the planner title before saving.',
      });
      return;
    }

    if (reminder !== 'none' && !dueDate) {
      setNotice({
        type: 'warning',
        title: 'Date needed',
        message: 'Please choose a date before setting a reminder.',
      });
      return;
    }

    if (trimmedMeetingLink && !isLikelyMeetingUrl(normalizedMeetingLink)) {
      setNotice({
        type: 'error',
        title: 'Invalid online meeting link',
        message: 'Please enter a valid online meeting link before saving.',
      });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    let notificationId: string | undefined;
    const nextManualReminderMinutes =
      reminder === 'custom' ? task.manualReminderMinutes : undefined;

    try {
      if (reminder !== 'none') {
        const reminderResult = await schedulePlannerReminder({
          taskId: task.id,
          title: trimmedTitle,
          plannerType,
          dueDate,
          dueTime: dueTime || '9:00 AM',
          location: trimmedLocation,
          reminder,
          manualReminderMinutes: nextManualReminderMinutes,
        });

        if (!reminderResult.ok) {
          setIsSaving(false);
          setNotice({
            type: 'warning',
            title: 'Reminder not scheduled',
            message: reminderResult.reason,
          });
          return;
        }

        notificationId = reminderResult.notificationId;
      }

      await updateTask(task.id, {
        title: trimmedTitle,
        description: description.trim(),
        plannerType,
        priority,
        dueDate,
        dueTime,
        estimatedDurationMinutes,
        location: trimmedLocation,
        reminder,
        manualReminderMinutes: nextManualReminderMinutes,
        notificationId,
      });

      if (trimmedMeetingLink) {
        await saveOnlineMeetingLink({
          taskId: task.id,
          taskTitle: trimmedTitle,
          url: normalizedMeetingLink,
        });
      } else {
        await deleteOnlineMeetingLinkForTask(task.id);
      }

      setNotice({
        type: 'success',
        title: 'Planner item updated',
        message: 'Your changes have been saved.',
      });

      setTimeout(() => {
        navigation.goBack();
      }, 650);
    } catch (error) {
      console.warn('Failed to save planner item edits:', error);
      setNotice({
        type: 'error',
        title: 'Could not save changes',
        message: 'Please try again in a moment.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenContainer
      topPadding={8}
      bottomPadding={34}
      contentStyle={styles.screenContent}
    >
      <Header onBack={() => navigation.goBack()} />

      <View style={styles.intro}>
        <Text style={styles.introTitle}>Edit planner item</Text>
        <Text style={styles.introSubtitle}>
          Update the details, schedule, location, and link.
        </Text>
      </View>

      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <View style={styles.card}>
        <CardHeader icon="list-outline" title="Planner details" />

        <View style={styles.inlineField}>
          <FieldLabel label="Planner type" />
          <View style={styles.inlinePillRow}>
            {plannerTypes.map((item) => (
              <SelectPill
                key={item.value}
                label={item.label}
                selected={plannerType === item.value}
                onPress={() => setPlannerType(item.value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <FieldLabel label="Title" />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Planner item title"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldGroup}>
          <FieldLabel label="Description" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Notes or extra details"
            placeholderTextColor={theme.colors.muted}
            style={[styles.input, styles.multilineInput]}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={[styles.inlineField, styles.inlineFieldLast]}>
          <FieldLabel label="Priority" />
          <View style={styles.inlinePillRow}>
            {priorities.map((item) => (
              <SelectPill
                key={item.value}
                label={item.label}
                selected={priority === item.value}
                onPress={() => setPriority(item.value)}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <CardHeader icon="calendar-outline" title="Schedule & setup" />

        <SetupRow
          icon={
            <Ionicons
              name="calendar-outline"
              size={20}
              color={theme.colors.primaryDark}
            />
          }
          label="Date"
        >
          <ValueButton
            value={dueDate}
            placeholder="Choose date"
            onPress={() => setPickerMode('date')}
            onClear={dueDate ? () => setDueDate('') : undefined}
            rightIcon="calendar-outline"
          />
        </SetupRow>

        <SetupRow
          icon={
            <Ionicons
              name="time-outline"
              size={21}
              color={theme.colors.primaryDark}
            />
          }
          label="Time"
        >
          <ValueButton
            value={dueTime}
            placeholder="Choose time"
            onPress={() => setPickerMode('time')}
            onClear={dueTime ? () => setDueTime('') : undefined}
          />
        </SetupRow>

        <SetupRow
          icon={
            <Ionicons
              name="hourglass-outline"
              size={21}
              color={theme.colors.primaryDark}
            />
          }
          label="Estimated Duration"
        >
          <ValueButton
            value={formatDurationLabel(estimatedDurationMinutes)}
            placeholder="Choose duration"
            onPress={() => toggleChoicePanel('duration')}
          />
          {choicePanel === 'duration' ? (
            <View style={styles.optionPanel}>
              {durationOptions.map((item) => (
                <SelectPill
                  key={item.label}
                  label={item.label}
                  selected={estimatedDurationMinutes === item.value}
                  onPress={() => {
                    setEstimatedDurationMinutes(item.value);
                    setChoicePanel(null);
                  }}
                />
              ))}
            </View>
          ) : null}
        </SetupRow>

        <SetupRow
          icon={
            <Ionicons
              name="location-outline"
              size={21}
              color={theme.colors.primaryDark}
            />
          }
          label="Location"
          helper="Optional venue or address"
        >
          <ValueButton
            value={location.trim()}
            placeholder="Set location"
            onPress={openLocationPicker}
            onClear={() => setLocation('')}
            rightIcon="chevron-forward"
          />
        </SetupRow>

        <SetupRow
          icon={
            <MaterialCommunityIcons
              name="video-outline"
              size={21}
              color={theme.colors.primaryDark}
            />
          }
          label="Online Meeting"
          helper="Optional if this is an online event"
        >
          <View style={styles.inputBox}>
            <TextInput
              value={onlineMeetingLink}
              onChangeText={setOnlineMeetingLink}
              placeholder="Add meeting link"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.setupInput}
            />
            {onlineMeetingLink ? (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.clearButton}
                onPress={() => setOnlineMeetingLink('')}
                accessibilityRole="button"
                accessibilityLabel="Clear online meeting link"
              >
                <Ionicons name="close" size={18} color={theme.colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </SetupRow>

        <SetupRow
          icon={
            <Ionicons
              name="notifications-outline"
              size={21}
              color={theme.colors.primaryDark}
            />
          }
          label="Final Reminder"
        >
          <ValueButton
            value={formatReminderLabel(reminder, task.manualReminderMinutes)}
            placeholder="No reminder"
            onPress={() => toggleChoicePanel('reminder')}
          />
          {choicePanel === 'reminder' ? (
            <View style={styles.optionPanel}>
              {reminderChoices.map((item) => (
                <SelectPill
                  key={item.value}
                  label={item.label}
                  selected={reminder === item.value}
                  onPress={() => {
                    setReminder(item.value);
                    setChoicePanel(null);
                  }}
                />
              ))}
            </View>
          ) : null}
        </SetupRow>
      </View>

      {pickerMode ? (
        <DateTimePicker
          value={
            pickerMode === 'date'
              ? dateFromStorage(dueDate)
              : timeFromStorage(dueTime)
          }
          mode={pickerMode}
          display="default"
          onChange={handlePickerChange}
        />
      ) : null}

      <View style={styles.actionBar}>
        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.86}
          style={[styles.saveButton, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={22}
            color="#FFFFFF"
          />
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>
      </View>

      <SmartLocationPickerModal
        visible={isLocationPickerVisible}
        initialLocation={location}
        recentLocations={recentLocations}
        onCancel={() => setIsLocationPickerVisible(false)}
        onSave={applyLocation}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 14,
  },
  headerRow: {
    minHeight: secondaryHeader.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: secondaryHeader.marginBottom,
  },
  backButton: {
    width: secondaryHeader.buttonSize,
    height: secondaryHeader.buttonSize,
    borderRadius: secondaryHeader.buttonRadius,
    backgroundColor: theme.colors.card,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: secondaryHeader.titleFontSize,
    lineHeight: secondaryHeader.titleLineHeight,
    fontWeight: secondaryHeader.titleFontWeight,
    textAlign: 'center',
    marginHorizontal: secondaryHeader.sideGap,
  },
  headerSpacer: {
    width: secondaryHeader.buttonSize,
    height: secondaryHeader.buttonSize,
  },
  intro: {
    marginBottom: 16,
  },
  introTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  introSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 6,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 26,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 14,
    marginBottom: 15,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'visible',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 1,
  },
  cardHeaderTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  inlineFieldLast: {
    marginBottom: 0,
  },
  inlinePillRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginLeft: 10,
    marginRight: -6,
    marginBottom: -6,
  },
  fieldGroup: {
    marginBottom: 15,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.input,
    borderWidth: 1.2,
    borderBottomWidth: 1.7,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.16)',
    paddingHorizontal: 14,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.035,
    shadowRadius: 5,
    elevation: 1,
  },
  multilineInput: {
    minHeight: 86,
    paddingTop: 12,
    lineHeight: 20,
  },
  selectPill: {
    minHeight: 36,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.16)',
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 6,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  selectPillActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
    borderBottomColor: 'rgba(30, 111, 54, 0.28)',
    shadowOpacity: 0.07,
  },
  selectPillText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  selectPillTextActive: {
    color: theme.colors.primaryDark,
  },
  setupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  setupLabelSide: {
    width: 118,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  setupIconBox: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1.2,
    borderBottomWidth: 1.6,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  setupLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12.5,
    fontWeight: '900',
    lineHeight: 17,
  },
  setupControlSide: {
    flex: 1,
    minWidth: 0,
  },
  valueBox: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: theme.colors.input,
    borderWidth: 1.2,
    borderBottomWidth: 1.7,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.16)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.035,
    shadowRadius: 5,
    elevation: 1,
  },
  valueText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginRight: 7,
  },
  placeholderText: {
    color: theme.colors.muted,
  },
  inputBox: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: theme.colors.input,
    borderWidth: 1.2,
    borderBottomWidth: 1.7,
    borderColor: theme.colors.inputBorder,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.16)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.035,
    shadowRadius: 5,
    elevation: 1,
  },
  setupInput: {
    flex: 1,
    minHeight: 42,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    paddingVertical: 7,
    paddingRight: 7,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupHelper: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    marginTop: 5,
  },
  optionPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginRight: -6,
    marginBottom: -6,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    paddingBottom: 4,
  },
  cancelButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1.2,
    borderBottomWidth: 1.8,
    borderColor: theme.colors.primary,
    borderTopColor: theme.colors.card,
    borderBottomColor: 'rgba(30, 111, 54, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cancelButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  saveButton: {
    flex: 1.18,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    borderWidth: 1.2,
    borderBottomWidth: 2,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  missingCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  missingIcon: {
    width: 58,
    height: 58,
    borderRadius: 24,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  missingTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  missingText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  missingButton: {
    minHeight: 44,
    borderRadius: 17,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  missingButtonText: {
    color: theme.colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
});
