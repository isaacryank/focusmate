import AsyncStorage from '@react-native-async-storage/async-storage';

import { getSupabaseClient, isSupabaseConfigured } from './supabase';
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

type SupabaseOnlineMeetingLinkRow = {
  id: string;
  user_id: string;
  local_id: string | null;
  task_id: string | null;
  task_local_id: string | null;
  task_title_snapshot: string | null;
  provider: string | null;
  url: string | null;
  label: string | null;
  created_at: string | null;
  updated_at: string | null;
};

async function resolveCurrentUserId(userId?: string | null) {
  if (userId || !isSupabaseConfigured) {
    return userId ?? null;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.warn('Failed to resolve Supabase user for meeting link:', error);
      return null;
    }

    return data.user?.id ?? null;
  } catch (error) {
    console.warn('Failed to resolve Supabase user for meeting link:', error);
    return null;
  }
}

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

function meetingLinkToSupabaseRow(
  meetingLink: OnlineMeetingLink,
  userId: string
) {
  const now = new Date().toISOString();

  return {
    user_id: userId,
    local_id: meetingLink.id,
    task_id: null,
    task_local_id: meetingLink.taskId,
    task_title_snapshot: meetingLink.taskTitle || null,
    provider: meetingLink.provider,
    url: meetingLink.url,
    label: meetingLink.label || buildMeetingDisplayLabel(meetingLink.url),
    created_at: meetingLink.createdAt || now,
    updated_at: meetingLink.updatedAt || now,
  };
}

function supabaseRowToMeetingLink(
  row: SupabaseOnlineMeetingLinkRow
): OnlineMeetingLink | null {
  const taskId = row.task_local_id?.trim() || row.task_id?.trim();
  const normalizedUrl = normalizeMeetingUrl(row.url || '');

  if (!taskId || !isLikelyMeetingUrl(normalizedUrl)) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: row.local_id || row.id,
    taskId,
    taskTitle: row.task_title_snapshot || undefined,
    provider: detectMeetingProvider(normalizedUrl),
    url: normalizedUrl,
    label: row.label?.trim() || buildMeetingDisplayLabel(normalizedUrl),
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || row.created_at || now,
  };
}

function mergeMeetingLinks(meetingLinks: OnlineMeetingLink[]) {
  const byTaskId = new Map<string, OnlineMeetingLink>();

  meetingLinks.forEach((meetingLink) => {
    const existing = byTaskId.get(meetingLink.taskId);

    if (
      !existing ||
      new Date(meetingLink.updatedAt).getTime() >
        new Date(existing.updatedAt).getTime()
    ) {
      byTaskId.set(meetingLink.taskId, meetingLink);
    }
  });

  return Array.from(byTaskId.values()).sort(
    (first, second) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
  );
}

async function loadSupabaseMeetingLinks(userId?: string | null) {
  const resolvedUserId = await resolveCurrentUserId(userId);

  if (!resolvedUserId || !isSupabaseConfigured) {
    return [];
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('online_meeting_links')
      .select('*')
      .eq('user_id', resolvedUserId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('Failed to fetch Supabase meeting links:', error);
      return [];
    }

    return (data ?? [])
      .map((row) => supabaseRowToMeetingLink(row as SupabaseOnlineMeetingLinkRow))
      .filter((meetingLink): meetingLink is OnlineMeetingLink =>
        Boolean(meetingLink)
      );
  } catch (error) {
    console.warn('Failed to fetch Supabase meeting links:', error);
    return [];
  }
}

async function saveMeetingLinkToSupabase(
  meetingLink: OnlineMeetingLink,
  userId?: string | null
) {
  const resolvedUserId = await resolveCurrentUserId(userId);

  if (!resolvedUserId || !isSupabaseConfigured) {
    return;
  }

  try {
    const supabase = getSupabaseClient();

    const { error: deleteError } = await supabase
      .from('online_meeting_links')
      .delete()
      .eq('user_id', resolvedUserId)
      .eq('task_local_id', meetingLink.taskId);

    if (deleteError) {
      console.warn('Failed to replace old Supabase meeting link:', deleteError);
      return;
    }

    const { error: insertError } = await supabase
      .from('online_meeting_links')
      .insert(meetingLinkToSupabaseRow(meetingLink, resolvedUserId));

    if (insertError) {
      console.warn('Failed to insert Supabase meeting link:', insertError);
    }
  } catch (error) {
    console.warn('Failed to save Supabase meeting link:', error);
  }
}

