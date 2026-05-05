import React, { useMemo, useState } from 'react';
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
import { useTasks } from '../lib/TaskContext';
import { schedulePlannerReminder } from '../lib/notificationUtils';
import {
  dateFromStorage,
  formatDateForStorage,
  formatTimeForStorage,
  timeFromStorage,
} from '../lib/dateTimeUtils';

import ScreenContainer from '../components/ui/ScreenContainer';
import SectionHeader from '../components/ui/SectionHeader';
import AppButton from '../components/ui/AppButton';
import NoticeCard from '../components/ui/NoticeCard';

type Props = NativeStackScreenProps<RootStackParamList, 'AddTask'>;

type PickerMode = 'date' | 'time' | null;

const plannerTypes: {
  value: PlannerType;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'task',
    label: 'Task',
    description: 'Assignment, study, personal work',
    icon: 'checkmark-circle-outline',
  },
  {
    value: 'meeting',
    label: 'Meeting',
    description: 'Class, supervisor, discussion',
    icon: 'people-outline',
  },
  {
    value: 'date',
    label: 'Date',
    description: 'Important date or event',
    icon: 'calendar-outline',
  },
];

const priorities: {
  value: TaskPriority;
  label: string;
  color: string;
}[] = [
  {
    value: 'low',
    label: 'Low',
    color: theme.colors.blue,
  },
  {
    value: 'medium',
    label: 'Medium',
    color: theme.colors.primary,
  },
  {
    value: 'high',
    label: 'High',
    color: theme.colors.yellow,
  },
];

