import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/lib/AuthContext';
import { TaskProvider } from './src/lib/TaskContext';
import { FocusProvider } from './src/lib/FocusContext';
import {
  FocusMateThemeProvider,
  useFocusMateTheme,
} from './src/theme/FocusMateThemeProvider';

function AppStatusBar() {
  const { isDark, theme } = useFocusMateTheme();

  return (
    <StatusBar
      style={isDark ? 'light' : 'dark'}
      backgroundColor={theme.colors.background}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FocusMateThemeProvider>
        <AuthProvider>
          <TaskProvider>
            <FocusProvider>
              <AppStatusBar />
              <AppNavigator />
            </FocusProvider>
          </TaskProvider>
        </AuthProvider>
      </FocusMateThemeProvider>
    </SafeAreaProvider>
  );
}
