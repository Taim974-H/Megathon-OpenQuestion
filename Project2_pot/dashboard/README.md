# Pothole Tracker Dashboard

A React dashboard for visualising and monitoring pothole severity data on an interactive Mapbox map.

## Setup

### 1. Copy the environment file

```bash
cp .env.example .env
```

### 2. Add your Mapbox token

Sign up for a free account at [mapbox.com](https://mapbox.com), go to your account tokens page, and copy your default public token (or create a new one).

Edit `.env`:

```
VITE_MAPBOX_TOKEN=pk.eyJ1...your_token_here
```

### 3. Set the backend URL

```
VITE_API_URL=http://localhost:3000
```

Change this to wherever your backend is running.

### 4. Install and run

```bash
npm install
npm run dev
```

The dashboard will open at [http://localhost:5173](http://localhost:5173).

---

## Features

- **Interactive Mapbox map** — dark theme, pins coloured by severity (green/orange/red), sized by confidence score
- **Hover tooltips** — severity, confidence %, report count, last reported time
- **Click popups** — anchored to map pins
- **Most Dangerous panel** — scrollable list of top potholes; click any item to fly the map to that location
- **StatsBar** — total count, high/medium severity counts, last updated time, manual refresh button
- **Auto-refresh** — data reloads every 30 seconds in the background

---

## API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /api/potholes/dangerous` | Top potholes by severity/confidence (used for both map pins and the danger panel) |
| `GET /api/potholes/stats` | Aggregate stats *(optional — StatsBar falls back to deriving counts from the potholes array)* |

### Known Limitation

The map currently displays only the top 20 potholes returned by `/api/potholes/dangerous`. To show all potholes on the map, implement a `GET /api/potholes` endpoint on the backend that returns the full (non-hidden) dataset, then add a second fetch in `src/hooks/usePotholes.js` for that endpoint.

---

## Expected Pothole Object Shape

The components tolerate several common field naming conventions:

```json
{
  "id": "abc123",
  "severity": "high",
  "confidence": 87,
  "report_count": 12,
  "last_reported": "2025-06-20T10:00:00Z",
  "latitude": 48.2082,
  "longitude": 16.3738
}
```

Alternative field names also accepted: `confidence_score`, `reports`, `created_at`, `updatedAt`, `lng`/`lat`, `location.coordinates[0/1]`, `location.lng`/`location.lat`.

---

## Project Structure

```
src/
  components/
    Map.jsx           # Mapbox map with markers and popups
    PotholePin.jsx    # Coloured circle marker
    DangerPanel.jsx   # Right sidebar, top potholes list
    Tooltip.jsx       # Hover/popup detail card
    StatsBar.jsx      # Top stats bar
  services/
    api.js            # Axios API calls
  hooks/
    usePotholes.js    # Data fetching + 30-second auto-refresh
  utils/
    severity.js       # Colour, label, and size helpers
  App.jsx
  main.jsx
  App.css
```
