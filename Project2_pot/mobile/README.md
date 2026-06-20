# Pothole Tracker — Mobile App

React Native (Expo SDK 51) app that detects road potholes using the phone's accelerometer, logs them to a backend API, and warns drivers approaching known hazards with an audio alert.

---

## Requirements

- Node.js 18+
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- Expo Go app on your phone **or** a physical device with a development build
- Backend API running (see `/backend` in this monorepo)

> **Physical device required** — the accelerometer is unavailable in simulators/emulators.

---

## Quick start

```bash
cd mobile

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set EXPO_PUBLIC_API_URL to your backend's LAN IP, e.g.:
#   EXPO_PUBLIC_API_URL=http://192.168.1.42:3000

# 3. Add the alert sound (optional but recommended)
# See assets/ALERT_AUDIO_README.txt for instructions

# 4. Start the development server
npx expo start

# 5. Scan the QR code with Expo Go (iOS/Android)
#    — or press 'a' for Android emulator, 'i' for iOS simulator
```

---

## Permissions

The app requests the following permissions at runtime:

| Permission | Platform | Why |
|---|---|---|
| Location (When In Use) | iOS & Android | GPS coordinates for pothole logging |
| Location (Always / Background) | iOS & Android | Background monitoring while driving |
| Motion & Fitness | iOS | Accelerometer access |

On **Android 12+** you may need to manually grant "Allow all the time" for background location in system settings after the in-app prompt.

---

## Configuration

### API URL

Set the backend URL in one of three ways (highest priority first):

1. **In-app Settings screen** — persisted to AsyncStorage, survives restarts.
2. **`.env` file** — `EXPO_PUBLIC_API_URL=http://192.168.x.x:3000`
3. **Hard-coded fallback** — `http://localhost:3000`

> Use your machine's **LAN IP** (not `localhost`) when testing on a physical device. Find it with `ipconfig` (Windows) or `ifconfig` / `ip addr` (macOS/Linux).

---

## Detection tuning

All thresholds and timing constants live in `src/constants/detection.js`:

| Constant | Default | Description |
|---|---|---|
| `BASE_THRESHOLDS.low` | 1.5 G | Minimum G-force to classify as a pothole |
| `BASE_THRESHOLDS.medium` | 3.0 G | Medium severity threshold |
| `BASE_THRESHOLDS.high` | 5.0 G | Severe pothole threshold |
| `DETECTION_DEBOUNCE_MS` | 3000 ms | Cooldown after a detection |
| `SPIKE_RESOLUTION_MS` | 200 ms | Max spike duration (longer = sustained vibration, ignored) |
| `MIN_SPEED_KMH` | 5 km/h | Below this speed, no detections |
| `NEARBY_FETCH_RADIUS_M` | 200 m | Radius for fetching nearby potholes from API |
| `ALERT_COOLDOWN_MS` | 30 000 ms | Min gap between re-alerting for the same pothole |

Car-type and sensitivity multipliers are also in that file and are applied on top of the base thresholds.

---

## Project structure

```
mobile/
  src/
    constants/
      detection.js        # thresholds, timing, task names
    services/
      detection.js        # accelerometer subscription & bump classification
      location.js         # background GPS task (TaskManager)
      api.js              # axios wrappers for backend calls
      storage.js          # AsyncStorage helpers (UUID, settings)
      audio.js            # expo-av sound loading & playback
    screens/
      HomeScreen.js       # monitoring toggle, car picker, live stats
      HistoryScreen.js    # FlatList of device's detections
      SettingsScreen.js   # user preferences
    navigation/
      index.js            # bottom tab navigator
    components/
      PotholeCard.js      # list item used in HistoryScreen
  assets/
    alert.mp3             # (you must add this — see assets/ALERT_AUDIO_README.txt)
  App.js                  # root component, navigation container
  app.json                # Expo config (permissions, background modes)
  package.json
  babel.config.js
  .env.example
```

---

## Building for production

```bash
# EAS Build (recommended)
npm install -g eas-cli
eas build --platform android   # or ios
```

You will need an Expo account and (for iOS) an Apple Developer account.

---

## Troubleshooting

**"No potholes detected" even on rough roads**
- Make sure the phone is mounted firmly (a loose phone cancels impacts).
- Reduce sensitivity to "High" in Settings.
- Check that speed is above 5 km/h.

**Audio alert not playing**
- Add `assets/alert.mp3` (see `assets/ALERT_AUDIO_README.txt`).
- Ensure "Audio Alerts" is enabled in Settings.
- On iOS, the device should not be in silent mode (the app configures `playsInSilentModeIOS: true` but some devices still suppress audio).

**Background task not running (Android)**
- Ensure "Allow all the time" location permission is granted.
- Some OEM battery optimisers (Xiaomi, Huawei, Samsung) kill background tasks aggressively. Add the app to the battery whitelist.

**API connection refused**
- Use the device's LAN IP of your development machine, not `localhost`.
- Confirm the backend is running and reachable on the same network.
