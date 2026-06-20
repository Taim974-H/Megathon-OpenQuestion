import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { BACKGROUND_LOCATION_TASK, NEARBY_FETCH_RADIUS_M, ALERT_COOLDOWN_MS, MIN_SPEED_KMH } from '../constants/detection';
import { setCurrentSpeed } from './detection';
import { getNearbyPotholes } from './api';
import { playAlert } from './audio';
import { getSettings } from './storage';

// ─── Haversine distance helper ────────────────────────────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Tracks the last alert timestamp per pothole id so we don't spam alerts
const recentAlerts = new Map(); // potholeId -> timestamp

// ─── Background task definition ──────────────────────────────────────────────
// This must be defined at the module's top level (not inside a function)
// before calling startLocationUpdates.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[location-task] Error:', error.message);
    return;
  }

  if (!data || !data.locations || data.locations.length === 0) return;

  const location = data.locations[data.locations.length - 1]; // most recent fix
  const { latitude, longitude, speed } = location.coords;

  // Speed from GPS is in m/s; convert to km/h
  const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : 0;

  // Share speed with the foreground detection service
  setCurrentSpeed(speedKmh);

  if (speedKmh < MIN_SPEED_KMH) return;

  // Fetch potholes nearby and warn the driver if needed
  try {
    const settings = await getSettings();
    const warningDistance = settings.warningDistance ?? 100;
    const soundEnabled = settings.soundEnabled !== false;

    const nearby = await getNearbyPotholes(latitude, longitude, NEARBY_FETCH_RADIUS_M);

    if (!Array.isArray(nearby)) return;

    const now = Date.now();

    for (const pothole of nearby) {
      const { id, latitude: pLat, longitude: pLng } = pothole;
      const dist = haversineDistance(latitude, longitude, pLat, pLng);

      if (dist <= warningDistance) {
        const lastAlert = recentAlerts.get(id) ?? 0;
        if (now - lastAlert > ALERT_COOLDOWN_MS) {
          recentAlerts.set(id, now);
          if (soundEnabled) {
            await playAlert();
          }
        }
      }
    }

    // Evict stale entries from the cache to avoid unbounded growth
    for (const [pId, ts] of recentAlerts.entries()) {
      if (now - ts > ALERT_COOLDOWN_MS * 2) recentAlerts.delete(pId);
    }
  } catch (err) {
    // Network errors are expected when driving through dead zones — log and continue
    console.warn('[location-task] Nearby fetch failed:', err.message);
  }
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Request location permissions and start background location updates.
 * Returns true on success, false if permissions were denied.
 */
export async function startLocationTracking() {
  // Foreground permission
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    console.warn('[location] Foreground location permission denied');
    return false;
  }

  // Background permission (required for Android background location & iOS always-on)
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    console.warn('[location] Background location permission denied — location task will still run in foreground');
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRegistered) {
    // Already running — nothing to do
    return true;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 3000,        // ms between updates
    distanceInterval: 10,      // metres between updates
    showsBackgroundLocationIndicator: true, // iOS blue bar
    foregroundService: {       // Android persistent notification
      notificationTitle: 'Pothole Tracker Active',
      notificationBody: 'Monitoring for potholes',
      notificationColor: '#2196F3',
    },
  });

  return true;
}

/**
 * Stop background location updates.
 */
export async function stopLocationTracking() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (err) {
    console.warn('[location] stopLocationTracking error:', err.message);
  }
}

/**
 * Returns the current one-shot location (for logging detected potholes).
 */
export async function getCurrentLocation() {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
  } catch (err) {
    console.warn('[location] getCurrentLocation error:', err.message);
    return null;
  }
}
