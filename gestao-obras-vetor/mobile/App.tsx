import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NotificationProvider } from './src/context/NotificationContext';
import { AuthProvider } from './src/context/AuthContext';
import { NetworkProvider } from './src/context/NetworkContext';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <NetworkProvider>
          <NotificationProvider>
            <AuthProvider>
              <StatusBar style="light" />
              <RootNavigator />
            </AuthProvider>
          </NotificationProvider>
        </NetworkProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
