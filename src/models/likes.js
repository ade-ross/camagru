const db = require('../lib/db');

// The primary key (user_id, image_id) allows one like per user per picture.
// ON CONFLICT DO NOTHING: liking twice is not an error, it just stays liked.
async function addLike(userId, imageId) {
  await db.query(
    `INSERT INTO likes (user_id, image_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, imageId]
  );
}

async function removeLike(userId, imageId) {
  await db.query(`DELETE FROM likes WHERE user_id = $1 AND image_id = $2`, [userId, imageId]);
}

async function countForImage(imageId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM likes WHERE image_id = $1`,
    [imageId]
  );
  return rows[0].count;
}

module.exports = { addLike, removeLike, countForImage };
