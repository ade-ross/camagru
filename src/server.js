const config = require('./lib/config'); // first: stops right here if .env is incomplete
const http = require('http');
const path = require('path');
const router = require('./router');
const { parseBody } = require('./middleware/bodyParser');
const { attachSession } = require('./middleware/session');
const { sendJson, sendFile } = require('./lib/http');

// Register all route groups
require('./routes/auth').register(router.add);
require('./routes/users').register(router.add);
require('./routes/images').register(router.add);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BODY_LIMIT = 1e6;
const IMAGE_BODY_LIMIT = 10 * 1024 * 1024; // a 6 MB photo is ~8 MB as base64

// Only these file types are served from public/. Anything else is a 404.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res) {
  if (req.method !== 'GET') return sendJson(res, 404, { error: 'Not found' });

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]); // "/my%20page.html" -> "/my page.html"
  } catch {
    return sendJson(res, 400, { error: 'Bad URL' }); // malformed escape like "%E0%A4%A"
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  // path.join resolves "..", so check the result is still INSIDE public/.
  // The trailing separator matters: "/usr/app/public-secret" starts with "/usr/app/public".
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return sendJson(res, 404, { error: 'Not found' });
  }

  const type = MIME[path.extname(filePath).toLowerCase()];
  const sent = type && await sendFile(res, filePath, {
    'Content-Type': type,
    'Cache-Control': 'no-cache', // always revalidate: you'll see your latest JS/CSS
  });
  if (!sent) sendJson(res, 404, { error: 'Not found' });
}

async function handle(req, res) {
  const match = router.match(req.method, req.url);

  if (!match) {
    // Unknown API route: JSON 404. Anything else: maybe a file in public/
    if (req.url.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
    return serveStatic(req, res);
  }

  // Only matched routes need the session: static files skip the DB lookup
  await attachSession(req);

  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    const limit = req.url.startsWith('/api/images') ? IMAGE_BODY_LIMIT : BODY_LIMIT;
    req.body = await parseBody(req, limit);
  } else {
    req.body = {};
  }

  await match.handler(req, res, match.params);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err.statusCode || 500;
    if (status === 500) console.error('Unhandled server error:', err);

    // A handler may fail AFTER it started answering (e.g. while streaming a
    // file). Writing new headers then would throw again and crash the server,
    // so the only thing left to do is cut the connection.
    if (res.headersSent) return res.destroy();

    sendJson(res, status, { error: status === 500 ? 'Internal server error' : err.message });
  });
});

server.listen(config.port, () => {
  console.log(`Camagru server running on port ${config.port}`);
});
