'use strict';

const cron = require('node-cron');
const { query } = require('../db');

/**
 * Halve confidence for potholes not reported in the last 90 days
 * (but still above a floor of 1 to avoid floating-point noise).
 */
async function applyConfidenceDecay() {
  const result = await query(
    `UPDATE potholes
     SET confidence = GREATEST(0, confidence * 0.5)
     WHERE last_reported_at < NOW() - INTERVAL '90 days'
       AND confidence > 1
       AND hidden = FALSE
     RETURNING id`
  );
  return result.rowCount;
}

/**
 * Hide potholes that have not been reported in the last 180 days.
 */
async function hideStaleRecords() {
  const result = await query(
    `UPDATE potholes
     SET hidden = TRUE
     WHERE last_reported_at < NOW() - INTERVAL '180 days'
       AND hidden = FALSE
     RETURNING id`
  );
  return result.rowCount;
}

/**
 * Main decay job — runs both steps in sequence.
 */
async function runDecayJob() {
  console.log('[decay] Starting daily time decay job...');

  try {
    const decayed = await applyConfidenceDecay();
    console.log(`[decay] Halved confidence for ${decayed} pothole(s) older than 90 days.`);
  } catch (err) {
    console.error('[decay] Error applying confidence decay:', err);
  }

  try {
    const hidden = await hideStaleRecords();
    console.log(`[decay] Marked ${hidden} pothole(s) as hidden (older than 180 days).`);
  } catch (err) {
    console.error('[decay] Error hiding stale records:', err);
  }

  console.log('[decay] Daily time decay job complete.');
}

/**
 * Register the cron schedule.
 * Runs every day at 02:00 server local time.
 */
function registerDecayJob() {
  cron.schedule('0 2 * * *', runDecayJob, {
    timezone: 'UTC',
  });

  console.log('[decay] Time decay cron job registered (daily at 02:00 UTC).');
}

module.exports = { registerDecayJob, runDecayJob };
