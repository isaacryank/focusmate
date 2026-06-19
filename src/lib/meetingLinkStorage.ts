import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  OnlineMeetingProvider,
  buildMeetingDisplayLabel,
  detectMeetingProvider,
  isLikelyMeetingUrl,
  normalizeMeetingUrl,
} from './meetingLinkUtils';

export const ONLINE_MEETING_LINKS_STORAGE_KEY =
  '@focusmate/online-meeting-links/v1';

export type OnlineMeetingLink = {
  id: string;
  taskId: string;
  taskTitle?: string;
  provider: OnlineMeetingProvider;
  url: string;
  label?: string;
  createdAt: string;
  updatedAt: string;
};

type SaveOnlineMeetingLinkInput = {
  taskId: string;
  taskTitle?: string;
  url: string;
  label?: string;
};

function normalizeStoredMeetingLink(value: unknown): OnlineMeetingLink | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const meetingLink = value as Partial<OnlineMeetingLink>;
  const taskId = meetingLink.taskId?.trim();
  const normalizedUrl = normalizeMeetingUrl(meetingLink.url || '');

  if (!taskId || !isLikelyMeetingUrl(normalizedUrl)) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: meetingLink.id || `${taskId}-${Date.now()}`,
    taskId,
    taskTitle: meetingLink.taskTitle?.trim() || undefined,
    provider: detectMeetingProvider(normalizedUrl),
    url: normalizedUrl,
    label: meetingLink.label?.trim() || buildMeetingDisplayLabel(normalizedUrl),
    createdAt: meetingLink.createdAt || now,
    updatedAt: meetingLink.updatedAt || meetingLink.createdAt || now,
  };
}

async function persistOnlineMeetingLinks(meetingLinks: OnlineMeetingLink[]) {
  await AsyncStorage.setItem(
    ONLINE_MEETING_LINKS_STORAGE_KEY,
    JSON.stringify(meetingLinks)
  );
}

export async function loadOnlineMeetingLinks(): Promise<OnlineMeetingLink[]> {
  try {
    const storedMeetingLinks = await AsyncStorage.getItem(
      ONLINE_MEETING_LINKS_STORAGE_KEY
    );

    if (!storedMeetingLinks) {
      return [];
    }

    const parsedMeetingLinks = JSON.parse(storedMeetingLinks);

    if (!Array.isArray(parsedMeetingLinks)) {
      return [];
    }

    return parsedMeetingLinks
      .map(normalizeStoredMeetingLink)
      .filter(
        (meetingLink): meetingLink is OnlineMeetingLink =>
          Boolean(meetingLink)
      );
  } catch (error) {
    console.warn('Failed to load online meeting links:', error);
    return [];
  }
}

export async function getOnlineMeetingLinkForTask(
  taskId: string
): Promise<OnlineMeetingLink | null> {
  const meetingLinks = await loadOnlineMeetingLinks();
  const normalizedTaskId = taskId.trim();

  return (
    meetingLinks.find((meetingLink) => meetingLink.taskId === normalizedTaskId) ||
    null
  );
}

export async function saveOnlineMeetingLink(
  input: SaveOnlineMeetingLinkInput
): Promise<OnlineMeetingLink> {
  const taskId = input.taskId.trim();
  const normalizedUrl = normalizeMeetingUrl(input.url);

  if (!taskId || !isLikelyMeetingUrl(normalizedUrl)) {
    throw new Error('Invalid online meeting link');
  }

  const currentMeetingLinks = await loadOnlineMeetingLinks();
  const existingMeetingLink = currentMeetingLinks.find(
    (meetingLink) => meetingLink.taskId === taskId
  );
  const now = new Date().toISOString();
  const nextMeetingLink: OnlineMeetingLink = {
    id: existingMeetingLink?.id || `${taskId}-${Date.now()}`,
    taskId,
    taskTitle: input.taskTitle?.trim() || existingMeetingLink?.taskTitle,
    provider: detectMeetingProvider(normalizedUrl),
    url: normalizedUrl,
    label: input.label?.trim() || buildMeetingDisplayLabel(normalizedUrl),
    createdAt: existingMeetingLink?.createdAt || now,
    updatedAt: now,
  };
  const nextMeetingLinks = [
    nextMeetingLink,
    ...currentMeetingLinks.filter((meetingLink) => meetingLink.taskId !== taskId),
  ];

  try {
    await persistOnlineMeetingLinks(nextMeetingLinks);
    return nextMeetingLink;
  } catch (error) {
    console.warn('Failed to save online meeting link:', error);
    throw error;
  }
}

export async function deleteOnlineMeetingLinkForTask(
  taskId: string
): Promise<void> {
  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    return;
  }

  const currentMeetingLinks = await loadOnlineMeetingLinks();
  const nextMeetingLinks = currentMeetingLinks.filter(
    (meetingLink) => meetingLink.taskId !== normalizedTaskId
  );

  try {
    await persistOnlineMeetingLinks(nextMeetingLinks);
  } catch (error) {
    console.warn('Failed to delete online meeting link:', error);
    throw error;
  }
}
