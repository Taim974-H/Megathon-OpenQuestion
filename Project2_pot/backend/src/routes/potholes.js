'use strict';

const express = require('express');
const { query, getClient } = require('../db');

const router = express.Router();

const SEVERITY_ORDER = { high: 3, medium: 2, low: 1 };

function maxSeverity(a, b) {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

function validateSeverity(value) {
  return ['low', 'medium', 'high'].includes(value);
}

function validateCarType(value) {
  if (value === null || value === undefined) return true;
  return ['sedan', 'suv', 'sports', 'truck', 'van'].includes(value);
}

/**
 * POST /api/potholes
 * Accept a new pothole detection report from a mobile device.
 */
router.post('/', async (req, res) => {
  const { device_uuid, lat, lng, severity, g_force, car_type } = req.body;

  // Input validation
  if (!device_uuid || typeof device_uuid !== 'string' || device_uuid.trim() === '') {
    return res.status(400).json({ error: 'device_uuid is required' });
  }
  if (lat === undefined || lat === null || isNaN(Number(lat))) {
    return res.status(400).json({ error: 'lat must be a valid number' });
  }
  if (lng === undefined || lng === null || isNaN(Number(lng))) {
    return res.status(400).json({ error: 'lng must be a valid number' });
  }
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (latNum < -90 || latNum > 90) {
    return res.status(400).json({ error: 'lat must be between -90 and 90' });
  }
  if (lngNum < -180 || lngNum > 180) {
    return res.status(400).json({ error: 'lng must be between -180 and 180' });
  }
  if (!severity || !validateSeverity(severity)) {
    return res.status(400).json({ error: 'severity must be one of: low, medium, high' });
  }
  if (g_force === undefined || g_force === null || isNaN(Number(g_force))) {
    return res.status(400).json({ error: 'g_force must be a valid number' });
  }
  if (!validateCarType(car_type)) {
    return res.status(400).json({ error: 'car_type must be one of: sedan, suv, sports, truck, van' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Check for an existing pothole within 15 metres
    const existingResult = await client.query(
      `SELECT id, severity, report_count
       FROM potholes
       WHERE ST_DWithin(
         location,
         ST_SetSRID(ST_Point($1, $2), 4326)::geography,
         15
       )
       AND hidden = FALSE
       ORDER BY ST_Distance(
         location::geography,
         ST_SetSRID(ST_Point($1, $2), 4326)::geography
       )
       LIMIT 1`,
      [lngNum, latNum]
    );

    let pothole;

    if (existingResult.rows.length > 0) {
      // --- Update existing pothole ---
      const existing = existingResult.rows[0];
      const newReportCount = existing.report_count + 1;

      // Update severity only once there are 2+ reports (confirmed location)
      const newSeverity = newReportCount >= 2
        ? maxSeverity(existing.severity, severity)
        : existing.severity;

      const updateResult = await client.query(
        `UPDATE potholes
         SET report_count       = $1,
             confidence         = LEAST(99, 30 * LN($1 + 1)),
             severity           = $2,
             last_reported_at   = NOW(),
             hidden             = FALSE
         WHERE id = $3
         RETURNING
           id,
           ST_Y(location::geometry) AS lat,
           ST_X(location::geometry) AS lng,
           severity,
           report_count,
           confidence,
           last_reported_at,
           hidden,
           created_at`,
        [newReportCount, newSeverity, existing.id]
      );

      pothole = updateResult.rows[0];

      // Insert the report linked to this pothole
      await client.query(
        `INSERT INTO reports (pothole_id, device_uuid, car_type, severity, g_force, location)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_Point($6, $7), 4326))`,
        [existing.id, device_uuid.trim(), car_type || null, severity, Number(g_force), lngNum, latNum]
      );
    } else {
      // --- Create a new pothole ---
      const confidence = Math.min(99, 30 * Math.log(2)); // report_count = 1 → LN(2)

      const insertResult = await client.query(
        `INSERT INTO potholes (location, severity, report_count, confidence)
         VALUES (ST_SetSRID(ST_Point($1, $2), 4326), $3, 1, $4)
         RETURNING
           id,
           ST_Y(location::geometry) AS lat,
           ST_X(location::geometry) AS lng,
           severity,
           report_count,
           confidence,
           last_reported_at,
           hidden,
           created_at`,
        [lngNum, latNum, severity, confidence]
      );

      pothole = insertResult.rows[0];

      // Insert the initial report
      await client.query(
        `INSERT INTO reports (pothole_id, device_uuid, car_type, severity, g_force, location)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_Point($6, $7), 4326))`,
        [pothole.id, device_uuid.trim(), car_type || null, severity, Number(g_force), lngNum, latNum]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({ data: pothole });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/potholes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/potholes/nearby
 * Returns non-hidden potholes within a given radius, ordered by distance.
 * Query params: lat, lng, radius (metres, default 200)
 */
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 200 } = req.query;

  if (lat === undefined || isNaN(Number(lat))) {
    return res.status(400).json({ error: 'lat query parameter is required and must be a number' });
  }
  if (lng === undefined || isNaN(Number(lng))) {
    return res.status(400).json({ error: 'lng query parameter is required and must be a number' });
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const radiusNum = Math.min(Math.max(Number(radius), 1), 50000); // clamp 1 – 50 000 m

  if (isNaN(radiusNum)) {
    return res.status(400).json({ error: 'radius must be a valid number' });
  }

  try {
    const result = await query(
      `SELECT
         id,
         ST_Y(location::geometry)                                          AS lat,
         ST_X(location::geometry)                                          AS lng,
         severity,
         report_count,
         confidence,
         last_reported_at,
         created_at,
         ROUND(ST_Distance(
           location::geography,
           ST_SetSRID(ST_Point($1, $2), 4326)::geography
         )::NUMERIC, 2)                                                    AS distance_m
       FROM potholes
       WHERE hidden = FALSE
         AND ST_DWithin(
           location::geography,
           ST_SetSRID(ST_Point($1, $2), 4326)::geography,
           $3
         )
       ORDER BY distance_m ASC`,
      [lngNum, latNum, radiusNum]
    );

    return res.json({ data: result.rows });
  } catch (err) {
    console.error('GET /api/potholes/nearby error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/potholes/dangerous
 * Returns the top 20 non-hidden potholes ordered by severity then confidence DESC.
 */
router.get('/dangerous', async (req, res) => {
  try {
    const result = await query(
      `SELECT
         id,
         ST_Y(location::geometry) AS lat,
         ST_X(location::geometry) AS lng,
         severity,
         confidence,
         report_count,
         last_reported_at
       FROM potholes
       WHERE hidden = FALSE
       ORDER BY
         CASE severity
           WHEN 'high'   THEN 3
           WHEN 'medium' THEN 2
           WHEN 'low'    THEN 1
           ELSE 0
         END DESC,
         confidence DESC
       LIMIT 20`
    );

    return res.json({ data: result.rows });
  } catch (err) {
    console.error('GET /api/potholes/dangerous error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/potholes/device/:device_uuid
 * Returns potholes associated with reports from a given device (history screen).
 * Returns last 50, ordered by report created_at DESC.
 */
router.get('/device/:device_uuid', async (req, res) => {
  const { device_uuid } = req.params;

  if (!device_uuid || device_uuid.trim() === '') {
    return res.status(400).json({ error: 'device_uuid is required' });
  }

  try {
    const result = await query(
      `SELECT DISTINCT ON (p.id)
         p.id,
         ST_Y(p.location::geometry)  AS lat,
         ST_X(p.location::geometry)  AS lng,
         p.severity,
         p.confidence,
         p.report_count,
         p.hidden,
         p.last_reported_at,
         p.created_at,
         r.created_at                AS reported_at,
         r.g_force,
         r.car_type,
         r.severity                  AS reported_severity
       FROM reports r
       JOIN potholes p ON p.id = r.pothole_id
       WHERE r.device_uuid = $1
       ORDER BY p.id, r.created_at DESC
       LIMIT 50`,
      [device_uuid.trim()]
    );

    // Re-sort by reported_at DESC after DISTINCT ON
    const rows = result.rows.sort(
      (a, b) => new Date(b.reported_at) - new Date(a.reported_at)
    );

    return res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/potholes/device/:device_uuid error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
