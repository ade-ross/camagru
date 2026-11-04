const db = require('../lib/db');

// Inserts the comment and answers it with its author's name, in one query:
// WITH names the inserted row ("c") so the SELECT can join it to users.
async function createComment(userId, imageId, body) {
  const { rows } = await db.query(
    `WITH c AS (
       INSERT INTO comments (user_id, image_id, body) VALUES ($1, $2, $3)
       RETURNING id, user_id, body, created_at
     )
     SELECT c.id, c.body, c.created_at, u.username AS author
     FROM c JOIN users u ON u.id = c.user_id`,
    [userId, imageId, body]
  );
  return rows[0];
}

// Oldest first, like a conversation
async function listForImage(imageId) {
  const { rows } = await db.query(
    `SELECT c.id, c.body, c.created_at, u.username AS author
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.image_id = $1
     ORDER BY c.id`,
    [imageId]
  );
  return rows;
}

module.exports = { createComment, listForImage };
