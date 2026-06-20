# Pothole Tracker — Backend

REST API for the pothole tracking app. Built with Node.js + Express, PostgreSQL + PostGIS.

## Prerequisites

- Node.js >= 18
- PostgreSQL >= 14 with the PostGIS extension

## Setup

### 1. Install PostgreSQL and PostGIS

On macOS with Homebrew:

```bash
brew install postgresql@16 postgis
```

On Ubuntu/Debian:

```bash
sudo apt install postgresql postgresql-contrib postgis
```

### 2. Create the database

```bash
createdb pothole_tracker
```

### 3. Run the schema

```bash
psql pothole_tracker < src/db/schema.sql
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to point at your database:

```
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/pothole_tracker
```

### 5. Install dependencies and start

```bash
npm install
npm run dev   # development (nodemon)
npm start     # production
```

The API will be available at `http://localhost:3000`.

---

## API Reference

### Health check

```
GET /health
```

Returns `200 { status: "ok", db: "connected" }` when the service and database are healthy.

---

### Submit a report

```
POST /api/potholes
Content-Type: application/json

{
  "device_uuid": "abc-123",
  "lat": 48.8566,
  "lng": 2.3522,
  "severity": "medium",
  "g_force": 2.4,
  "car_type": "sedan"
}
```

- If a pothole already exists within **15 metres**, the existing record is updated (report count incremented, confidence recalculated, severity promoted if ≥ 2 reports).
- Otherwise a new pothole is created.
- Returns `201` with the pothole object.

Confidence formula: `min(99, 30 × ln(report_count + 1))`

---

### Nearby potholes (warning system)

```
GET /api/potholes/nearby?lat=48.8566&lng=2.3522&radius=200
```

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `lat`     | yes      | —       | Latitude |
| `lng`     | yes      | —       | Longitude |
| `radius`  | no       | `200`   | Search radius in metres (max 50 000) |

Returns all non-hidden potholes within radius, ordered by ascending distance.

---

### Most dangerous potholes

```
GET /api/potholes/dangerous
```

Returns the top 20 non-hidden potholes ordered by severity (`high > medium > low`) then confidence descending.

---

### Device history

```
GET /api/potholes/device/:device_uuid
```

Returns the last 50 potholes associated with reports from the given device, ordered by report time descending.

---

## Time decay cron job

Runs automatically every day at **02:00 UTC**:

- Potholes last reported **> 90 days ago** with confidence > 1: confidence is halved.
- Potholes last reported **> 180 days ago**: marked `hidden = true`.