async function syncMeetingLinksToSupabase(
  meetingLinks: OnlineMeetingLink[],
  userId?: string | null
) {
  if (meetingLinks.length === 0) {
    return;
  }

  for (const meetingLink of meetingLinks) {
    await saveMeetingLinkToSupabase(meetingLink, userId);
  }
}

export async function loadOnlineMeetingLinks(
  userId?: string | null
): Promise<OnlineMeetingLink[]> {
  try {
    const storedMeetingLinks = await AsyncStorage.getItem(
      ONLINE_MEETING_LINKS_STORAGE_KEY
    );
    const remoteMeetingLinks = await loadSupabaseMeetingLinks(userId);

    if (!storedMeetingLinks) {
      if (remoteMeetingLinks.length > 0) {
        await persistOnlineMeetingLinks(remoteMeetingLinks);
      }

      return remoteMeetingLinks;
    }

    const parsedMeetingLinks = JSON.parse(storedMeetingLinks);

    if (!Array.isArray(parsedMeetingLinks)) {
      return remoteMeetingLinks;
    }

    const localMeetingLinks = parsedMeetingLinks
      .map(normalizeStoredMeetingLink)
      .filter(
        (meetingLink): meetingLink is OnlineMeetingLink =>
          Boolean(meetingLink)
      );
    const mergedMeetingLinks = mergeMeetingLinks([
      ...remoteMeetingLinks,
      ...localMeetingLinks,
    ]);

    await persistOnlineMeetingLinks(mergedMeetingLinks);
    await syncMeetingLinksToSupabase(mergedMeetingLinks, userId);

    return mergedMeetingLinks;
  } catch (error) {
    console.warn('Failed to load online meeting links:', error);
    return [];
  }
}

export async function getOnlineMeetingLinkForTask(
  taskId: string,
  userId?: string | null
): Promise<OnlineMeetingLink | null> {
  const meetingLinks = await loadOnlineMeetingLinks(userId);
  const normalizedTaskId = taskId.trim();

  return (
    meetingLinks.find((meetingLink) => meetingLink.taskId === normalizedTaskId) ||
    null
  );
}

export async function saveOnlineMeetingLink(
  input: SaveOnlineMeetingLinkInput,
  userId?: string | null
): Promise<OnlineMeetingLink> {
  const taskId = input.taskId.trim();
  const normalizedUrl = normalizeMeetingUrl(input.url);

  if (!taskId || !isLikelyMeetingUrl(normalizedUrl)) {
    throw new Error('Invalid online meeting link');
  }

  const currentMeetingLinks = await loadOnlineMeetingLinks(userId);
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
    await saveMeetingLinkToSupabase(nextMeetingLink, userId);
    return nextMeetingLink;
  } catch (error) {
    console.warn('Failed to save online meeting link:', error);
    throw error;
  }
}

export async function deleteOnlineMeetingLinkForTask(
  taskId: string,
  userId?: string | null
): Promise<void> {
  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    return;
  }

  const currentMeetingLinks = await loadOnlineMeetingLinks(userId);
  const nextMeetingLinks = currentMeetingLinks.filter(
    (meetingLink) => meetingLink.taskId !== normalizedTaskId
  );

  try {
    await persistOnlineMeetingLinks(nextMeetingLinks);

    const resolvedUserId = await resolveCurrentUserId(userId);

    if (resolvedUserId && isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('online_meeting_links')
        .delete()
        .eq('user_id', resolvedUserId)
        .eq('task_local_id', normalizedTaskId);

      if (error) {
        console.warn('Failed to delete Supabase meeting link:', error);
      }
    }
  } catch (error) {
    console.warn('Failed to delete online meeting link:', error);
    throw error;
  }
}