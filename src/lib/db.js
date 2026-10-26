// lib/db.js
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
