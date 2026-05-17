import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { supabase } from './supabase';

const AUTH_STORAGE_KEY = '@focusmate/auth';

export type AuthActionResult = {
  success: boolean;
  error?: string;
  profileError?: string;
  needsEmailConfirmation?: boolean;
};

type AuthContextType = {
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  userName: string;
  session: Session | null;
  user: User | null;
  signIn: (name?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string
  ) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getReadableError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallbackMessage;
}

function getErrorCode(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return '';
}

function normalizeDisplayName(name?: string | null) {
  return name?.trim() || 'Student';
}

function getUserMetadataName(user: User) {
  const metadata = user.user_metadata;
  const candidates = [
    metadata?.display_name,
    metadata?.full_name,
    metadata?.name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function getFallbackUserName(user: User) {
  const metadataName = getUserMetadataName(user);

  if (metadataName) {
    return metadataName;
  }

  const emailName = user.email?.split('@')[0]?.trim();
  return emailName || 'Student';
}

async function loadProfileDisplayName(user: User) {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (typeof data?.display_name === 'string' && data.display_name.trim()) {
    return data.display_name.trim();
  }

  return null;
}

function isMissingProfileEmailColumnError(error: unknown) {
  const message = getReadableError(error, '').toLowerCase();
  const code = getErrorCode(error);

  return (
    code === 'PGRST204' ||
    (message.includes('email') &&
      (message.includes('column') || message.includes('schema cache')))
  );
}

function isMissingSessionError(error: unknown) {
  const message = getReadableError(error, '').toLowerCase();

  return message.includes('session') && message.includes('missing');
}

async function upsertProfile(userId: string, name: string, email: string) {
  const displayName = normalizeDisplayName(name);
  const cleanEmail = email.trim().toLowerCase();

  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: displayName,
      email: cleanEmail,
    },
    { onConflict: 'id' }
  );

  if (!error) {
    return null;
  }

  if (!isMissingProfileEmailColumnError(error)) {
    return getReadableError(error, 'Profile setup failed.');
  }

  const { error: retryError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      display_name: displayName,
    },
    { onConflict: 'id' }
  );

  if (retryError) {
    return getReadableError(retryError, 'Profile setup failed.');
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isMountedRef = useRef(true);

  const [session, setSession] = useState<Session | null>(null);
  const [isLegacyDemoAuthenticated, setIsLegacyDemoAuthenticated] =
    useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [userName, setUserName] = useState('Student');

  const user = session?.user ?? null;
  const isAuthenticated = Boolean(session) || isLegacyDemoAuthenticated;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearAuthState = useCallback(async () => {
    setSession(null);
    setIsLegacyDemoAuthenticated(false);
    setUserName('Student');

    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      console.log('Failed to clear legacy auth:', error);
    }
  }, []);

  const applySupabaseSession = useCallback((nextSession: Session) => {
    setSession(nextSession);
    setIsLegacyDemoAuthenticated(false);
    setUserName(getFallbackUserName(nextSession.user));

    AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch((error) => {
      console.log('Failed to clear legacy auth:', error);
    });

    loadProfileDisplayName(nextSession.user)
      .then((profileName) => {
        if (isMountedRef.current && profileName) {
          setUserName(profileName);
        }
      })
      .catch(() => {
        // Profile lookup is optional for keeping the app usable.
      });
  }, []);

  const loadLegacyAuthFallback = useCallback(async () => {
    try {
      const storedAuth = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

      if (storedAuth) {
        const parsedAuth = JSON.parse(storedAuth) as {
          isAuthenticated?: unknown;
          userName?: unknown;
        };

        if (parsedAuth.isAuthenticated) {
          setSession(null);
          setUserName(
            typeof parsedAuth.userName === 'string'
              ? normalizeDisplayName(parsedAuth.userName)
              : 'Student'
          );
          setIsLegacyDemoAuthenticated(true);
          return;
        }
      }
    } catch (error) {
      console.log('Failed to load legacy auth:', error);
    }

    setSession(null);
    setIsLegacyDemoAuthenticated(false);
    setUserName('Student');
  }, []);

  useEffect(() => {
    let isSubscribed = true;

    const initializeAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!isSubscribed) {
          return;
        }

        if (data.session) {
          applySupabaseSession(data.session);
        } else {
          await loadLegacyAuthFallback();
        }
      } catch (error) {
        console.log('Failed to load Supabase auth:', error);

        if (isSubscribed) {
          await loadLegacyAuthFallback();
        }
      } finally {
        if (isSubscribed) {
          setIsLoadingAuth(false);
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isSubscribed) {
        return;
      }

      if (nextSession) {
        applySupabaseSession(nextSession);
        return;
      }

      if (event === 'SIGNED_OUT') {
        clearAuthState();
      }
    });

    initializeAuth();

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, [applySupabaseSession, clearAuthState, loadLegacyAuthFallback]);

  const signIn = async (name?: string) => {
    const nextName = normalizeDisplayName(name);

    setSession(null);
    setUserName(nextName);
    setIsLegacyDemoAuthenticated(true);

    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        isAuthenticated: true,
        userName: nextName,
        authMode: 'legacy-demo',
      })
    );
  };

  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<AuthActionResult> => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      return {
        success: false,
        error: 'Email and password are required.',
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      return {
        success: false,
        error: getReadableError(error, 'Unable to sign in.'),
      };
    }

    if (!data.session) {
      return {
        success: false,
        error: 'Sign in did not return a Supabase session.',
      };
    }

    applySupabaseSession(data.session);

    return { success: true };
  };

  const signUpWithEmail = async (
    name: string,
    email: string,
    password: string
  ): Promise<AuthActionResult> => {
    const displayName = normalizeDisplayName(name);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      return {
        success: false,
        error: 'Email and password are required.',
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      return {
        success: false,
        error: getReadableError(error, 'Unable to create account.'),
      };
    }

    const newUser = data.user ?? data.session?.user;

    if (!newUser) {
      return {
        success: false,
        error: 'Account creation did not return a Supabase user.',
      };
    }

    const profileError = await upsertProfile(newUser.id, displayName, cleanEmail);

    if (data.session) {
      applySupabaseSession(data.session);
    }

    return {
      success: true,
      profileError: profileError ?? undefined,
      needsEmailConfirmation: !data.session,
    };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error && !isMissingSessionError(error)) {
      throw new Error(getReadableError(error, 'Unable to sign out.'));
    }

    await clearAuthState();
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoadingAuth,
        userName,
        session,
        user,
        signIn,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
