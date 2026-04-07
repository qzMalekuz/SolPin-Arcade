// Polyfills — must be imported before anything else
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

import { WalletScreen } from './src/screens/WalletScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { GameScreen } from './src/screens/GameScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { InGameWalletScreen } from './src/screens/InGameWalletScreen';
import { initAudio, unloadAllSounds } from './src/utils/audio';
import { Colors } from './src/theme';

// -------------------------------------------
// Navigation param types
// -------------------------------------------
export type RootStackParamList = {
  Wallet: undefined;
  InGameWallet: undefined;
  Setup: undefined;
  Game: undefined;
  Result: undefined;
  Leaderboard: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

import * as SplashScreen from 'expo-splash-screen';

// Keep the splash screen visible while we fetch resources
void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash is already controlled by the host environment (e.g., Expo Go).
});

export default function App() {
  const [appIsReady, setAppIsReady] = React.useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize audio without blocking app startup forever.
        await Promise.race([
          initAudio(),
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);
        // Artificial delay for smooth splash screen branding visibility
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();

    return () => {
      unloadAllSounds();
    };
  }, []);

  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => {
        // Prevent startup deadlock if splash API fails in Expo Go.
      });
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: Colors.neonBlue,
            background: Colors.bg,
            card: Colors.bgCard,
            text: Colors.textPrimary,
            border: Colors.border,
            notification: Colors.neonPurple,
          },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '900' },
          },
        }}
      >
        <Stack.Navigator
          initialRouteName="Wallet"
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: Colors.bg },
          }}
        >
          <Stack.Screen name="Wallet" component={WalletScreen} />
          <Stack.Screen name="InGameWallet" component={InGameWalletScreen} />
          <Stack.Screen name="Setup" component={SetupScreen} />
          <Stack.Screen
            name="Game"
            component={GameScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="Result" component={ResultScreen} />
          <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});
