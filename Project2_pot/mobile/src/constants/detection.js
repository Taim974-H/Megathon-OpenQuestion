// Base G-force thresholds for pothole detection
// Values represent net acceleration above gravity (9.81 m/s²)
export const BASE_THRESHOLDS = {
  low: 1.5,    // G — minor pothole / rough surface
  medium: 3.0, // G — moderate pothole
  high: 5.0,   // G — severe pothole / large impact
};

// Per-car-type multipliers on the base thresholds.
// Higher multiplier = less sensitive (requires bigger spike to trigger).
// Lower multiplier  = more sensitive (smaller spike triggers).
export const CAR_TYPE_MULTIPLIERS = {
  sedan: 1.0,  // baseline
  suv: 1.2,    // higher suspension absorbs more
  sports: 0.8, // stiffer suspension — feels bumps more acutely
  truck: 1.3,  // heavy-duty suspension, dampens impacts
  van: 1.1,    // slightly softer ride than sedan
};

// Sensitivity multipliers applied on top of the car-type multiplier.
// "High" sensitivity → lower effective threshold → triggers more easily.
export const SENSITIVITY_MULTIPLIERS = {
  low: 1.2,    // harder to trigger
  normal: 1.0, // default
  high: 0.8,   // easier to trigger
};

// Accelerometer subscription rate (samples per second)
export const ACCELEROMETER_SAMPLE_RATE_MS = 10; // 100 Hz → 10 ms interval

// After a detection, ignore further events for this long (ms) to avoid double-logging
export const DETECTION_DEBOUNCE_MS = 3000;

// A spike must resolve within this window to be classified as a pothole
// rather than sustained vibration (ms)
export const SPIKE_RESOLUTION_MS = 200;

// Minimum speed (km/h) required before the app will detect / alert
export const MIN_SPEED_KMH = 5;

// Proximity alert radius (m) — default; overridden by Settings
export const DEFAULT_WARNING_DISTANCE_M = 100;

// Don't re-alert for the same pothole within this window (ms)
export const ALERT_COOLDOWN_MS = 30000; // 30 seconds

// Background location task name (must be consistent across the app)
export const BACKGROUND_LOCATION_TASK = 'POTHOLE_BACKGROUND_TASK';

// Radius (m) used when fetching nearby potholes from the API
export const NEARBY_FETCH_RADIUS_M = 200;
