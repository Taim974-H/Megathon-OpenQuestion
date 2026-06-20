# Pothole Tracker

A crowdsourced pothole detection and warning system. The mobile app runs in the background, detects bumps using the phone's accelerometer, logs pothole locations to the backend, and warns drivers when approaching known potholes. The web dashboard provides a map overview with severity and confidence data.

## Monorepo structure

```
megathon/
  backend/      Node.js + Express + PostgreSQL + PostGIS
  mobile/       React Native (Expo) mobile app
  dashboard/    React + Mapbox web dashboard
```

## Quick start

### 1. Backend

Requires PostgreSQL with PostGIS extension.

```bash
createdb pothole_tracker
cd backend
cp .env.example .env        # set DATABASE_URL
psql pothole_tracker < src/db/schema.sql
npm install
npm run dev                 # runs on http://localhost:3000
```

### 2. Dashboard

Requires a free Mapbox account for the access token.

```bash
cd dashboard
cp .env.example .env        # set VITE_MAPBOX_TOKEN and VITE_API_URL
npm install
npm run dev                 # runs on http://localhost:5173
```

### 3. Mobile app

Requires a physical device (accelerometer not available in simulators).

```bash
cd mobile
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your backend's LAN IP
npm install
npx expo start              # scan QR with Expo Go
```

## How it works

1. **Detection** — accelerometer Z-axis spikes above a threshold (adjusted per car type) within a 200ms window are classified as potholes. Severity tiers: Low (1.5–3G), Medium (3–5G), High (5G+).
2. **Clustering** — new reports within 15m of an existing pothole update it rather than creating a duplicate.
3. **Confidence** — logarithmic formula based on report count: `min(99, 30 * ln(reports + 1))`. Never reaches 100%.
4. **Severity** — maximum G-tier across all reports, only applied after 2+ reports confirm the location.
5. **Warnings** — background GPS polling every 3 seconds queries the backend for potholes within 200m. Audio alert triggers at 100m.
6. **Decay** — daily cron job halves confidence after 90 days of no reports, hides potholes after 180 days.
