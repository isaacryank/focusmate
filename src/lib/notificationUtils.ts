import { LogBox, Platform } from 'react-native';

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
]);

const Notifications = require('expo-notifications') as typeof import('expo-notifications');

import { PlannerType, ReminderOption } from '../types/task';

const CHANNEL_ID = 'planner-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type SchedulePlannerReminderInput = {
  taskId: string;
  title: string;
  plannerType: PlannerType;
  dueDate?: string;
  dueTime?: string;
  location?: string;
  reminder: ReminderOption;
  manualReminderMinutes?: number;
};

type SchedulePlannerReminderResult =
  | {
      ok: true;
      notificationId: string;
      scheduledFor: string;
    }
  | {
      ok: false;
      reason: string;
    };

export async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Planner Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#55C878',
    });
  }
}

export async function requestNotificationPermission() {
  await setupNotificationChannel();

  const existingPermission = await Notifications.getPermissionsAsync();

  if (existingPermission.status === 'granted') {
    return true;
  }

  const requestedPermission = await Notifications.requestPermissionsAsync();

  return requestedPermission.status === 'granted';
}

function getPlannerTypeLabel(type: PlannerType) {
  if (type === 'meeting') return 'meeting';
  if (type === 'date') return 'important date';
  return 'task';
}

function getReminderOffsetMs(reminder: ReminderOption, manualReminderMinutes?: number) {
  switch (reminder) {
    case 'custom': {
      if (
        typeof manualReminderMinutes !== 'number' ||
        !Number.isFinite(manualReminderMinutes) ||
        manualReminderMinutes < 0
      ) {
        return null;
      }

      return Math.max(manualReminderMinutes || 0, 0) * 60 * 1000;
    }
    case '10min':
      return 10 * 60 * 1000;
    case '30min':
      return 30 * 60 * 1000;
    case '1hour':
      return 60 * 60 * 1000;
    case '1day':
      return 24 * 60 * 60 * 1000;
    case 'atTime':
    case 'none':
    default:
      return 0;
  }
}

function parsePlannerDateTime(dueDate?: string, dueTime?: string) {
  if (!dueDate) return null;

  const dateMatch = dueDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  const timeValue = dueTime?.trim() || '9:00 AM';

  const timeMatch = timeValue
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || '0');
  const meridian = timeMatch[3];

  if (minute < 0 || minute > 59) return null;

  if (meridian) {
    if (hour < 1 || hour > 12) return null;

    if (meridian === 'AM' && hour === 12) {
      hour = 0;
    }

    if (meridian === 'PM' && hour !== 12) {
      hour += 12;
    }
  } else {
    if (hour < 0 || hour > 23) return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export async function schedulePlannerReminder(
  input: SchedulePlannerReminderInput
): Promise<SchedulePlannerReminderResult> {
  if (input.reminder === 'none') {
    return {
      ok: false,
      reason: 'No reminder selected.',
    };
  }

  const permissionGranted = await requestNotificationPermission();

  if (!permissionGranted) {
    return {
      ok: false,
      reason:
        'Notification permission was not granted. Please allow notifications to receive reminders.',
    };
  }

  const eventDate = parsePlannerDateTime(input.dueDate, input.dueTime);

  if (!eventDate) {
    return {
      ok: false,
      reason:
        'Please choose a valid date and time before setting a reminder.',
    };
  }

  const reminderOffsetMs = getReminderOffsetMs(
    input.reminder,
    input.manualReminderMinutes
  );

  if (reminderOffsetMs === null) {
    return {
      ok: false,
      reason: 'Please choose a valid custom reminder time.',
    };
  }

  const scheduledDate = new Date(eventDate.getTime() - reminderOffsetMs);

  if (
    !Number.isFinite(scheduledDate.getTime()) ||
    scheduledDate.getTime() <= Date.now()
  ) {
    return {
      ok: false,
      reason:
        'The reminder time is already in the past. Choose a future date/time or a shorter reminder option.',
    };
  }

  const typeLabel = getPlannerTypeLabel(input.plannerType);

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Milo reminder: ${input.title}`,
        body: `You have a ${typeLabel}${
          input.location ? ` at ${input.location}` : ''
        }. Open FocusMate and get ready.`,
        data: {
          taskId: input.taskId,
          plannerType: input.plannerType,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledDate,
        channelId: CHANNEL_ID,
      },
    });

    return {
      ok: true,
      notificationId,
      scheduledFor: scheduledDate.toISOString(),
    };
  } catch (error) {
    console.log('Failed to schedule planner reminder:', error);

    return {
      ok: false,
      reason:
        'Milo could not schedule this reminder. Please check notification settings and try again.',
    };
  }
}

export async function scheduleTestNotification() {
  const permissionGranted = await requestNotificationPermission();

  if (!permissionGranted) {
    return false;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Milo test reminder',
      body: 'Your FocusMate reminders are working.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CHANNEL_ID,
    },
  });

  return true;
}

export async function cancelPlannerReminder(notificationId?: string) {
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.log('Failed to cancel notification:', error);
  }
}
