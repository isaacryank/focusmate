import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

const AUTH_STORAGE_KEY = '@focusmate/auth';

type AuthContextType = {
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  userName: string;
  signIn: (name?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [userName, setUserName] = useState('Student');

  useEffect(() => {
    loadAuth();
  }, []);

  const loadAuth = async () => {
    try {
      const storedAuth = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

      if (storedAuth) {
        const parsedAuth = JSON.parse(storedAuth);

        setUserName(parsedAuth.userName || 'Student');
        setIsAuthenticated(Boolean(parsedAuth.isAuthenticated));
      }
    } catch (error) {
      console.log('Failed to load auth:', error);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const signIn = async (name?: string) => {
    const nextName = name || 'Student';

    setUserName(nextName);
    setIsAuthenticated(true);

    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        isAuthenticated: true,
        userName: nextName,
      })
    );
  };

  const signOut = async () => {
    setIsAuthenticated(false);

    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoadingAuth,
        userName,
        signIn,
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