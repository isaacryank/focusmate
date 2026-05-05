import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/lib/AuthContext';
import { TaskProvider } from './src/lib/TaskContext';
import { FocusProvider } from './src/lib/FocusContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TaskProvider>
          <FocusProvider>
            <StatusBar style="dark" />
            <AppNavigator />
          </FocusProvider>
        </TaskProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}