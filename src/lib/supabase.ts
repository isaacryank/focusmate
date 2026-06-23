import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

function isValidHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getSupabaseConfigError() {
  const missingVariables = [
    !supabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
    !supabaseAnonKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : null,
  ].filter((value): value is string => Boolean(value));

  if (missingVariables.length > 0) {
    return `Missing ${missingVariables.join(' and ')}.`;
  }

  if (!isValidHttpsUrl(supabaseUrl)) {
    return 'EXPO_PUBLIC_SUPABASE_URL must be a valid https URL.';
  }

  return null;
}

export const supabaseConfigError = getSupabaseConfigError();
export const isSupabaseConfigured = !supabaseConfigError;

let supabaseClient: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
} else {
  console.warn('[FocusMate] Supabase client disabled:', supabaseConfigError);
}

export function getSupabaseUnavailableMessage() {
  return [
    'FocusMate backend is not configured for this build.',
    supabaseConfigError,
    'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the EAS preview environment, then rebuild the APK.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function getSupabaseClient() {
  if (!supabaseClient) {
    throw new Error(getSupabaseUnavailableMessage());
  }

  return supabaseClient;
}
