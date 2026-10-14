const sessionsModel = require('../models/sessions');

async function attachSession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/(?:^|;\s*)session_id=([^;]+)/);
  const sessionId = match ? match[1] : null;

  if (!sessionId) {
    req.user = null;
    return;
  }

  const session = await sessionsModel.findValidSession(sessionId);
  if (!session) {
    req.user = null;
    return;
  }

  req.user = { id: session.user_id };
  req.sessionId = sessionId;
}

function requireAuth(req, res) {
  if (!req.user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not authenticated' }));
    return false;
  }
  return true;
}

module.exports = { attachSession, requireAuth };