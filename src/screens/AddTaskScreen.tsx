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
import { useTasks } from '../lib/TaskContext';
import { schedulePlannerReminder } from '../lib/notificationUtils';
import { buildMiloSmartData } from '../lib/miloSmartPlan';
import { findMiloConflict, moveDraftTime } from '../lib/miloConflicts';
import {
  dateFromStorage,
  formatDateForStorage,
  formatTimeForStorage,
  timeFromStorage,
} from '../lib/dateTimeUtils';
import { isPhysicalLocationLikeValue } from '../lib/locationPickerUtils';

import ScreenContainer from '../components/ui/ScreenContainer';
import NoticeCard from '../components/ui/NoticeCard';
import MiloMoodImage from '../components/milo/MiloMoodImage';
import SmartLocationPickerModal from '../components/SmartLocationPickerModal';

type Props = NativeStackScreenProps<RootStackParamList, 'AddTask'>;

type PickerMode = 'date' | 'time' | null;
type ScheduleSheet = 'duration' | 'location' | 'reminder' | null;
type ReminderUnit = 'minutes' | 'hours' | 'days';

const SCHEDULE_MILO_ROTATION_MS = 57000;
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

function getScheduleMiloMessages({
  dueDate,
  dueTime,
  estimatedDurationMinutes,
  plannerType,
  conflictInfo,
  overlapAccepted,
}: {
  dueDate: string;
  dueTime: string;
  estimatedDurationMinutes?: number;
  plannerType: PlannerType;
  conflictInfo?: MiloConflictInfo;
  overlapAccepted: boolean;
}) {
  const noFixedDuration = estimatedDurationMinutes === undefined;
  const selectedTimeLabel = conflictInfo?.selectedTimeLabel || dueTime || 'this time';
  const conflictingTitle = conflictInfo?.conflictingTitle || 'that plan';
  const conflictingStart =
    conflictInfo?.conflictingStartTimeLabel ||
    conflictInfo?.conflictingTime ||
    'the same time';
  const conflictingEnd = conflictInfo?.conflictingEndTimeLabel;

  if (
    overlapAccepted &&
    (conflictInfo?.level === 'hard' ||
      conflictInfo?.level === 'soft' ||
      conflictInfo?.level === 'same_time')
  ) {
    return [
      'Okay, Milo will keep an extra eye on both.',
      'This stays high focus.',
      "Milo saved it, but we'll stay careful.",
    ];
  }

  if (conflictInfo?.type === 'same_time' || conflictInfo?.level === 'same_time') {
    return [
      `Milo noticed this shares ${selectedTimeLabel} with ${conflictingTitle}.`,
      'Both plans start at the same time.',
      'You can keep both, or Milo can find a calmer time.',
    ];
  }

  if (
    conflictInfo?.type === 'hard_overlap' ||
    conflictInfo?.type === 'ongoing_overlap' ||
    conflictInfo?.level === 'hard'
  ) {
    return [
      `${conflictingTitle} may still be ongoing at ${selectedTimeLabel}.`,
      conflictingEnd
        ? `It could finish around ${conflictingEnd}.`
        : `It starts around ${conflictingStart}.`,
      'Want to keep both, or choose another time?',
    ];
  }

  if (
    conflictInfo?.type === 'whole_day' ||
    conflictInfo?.type === 'soft_overlap' ||
    conflictInfo?.level === 'soft'
  ) {
    return [
      `This is during ${conflictingTitle}.`,
      'You can keep both if that still works.',
      'Milo can help you leave a gentle buffer.',
    ];
  }

  if (noFixedDuration) {
    return [
      'No fixed duration is okay.',
      'Milo will focus on the deadline.',
      "We can plan small steps before it's due.",
    ];
  }

  if (!dueDate || !dueTime) {
    return [
      "Pick a time and I'll help.",
      'Milo will watch the plan with you.',
      'Choose the schedule gently.',
    ];
  }

  return plannerType === 'task'
    ? [
        'This time looks calm so far.',
        'Milo will watch the plan with you.',
        'Choose the schedule gently.',
      ]
    : [
        'This slot looks okay so far.',
        'Milo will watch the plan with you.',
        'Leave a little room if you need it.',
      ];
}

