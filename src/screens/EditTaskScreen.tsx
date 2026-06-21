import React, { useEffect, useState } from 'react';
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
import EmptyState from '../components/ui/EmptyState';
import NoticeCard from '../components/ui/NoticeCard';

type Props = NativeStackScreenProps<RootStackParamList, 'EditTask'>;

type PickerMode = 'date' | 'time' | null;

const miloWorriedImage = require('../../assets/mascot/milo_worried.png');

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
    label: '10 min',
  },
  {
    value: '30min',
    label: '30 min',
  },
  {
    value: '1hour',
    label: '1 hour',
  },
  {
    value: '1day',
    label: '1 day',
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

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
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

      <TouchableOpacity activeOpacity={0.85} style={styles.dateButton} onPress={onPress}>
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
  const [location, setLocation] = useState('');
  const [reminder, setReminder] = useState<ReminderOption>('none');
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!task) return;

    setTitle(task.title || '');
    setDescription(task.description || '');
    setPlannerType(task.plannerType || 'task');
    setPriority(task.priority || 'medium');
    setDueDate(task.dueDate || '');
    setDueTime(task.dueTime || '');
    setLocation(task.location || '');
    setReminder(task.reminder || 'none');
  }, [task]);

  if (!task) {
    return (
      <ScreenContainer>
        <EmptyState
          imageSource={miloWorriedImage}
          title="Planner item not found"
          message="Milo could not find this item. It may have been deleted."
          actionLabel="Go back"
          onActionPress={() => navigation.goBack()}
        />
      </ScreenContainer>
    );
  }

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
    if (!title.trim()) {
      setNotice({
        type: 'error',
        title: 'Title is required',
        message: 'Please enter a title before saving changes.',
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

    setIsSaving(true);
    setNotice(null);

    let notificationId: string | undefined;

    if (reminder !== 'none') {
      const reminderResult = await schedulePlannerReminder({
        taskId: task.id,
        title: title.trim(),
        plannerType,
        dueDate,
        dueTime: dueTime || '9:00 AM',
        location,
        reminder,
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
      title: title.trim(),
      description: description.trim(),
      plannerType,
      priority,
      dueDate,
      dueTime,
      location: location.trim(),
      reminder,
      notificationId,
    });

    setNotice({
      type: 'success',
      title: 'Milo updated it!',
      message: 'Your planner item has been saved successfully.',
    });

    setTimeout(() => {
      navigation.goBack();
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

      <SectionHeader
        title="Edit planner item"
        subtitle="Update the details and Milo will keep it organized."
      />

      <View style={styles.card}>
        <View style={styles.fieldGroup}>
          <FieldLabel label="Planner type" />

          <View style={styles.rowWrap}>
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

        <View style={styles.fieldGroup}>
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
      </View>

      <SectionHeader
        title="Schedule"
        subtitle="Update date, time, location, and reminder."
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

        <View style={styles.fieldGroup}>
          <FieldLabel label="Location" />

          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Example: Library, online, cafe"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
          />
        </View>

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

      {pickerMode ? (
        <DateTimePicker
          value={pickerMode === 'date' ? dateFromStorage(dueDate) : timeFromStorage(dueTime)}
          mode={pickerMode}
          display="default"
          onChange={handlePickerChange}
        />
      ) : null}

      <View style={styles.saveArea}>
        <AppButton
          title="Save changes"
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
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 16,
    marginBottom: 18,
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
  saveArea: {
    marginTop: 4,
  },
});