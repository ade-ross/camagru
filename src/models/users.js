const db = require('../lib/db'); // exports a pg Pool

// All queries use parameterized placeholders ($1, $2...) — never string concatenation.

async function createUser({ username, email, passwordHash, confirmToken }) {
  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, confirm_token)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, created_at`,
    [username, email, passwordHash, confirmToken]
  );
  return rows[0];
}

async function findByUsername(username) {
  const { rows } = await db.query(
    `SELECT * FROM users WHERE username = $1`,
    [username]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await db.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, username, email, notify_on_comment, is_confirmed, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getPasswordHash(userId) {
  const { rows } = await db.query(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] ? rows[0].password_hash : null;
}

async function confirmUser(token) {
  const { rows } = await db.query(
    `UPDATE users SET is_confirmed = TRUE, confirm_token = NULL
     WHERE confirm_token = $1
     RETURNING id`,
    [token]
  );
  return rows[0] || null; // null means token was invalid/already used
}

async function setResetToken(userId, token, expiresAt) {
  await db.query(
    `UPDATE users SET reset_token = $1, reset_token_expires = $2
     WHERE id = $3`,
    [token, expiresAt, userId]
  );
}

async function findByResetToken(token) {
  const { rows } = await db.query(
    `SELECT * FROM users
     WHERE reset_token = $1 AND reset_token_expires > now()`,
    [token]
  );
  return rows[0] || null;
}

async function updatePassword(userId, passwordHash) {
  await db.query(
    `UPDATE users
     SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL
     WHERE id = $2`,
    [passwordHash, userId]
  );
}

async function updateProfile(userId, { username, email, notifyOnComment }) {
  const { rows } = await db.query(
    `UPDATE users
     SET username = COALESCE($1, username),
         email = COALESCE($2, email),
         notify_on_comment = COALESCE($3, notify_on_comment)
     WHERE id = $4
     RETURNING id, username, email, notify_on_comment`,
    [username, email, notifyOnComment, userId]
  );
  return rows[0];
}

async function setPendingEmail(userId, email, token, expiresAt) {
  await db.query(
    `UPDATE users
     SET pending_email = $1, pending_email_token = $2, pending_email_expires = $3
     WHERE id = $4`,
    [email, token, expiresAt, userId]
  );
}

async function clearPendingEmail(userId) {
  await db.query(
    `UPDATE users
     SET pending_email = NULL, pending_email_token = NULL, pending_email_expires = NULL
     WHERE id = $1`,
    [userId]
  );
}

async function confirmPendingEmail(token) {
  const { rows } = await db.query(
    `UPDATE users
     SET email = pending_email, pending_email = NULL,
         pending_email_token = NULL, pending_email_expires = NULL
     WHERE pending_email_token = $1 AND pending_email_expires > now()
     RETURNING id`,
    [token]
  );
  return rows[0] || null;
}

module.exports = {
  createUser, findByUsername, findByEmail, findById,
  confirmUser, setResetToken, findByResetToken,
  updatePassword, updateProfile, getPasswordHash,
  setPendingEmail, confirmPendingEmail, clearPendingEmail,
};