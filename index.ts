// Entry point for Expo — polyfills must be at the top
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
