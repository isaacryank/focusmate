import AsyncStorage from '@react-native-async-storage/async-storage';

export type MiloAiMode = 'online' | 'local';

export type MiloAiSettings = {
  aiMode: MiloAiMode;
  skipAiForSmallTalk: boolean;
  showDebugReason: boolean;
  aiCallsToday: number;
  aiCallsDate: string;
};

const MILO_AI_SETTINGS_STORAGE_KEY = '@focusmate/milo-ai/settings';

export const DEFAULT_MILO_AI_SETTINGS: MiloAiSettings = {
  aiMode: 'online',
  skipAiForSmallTalk: true,
  showDebugReason: false,
  aiCallsToday: 0,
  aiCallsDate: getLocalDateKey(),
};

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeMiloAiSettings(value: unknown): MiloAiSettings {
  const todayKey = getLocalDateKey();

  if (!isRecord(value)) {
    return {
      ...DEFAULT_MILO_AI_SETTINGS,
      aiCallsDate: todayKey,
    };
  }

  const aiCallsDate =
    typeof value.aiCallsDate === 'string' && value.aiCallsDate
      ? value.aiCallsDate
      : todayKey;
  const isSameDate = aiCallsDate === todayKey;
  const aiCallsToday =
    typeof value.aiCallsToday === 'number' &&
    Number.isFinite(value.aiCallsToday) &&
    value.aiCallsToday >= 0 &&
    isSameDate
      ? Math.floor(value.aiCallsToday)
      : 0;

  return {
    aiMode: value.aiMode === 'local' ? 'local' : 'online',
    skipAiForSmallTalk:
      typeof value.skipAiForSmallTalk === 'boolean'
        ? value.skipAiForSmallTalk
        : DEFAULT_MILO_AI_SETTINGS.skipAiForSmallTalk,
    showDebugReason:
      typeof value.showDebugReason === 'boolean'
        ? value.showDebugReason
        : DEFAULT_MILO_AI_SETTINGS.showDebugReason,
    aiCallsToday,
    aiCallsDate: todayKey,
  };
}

export async function loadMiloAiSettings() {
  try {
    const stored = await AsyncStorage.getItem(MILO_AI_SETTINGS_STORAGE_KEY);
    const settings = sanitizeMiloAiSettings(stored ? JSON.parse(stored) : null);

    await AsyncStorage.setItem(
      MILO_AI_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );

    return settings;
  } catch (error) {
    console.log('Failed to load Milo AI settings:', error);
    return sanitizeMiloAiSettings(null);
  }
}

export async function saveMiloAiSettings(settings: MiloAiSettings) {
  const nextSettings = sanitizeMiloAiSettings(settings);

  await AsyncStorage.setItem(
    MILO_AI_SETTINGS_STORAGE_KEY,
    JSON.stringify(nextSettings)
  );

  return nextSettings;
}

export async function updateMiloAiSettings(
  partial: Partial<MiloAiSettings>
) {
  const currentSettings = await loadMiloAiSettings();

  return saveMiloAiSettings({
    ...currentSettings,
    ...partial,
  });
}

export async function resetMiloAiSettings() {
  return saveMiloAiSettings({
    ...DEFAULT_MILO_AI_SETTINGS,
    aiCallsDate: getLocalDateKey(),
  });
}

export async function incrementMiloAiCallsToday() {
  const currentSettings = await loadMiloAiSettings();

  return saveMiloAiSettings({
    ...currentSettings,
    aiCallsToday: currentSettings.aiCallsToday + 1,
    aiCallsDate: getLocalDateKey(),
  });
}
