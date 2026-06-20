import 'react-native-get-random-values'; // Must be the very first import (UUID polyfill)
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import location service to ensure the background task is defined at module level
// before expo-task-manager needs it.
import './src/services/location';

import AppNavigator from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: '#2196F3',
            background: '#0F0F0F',
            card: '#0F0F0F',
            text: '#FFFFFF',
            border: '#1E1E1E',
            notification: '#2196F3',
          },
        }}
      >
        <StatusBar style="light" backgroundColor="#0F0F0F" />
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