const reminders: {
  value: ReminderOption;
  label: string;
}[] = [
  {
    value: 'none',
    label: 'No reminder',
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

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel label={label} />

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        style={[styles.input, multiline && styles.multilineInput]}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function SelectPill({
  label,
  selected,
  color,
  onPress,
}: {
  label: string;
  selected: boolean;
  color?: string;
  onPress: () => void;
}) {
  const activeColor = color || theme.colors.primary;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.selectPill,
        selected && {
          backgroundColor: `${activeColor}20`,
          borderColor: activeColor,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.selectPillText,
          selected && {
            color: activeColor,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function TypeCard({
  type,
  selected,
  onPress,
}: {
  type: (typeof plannerTypes)[number];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[styles.typeCard, selected && styles.typeCardSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Choose ${type.label}`}
    >
      <View
        style={[
          styles.typeIcon,
          selected && {
            backgroundColor: theme.colors.primary,
          },
        ]}
      >
        <Ionicons
          name={type.icon}
          size={22}
          color={selected ? '#FFFFFF' : theme.colors.primaryDark}
        />
      </View>

      <View style={styles.typeTextArea}>
        <Text style={styles.typeTitle}>{type.label}</Text>
        <Text style={styles.typeDescription}>{type.description}</Text>
      </View>
    </TouchableOpacity>
  );
}

function DateTimeButton({
  label,
  value,
  placeholder,
  icon,
  onPress,
  onClear,
}: {
  label: string;
  value?: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel label={label} />

      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.dateButton}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={18} color={theme.colors.primaryDark} />

        <Text
          style={[
            styles.dateButtonText,
            !value && {
              color: theme.colors.muted,
            },
          ]}
        >
          {value || placeholder}
        </Text>

        {value ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClear}
            style={styles.clearSmallButton}
          >
            <Ionicons name="close" size={15} color={theme.colors.muted} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export default function AddTaskScreen({ navigation }: Props) {
  const { addTask } = useTasks();

  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const [plannerType, setPlannerType] = useState<PlannerType>('task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [location, setLocation] = useState('');
  const [reminder, setReminder] = useState<ReminderOption>('none');

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const selectedType = useMemo(() => {
    return plannerTypes.find((type) => type.value === plannerType) || plannerTypes[0];
  }, [plannerType]);

  const showNotice = (
    type: 'success' | 'info' | 'warning' | 'error',
    noticeTitle: string,
    message: string
  ) => {
    setNotice({
      type,
      title: noticeTitle,
      message,
    });
  };

  const validateStepOne = () => {
    if (!title.trim()) {
      showNotice(
        'error',
        'Title is required',
        'Please enter a clear title so Milo knows what to help with.'
      );
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStepOne()) {
      return;
    }

    setNotice(null);
    setStep((current) => Math.min(current + 1, 3));
  };

  const handleBack = () => {
    setNotice(null);
    setStep((current) => Math.max(current - 1, 1));
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
    if (!validateStepOne()) {
      setStep(1);
      return;
    }

    if (reminder !== 'none' && !dueDate) {
      showNotice(
        'warning',
        'Date needed',
        'Please choose a date before setting a reminder.'
      );
      setStep(2);
      return;
    }

    setIsSaving(true);
    setNotice(null);

    const taskId = Date.now().toString();
    let notificationId: string | undefined;

    if (reminder !== 'none') {
      const reminderResult = await schedulePlannerReminder({
        taskId,
        title: title.trim(),
        plannerType,
        dueDate,
        dueTime: dueTime || '9:00 AM',
        location,
        reminder,
      });

      if (!reminderResult.ok) {
        setIsSaving(false);
        showNotice('warning', 'Reminder not scheduled', reminderResult.reason);
        setStep(2);
        return;
      }

      notificationId = reminderResult.notificationId;
    }

    addTask({
      id: taskId,
      title: title.trim(),
      description: description.trim(),
      dueDate,
      dueTime,
      location: location.trim(),
      reminder,
      notificationId,
      plannerType,
      priority,
      subtasks: [],
    });

    showNotice(
      'success',
      'Milo saved it!',
      `${selectedType.label} created successfully. Milo is ready to help you manage it.`
    );

    setTimeout(() => {
      navigation.replace('TaskDetails', {
        taskId,
      });
    }, 850);

    setIsSaving(false);
  };

  return (
    <ScreenContainer topPadding={12} bottomPadding={40}>
      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      <View style={styles.progressCard}>
        {[1, 2, 3].map((item) => (
          <View key={item} style={styles.progressItem}>
            <View
              style={[
                styles.progressCircle,
                step >= item && styles.progressCircleActive,
              ]}
            >
              <Text
                style={[
                  styles.progressNumber,
                  step >= item && styles.progressNumberActive,
                ]}
              >
                {item}
              </Text>
            </View>

            <Text
              style={[
                styles.progressLabel,
                step === item && styles.progressLabelActive,
              ]}
            >
              {item === 1 ? 'Details' : item === 2 ? 'Schedule' : 'Review'}
            </Text>
          </View>
        ))}
      </View>

      {step === 1 ? (
        <>
          <SectionHeader
            title="What are you planning?"
            subtitle="Choose the planner type and give Milo a clear title."
          />

          <View style={styles.typeGrid}>
            {plannerTypes.map((type) => (
              <TypeCard
                key={type.value}
                type={type}
                selected={plannerType === type.value}
                onPress={() => setPlannerType(type.value)}
              />
            ))}
          </View>

          <View style={styles.card}>
            <FormInput
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Example: Prepare FYP chapter 1"
            />

            <FormInput
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Add notes, requirements, or context"
              multiline
            />

            <FieldLabel label="Priority" />

            <View style={styles.rowWrap}>
              {priorities.map((item) => (
                <SelectPill
                  key={item.value}
                  label={item.label}
                  color={item.color}
                  selected={priority === item.value}
                  onPress={() => setPriority(item.value)}
                />
              ))}
            </View>
          </View>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <SectionHeader
            title="When should Milo remind you?"
            subtitle="Date and time are optional unless you set a reminder."
          />

          <View style={styles.card}>
            <DateTimeButton
              label="Date"
              value={dueDate}
              placeholder="Choose date"
              icon="calendar-outline"
              onPress={() => setPickerMode('date')}
              onClear={() => setDueDate('')}
            />

            <DateTimeButton
              label="Time"
              value={dueTime}
              placeholder="Choose time"
              icon="time-outline"
              onPress={() => setPickerMode('time')}
              onClear={() => setDueTime('')}
            />

            <FormInput
              label="Location"
              value={location}
              onChangeText={setLocation}
              placeholder="Example: Library, online, cafe"
            />

            <FieldLabel label="Reminder" />

            <View style={styles.rowWrap}>
              {reminders.map((item) => (
                <SelectPill
                  key={item.value}
                  label={item.label}
                  selected={reminder === item.value}
                  onPress={() => setReminder(item.value)}
                />
              ))}
            </View>
          </View>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <SectionHeader
            title="Review with Milo"
            subtitle="Check everything before saving."
          />

          <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewIcon}>
                <Ionicons name={selectedType.icon} size={23} color="#FFFFFF" />
              </View>

              <View style={styles.reviewTitleArea}>
                <Text style={styles.reviewType}>{selectedType.label}</Text>
                <Text style={styles.reviewTitle}>{title.trim()}</Text>
              </View>
            </View>

            {description.trim() ? (
              <Text style={styles.reviewDescription}>{description.trim()}</Text>
            ) : null}

            <View style={styles.reviewGrid}>
              <View style={styles.reviewPill}>
                <Ionicons name="flag-outline" size={15} color={theme.colors.primaryDark} />
                <Text style={styles.reviewPillText}>{priority}</Text>
              </View>

              <View style={styles.reviewPill}>
                <Ionicons name="calendar-outline" size={15} color={theme.colors.primaryDark} />
                <Text style={styles.reviewPillText}>{dueDate || 'No date'}</Text>
              </View>

              <View style={styles.reviewPill}>
                <Ionicons name="time-outline" size={15} color={theme.colors.primaryDark} />
                <Text style={styles.reviewPillText}>{dueTime || 'No time'}</Text>
              </View>

              <View style={styles.reviewPill}>
                <Ionicons name="notifications-outline" size={15} color={theme.colors.primaryDark} />
                <Text style={styles.reviewPillText}>{reminder}</Text>
              </View>
            </View>

            <NoticeCard
              type="info"
              title="Milo tip"
              message="After saving, open Milo Smart Plan to break this item into smaller checklist steps."
            />
          </View>
        </>
      ) : null}

      {pickerMode ? (
        <DateTimePicker
          value={pickerMode === 'date' ? dateFromStorage(dueDate) : timeFromStorage(dueTime)}
          mode={pickerMode}
          display="default"
          onChange={handlePickerChange}
        />
      ) : null}

      <View style={styles.footerRow}>
        {step > 1 ? (
          <View style={styles.footerButton}>
            <AppButton title="Back" variant="ghost" onPress={handleBack} />
          </View>
        ) : null}

        <View style={styles.footerButton}>
          {step < 3 ? (
            <AppButton
              title="Next"
              onPress={handleNext}
              icon={<Ionicons name="arrow-forward" size={18} color="#FFFFFF" />}
            />
          ) : (
            <AppButton
              title="Save with Milo"
              onPress={handleSave}
              loading={isSaving}
              icon={
                <MaterialCommunityIcons
                  name="content-save"
                  size={18}
                  color="#FFFFFF"
                />
              }
            />
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 14,
    marginBottom: 18,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
  },
  progressCircle: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCircleActive: {
    backgroundColor: theme.colors.primary,
  },
  progressNumber: {
    color: theme.colors.muted,
    fontWeight: '900',
    fontSize: 12,
  },
  progressNumberActive: {
    color: '#FFFFFF',
  },
  progressLabel: {
    marginTop: 6,
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  progressLabelActive: {
    color: theme.colors.primaryDark,
  },
  typeGrid: {
    marginBottom: 14,
  },
  typeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  typeCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  typeIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  typeTextArea: {
    flex: 1,
  },
  typeTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  typeDescription: {
    marginTop: 3,
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    marginBottom: 7,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    minHeight: 50,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  multilineInput: {
    minHeight: 95,
    paddingTop: 13,
    lineHeight: 20,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  selectPill: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
    marginBottom: 8,
  },
  selectPillText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  dateButton: {
    minHeight: 50,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateButtonText: {
    flex: 1,
    marginLeft: 9,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  clearSmallButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reviewTitleArea: {
    flex: 1,
  },
  reviewType: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  reviewTitle: {
    marginTop: 2,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  reviewDescription: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
  },
  reviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  reviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  reviewPillText: {
    marginLeft: 6,
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  footerRow: {
    flexDirection: 'row',
    marginTop: 18,
  },
  footerButton: {
    flex: 1,
    marginRight: 10,
  },
});