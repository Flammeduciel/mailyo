/**
 * App entry. Background tasks must be defined here, at module scope: when
 * Android wakes the app without UI (Gmail push from the relay, periodic
 * sync), only this file runs; the Expo Router screens are not loaded.
 */
import './src/realtime/push-task';
import './src/sync/background-sync';

import 'expo-router/entry';
