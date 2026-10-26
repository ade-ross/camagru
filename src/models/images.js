const db = require('../lib/db');

async function createImage(userId, filename) {
  const { rows } = await db.query(
    `INSERT INTO images (user_id, filename) VALUES ($1, $2)
     RETURNING id, filename, created_at`,
    [userId, filename]
  );
  return rows[0];
}

async function listByUser(userId) {
  const { rows } = await db.query(
    `SELECT id, filename, created_at FROM images
     WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows;
}

// Ownership is enforced INSIDE the query: a row is only deleted if it belongs to
// userId. Someone else's image id simply matches nothing, so there is no way to
// forget an ownership check in a controller.
async function deleteOwned(imageId, userId) {
  const { rows } = await db.query(
    `DELETE FROM images WHERE id = $1 AND user_id = $2 RETURNING filename`,
    [imageId, userId]
  );
  return rows[0] || null;
}

module.exports = { createImage, listByUser, deleteOwned };
