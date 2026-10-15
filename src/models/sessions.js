const db = require('../lib/db');

async function createSession(sessionId, userId, expiresAt) {
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [sessionId, userId, expiresAt]
  );
}

async function findValidSession(sessionId) {
  const { rows } = await db.query(
    `SELECT * FROM sessions WHERE id = $1 AND expires_at > now()`,
    [sessionId]
  );
  return rows[0] || null;
}

async function deleteSession(sessionId) {
  await db.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
}

async function deleteAllSessionsForUser(userId) {
  await db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

async function deleteOtherSessions(userId, keepSessionId) {
  await db.query(
    `DELETE FROM sessions WHERE user_id = $1 AND id <> $2`,
    [userId, keepSessionId]
  );
}

module.exports = { createSession, findValidSession, deleteSession, deleteAllSessionsForUser, deleteOtherSessions, };