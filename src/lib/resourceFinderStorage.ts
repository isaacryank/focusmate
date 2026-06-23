import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';

export const SAVED_RESOURCES_STORAGE_KEY =
  '@focusmate/resource-finder/saved-resources';

export type ResourceSourceType =
  | 'Website'
  | 'Search'
  | 'YouTube'
  | 'Docs'
  | 'Map'
  | 'Checklist'
  | 'Scholar';

export type SavedResource = {
  id: string;
  taskId?: string;
  taskTitle?: string;
  taskTypeSnapshot?: 'task' | 'meeting' | 'date' | null;
  resourceTitle: string;
  resourceUrl: string;
  description?: string;
  category?: string;
  sourceType?: ResourceSourceType;
  reason?: string;
  note?: string;
  saved?: boolean;
  createdAt: string;
};

type SaveResourceInput = Omit<SavedResource, 'id' | 'createdAt'> &
  Partial<Pick<SavedResource, 'id' | 'createdAt'>>;

type SupabaseResourceRow = {
  id: string;
  user_id: string;
  local_id: string | null;
  task_id: string | null;
  task_local_id: string | null;
  task_title_snapshot: string | null;
  task_type_snapshot: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  source_type: string | null;
  url: string | null;
  reason: string | null;
  saved: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeResource(value: unknown): SavedResource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const resource = value as Partial<SavedResource>;
  const resourceTitle = resource.resourceTitle?.trim();
  const resourceUrl = resource.resourceUrl?.trim();

  if (!resourceTitle || !resourceUrl) {
    return null;
  }

  return {
    id: resource.id || `${Date.now()}`,
    taskId: resource.taskId,
    taskTitle: resource.taskTitle,
    taskTypeSnapshot:
      resource.taskTypeSnapshot === 'task' ||
      resource.taskTypeSnapshot === 'meeting' ||
      resource.taskTypeSnapshot === 'date'
        ? resource.taskTypeSnapshot
        : null,
    resourceTitle,
    resourceUrl,
    description: resource.description?.trim() || undefined,
    category: resource.category?.trim() || undefined,
    sourceType: resource.sourceType,
    reason: resource.reason?.trim() || undefined,
    note: resource.note?.trim() || undefined,
    saved: resource.saved !== false,
    createdAt: resource.createdAt || new Date().toISOString(),
  };
}

function resourceToSupabaseRow(resource: SavedResource, userId: string) {
  return {
    user_id: userId,
    local_id: resource.id,
    task_id: null,
    task_local_id: resource.taskId || null,
    task_title_snapshot: resource.taskTitle || null,
    task_type_snapshot: resource.taskTypeSnapshot || null,
    title: resource.resourceTitle,
    description: resource.description || resource.note || null,
    category: resource.category || null,
    source_type: resource.sourceType || 'Website',
    url: resource.resourceUrl,
    reason: resource.reason || resource.note || null,
    saved: resource.saved !== false,
  };
}

