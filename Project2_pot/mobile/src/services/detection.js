import { Accelerometer } from 'expo-sensors';
import {
  BASE_THRESHOLDS,
  CAR_TYPE_MULTIPLIERS,
  SENSITIVITY_MULTIPLIERS,
  ACCELEROMETER_SAMPLE_RATE_MS,
  DETECTION_DEBOUNCE_MS,
  SPIKE_RESOLUTION_MS,
  MIN_SPEED_KMH,
} from '../constants/detection';

// ─── Module state ─────────────────────────────────────────────────────────────
let subscription = null;
let lastDetectionTime = 0;
let spikeStartTime = null;
let spikeMaxMagnitude = 0;

// Speed is written by the background location task and read here.
// Using a module-level variable avoids bridging complexity.
let currentSpeedKmh = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Update the current vehicle speed.
 * Called by the background location task whenever a new location arrives.
 *
 * @param {number} speedKmh
 */
export function setCurrentSpeed(speedKmh) {
  currentSpeedKmh = speedKmh >= 0 ? speedKmh : 0;
}

export function getCurrentSpeed() {
  return currentSpeedKmh;
}

/**
 * Start accelerometer subscription.
 *
 * @param {object} options
 * @param {string} options.carType      - 'sedan' | 'suv' | 'sports' | 'truck' | 'van'
 * @param {string} options.sensitivity  - 'low' | 'normal' | 'high'
 * @param {function} options.onDetect   - callback({ severity, gForce }) when a pothole is detected
 */
export function startDetection({ carType = 'sedan', sensitivity = 'normal', onDetect }) {
  if (subscription) {
    console.warn('[detection] Already subscribed — call stopDetection first');
    return;
  }

  // Compute effective thresholds
  const carMult = CAR_TYPE_MULTIPLIERS[carType] ?? 1.0;
  const sensMult = SENSITIVITY_MULTIPLIERS[sensitivity] ?? 1.0;
  const combinedMult = carMult * sensMult;

  const thresholds = {
    low: BASE_THRESHOLDS.low * combinedMult,
    medium: BASE_THRESHOLDS.medium * combinedMult,
    high: BASE_THRESHOLDS.high * combinedMult,
  };

  Accelerometer.setUpdateInterval(ACCELEROMETER_SAMPLE_RATE_MS);

  subscription = Accelerometer.addListener(({ x, y, z }) => {
    const now = Date.now();

    // Raw magnitude of the acceleration vector (m/s² → divide by 9.81 to get G)
    const rawMagnitude = Math.sqrt(x * x + y * y + z * z);
    // Net magnitude above gravity (remove the ~1G offset)
    const netG = Math.abs(rawMagnitude - 9.81) / 9.81;

    // Must be moving
    if (currentSpeedKmh < MIN_SPEED_KMH) {
      spikeStartTime = null;
      spikeMaxMagnitude = 0;
      return;
    }

    // Debounce: skip if we just detected one
    if (now - lastDetectionTime < DETECTION_DEBOUNCE_MS) return;

    if (netG >= thresholds.low) {
      // ── Spike onset ──────────────────────────────────────────────────────
      if (spikeStartTime === null) {
        spikeStartTime = now;
        spikeMaxMagnitude = netG;
      } else {
        // Accumulate peak within the window
        if (netG > spikeMaxMagnitude) spikeMaxMagnitude = netG;

        // If the spike has lasted too long it's sustained vibration, not a pothole
        if (now - spikeStartTime > SPIKE_RESOLUTION_MS) {
          spikeStartTime = null;
          spikeMaxMagnitude = 0;
        }
      }
    } else {
      // ── Spike resolved (back below low threshold) ─────────────────────
      if (spikeStartTime !== null) {
        const spikeDuration = now - spikeStartTime;

        if (spikeDuration <= SPIKE_RESOLUTION_MS && spikeMaxMagnitude >= thresholds.low) {
          // Classify severity by peak G
          let severity;
          if (spikeMaxMagnitude >= thresholds.high) {
            severity = 'high';
          } else if (spikeMaxMagnitude >= thresholds.medium) {
            severity = 'medium';
          } else {
            severity = 'low';
          }

          lastDetectionTime = now;

          if (typeof onDetect === 'function') {
            onDetect({ severity, gForce: parseFloat(spikeMaxMagnitude.toFixed(3)) });
          }
        }

        spikeStartTime = null;
        spikeMaxMagnitude = 0;
      }
    }
  });
}

/**
 * Stop accelerometer subscription and reset state.
 */
export function stopDetection() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  spikeStartTime = null;
  spikeMaxMagnitude = 0;
  lastDetectionTime = 0;
}

export function isDetecting() {
  return subscription !== null;
}
