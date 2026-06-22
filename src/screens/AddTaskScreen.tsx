import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Modal,
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
  MiloConflictInfo,
  PlannerType,
  ReminderOption,
  TaskPriority,
} from '../types/task';
import { theme } from '../theme';
import { useFocusMateTheme } from '../theme/FocusMateThemeProvider';
import { secondaryHeader } from '../constants/header';
import { useTasks } from '../lib/TaskContext';
import { schedulePlannerReminder } from '../lib/notificationUtils';
import { buildMiloSmartData } from '../lib/miloSmartPlan';
import { findMiloConflict, moveDraftTime } from '../lib/miloConflicts';
import { saveOnlineMeetingLink } from '../lib/meetingLinkStorage';
import {
  buildMeetingDisplayLabel,
  detectMeetingProvider,
  isLikelyMeetingUrl,
  normalizeMeetingUrl,
} from '../lib/meetingLinkUtils';
import {
  dateFromStorage,
  formatDateForStorage,
  formatTimeForStorage,
  timeFromStorage,
} from '../lib/dateTimeUtils';
import { isPhysicalLocationLikeValue } from '../lib/locationPickerUtils';

import ScreenContainer from '../components/ui/ScreenContainer';
import NoticeCard from '../components/ui/NoticeCard';
import SmartLocationPickerModal from '../components/SmartLocationPickerModal';

type Props = NativeStackScreenProps<RootStackParamList, 'AddTask'>;

type PickerMode = 'date' | 'time' | null;
type ScheduleSheet = 'duration' | 'location' | 'onlineMeeting' | 'reminder' | null;
type ReminderUnit = 'minutes' | 'hours' | 'days';

const MAX_RECENT_LOCATION_CHIPS = 3;

const plannerTypes: {
  value: PlannerType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tint: string;
}[] = [
  {
    value: 'task',
    label: 'Task',
    icon: 'checkbox-outline',
    color: theme.colors.primaryDark,
    tint: theme.colors.primarySoft,
  },
  {
    value: 'meeting',
    label: 'Meeting',
    icon: 'people-outline',
    color: theme.colors.purple,
    tint: theme.colors.purpleSoft,
  },
  {
    value: 'date',
    label: 'Date',
    icon: 'calendar-outline',
    color: '#D88916',
    tint: theme.colors.yellowSoft,
  },
];

const priorities: {
  value: TaskPriority;
  label: string;
  color: string;
  tint: string;
  selectedText: string;
}[] = [
  {
    value: 'low',
    label: 'Low',
    color: theme.colors.primary,
    tint: theme.colors.primarySoft,
    selectedText: theme.colors.primaryDark,
  },
  {
    value: 'medium',
    label: 'Medium',
    color: theme.colors.yellow,
    tint: theme.colors.yellowSoft,
    selectedText: '#9A6A00',
  },
  {
    value: 'high',
    label: 'High',
    color: theme.colors.danger,
    tint: theme.colors.dangerSoft,
    selectedText: theme.colors.danger,
  },
];

const reminders: {
  value: ReminderOption;
  label: string;
}[] = [
  { value: 'atTime', label: 'At time' },
  { value: '10min', label: '10 min before' },
  { value: '30min', label: '30 min before' },
  { value: '1hour', label: '1 hour before' },
  { value: '1day', label: '1 day before' },
];

const durationOptions = [
  { label: 'No fixed duration', value: undefined },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: 'Half day', value: 4 * 60 },
  { label: 'Whole day', value: 24 * 60 },
];

const reminderOptions: {
  value: ReminderOption;
  label: string;
  minutes?: number;
}[] = [
  { value: 'none', label: 'No reminder' },
  { value: 'atTime', label: 'At time', minutes: 0 },
  { value: '10min', label: '10 min before', minutes: 10 },
  { value: '30min', label: '30 min before', minutes: 30 },
  { value: '1hour', label: '1 hour before', minutes: 60 },
  { value: '1day', label: '1 day before', minutes: 1440 },
  { value: 'custom', label: 'Custom' },
];

function formatReminderMinutes(minutes: number) {
  if (minutes === 0) return 'At time';
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${days === 1 ? 'day' : 'days'} before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} before`;
  }

  return `${minutes} min before`;
}

function getReminderLabel(value: ReminderOption, customMinutes?: number) {
  if (value === 'none') return 'No reminder';
  if (value === 'custom') {
    return customMinutes
      ? `Custom: ${formatReminderMinutes(customMinutes)}`
      : 'Custom';
  }

  return reminders.find((item) => item.value === value)?.label || 'No reminder';
}

function formatDurationLabel(minutes?: number) {
  if (minutes === undefined) return 'No fixed duration';
  if (!minutes) return 'Add duration';
  if (minutes >= 24 * 60) return 'Whole day';
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${minutes} min`;
}

