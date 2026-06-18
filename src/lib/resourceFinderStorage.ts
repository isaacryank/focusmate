import AsyncStorage from '@react-native-async-storage/async-storage';

export const SAVED_RESOURCES_STORAGE_KEY =
  '@focusmate/resource-finder/saved-resources';

export type SavedResource = {
  id: string;
  taskId?: string;
  taskTitle?: string;
  resourceTitle: string;
  resourceUrl: string;
  note?: string;
  createdAt: string;
};

type SaveResourceInput = Omit<SavedResource, 'id' | 'createdAt'> &
  Partial<Pick<SavedResource, 'id' | 'createdAt'>>;

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
    resourceTitle,
    resourceUrl,
    note: resource.note?.trim() || undefined,
    createdAt: resource.createdAt || new Date().toISOString(),
  };
}

async function persistResources(resources: SavedResource[]) {
  await AsyncStorage.setItem(
    SAVED_RESOURCES_STORAGE_KEY,
    JSON.stringify(resources)
  );
}

export async function loadSavedResources(): Promise<SavedResource[]> {
  try {
    const storedResources = await AsyncStorage.getItem(SAVED_RESOURCES_STORAGE_KEY);

    if (!storedResources) {
      return [];
    }

    const parsedResources = JSON.parse(storedResources);

    if (!Array.isArray(parsedResources)) {
      return [];
    }

    return parsedResources
      .map(normalizeResource)
      .filter((resource): resource is SavedResource => Boolean(resource));
  } catch (error) {
    console.warn('Failed to load saved resources:', error);
    return [];
  }
}

export async function saveResource(
  input: SaveResourceInput
): Promise<SavedResource[]> {
  const currentResources = await loadSavedResources();
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
    return nextResources;
  } catch (error) {
    console.warn('Failed to save resource:', error);
    return currentResources;
  }
}

export async function deleteSavedResource(id: string): Promise<SavedResource[]> {
  const currentResources = await loadSavedResources();
  const nextResources = currentResources.filter((resource) => resource.id !== id);

  try {
    await persistResources(nextResources);
    return nextResources;
  } catch (error) {
    console.warn('Failed to delete saved resource:', error);
    return currentResources;
  }
}
