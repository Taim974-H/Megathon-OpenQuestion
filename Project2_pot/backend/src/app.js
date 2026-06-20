'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const potholeRoutes = require('./routes/potholes');
const { registerDecayJob } = require('./jobs/decay');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Health check DB error:', err);
    return res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

app.use('/api/potholes', potholeRoutes);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Pothole Tracker API listening on port ${PORT}`);
  registerDecayJob();
});

module.exports = app;
