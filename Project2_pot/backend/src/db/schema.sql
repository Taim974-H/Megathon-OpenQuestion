CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS potholes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location GEOMETRY(POINT, 4326) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high'
  report_count INTEGER NOT NULL DEFAULT 1,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS potholes_location_idx ON potholes USING GIST(location);
CREATE INDEX IF NOT EXISTS potholes_hidden_idx ON potholes(hidden);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pothole_id UUID REFERENCES potholes(id) ON DELETE CASCADE,
  device_uuid VARCHAR(255) NOT NULL,
  car_type VARCHAR(20),  -- 'sedan', 'suv', 'sports', 'truck', 'van'
  severity VARCHAR(10) NOT NULL, -- 'low', 'medium', 'high'
  g_force NUMERIC(6,3) NOT NULL,
  location GEOMETRY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reports_pothole_id_idx ON reports(pothole_id);
CREATE INDEX IF NOT EXISTS reports_device_uuid_idx ON reports(device_uuid);
