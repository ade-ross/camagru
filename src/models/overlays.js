const db = require('../lib/db');

async function listAll() {
  const { rows } = await db.query(
    `SELECT id, filename, label FROM overlays ORDER BY id`
  );
  return rows;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, filename, label FROM overlays WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { listAll, findById };
