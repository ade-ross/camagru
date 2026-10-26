const fs = require('fs');
const { pipeline } = require('node:stream/promises');

function sendJson(res, status, data) {
  const body = JSON.stringify(data); // if this throws, nothing has been sent yet
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body), // bytes, not characters
  });
  res.end(body);
}

// Streams a file with a 200. Returns false WITHOUT sending anything if the file
// can't be served, so the caller can still answer with its own 404.
// Used by both the static files (public/) and the uploaded images.
async function sendFile(res, filePath, headers = {}) {
  let file;
  let size;
  try {
    file = await fs.promises.open(filePath, 'r');
    const stat = await file.stat();
    // On Linux, open() succeeds on a directory and only the read fails,
    // after the 200 is already out. Check before committing.
    if (!stat.isFile()) throw new Error('not a regular file');
    size = stat.size;
  } catch {
    if (file) await file.close().catch(() => {});
    return false;
  }

  // From here on we are committed to a 200
  res.writeHead(200, {
    'Content-Length': size,
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  try {
    // If either side fails or the client leaves early, pipeline destroys
    // both streams, and destroying the read stream closes the file.
    await pipeline(file.createReadStream(), res);
  } catch (err) {
    // ERR_STREAM_PREMATURE_CLOSE only means the client went away
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error('sendFile:', err);
  }
  return true;
}

module.exports = { sendJson, sendFile };