function formatScheduleDate(value: string) {
  if (!value) return '';

  return dateFromStorage(value).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    weekday: 'short',
  });
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        activeOpacity={0.82}
        style={styles.headerButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons
          name="chevron-back"
          size={secondaryHeader.iconSize}
          color={theme.colors.text}
        />
      </TouchableOpacity>

      <Text style={styles.headerTitle}>FocusMate</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ['Details', 'Schedule', 'Review'];
  const progressWidth = `${((step - 1) / (steps.length - 1)) * 100}%` as `${number}%`;

  return (
    <View style={styles.stepper}>
      <View style={styles.stepperTrackWrap}>
        <View style={styles.stepperTrack} />
        <View style={[styles.stepperTrackActive, { width: progressWidth }]} />
      </View>

      {steps.map((label, index) => {
        const item = index + 1;

        return (
          <View key={item} style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                step > item && styles.stepCircleComplete,
                step === item && styles.stepCircleActive,
              ]}
            >
              {step > item ? (
                <Ionicons name="checkmark" size={15} color="#FFFFFF" />
              ) : (
                <Text
                  style={[
                    styles.stepNumber,
                    step === item && styles.stepNumberActive,
                  ]}
                >
                  {item}
                </Text>
              )}
            </View>

            <Text
              style={[
                styles.stepLabel,
                step === item && styles.stepLabelActive,
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  icon,
  invalid,
  validationMessage,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  invalid?: boolean;
  validationMessage?: string;
}) {
  const { isDark } = useFocusMateTheme();

  return (
    <View
      style={[
        styles.cardDepthWrap,
        styles.detailCardDepthWrap,
        invalid && styles.cardDepthWrapInvalid,
        invalid && isDark && styles.cardDepthWrapInvalidDark,
      ]}
    >
      <View
        style={[
          styles.detailCard,
          invalid && styles.detailCardInvalid,
          invalid && isDark && styles.detailCardInvalidDark,
        ]}
      >
        <View style={styles.detailCardHeader}>
        {icon ? (
          <View style={styles.detailIcon}>
            <Ionicons name={icon} size={17} color={theme.colors.primaryDark} />
          </View>
        ) : null}
        <FieldLabel label={label} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          invalid && styles.inputInvalid,
        ]}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />

        {invalid ? (
          <View style={styles.fieldErrorRow}>
            <Ionicons name="alert-circle-outline" size={15} color={theme.colors.danger} />
            <Text style={styles.fieldErrorText}>
              {validationMessage || 'Please fill in this field.'}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TypeSegment({
  label,
  icon,
  color,
  tint,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  tint: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.segment,
        selected && styles.segmentSelected,
        selected && {
          backgroundColor: tint,
          borderColor: color,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={16}
        color={selected ? color : theme.colors.muted}
      />
      <Text
        style={[
          styles.segmentText,
          selected && {
            color,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PrioritySegment({
  label,
  color,
  tint,
  selectedText,
  selected,
  onPress,
}: {
  label: string;
  color: string;
  tint: string;
  selectedText: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[
        styles.segment,
        selected && styles.segmentSelected,
        selected && {
          backgroundColor: tint,
          borderColor: color,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.priorityDot, { backgroundColor: color }]} />
      <Text
        style={[
          styles.segmentText,
          selected && {
            color: selectedText,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DetailSelectCard({
  icon,
  label,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.cardDepthWrap, styles.detailCardDepthWrap]}>
      <View style={styles.detailCard}>
        <View style={styles.detailCardHeader}>
        <View style={styles.detailIcon}>
          <Ionicons name={icon} size={17} color={theme.colors.primaryDark} />
        </View>
        <FieldLabel label={label} />
        </View>
        {children}
      </View>
    </View>
  );
}

function ScheduleRow({
  icon,
  label,
  value,
  placeholder,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.scheduleRow, last && styles.scheduleRowLast]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={17} color={theme.colors.primaryDark} />
      </View>
      <Text style={styles.scheduleLabel}>{label}</Text>
      <Text
        numberOfLines={1}
        style={[
          styles.scheduleValue,
          !value && {
            color: theme.colors.muted,
          },
        ]}
      >
        {value || placeholder}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} />
    </TouchableOpacity>
  );
}

function ReviewSummaryRow({
  icon,
  label,
  value,
  last,
  valueColor,
  valueTint,
  valueBorder,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
  valueColor?: string;
  valueTint?: string;
      valueBorder?: string;
}) {
  return (
    <View style={[styles.reviewSummaryRow, last && styles.reviewSummaryRowLast]}>
      <View style={styles.reviewRowIcon}>
        <Ionicons name={icon} size={14} color={theme.colors.primaryDark} />
      </View>
      <Text style={styles.reviewSummaryLabel}>{label}</Text>
      {valueColor ? (
        <View
          style={[
            styles.reviewSummaryValueBadge,
            {
              backgroundColor: valueTint,
              borderColor: valueBorder || valueColor,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.reviewSummaryBadgeText, { color: valueColor }]}
          >
            {value}
          </Text>
        </View>
      ) : (
        <Text numberOfLines={1} style={styles.reviewSummaryValue}>
          {value}
        </Text>
      )}
    </View>
  );
}

function PrimaryButton({
  title,
  onPress,
  loading,
  icon,
  iconSide = 'right',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  icon?: React.ReactNode;
  iconSide?: 'left' | 'right';
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={[styles.primaryButtonDepth, loading && styles.disabledButton]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.primaryButtonFace}>
        {icon && iconSide === 'left' ? (
          <View style={styles.primaryButtonLeftIcon}>{icon}</View>
        ) : null}
        <Text
          style={[
            styles.primaryButtonText,
            iconSide === 'left' && styles.primaryButtonTextCentered,
          ]}
        >
          {loading ? 'Saving...' : title}
        </Text>
        {icon && iconSide === 'right' ? (
          <View style={styles.primaryButtonRightIcon}>{icon}</View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function SecondaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={styles.secondaryButtonDepth}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.secondaryButtonFace}>
        <Text style={styles.secondaryButtonText}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function AddTaskScreen({ navigation }: Props) {
  useFocusMateTheme();

  const { addTask, tasks } = useTasks();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const [plannerType, setPlannerType] = useState<PlannerType>('task');
  const [title, setTitle] = useState('');
  const [showTitleValidation, setShowTitleValidation] = useState(false);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [location, setLocation] = useState('');
  const [onlineMeetingLink, setOnlineMeetingLink] = useState('');
  const [reminder, setReminder] = useState<ReminderOption>('none');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState<
    number | undefined
  >(60);
  const [overlapAccepted, setOverlapAccepted] = useState(false);
  const [acceptedConflictSignature, setAcceptedConflictSignature] = useState<
    string | null
  >(null);
  const [showOverlapConfirm, setShowOverlapConfirm] = useState(false);

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [scheduleSheet, setScheduleSheet] = useState<ScheduleSheet>(null);
  const [customDurationText, setCustomDurationText] = useState('3');
  const [onlineMeetingInput, setOnlineMeetingInput] = useState('');
  const [onlineMeetingError, setOnlineMeetingError] = useState('');
  const [customReminderText, setCustomReminderText] = useState('5');
  const [customReminderUnit, setCustomReminderUnit] =
    useState<ReminderUnit>('minutes');

  const [notice, setNotice] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const selectedType = useMemo(() => {
    return plannerTypes.find((type) => type.value === plannerType) || plannerTypes[0];
  }, [plannerType]);

  const smartData = useMemo(
    () =>
      buildMiloSmartData({
        title,
        description,
        plannerType,
        priority,
        dueDate,
        dueTime,
        location,
        reminder,
        estimatedDurationMinutes,
      }),
    [
      title,
      description,
      plannerType,
      priority,
      dueDate,
      dueTime,
      location,
      reminder,
      estimatedDurationMinutes,
    ]
  );

  const conflictInfo = useMemo(
    () =>
      findMiloConflict(
        {
          title,
          plannerType,
          dueDate,
          dueTime,
          location,
          estimatedDurationMinutes,
        },
        tasks
      ),
    [dueDate, dueTime, estimatedDurationMinutes, location, plannerType, tasks, title]
  );
  const conflictSignature = [
    conflictInfo?.level,
    conflictInfo?.type,
    conflictInfo?.conflictingTaskId,
    conflictInfo?.conflictingTitle,
    conflictInfo?.conflictingTime,
    conflictInfo?.conflictingEndTimeLabel,
    dueDate,
    dueTime,
    estimatedDurationMinutes,
    plannerType,
    location.trim().toLowerCase(),
  ].join('|');

  useEffect(() => {
    setOverlapAccepted(false);
    setAcceptedConflictSignature(null);
    setShowOverlapConfirm(false);
  }, [conflictSignature]);

  const conflictingTask = useMemo(
    () =>
      conflictInfo?.conflictingTaskId
        ? tasks.find((task) => task.id === conflictInfo.conflictingTaskId)
        : undefined,
    [conflictInfo?.conflictingTaskId, tasks]
  );

  const customReminderMinutes = useMemo(() => {
    const amount = Number(customReminderText.replace(/[^0-9]/g, ''));

    if (!amount) return undefined;
    if (customReminderUnit === 'days') return amount * 1440;
    if (customReminderUnit === 'hours') return amount * 60;

    return amount;
  }, [customReminderText, customReminderUnit]);
  const manualReminderMinutes =
    reminder === 'custom'
      ? customReminderMinutes
      : reminderOptions.find((item) => item.value === reminder)?.minutes;

  const reminderLabel = getReminderLabel(reminder, customReminderMinutes);
  const dateLabel = formatScheduleDate(dueDate);
  const durationLabel = formatDurationLabel(estimatedDurationMinutes);
  const locationLabel = location.trim();
  const onlineMeetingLabel = onlineMeetingLink.trim()
    ? detectMeetingProvider(onlineMeetingLink)
    : '';
  const detectedOnlineMeetingProvider = onlineMeetingInput.trim()
    ? detectMeetingProvider(onlineMeetingInput)
    : '';
  const recentLocations = useMemo(() => {
    const seenLocations = new Set<string>();

    return tasks
      .map((task) => task.location?.trim())
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
  const hasScheduleConflict =
    conflictInfo?.level === 'hard' ||
    conflictInfo?.level === 'soft' ||
    conflictInfo?.level === 'same_time';
  const currentConflictAccepted =
    overlapAccepted && acceptedConflictSignature === conflictSignature;
  const scheduleCtaLabel = !hasScheduleConflict
    ? 'Next: Review'
    : currentConflictAccepted
    ? 'Proceed: Review'
    : 'Keep Anyway';
  const reviewMiloUrgency =
    currentConflictAccepted && hasScheduleConflict ? 'high' : smartData.urgency;
  const priorityTone =
    priority === 'high'
      ? {
          color: '#DC2626',
          tint: '#FFF1F1',
          border: '#FECACA',
        }
      : priority === 'medium'
      ? {
          color: '#D97706',
          tint: '#FFF7ED',
          border: '#FDBA74',
        }
      : {
          color: theme.colors.primaryDark,
          tint: '#ECFAF0',
          border: '#BFE9CE',
        };
  const urgencyTone =
    reviewMiloUrgency === 'high'
      ? {
          color: '#DC2626',
          tint: '#FFF1F1',
          border: '#FECACA',
        }
      : reviewMiloUrgency === 'medium'
      ? {
          color: '#D97706',
          tint: '#FFF7ED',
          border: '#FDBA74',
        }
      : {
          color: theme.colors.primaryDark,
          tint: '#ECFAF0',
          border: '#BFE9CE',
        };
  const savedConflictInfo =
    currentConflictAccepted && hasScheduleConflict && conflictInfo
      ? ({
          ...conflictInfo,
          type: 'accepted_overlap',
          messageTone: 'accepted',
        } satisfies MiloConflictInfo)
      : conflictInfo;
  const acceptedConflictTitle =
    conflictInfo?.conflictingTitle || conflictingTask?.title || undefined;
  const acceptedConflictTime =
    conflictInfo?.conflictingStartTimeLabel ||
    conflictInfo?.conflictingTime ||
    conflictingTask?.dueTime ||
    undefined;
  const overlapConfirmMessage = `This overlaps with ${
    acceptedConflictTitle || 'that plan'
  }. Milo can keep both and mark this as high focus.`;

  const isTitleInvalid = showTitleValidation && !title.trim();
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
      setNotice(null);
      setShowTitleValidation(true);
      return false;
    }

    setShowTitleValidation(false);
    return true;
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);

    if (value.trim()) {
      setShowTitleValidation(false);
    }
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

  const openLocationSheet = () => {
    setScheduleSheet('location');
  };

  const applyCustomDuration = () => {
    const hours = Number(customDurationText.replace(/[^0-9]/g, ''));

    if (!hours) return;

    setEstimatedDurationMinutes(hours * 60);
    setScheduleSheet(null);
  };

  const handleKeepAnyway = () => {
    if (!hasScheduleConflict) return;

    setShowOverlapConfirm(true);
  };

  const handleKeepBoth = () => {
    setOverlapAccepted(true);
    setAcceptedConflictSignature(conflictSignature);
    setShowOverlapConfirm(false);
    showNotice(
      'info',
      'Milo will watch both',
      'Milo will keep an extra eye on this.'
    );
  };

  const handleScheduleCtaPress = () => {
    if (!hasScheduleConflict || currentConflictAccepted) {
      handleNext();
      return;
    }

    handleKeepAnyway();
  };

  const applyLocation = (selectedLocation: string) => {
    setLocation(selectedLocation.trim());
    setScheduleSheet(null);
  };

  const openOnlineMeetingSheet = () => {
    setOnlineMeetingInput(onlineMeetingLink);
    setOnlineMeetingError('');
    setScheduleSheet('onlineMeeting');
  };

  const applyOnlineMeetingLink = () => {
    const normalizedUrl = normalizeMeetingUrl(onlineMeetingInput);

    if (!normalizedUrl) {
      setOnlineMeetingError('Paste a meeting link first.');
      return;
    }

    if (!isLikelyMeetingUrl(normalizedUrl)) {
      setOnlineMeetingError('This does not look like a valid meeting link.');
      return;
    }

    setOnlineMeetingLink(normalizedUrl);
    setOnlineMeetingInput(normalizedUrl);
    setOnlineMeetingError('');
    setScheduleSheet(null);
  };

  const removeOnlineMeetingLink = () => {
    setOnlineMeetingLink('');
    setOnlineMeetingInput('');
    setOnlineMeetingError('');
    setScheduleSheet(null);
  };

  const applyCustomReminder = () => {
    if (!customReminderMinutes && customReminderMinutes !== 0) return;

    setReminder('custom');
    setScheduleSheet(null);
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
        manualReminderMinutes,
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
      manualReminderMinutes,
      plannerType,
      priority,
      estimatedDurationMinutes,
      miloUrgency: reviewMiloUrgency,
      miloSmartPlan: smartData.plan,
      miloSmartNudges: smartData.nudges,
      conflictInfo: savedConflictInfo,
      conflictAccepted: currentConflictAccepted && hasScheduleConflict,
      conflictWithTitle:
        currentConflictAccepted && hasScheduleConflict
          ? acceptedConflictTitle
          : undefined,
      conflictWithTime:
        currentConflictAccepted && hasScheduleConflict
          ? acceptedConflictTime
          : undefined,
      conflictLevel:
        currentConflictAccepted && hasScheduleConflict
          ? conflictInfo?.level
          : undefined,
      subtasks: [],
    });

    const normalizedOnlineMeetingLink = normalizeMeetingUrl(onlineMeetingLink);

    if (
      normalizedOnlineMeetingLink &&
      isLikelyMeetingUrl(normalizedOnlineMeetingLink)
    ) {
      try {
        await saveOnlineMeetingLink({
          taskId,
          taskTitle: title.trim(),
          url: normalizedOnlineMeetingLink,
          label: buildMeetingDisplayLabel(normalizedOnlineMeetingLink),
        });
      } catch (error) {
        console.warn('Failed to save online meeting link for new task:', error);
      }
    }

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

  const stepHeading =
    step === 1
      ? 'Create Task — Details'
      : step === 2
      ? 'Create Task — Schedule'
      : 'Create Task — Review';
  const stepSubheading =
    step === 1
      ? 'Fill in the basic information for your plan.'
      : step === 2
      ? 'Choose when, where, and how you want to prepare.'
      : 'Check the details before saving your plan.';

  return (
    <ScreenContainer
      topPadding={2}
      bottomPadding={40}
      contentStyle={styles.screenContent}
    >
      <View style={styles.headerDepthWrap}>
        <View style={styles.simpleHeaderPanel}>
          <Header onBack={() => navigation.goBack()} />
        <Stepper step={step} />
        <View style={styles.simpleStepCopy}>
          <Text style={styles.simpleStepTitle}>{stepHeading}</Text>
          <Text style={styles.simpleStepSubtitle}>{stepSubheading}</Text>
        </View>

        {step === 2 && hasScheduleConflict ? (
          <View style={styles.conflictActions}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.conflictButton}
              onPress={() =>
                setDueTime(
                  moveDraftTime(
                    dueDate,
                    dueTime,
                    'earlier',
                    estimatedDurationMinutes
                  )
                )
              }
            >
              <Text style={styles.conflictButtonText}>Move Earlier</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.conflictButton}
              onPress={() =>
                setDueTime(
                  moveDraftTime(
                    dueDate,
                    dueTime,
                    'later',
                    estimatedDurationMinutes
                  )
                )
              }
            >
              <Text style={styles.conflictButtonText}>Move Later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.conflictButton}
              onPress={() => setPickerMode('time')}
            >
              <Text style={styles.conflictButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
          ) : null}
        </View>
      </View>

      <View style={styles.createSheetDepth}>
        <View style={styles.createSheet}>
        {notice ? (
          <NoticeCard
            type={notice.type}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        {step === 1 ? (
          <>
          <FormInput
            label="Title"
            value={title}
            onChangeText={handleTitleChange}
            placeholder="Example: Assignment Lab"
            icon="document-text-outline"
            invalid={isTitleInvalid}
            validationMessage="Please fill in the task title before continuing."
          />

          <FormInput
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Add notes, requirements, or context"
            multiline
            icon="list-outline"
          />

          <DetailSelectCard icon="apps-outline" label="Type">
            <View style={styles.segmentRow}>
              {plannerTypes.map((type) => (
                <TypeSegment
                  key={type.value}
                  label={type.label}
                  icon={type.icon}
                  color={type.color}
                  tint={type.tint}
                  selected={plannerType === type.value}
                  onPress={() => setPlannerType(type.value)}
                />
              ))}
            </View>
          </DetailSelectCard>

          <DetailSelectCard icon="flag-outline" label="Priority">
            <View style={styles.segmentRow}>
              {priorities.map((item) => (
                <PrioritySegment
                  key={item.value}
                  label={item.label}
                  color={item.color}
                  tint={item.tint}
                  selectedText={item.selectedText}
                  selected={priority === item.value}
                  onPress={() => setPriority(item.value)}
                />
              ))}
            </View>
          </DetailSelectCard>

          <View style={styles.singleFooter}>
            <PrimaryButton
              title="Next: Schedule"
              onPress={handleNext}
              icon={<Ionicons name="chevron-forward" size={18} color="#FFFFFF" />}
            />
          </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
          <View style={[styles.cardDepthWrap, styles.scheduleCardDepthWrap]}>
            <View style={styles.scheduleCard}>
              <ScheduleRow
              label="Date"
              value={dateLabel}
              placeholder="Choose date"
              icon="calendar-outline"
              onPress={() => setPickerMode('date')}
            />
            <ScheduleRow
              label="Time"
              value={dueTime}
              placeholder="Choose time"
              icon="time-outline"
              onPress={() => setPickerMode('time')}
            />

            <ScheduleRow
              label="Estimated Duration"
              value={durationLabel}
              placeholder="Add duration"
              icon="hourglass-outline"
              onPress={() => setScheduleSheet('duration')}
            />
            <ScheduleRow
              label="Location"
              value={locationLabel}
              placeholder="Add place"
              icon="location-outline"
              onPress={openLocationSheet}
            />
            <ScheduleRow
              label="Online Meeting"
              value={onlineMeetingLabel}
              placeholder="Add link"
              icon="videocam-outline"
              onPress={openOnlineMeetingSheet}
            />
              <ScheduleRow
                label="Final Reminder"
                value={reminderLabel}
                placeholder="No reminder"
                icon="notifications-outline"
                onPress={() => setScheduleSheet('reminder')}
                last
              />
            </View>
          </View>

          <View style={styles.footerRow}>
            <SecondaryButton title="Back" onPress={handleBack} />
            <View style={styles.footerPrimary}>
              <PrimaryButton
                title={scheduleCtaLabel}
                onPress={handleScheduleCtaPress}
                icon={<Ionicons name="chevron-forward" size={18} color="#FFFFFF" />}
              />
            </View>
          </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
          <View style={[styles.cardDepthWrap, styles.summaryCardDepthWrap]}>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>Plan Summary</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.summaryEditButton}
                onPress={() => setStep(1)}
              >
                <Ionicons name="create-outline" size={14} color={theme.colors.primaryDark} />
                <Text style={styles.summaryEditText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.summaryRows}>
              <ReviewSummaryRow
                icon="document-text-outline"
                label="Title"
                value={title.trim() || 'Untitled'}
              />
              <ReviewSummaryRow icon={selectedType.icon} label="Type" value={selectedType.label} />
              <ReviewSummaryRow
                icon="flag-outline"
                label="Priority"
                value={priority}
                valueColor={priorityTone.color}
                valueTint={priorityTone.tint}
                valueBorder={priorityTone.border}
              />
              <ReviewSummaryRow
                icon="calendar-outline"
                label="Due"
                value={[dueDate, dueTime].filter(Boolean).join(' ') || 'Not set'}
              />
              <ReviewSummaryRow icon="hourglass-outline" label="Duration" value={durationLabel} />
              <ReviewSummaryRow
                icon="location-outline"
                label="Location"
                value={location.trim() || 'Not set'}
              />
              <ReviewSummaryRow
                icon="videocam-outline"
                label="Online Meeting"
                value={onlineMeetingLabel || 'Not set'}
              />
              <ReviewSummaryRow
                icon="notifications-outline"
                label="Final Reminder"
                value={reminderLabel}
                last
              />
              </View>
            </View>
          </View>

          {currentConflictAccepted && hasScheduleConflict ? (
            <View style={styles.reviewConflictNote}>
              <Ionicons name="warning-outline" size={16} color="#92400E" />
              <Text style={styles.reviewConflictText}>
                {`Overlap with "${acceptedConflictTitle || 'another plan'}"${
                  acceptedConflictTime ? ` (${acceptedConflictTime})` : ''
                }. You chose to keep both.`}
              </Text>
            </View>
          ) : null}

          <View style={[styles.cardDepthWrap, styles.urgencyCardDepthWrap]}>
            <View style={styles.urgencyCard}>
              <View
              style={[
                styles.urgencyIcon,
                {
                  backgroundColor: urgencyTone.tint,
                  borderColor: urgencyTone.border,
                },
              ]}
            >
              <Ionicons name="flame-outline" size={17} color={urgencyTone.color} />
            </View>
            <View style={styles.urgencyTextArea}>
              <Text style={styles.urgencyLabel}>Urgency</Text>
              <Text style={styles.urgencyHint}>Helps you stay on track</Text>
            </View>
              <View
                style={[
                  styles.urgencyBadge,
                  {
                    backgroundColor: urgencyTone.tint,
                    borderColor: urgencyTone.border,
                  },
                ]}
              >
                <Text style={[styles.urgencyBadgeText, { color: urgencyTone.color }]}>
                  {reviewMiloUrgency}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.footerRow}>
            <SecondaryButton title="Back" onPress={handleBack} />
            <View style={styles.footerPrimary}>
              <PrimaryButton
                title="Save with Milo"
                onPress={handleSave}
                loading={isSaving}
                iconSide="left"
                icon={
                  <MaterialCommunityIcons
                    name="content-save"
                    size={17}
                    color="#FFFFFF"
                  />
                }
              />
            </View>
          </View>
          </>
        ) : null}
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

      <Modal
        visible={showOverlapConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOverlapConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmSheet}>
            <View style={styles.confirmMessageRow}>
              <View style={styles.confirmIconBox}>
                <Ionicons name="warning-outline" size={22} color="#92400E" />
              </View>
              <View style={styles.confirmBubble}>
                <Text style={styles.confirmText}>{overlapConfirmMessage}</Text>
              </View>
            </View>

            <View style={styles.confirmActions}>
              <SecondaryButton
                title="Go Back"
                onPress={() => setShowOverlapConfirm(false)}
              />
              <View style={styles.footerPrimary}>
                <PrimaryButton title="Keep Both" onPress={handleKeepBoth} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={scheduleSheet === 'duration' || scheduleSheet === 'reminder'}
        transparent
        animationType="fade"
        onRequestClose={() => setScheduleSheet(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {scheduleSheet === 'duration'
                  ? 'Estimated Duration'
                  : scheduleSheet === 'location'
                  ? 'Set Location'
                  : 'Final Reminder'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.sheetCloseButton}
                onPress={() => setScheduleSheet(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {scheduleSheet === 'duration' ? (
              <>
                <View style={styles.sheetOptionList}>
                  {durationOptions.map((item) => (
                    <TouchableOpacity
                      key={item.label}
                      activeOpacity={0.85}
                      style={[
                        styles.sheetOption,
                        estimatedDurationMinutes === item.value &&
                          styles.sheetOptionActive,
                      ]}
                      onPress={() => {
                        setEstimatedDurationMinutes(item.value);
                        setScheduleSheet(null);
                      }}
                    >
                      <Text style={styles.sheetOptionText}>{item.label}</Text>
                      {estimatedDurationMinutes === item.value ? (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={theme.colors.primaryDark}
                        />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.customBox}>
                  <Text style={styles.customLabel}>Custom hours</Text>
                  <View style={styles.customInputRow}>
                    <TextInput
                      value={customDurationText}
                      onChangeText={(value) =>
                        setCustomDurationText(value.replace(/[^0-9]/g, ''))
                      }
                      keyboardType="number-pad"
                      placeholder="3"
                      placeholderTextColor={theme.colors.muted}
                      style={styles.customInput}
                    />
                    <Text style={styles.customUnitText}>hours</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.customApplyButton}
                      onPress={applyCustomDuration}
                    >
                      <Text style={styles.customApplyText}>Set</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : null}

            {scheduleSheet === 'reminder' ? (
              <>
                <View style={styles.sheetOptionList}>
                  {reminderOptions.map((item) => (
                    <TouchableOpacity
                      key={item.value}
                      activeOpacity={0.85}
                      style={[
                        styles.sheetOption,
                        reminder === item.value && styles.sheetOptionActive,
                      ]}
                      onPress={() => {
                        setReminder(item.value);
                        if (item.value !== 'custom') {
                          setScheduleSheet(null);
                        }
                      }}
                    >
                      <Text style={styles.sheetOptionText}>{item.label}</Text>
                      {reminder === item.value ? (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={theme.colors.primaryDark}
                        />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.customBox}>
                  <Text style={styles.customLabel}>Custom reminder</Text>
                  <View style={styles.customInputRow}>
                    <TextInput
                      value={customReminderText}
                      onChangeText={(value) =>
                        setCustomReminderText(value.replace(/[^0-9]/g, ''))
                      }
                      keyboardType="number-pad"
                      placeholder="5"
                      placeholderTextColor={theme.colors.muted}
                      style={styles.customInput}
                    />
                    <View style={styles.unitSegmentRow}>
                      {(['minutes', 'hours', 'days'] as ReminderUnit[]).map(
                        (unit) => (
                          <TouchableOpacity
                            key={unit}
                            activeOpacity={0.85}
                            style={[
                              styles.unitSegment,
                              customReminderUnit === unit &&
                                styles.unitSegmentActive,
                            ]}
                            onPress={() => setCustomReminderUnit(unit)}
                          >
                            <Text
                              style={[
                                styles.unitSegmentText,
                                customReminderUnit === unit &&
                                  styles.unitSegmentTextActive,
                              ]}
                            >
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.fullApplyButton}
                    onPress={applyCustomReminder}
                  >
                    <Text style={styles.customApplyText}>
                      Set custom reminder
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={scheduleSheet === 'onlineMeeting'}
        transparent
        animationType="fade"
        onRequestClose={() => setScheduleSheet(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.meetingSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Set Online Meeting</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.sheetCloseButton}
                onPress={() => setScheduleSheet(null)}
                accessibilityRole="button"
                accessibilityLabel="Close online meeting editor"
              >
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.meetingHelperText}>
              Paste a Google Meet, Teams, Zoom, or other meeting link.
            </Text>

            <TextInput
              value={onlineMeetingInput}
              onChangeText={(value) => {
                setOnlineMeetingInput(value);
                setOnlineMeetingError('');
              }}
              placeholder="https://meet.google.com/abc-defg-hij"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[
                styles.sheetTextInput,
                onlineMeetingError ? styles.meetingInputInvalid : null,
              ]}
            />

            {onlineMeetingInput.trim() ? (
              <View style={styles.detectedProviderPill}>
                <Ionicons
                  name="sparkles-outline"
                  size={13}
                  color={theme.colors.purple}
                />
                <Text style={styles.detectedProviderText}>
                  Detected: {detectedOnlineMeetingProvider || 'Custom'}
                </Text>
              </View>
            ) : null}

            {onlineMeetingError ? (
              <Text style={styles.meetingErrorText}>{onlineMeetingError}</Text>
            ) : null}

            <View style={styles.meetingActionRow}>
              {onlineMeetingLink ? (
                <TouchableOpacity
                  activeOpacity={0.84}
                  style={styles.meetingRemoveButton}
                  onPress={removeOnlineMeetingLink}
                  accessibilityRole="button"
                  accessibilityLabel="Remove online meeting link"
                >
                  <Text style={styles.meetingRemoveButtonText}>Remove Link</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.meetingSaveRow}>
                <SecondaryButton
                  title="Cancel"
                  onPress={() => setScheduleSheet(null)}
                />
                <View style={styles.footerPrimary}>
                  <PrimaryButton title="Save Link" onPress={applyOnlineMeetingLink} />
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <SmartLocationPickerModal
        visible={scheduleSheet === 'location'}
        initialLocation={location}
        recentLocations={recentLocations}
        onCancel={() => setScheduleSheet(null)}
        onSave={applyLocation}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 14,
  },
  headerDepthWrap: {
    backgroundColor: 'rgba(190, 216, 194, 0.22)',
    borderRadius: 31,
    paddingRight: 0,
    paddingBottom: 1,
    marginBottom: 15,
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  createSheetDepth: {
    backgroundColor: 'rgba(190, 216, 194, 0.24)',
    borderRadius: 30,
    paddingRight: 0,
    paddingBottom: 1,
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cardDepthWrap: {
    backgroundColor: 'rgba(190, 216, 194, 0.20)',
    borderRadius: 24,
    paddingRight: 0,
    paddingBottom: 1,
    marginBottom: 14,
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardDepthWrapInvalid: {
    backgroundColor: '#F2BEBE',
    shadowColor: '#7F1D1D',
  },
  cardDepthWrapInvalidDark: {
    backgroundColor: theme.colors.card,
    shadowColor: theme.colors.shadow,
  },
  detailCardDepthWrap: {
    borderRadius: 24,
  },
  scheduleCardDepthWrap: {
    borderRadius: 28,
  },
  summaryCardDepthWrap: {
    borderRadius: 27,
    marginBottom: 0,
  },
  urgencyCardDepthWrap: {
    borderRadius: 25,
    marginTop: 16,
    marginBottom: 0,
  },
  simpleHeaderPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 15,
    marginBottom: 0,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(36, 105, 57, 0.12)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.13)',
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'visible',
  },
  simpleStepCopy: {
    marginTop: 2,
    paddingHorizontal: 5,
  },
  simpleStepTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  simpleStepSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 3,
  },
  createHero: {
    minHeight: 248,
    borderRadius: 32,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 23,
    marginBottom: -22,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.14)',
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  scenicDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  heroSpotlight: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -58,
    right: -18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroBlob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  heroBlobLarge: {
    width: 184,
    height: 184,
    top: -62,
    right: -44,
  },
  heroBlobSmall: {
    width: 104,
    height: 104,
    top: 76,
    left: -40,
    backgroundColor: 'rgba(47, 143, 70, 0.13)',
  },
  heroBlobTiny: {
    width: 54,
    height: 54,
    top: 120,
    right: 18,
    backgroundColor: 'rgba(255, 246, 217, 0.26)',
  },
  heroCloud: {
    position: 'absolute',
    width: 64,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
  heroCloudLeft: {
    top: 89,
    left: 23,
  },
  heroCloudRight: {
    top: 54,
    right: 48,
    width: 80,
  },
  heroCloudLower: {
    top: 143,
    left: '42%',
    width: 72,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  heroHill: {
    position: 'absolute',
    left: -30,
    right: -30,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  heroHillBack: {
    height: 84,
    bottom: -20,
    backgroundColor: 'rgba(47, 143, 70, 0.15)',
  },
  heroHillMid: {
    height: 68,
    bottom: -18,
    left: -72,
    right: 64,
    backgroundColor: 'rgba(35, 107, 53, 0.12)',
  },
  heroHillFront: {
    height: 62,
    bottom: -30,
    left: 58,
    backgroundColor: 'rgba(47, 143, 70, 0.24)',
  },
  heroLeaf: {
    position: 'absolute',
    width: 10,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(35, 107, 53, 0.34)',
  },
  heroLeafOne: {
    top: 93,
    right: 95,
    transform: [{ rotate: '-24deg' }],
  },
  heroLeafTwo: {
    top: 130,
    right: 126,
    width: 8,
    backgroundColor: 'rgba(47, 143, 70, 0.28)',
    transform: [{ rotate: '28deg' }],
  },
  heroLeafThree: {
    top: 154,
    left: 78,
    width: 9,
    backgroundColor: 'rgba(35, 107, 53, 0.24)',
    transform: [{ rotate: '-18deg' }],
  },
  heroDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(47, 143, 70, 0.28)',
  },
  heroDotOne: {
    top: 68,
    left: '42%',
  },
  heroDotTwo: {
    top: 118,
    right: 38,
    width: 5,
    height: 5,
  },
  heroDotThree: {
    top: 150,
    left: 48,
    width: 4,
    height: 4,
  },
  heroDotFour: {
    top: 104,
    right: 118,
    width: 4,
    height: 4,
    backgroundColor: 'rgba(244, 197, 66, 0.42)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: secondaryHeader.minHeight,
    marginBottom: 8,
  },
  headerButton: {
    width: secondaryHeader.buttonSize,
    height: secondaryHeader.buttonSize,
    borderRadius: secondaryHeader.buttonRadius,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(36, 105, 57, 0.12)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 4,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: secondaryHeader.titleFontSize,
    lineHeight: secondaryHeader.titleLineHeight,
    fontWeight: secondaryHeader.titleFontWeight,
    textAlign: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerSpacer: {
    width: secondaryHeader.buttonSize,
    height: secondaryHeader.buttonSize,
  },
  stepper: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '84%',
    position: 'relative',
    marginBottom: 12,
    paddingTop: 2,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    zIndex: 2,
  },
  stepperTrackWrap: {
    position: 'absolute',
    top: 16,
    left: '16.67%',
    right: '16.67%',
    height: 4,
    zIndex: 0,
  },
  stepperTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 4,
    backgroundColor: theme.colors.divider,
  },
  stepperTrackActive: {
    height: 4,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: 'rgba(36, 105, 57, 0.15)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  stepCircleActive: {
    backgroundColor: theme.colors.primary,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    shadowColor: theme.colors.primaryDark,
    shadowOpacity: 0.15,
    shadowRadius: 7,
    elevation: 4,
  },
  stepCircleComplete: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: '#2F8F46',
    borderTopColor: '#62C875',
    borderBottomColor: '#1F5F2F',
  },
  stepNumber: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 6,
  },
  stepLabelActive: {
    color: theme.colors.primaryDark,
  },
  heroGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  heroMiloStage: {
    width: 104,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomColor: 'rgba(35, 107, 53, 0.12)',
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  heroMiloGround: {
    position: 'absolute',
    bottom: 7,
    width: 72,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(35, 107, 53, 0.18)',
  },
  heroMiloImage: {
    marginBottom: -5,
  },
  heroSpeechBubble: {
    flex: 1,
    minHeight: 62,
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.12)',
    justifyContent: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  heroSpeechBubbleWarning: {
    backgroundColor: theme.colors.warningSoft,
  },
  heroSpeechBubbleDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  heroSpeechTail: {
    position: 'absolute',
    left: -7,
    top: 25,
    width: 14,
    height: 14,
    backgroundColor: theme.colors.card,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.inputBorder,
    transform: [{ rotate: '45deg' }],
  },
  heroSpeechTailWarning: {
    backgroundColor: theme.colors.warningSoft,
  },
  heroSpeechTailDanger: {
    backgroundColor: theme.colors.dangerSoft,
  },
  heroSpeechText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  heroSpeechTextWarning: {
    color: '#92400E',
  },
  heroExtraContent: {
    paddingLeft: 108,
    marginTop: 8,
  },
  createSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 15,
    paddingTop: 16,
    paddingBottom: 16,
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(36, 105, 57, 0.13)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.16)',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'visible',
  },
  miloPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    ...theme.shadowSoft,
  },
  speechBubbleInvalid: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.inputBorder,
  },
  speechTail: {
    position: 'absolute',
    left: -7,
    top: 20,
    width: 14,
    height: 14,
    backgroundColor: theme.colors.primarySoft,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.inputBorder,
    transform: [{ rotate: '45deg' }],
  },
  speechTailInvalid: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.inputBorder,
  },
  speechText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    ...theme.shadowSoft,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1.2,
    borderColor: 'rgba(36, 105, 57, 0.10)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.11)',
    marginBottom: 0,
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.035,
    shadowRadius: 5,
    elevation: 1,
    overflow: 'visible',
  },
  detailCardInvalid: {
    backgroundColor: '#FFF4F4',
    borderColor: '#F4B4B4',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(220, 38, 38, 0.28)',
    shadowColor: '#7F1D1D',
  },
  detailCardInvalidDark: {
    backgroundColor: theme.colors.input,
    borderColor: theme.colors.danger,
    borderTopColor: theme.colors.danger,
    borderBottomColor: theme.colors.danger,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.1,
  },
  detailCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderBottomWidth: 1.2,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.12)',
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  input: {
    minHeight: 38,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 2,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  inputInvalid: {
    borderTopColor: '#F8CACA',
  },
  fieldErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 13,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.16)',
  },
  fieldErrorText: {
    flex: 1,
    color: theme.colors.danger,
    fontSize: 11.5,
    fontWeight: '800',
    lineHeight: 16,
    marginLeft: 6,
  },
  multilineInput: {
    minHeight: 58,
    paddingTop: 9,
    lineHeight: 19,
  },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(36, 105, 57, 0.12)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: 4,
    paddingHorizontal: 7,
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.045,
    shadowRadius: 5,
    elevation: 2,
  },
  segmentSelected: {
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.16)',
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.055,
    shadowRadius: 5,
    elevation: 2,
  },
  segmentText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 5,
  },
  priorityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  singleFooter: {
    marginTop: 4,
  },
  primaryButtonDepth: {
    borderRadius: 21,
    backgroundColor: '#167A38',
    paddingRight: 0,
    paddingBottom: 2,
    shadowColor: '#0B3D1E',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 7,
    elevation: 4,
  },
  primaryButtonFace: {
    minHeight: 52,
    borderRadius: 19,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#46AE5A',
    borderTopColor: '#7BE58B',
  },
  secondaryButtonDepth: {
    borderRadius: 21,
    backgroundColor: 'rgba(190, 216, 194, 0.32)',
    paddingRight: 0,
    paddingBottom: 1,
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.055,
    shadowRadius: 5,
    elevation: 2,
  },
  secondaryButtonFace: {
    minHeight: 48,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(36, 105, 57, 0.12)',
    borderTopColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 19,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderBottomWidth: 1.8,
    borderColor: '#46AE5A',
    borderTopColor: '#7BE58B',
    borderBottomColor: '#17813A',
    shadowColor: '#0F4F25',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.11,
    shadowRadius: 7,
    elevation: 4,
    overflow: 'visible',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  primaryButtonTextCentered: {
    textAlign: 'center',
  },
  primaryButtonLeftIcon: {
    width: 24,
    alignItems: 'flex-start',
  },
  primaryButtonRightIcon: {
    position: 'absolute',
    right: 16,
    width: 24,
    alignItems: 'flex-end',
  },
  disabledButton: {
    opacity: 0.65,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(36, 105, 57, 0.12)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 3,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  scheduleMiloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  scheduleMilo: {
    marginLeft: -2,
  },
  scheduleBubbleArea: {
    flex: 1,
    marginLeft: 8,
  },
  scheduleBubble: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    ...theme.shadowSoft,
  },
  scheduleBubbleConflict: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.inputBorder,
  },
  scheduleBubbleTail: {
    position: 'absolute',
    left: -7,
    top: 22,
    width: 14,
    height: 14,
    backgroundColor: theme.colors.primarySoft,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.inputBorder,
    transform: [{ rotate: '45deg' }],
  },
  scheduleBubbleTailConflict: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.inputBorder,
  },
  scheduleBubbleText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  scheduleBubbleTextConflict: {
    color: '#92400E',
  },
  conflictActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  conflictButton: {
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginRight: 7,
    marginBottom: 4,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  conflictButtonText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '900',
  },
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(36, 105, 57, 0.11)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.13)',
    shadowColor: '#174726',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.045,
    shadowRadius: 7,
    elevation: 2,
    overflow: 'visible',
  },
  miloTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 24,
    padding: 13,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(35, 107, 53, 0.12)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 11,
    },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 6,
  },
  miloTipMiloBadge: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    ...theme.shadowSoft,
  },
  miloTipCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },
  miloTipTitle: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  miloTipText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 3,
  },
  scheduleRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  scheduleInputRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  scheduleRowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  scheduleLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    width: 120,
  },
  scheduleValue: {
    flex: 1,
    color: theme.colors.mutedText,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(34, 40, 49, 0.28)',
    justifyContent: 'flex-end',
    padding: 14,
  },
  sheet: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    ...theme.shadow,
  },
  meetingSheet: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    ...theme.shadow,
  },
  confirmSheet: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    ...theme.shadow,
  },
  confirmMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmIconBox: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: theme.colors.warningSoft,
    borderWidth: 1,
    borderColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  confirmBubble: {
    flex: 1,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 9,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  confirmText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 19,
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionList: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
  },
  sheetOption: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(253, 247, 233, 0.32)',
  },
  sheetOptionActive: {
    backgroundColor: theme.colors.primarySoft,
  },
  sheetOptionText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  customBox: {
    backgroundColor: theme.colors.input,
    borderRadius: 18,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    ...theme.shadowSoft,
  },
  customLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customInput: {
    minWidth: 58,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  customUnitText: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 9,
    flex: 1,
  },
  customApplyButton: {
    minHeight: 40,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  customApplyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  sheetTextInput: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 13,
  },
  meetingHelperText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 10,
  },
  meetingInputInvalid: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.inputBorder,
  },
  detectedProviderPill: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.purpleSoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginTop: 10,
  },
  detectedProviderText: {
    color: theme.colors.purple,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 5,
  },
  meetingErrorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 8,
  },
  meetingActionRow: {
    marginTop: 12,
  },
  meetingSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meetingRemoveButton: {
    minHeight: 38,
    borderRadius: 15,
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 9,
  },
  meetingRemoveButtonText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  locationHelperText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 10,
  },
  locationQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  quickPill: {
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  quickPillText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  sheetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  unitSegmentRow: {
    flex: 1,
    flexDirection: 'row',
    marginLeft: 8,
  },
  unitSegment: {
    flex: 1,
    minHeight: 38,
    borderRadius: 13,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopColor: '#FDF7E978',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 5,
    paddingHorizontal: 4,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  unitSegmentActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  unitSegmentText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
  },
  unitSegmentTextActive: {
    color: theme.colors.primaryDark,
  },
  fullApplyButton: {
    minHeight: 42,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    borderBottomColor: '#1E6C34',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  inlineInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    paddingVertical: 8,
  },
  minuteText: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4,
  },
  locationInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    paddingVertical: 8,
  },
  reminderTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 12,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  reminderChip: {
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
    marginBottom: 10,
  },
  reminderChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  reminderChipText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '900',
  },
  reminderChipTextActive: {
    color: theme.colors.primaryDark,
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 22,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    ...theme.shadowSoft,
  },
  supportTextArea: {
    flex: 1,
    marginLeft: 10,
  },
  supportTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  supportText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 3,
  },
  warningCard: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 22,
    padding: 13,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    ...theme.shadowSoft,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningTitle: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 6,
  },
  warningText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6,
  },
  warningActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  warningButton: {
    backgroundColor: theme.colors.card,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 7,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  warningButtonText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '900',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  footerPrimary: {
    flex: 1,
    marginLeft: 10,
  },
  reviewMiloPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -4,
    marginBottom: 10,
  },
  reviewMiloImage: {
    marginLeft: -6,
    marginRight: 2,
  },
  reviewSpeechBubble: {
    flex: 1,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    borderBottomColor: 'rgba(46, 125, 75, 0.08)',
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 5,
  },
  reviewSpeechTail: {
    position: 'absolute',
    left: -7,
    top: 24,
    width: 14,
    height: 14,
    backgroundColor: theme.colors.primarySoft,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.inputBorder,
    transform: [{ rotate: '45deg' }],
  },
  reviewSpeechText: {
    color: theme.colors.text,
    fontSize: 13.5,
    fontWeight: '900',
    lineHeight: 19,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 8,
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(36, 105, 57, 0.12)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.12)',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'visible',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#4DBA62',
    borderTopColor: '#7CE38D',
    shadowColor: theme.colors.primaryDark,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.15,
    shadowRadius: 9,
    elevation: 3,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 15.5,
    fontWeight: '900',
  },
  summaryEditButton: {
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.18)',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  summaryEditText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 4,
  },
  summaryRows: {
    backgroundColor: theme.colors.card,
  },
  reviewSummaryRow: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  reviewSummaryRowLast: {
    borderBottomWidth: 0,
  },
  reviewRowIcon: {
    width: 26,
    height: 26,
    borderRadius: 10,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.16)',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  reviewSummaryLabel: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '800',
    width: 96,
  },
  reviewSummaryValue: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12.5,
    fontWeight: '900',
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  reviewSummaryValueBadge: {
    maxWidth: 116,
    minHeight: 27,
    borderRadius: 999,
    borderWidth: 1,
    borderBottomWidth: 1.4,
    paddingHorizontal: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
    borderTopColor: '#FFFFFF',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  reviewSummaryBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  summaryRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  summaryLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    width: 82,
  },
  summaryValue: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 22,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderTopColor: '#FDF7E978',
    ...theme.shadowSoft,
  },
  insightText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginLeft: 10,
  },
  urgencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 0,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(36, 105, 57, 0.12)',
    borderTopColor: '#FFFFFF',
    borderBottomColor: 'rgba(30, 111, 54, 0.14)',
    shadowColor: '#10391D',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'visible',
  },
  urgencyIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  urgencyLabel: {
    color: theme.colors.text,
    fontSize: 13.5,
    fontWeight: '900',
  },
  urgencyTextArea: {
    flex: 1,
    paddingRight: 10,
  },
  urgencyHint: {
    color: theme.colors.mutedText,
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 2,
  },
  urgencyBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    shadowColor: theme.colors.shadow,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.1,
    shadowRadius: 9,
    elevation: 3,
  },
  urgencyBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  reviewConflictNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
  },
  reviewConflictText: {
    flex: 1,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginLeft: 8,
  },
  timeline: {
    flexDirection: 'row',
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
  },
  timelineDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: theme.colors.primary,
    marginBottom: 7,
  },
  timelineLine: {
    position: 'absolute',
    top: 6,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: theme.colors.primarySoft,
  },
  timelineText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  planChip: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  planChipText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
});
