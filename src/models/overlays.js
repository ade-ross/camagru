const db = require('../lib/db');

// center_x/center_y: NULL for a frame, the sticker's center otherwise
const FIELDS = 'id, filename, label, center_x, center_y';

async function listAll() {
  const { rows } = await db.query(
    `SELECT ${FIELDS} FROM overlays ORDER BY id`
  );
  return rows;
}

// The kind is checked in the SQL, like ownership elsewhere: a sticker's id
// asked for as a frame finds nothing, exactly like an unknown id.
async function findFrame(id) {
  const { rows } = await db.query(
    `SELECT ${FIELDS} FROM overlays WHERE id = $1 AND center_x IS NULL`,
    [id]
  );
  return rows[0] || null;
}

async function findSticker(id) {
  const { rows } = await db.query(
    `SELECT ${FIELDS} FROM overlays WHERE id = $1 AND center_x IS NOT NULL`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { listAll, findFrame, findSticker };
