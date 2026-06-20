'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Execute a single query against the pool.
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV !== 'production') {
    console.debug('Executed query', { text, duration, rows: result.rowCount });
  }

  return result;
}

/**
 * Acquire a client from the pool for transactions.
 * Caller is responsible for releasing the client.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