function supabaseRowToResource(row: SupabaseResourceRow): SavedResource | null {
  const title = row.title?.trim();
  const url = row.url?.trim();

  if (!title || !url) {
    return null;
  }

  const taskTypeSnapshot =
    row.task_type_snapshot === 'task' ||
    row.task_type_snapshot === 'meeting' ||
    row.task_type_snapshot === 'date'
      ? row.task_type_snapshot
      : null;

  return {
    id: row.local_id || row.id,
    taskId: row.task_local_id || row.task_id || undefined,
    taskTitle: row.task_title_snapshot || undefined,
    taskTypeSnapshot,
    resourceTitle: title,
    resourceUrl: url,
    description: row.description || undefined,
    category: row.category || undefined,
    sourceType: row.source_type as ResourceSourceType | undefined,
    reason: row.reason || undefined,
    note: row.reason || row.description || undefined,
    saved: row.saved !== false,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

async function persistResources(resources: SavedResource[]) {
  await AsyncStorage.setItem(
    SAVED_RESOURCES_STORAGE_KEY,
    JSON.stringify(resources)
  );
}

async function loadSupabaseResources(userId?: string | null) {
  if (!userId || !isSupabaseConfigured) {
    return [];
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('milo_resources')
      .select('*')
      .eq('user_id', userId)
      .eq('saved', true)
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      console.warn('Failed to fetch Supabase resources:', error);
      return [];
    }

    return (data ?? [])
      .map((row) => supabaseRowToResource(row as SupabaseResourceRow))
      .filter((resource): resource is SavedResource => Boolean(resource));
  } catch (error) {
    console.warn('Failed to fetch Supabase resources:', error);
    return [];
  }
}

async function syncResourcesToSupabase(
  resources: SavedResource[],
  userId?: string | null
) {
  if (!userId || !isSupabaseConfigured || resources.length === 0) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const rows = resources.map((resource) => resourceToSupabaseRow(resource, userId));
    const { error } = await supabase
      .from('milo_resources')
      .upsert(rows, { onConflict: 'user_id,local_id' });

    if (error) {
      console.warn('Failed to upsert Supabase resources:', error);
    }
  } catch (error) {
    console.warn('Failed to upsert Supabase resources:', error);
  }
}

function mergeResources(resources: SavedResource[]) {
  const seen = new Set<string>();

  return resources.filter((resource) => {
    const key = resource.id || `${resource.taskId}:${resource.resourceUrl}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function loadSavedResources(
  userId?: string | null
): Promise<SavedResource[]> {
  try {
    const storedResources = await AsyncStorage.getItem(SAVED_RESOURCES_STORAGE_KEY);
    const remoteResources = await loadSupabaseResources(userId);

    if (!storedResources) {
      if (remoteResources.length > 0) {
        await persistResources(remoteResources);
      }

      return remoteResources;
    }

    const parsedResources = JSON.parse(storedResources);

    if (!Array.isArray(parsedResources)) {
      return remoteResources;
    }

    const localResources = parsedResources
      .map(normalizeResource)
      .filter((resource): resource is SavedResource => Boolean(resource));
    const mergedResources = mergeResources([
      ...remoteResources,
      ...localResources,
    ]);

    if (mergedResources.length > localResources.length || remoteResources.length > 0) {
      await persistResources(mergedResources);
    }

    await syncResourcesToSupabase(mergedResources, userId);
    return mergedResources;
  } catch (error) {
    console.warn('Failed to load saved resources:', error);
    return [];
  }
}

export async function saveResource(
  input: SaveResourceInput,
  userId?: string | null
): Promise<SavedResource[]> {
  const currentResources = await loadSavedResources(userId);
  const nextResource = normalizeResource({
    ...input,
    id: input.id || `${Date.now()}-${Math.round(Math.random() * 100000)}`,
    createdAt: input.createdAt || new Date().toISOString(),
  });

  if (!nextResource) {
    return currentResources;
  }

  const nextResources = [nextResource, ...currentResources];

  try {
    await persistResources(nextResources);
    await syncResourcesToSupabase([nextResource], userId);
    return nextResources;
  } catch (error) {
    console.warn('Failed to save resource:', error);
    return currentResources;
  }
}

export async function deleteSavedResource(
  id: string,
  userId?: string | null
): Promise<SavedResource[]> {
  const currentResources = await loadSavedResources(userId);
  const nextResources = currentResources.filter((resource) => resource.id !== id);

  try {
    await persistResources(nextResources);

    if (userId && isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('milo_resources')
        .update({ saved: false })
        .eq('user_id', userId)
        .eq('local_id', id);

      if (error) {
        console.warn('Failed to hide Supabase resource:', error);
      }
    }

    return nextResources;
  } catch (error) {
    console.warn('Failed to delete saved resource:', error);
    return currentResources;
  }
}
