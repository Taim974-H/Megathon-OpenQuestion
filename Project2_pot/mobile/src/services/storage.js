import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values'; // polyfill required before uuid
import { v4 as uuidv4 } from 'uuid';

const KEYS = {
  DEVICE_UUID: '@pothole_tracker/device_uuid',
  SETTINGS: '@pothole_tracker/settings',
};

const DEFAULT_SETTINGS = {
  warningDistance: 100,   // metres
  soundEnabled: true,
  sensitivity: 'normal',  // 'low' | 'normal' | 'high'
  carType: 'sedan',       // 'sedan' | 'suv' | 'sports' | 'truck' | 'van'
  apiUrl: 'http://localhost:3000',
};

/**
 * Returns the persistent device UUID.
 * Generates and stores a new UUID v4 on first call.
 */
export async function getDeviceUuid() {
  try {
    let uuid = await AsyncStorage.getItem(KEYS.DEVICE_UUID);
    if (!uuid) {
      uuid = uuidv4();
      await AsyncStorage.setItem(KEYS.DEVICE_UUID, uuid);
    }
    return uuid;
  } catch (err) {
    console.error('[storage] getDeviceUuid error:', err);
    // Return a fallback so the app doesn't crash
    return 'unknown-device';
  }
}

/**
 * Returns the merged settings object (defaults filled in for missing keys).
 */
export async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const stored = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (err) {
    console.error('[storage] getSettings error:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persists a partial or full settings object.
 * Merges with existing stored values so callers can update a single key.
 */
export async function saveSettings(newSettings) {
  try {
    const current = await getSettings();
    const merged = { ...current, ...newSettings };
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  } catch (err) {
    console.error('[storage] saveSettings error:', err);
    throw err;
  }
}

/**
 * Removes only the locally-cached history entries (not the UUID or settings).
 * The canonical history lives on the backend; this just clears any local cache key.
 */
export async function clearLocalHistory() {
  try {
    await AsyncStorage.removeItem('@pothole_tracker/local_history');
  } catch (err) {
    console.error('[storage] clearLocalHistory error:', err);
  }
}
