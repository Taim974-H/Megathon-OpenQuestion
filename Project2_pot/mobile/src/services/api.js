import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@pothole_tracker/settings';
const FALLBACK_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Reads the API base URL from AsyncStorage settings.
 * Falls back to the env variable / hard-coded default.
 */
export async function getApiUrl() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const settings = JSON.parse(raw);
      if (settings.apiUrl) return settings.apiUrl.replace(/\/$/, ''); // strip trailing slash
    }
  } catch (_) {}
  return FALLBACK_URL;
}

/**
 * Returns a pre-configured axios instance pointed at the current API URL.
 */
async function getClient() {
  const baseURL = await getApiUrl();
  return axios.create({
    baseURL,
    timeout: 8000,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Log a newly detected pothole to the backend.
 *
 * POST /api/potholes
 * Body: { device_uuid, latitude, longitude, severity, g_force, car_type }
 */
export async function logPothole(deviceUuid, lat, lng, severity, gForce, carType) {
  const client = await getClient();
  const response = await client.post('/api/potholes', {
    device_uuid: deviceUuid,
    latitude: lat,
    longitude: lng,
    severity,
    g_force: gForce,
    car_type: carType,
  });
  return response.data;
}

/**
 * Fetch potholes within `radius` metres of the given coordinates.
 *
 * GET /api/potholes/nearby?lat=…&lng=…&radius=…
 */
export async function getNearbyPotholes(lat, lng, radius = 200) {
  const client = await getClient();
  const response = await client.get('/api/potholes/nearby', {
    params: { lat, lng, radius },
  });
  return response.data; // expected: array of pothole objects
}

/**
 * Retrieve all potholes reported by a specific device.
 *
 * GET /api/potholes/device/:device_uuid
 */
export async function getDeviceHistory(deviceUuid) {
  const client = await getClient();
  const response = await client.get(`/api/potholes/device/${deviceUuid}`);
  return response.data; // expected: array of pothole objects
}
