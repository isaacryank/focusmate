import { Platform, Vibration } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { requestNotificationPermission } from './notificationUtils';

const Notifications = require('expo-notifications') as typeof import('expo-notifications');
const miloTimerDoneAudio = require('../../assets/audio/milo_timer_done.mp3');

const FOCUS_ALERT_CHANNEL_ID = 'focus-timer-alerts';
const ALERT_VIBRATION_PATTERN = [0, 350, 150, 350];

let activeAlertPlayer: AudioPlayer | null = null;
let isAlertLoopStarting = false;
let alertLoopRequestId = 0;

export type FocusAlertType =
  | 'focusComplete'
  | 'shortBreakComplete'
  | 'longBreakComplete';

const focusAlertNotificationCopy: Record<
  FocusAlertType,
  { title: string; body: string }
> = {
  focusComplete: {
    title: 'Focus block done',
    body: "Milo says it's time for a break.",
  },
  shortBreakComplete: {
    title: 'Break done',
    body: 'Ready for your next focus block?',
  },
  longBreakComplete: {
    title: 'Long break done',
    body: 'Nice rest! Ready to continue with Milo?',
  },
};

async function setupFocusAlertChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(FOCUS_ALERT_CHANNEL_ID, {
    name: 'Focus Timer Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 350, 150, 350],
    lightColor: '#55C878',
  });
}

export async function scheduleFocusTimerCompletionNotification(
  alertType: FocusAlertType,
  delayMs: number
) {
  try {
    const permissionGranted = await requestNotificationPermission();

    if (!permissionGranted) return null;

    await setupFocusAlertChannel();

    const notificationCopy = focusAlertNotificationCopy[alertType];

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: notificationCopy.title,
        body: notificationCopy.body,
        data: {
          alertType,
          source: 'focusTimer',
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.ceil(delayMs / 1000)),
        channelId: FOCUS_ALERT_CHANNEL_ID,
      },
    });
  } catch (error) {
    console.log('Failed to schedule focus timer alert:', error);
    return null;
  }
}

export async function cancelFocusTimerCompletionNotification(
  notificationId?: string | null
) {
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.log('Failed to cancel focus timer alert:', error);
  }
}

async function triggerFocusAlertFeedback() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics can fail on unsupported devices; vibration below is the fallback.
  }

  try {
    Vibration.vibrate(ALERT_VIBRATION_PATTERN);
  } catch {
    // Alert feedback is best-effort and should never block Pomodoro flow.
  }
}

export async function startFocusAlertLoop(_alertType?: FocusAlertType) {
  if (activeAlertPlayer || isAlertLoopStarting) return;

  const requestId = alertLoopRequestId + 1;
  alertLoopRequestId = requestId;
  isAlertLoopStarting = true;
  await triggerFocusAlertFeedback();

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    if (requestId !== alertLoopRequestId) return;

    const player = createAudioPlayer(miloTimerDoneAudio, {
      updateInterval: 1000,
    });

    if (requestId !== alertLoopRequestId) {
      player.remove();
      return;
    }

    activeAlertPlayer = player;
    player.loop = true;
    player.volume = 1;
    player.play();
  } catch (error) {
    console.log('Failed to play focus timer alert audio:', error);

    if (activeAlertPlayer) {
      try {
        activeAlertPlayer.pause();
        activeAlertPlayer.remove();
      } catch {
        // Audio cleanup is best-effort after playback failures.
      }
    }

    activeAlertPlayer = null;
  } finally {
    isAlertLoopStarting = false;
  }
}

export async function stopFocusAlertLoop() {
  try {
    Vibration.cancel();
  } catch {
    // Nothing to clean up on platforms without vibration support.
  }

  const player = activeAlertPlayer;
  activeAlertPlayer = null;
  isAlertLoopStarting = false;
  alertLoopRequestId += 1;

  if (!player) return;

  try {
    player.pause();
  } catch {
    // Playback may already be stopped or unavailable.
  }

  try {
    await player.seekTo(0);
  } catch {
    // Rewinding is best-effort before unloading.
  }

  try {
    player.remove();
  } catch {
    // Unloading is best-effort on unsupported platforms.
  }
}

export async function playFocusAlert(alertType: FocusAlertType) {
  await startFocusAlertLoop(alertType);
}

export function stopFocusAlertFeedback() {
  void stopFocusAlertLoop();
}
