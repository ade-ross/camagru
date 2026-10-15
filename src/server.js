const http = require('http');
const fs = require('fs');
const path = require('path');
const router = require('./router');
const { parseBody } = require('./middleware/bodyParser');
const { attachSession } = require('./middleware/session');

// register all route groups
require('./routes/auth').register(router.add);
require('./routes/users').register(router.add);   
// require('./routes/images').register(router.add); // add these as you build them
// require('./routes/gallery').register(router.add);
// require('./routes/comments').register(router.add);
// require('./routes/likes').register(router.add);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function serveStatic(req, res) {
  const filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  // prevent path traversal (e.g. /../../etc/passwd)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200);
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    await attachSession(req); // runs before routing, sets req.user

    const match = router.match(req.method, req.url);

    if (!match) {
      // no API route matched — try serving it as a static file instead
      return serveStatic(req, res);
    }

    if (req.method === 'POST' || req.method === 'PATCH') {
      req.body = await parseBody(req);
    }

    await match.handler(req, res, match.params);
  } catch (err) {
    console.error('Unhandled server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Camagru server running on port ${PORT}`);
});