function Header({
  onBack,
  showAvatar = true,
}: {
  onBack: () => void;
  showAvatar?: boolean;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        activeOpacity={0.82}
        style={styles.headerButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={21} color={theme.colors.text} />
      </TouchableOpacity>

      <Text style={styles.headerTitle}>FocusMate</Text>

      {showAvatar ? (
        <View style={styles.headerAvatar}>
          <MiloMoodImage mood="happy" size={34} />
        </View>
      ) : (
        <View style={styles.headerSpacer} />
      )}
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  invalid?: boolean;
}) {
  return (
    <View style={[styles.detailCard, invalid && styles.detailCardInvalid]}>
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
    <View style={styles.detailCard}>
      <View style={styles.detailCardHeader}>
        <View style={styles.detailIcon}>
          <Ionicons name={icon} size={17} color={theme.colors.primaryDark} />
        </View>
        <FieldLabel label={label} />
      </View>
      {children}
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
      style={[styles.primaryButton, loading && styles.disabledButton]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
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
      style={styles.secondaryButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

export default function AddTaskScreen({ navigation }: Props) {
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
  const [reminder, setReminder] = useState<ReminderOption>('none');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState<
    number | undefined
  >(60);
  const [overlapAccepted, setOverlapAccepted] = useState(false);
  const [acceptedConflictSignature, setAcceptedConflictSignature] = useState<
    string | null
  >(null);
  const [showOverlapConfirm, setShowOverlapConfirm] = useState(false);
  const [scheduleMiloMessageIndex, setScheduleMiloMessageIndex] = useState(0);

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [scheduleSheet, setScheduleSheet] = useState<ScheduleSheet>(null);
  const [customDurationText, setCustomDurationText] = useState('3');
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
  const scheduleMiloMessages = useMemo(
    () =>
      getScheduleMiloMessages({
        dueDate,
        dueTime,
        estimatedDurationMinutes,
        plannerType,
        conflictInfo,
        overlapAccepted: currentConflictAccepted,
      }),
    [
      conflictInfo,
      dueDate,
      dueTime,
      estimatedDurationMinutes,
      currentConflictAccepted,
      plannerType,
    ]
  );
  const scheduleMiloMessageSignature = scheduleMiloMessages.join('|');
  const scheduleMiloBubbleText =
    scheduleMiloMessages[
      Math.min(scheduleMiloMessageIndex, scheduleMiloMessages.length - 1)
    ] || "Pick a time and I'll help.";
  const reviewMiloUrgency =
    currentConflictAccepted && hasScheduleConflict ? 'high' : smartData.urgency;
  const reviewMiloMessage = currentConflictAccepted && hasScheduleConflict
    ? "Milo noted both plans. We'll stay careful."
    : reviewMiloUrgency === 'high'
    ? 'This needs your focus soon.'
    : priority === 'high'
    ? 'Milo thinks this deserves extra attention.'
    : plannerType === 'meeting'
    ? 'Milo checked the meeting plan.'
    : "Looks good. Ready to save?";
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
  const miloPromptText = isTitleInvalid
    ? 'Milo needs a title first so I know what to help with.'
    : "Tell Milo what you're planning.";

  useEffect(() => {
    setScheduleMiloMessageIndex(0);
  }, [scheduleMiloMessageSignature]);

  useEffect(() => {
    if (step !== 2 || scheduleMiloMessages.length <= 1) return undefined;

    const intervalId = setInterval(() => {
      setScheduleMiloMessageIndex((current) =>
        (current + 1) % scheduleMiloMessages.length
      );
    }, SCHEDULE_MILO_ROTATION_MS);

    return () => clearInterval(intervalId);
  }, [scheduleMiloMessages.length, scheduleMiloMessageSignature, step]);

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
    <ScreenContainer topPadding={2} bottomPadding={40}>
      <Header onBack={() => navigation.goBack()} showAvatar={step === 1} />
      <Stepper step={step} />

      {notice ? (
        <NoticeCard
          type={notice.type}
          title={notice.title}
          message={notice.message}
        />
      ) : null}

      {step === 1 ? (
        <>
          <View style={styles.miloPrompt}>
            <MiloMoodImage mood="waving" size={84} />
            <View
              style={[
                styles.speechBubble,
                isTitleInvalid && styles.speechBubbleInvalid,
              ]}
            >
              <View
                style={[
                  styles.speechTail,
                  isTitleInvalid && styles.speechTailInvalid,
                ]}
              />
              <Text style={styles.speechText}>{miloPromptText}</Text>
            </View>
          </View>

          <FormInput
            label="Title"
            value={title}
            onChangeText={handleTitleChange}
            placeholder="Example: Assignment Lab"
            icon="document-text-outline"
            invalid={isTitleInvalid}
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
          <View style={styles.scheduleMiloRow}>
            <MiloMoodImage
              mood={
                hasScheduleConflict && !currentConflictAccepted ? 'worried' : 'happy'
              }
              size={92}
              style={styles.scheduleMilo}
            />
            <View style={styles.scheduleBubbleArea}>
              <View
                style={[
                  styles.scheduleBubble,
                  hasScheduleConflict && styles.scheduleBubbleConflict,
                ]}
              >
                <View
                  style={[
                    styles.scheduleBubbleTail,
                    hasScheduleConflict && styles.scheduleBubbleTailConflict,
                  ]}
                />
                <Text
                  style={[
                    styles.scheduleBubbleText,
                    hasScheduleConflict && styles.scheduleBubbleTextConflict,
                  ]}
                >
                  {scheduleMiloBubbleText}
                </Text>
              </View>

              {hasScheduleConflict ? (
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
              label="Final Reminder"
              value={reminderLabel}
              placeholder="No reminder"
              icon="notifications-outline"
              onPress={() => setScheduleSheet('reminder')}
              last
            />
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
          <View style={styles.reviewMiloPrompt}>
            <MiloMoodImage
              mood={currentConflictAccepted && hasScheduleConflict ? 'focused' : 'happy'}
              size={104}
              style={styles.reviewMiloImage}
            />
            <View style={styles.reviewSpeechBubble}>
              <View style={styles.reviewSpeechTail} />
              <Text style={styles.reviewSpeechText}>{reviewMiloMessage}</Text>
            </View>
          </View>

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
                icon="notifications-outline"
                label="Final Reminder"
                value={reminderLabel}
                last
              />
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
              <Text style={styles.urgencyLabel}>Milo Urgency</Text>
              <Text style={styles.urgencyHint}>Milo will help you stay on track</Text>
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
            <View style={styles.confirmMiloRow}>
              <MiloMoodImage mood="focused" size={58} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
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
    width: 36,
    height: 36,
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
    top: 15,
    left: '16.67%',
    right: '16.67%',
    height: 2,
    zIndex: 0,
  },
  stepperTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#DDE5EC',
  },
  stepperTrackActive: {
    height: 2,
    borderRadius: 2,
    backgroundColor: '#AEE8BE',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#DDE5EC',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    ...theme.shadowSoft,
  },
  stepCircleActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  stepCircleComplete: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primaryDark,
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
    borderColor: '#CFEFDA',
    ...theme.shadowSoft,
  },
  speechBubbleInvalid: {
    backgroundColor: '#FFF5F5',
    borderColor: '#F8CACA',
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
    borderColor: '#CFEFDA',
    transform: [{ rotate: '45deg' }],
  },
  speechTailInvalid: {
    backgroundColor: '#FFF5F5',
    borderColor: '#F8CACA',
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
    ...theme.shadowSoft,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  detailCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingTop: 11,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 9,
    ...theme.shadowSoft,
  },
  detailCardInvalid: {
    backgroundColor: '#FFFAFA',
    borderColor: '#F8CACA',
  },
  detailCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailIcon: {
    width: 28,
    height: 28,
    borderRadius: 11,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
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
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: 4,
    paddingHorizontal: 7,
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
  primaryButton: {
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    ...theme.shadowSoft,
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
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
    borderColor: '#CFEFDA',
    ...theme.shadowSoft,
  },
  scheduleBubbleConflict: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
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
    borderColor: '#CFEFDA',
    transform: [{ rotate: '45deg' }],
  },
  scheduleBubbleTailConflict: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#FED7AA',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginRight: 7,
    marginBottom: 4,
  },
  conflictButtonText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '900',
  },
  scheduleCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadowSoft,
  },
  scheduleRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
  },
  scheduleLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    width: 120,
  },
  scheduleValue: {
    flex: 1,
    color: theme.colors.textSoft,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  confirmSheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 15,
    borderWidth: 1,
    borderColor: '#FED7AA',
    ...theme.shadow,
  },
  confirmMiloRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmBubble: {
    flex: 1,
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 9,
    borderWidth: 1,
    borderColor: '#FED7AA',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionList: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sheetOption: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 13,
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
    backgroundColor: theme.colors.backgroundSoft,
    borderRadius: 18,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  },
  customApplyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  sheetTextInput: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 13,
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
    borderColor: '#CFEFDA',
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 5,
    paddingHorizontal: 4,
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
    borderColor: '#CFEFDA',
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
    backgroundColor: '#FFF1E8',
    borderRadius: 22,
    padding: 13,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
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
    backgroundColor: theme.colors.surface,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 7,
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
    backgroundColor: '#ECFAF0',
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: '#CDEFD8',
    shadowColor: '#0F5132',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 1,
  },
  reviewSpeechTail: {
    position: 'absolute',
    left: -7,
    top: 24,
    width: 14,
    height: 14,
    backgroundColor: '#ECFAF0',
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CDEFD8',
    transform: [{ rotate: '45deg' }],
  },
  reviewSpeechText: {
    color: theme.colors.text,
    fontSize: 13.5,
    fontWeight: '900',
    lineHeight: 19,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 7,
    borderWidth: 1,
    borderColor: '#E4EAEF',
    shadowColor: '#111827',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.045,
    shadowRadius: 14,
    elevation: 2,
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
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 15.5,
    fontWeight: '900',
  },
  summaryEditButton: {
    minHeight: 27,
    borderRadius: 999,
    backgroundColor: '#ECFAF0',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#CDEFD8',
  },
  summaryEditText: {
    color: theme.colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 4,
  },
  summaryRows: {
    backgroundColor: theme.colors.surface,
  },
  reviewSummaryRow: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F5',
  },
  reviewSummaryRowLast: {
    borderBottomWidth: 0,
  },
  reviewRowIcon: {
    width: 24,
    height: 24,
    borderRadius: 9,
    backgroundColor: '#F3FBF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  reviewSummaryLabel: {
    color: '#4B5563',
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
    minHeight: 25,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
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
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 11,
    borderWidth: 1,
    borderColor: '#E4EAEF',
    shadowColor: '#111827',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  urgencyIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
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
    color: '#6B7280',
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 2,
  },
  urgencyBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  urgencyBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  reviewConflictNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FDBA74',
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
