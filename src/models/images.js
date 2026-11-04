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

// What the gallery shows for each picture. $1 is the viewer's user id (NULL for
// a visitor): "l.user_id = NULL" is never true, so a visitor's liked is false.
// COUNT returns a bigint, which pg hands over as a string: ::int makes it a number.
const PUBLIC_FIELDS = `
  i.id, i.filename, i.created_at, u.username AS author,
  (SELECT COUNT(*) FROM likes l WHERE l.image_id = i.id)::int AS likes,
  (SELECT COUNT(*) FROM comments c WHERE c.image_id = i.id)::int AS comments,
  EXISTS (SELECT 1 FROM likes l WHERE l.image_id = i.id AND l.user_id = $1) AS liked`;

// One page of the public gallery, newest first. "Keyset" pagination: the pictures
// older than the last one the client has (before = its id; NULL = first page).
// Unlike OFFSET, a picture posted meanwhile can't shift the pages and cause a
// duplicate. SERIAL ids are handed out in insert order, so id order is creation order.
async function listPage(viewerId, before, limit) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_FIELDS}
     FROM images i JOIN users u ON u.id = i.user_id
     WHERE $2::int IS NULL OR i.id < $2
     ORDER BY i.id DESC
     LIMIT $3`,
    [viewerId, before, limit]
  );
  return rows;
}

async function findPublic(viewerId, imageId) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_FIELDS}
     FROM images i JOIN users u ON u.id = i.user_id
     WHERE i.id = $2`,
    [viewerId, imageId]
  );
  return rows[0] || null;
}

async function exists(imageId) {
  const { rows } = await db.query(`SELECT 1 FROM images WHERE id = $1`, [imageId]);
  return rows.length > 0;
}

// Who to notify about a new comment (null if the picture doesn't exist)
async function findAuthor(imageId) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.notify_on_comment
     FROM images i JOIN users u ON u.id = i.user_id
     WHERE i.id = $1`,
    [imageId]
  );
  return rows[0] || null;
}

module.exports = { createImage, listByUser, deleteOwned, listPage, findPublic, exists, findAuthor };
