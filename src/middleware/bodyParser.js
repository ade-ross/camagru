// Reads the request body and resolves with the parsed JSON object ({} if empty).
// limit:      max body size in bytes.
// drainExtra: how many MORE bytes we accept to read and throw away after the
//             limit, so the client is still listening when our 413 arrives.
// Errors carry a statusCode so server.js can answer with the right status.
function parseBody(req, limit = 1e6, drainExtra = 10e6) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;

    const fail = (statusCode, message) => {
      const err = new Error(message);
      err.statusCode = statusCode;
      reject(err);
    };

    const tooLarge = () => {
      tooBig = true;
      chunks.length = 0;
      fail(413, 'Payload too large');
    };

    // The client announces the size up front: no need to wait for the data
    if (Number(req.headers['content-length']) > limit) tooLarge();

    req.on('data', (chunk) => {
      size += chunk.length;
      if (tooBig) {
        // Keep draining so the 413 reaches the client, but not forever
        if (size > limit + drainExtra) req.destroy();
        return;
      }
      if (size > limit) return tooLarge();
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooBig) return; // already rejected

      // Only accept requests that say they are JSON, EVEN WITH AN EMPTY BODY
      // (logout, like). A cross-site HTML form cannot send this content type,
      // so it cannot trigger any of our POST/PATCH/PUT/DELETE routes (CSRF).
      // This is on top of the SameSite cookie, which old browsers (Chrome < 51,
      // Firefox < 60) ignore.
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
        return fail(415, 'Content-Type must be application/json');
      }
      if (size === 0) return resolve({});

      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return fail(400, 'Invalid JSON');
      }
      // "null", "5" or "[1,2]" are valid JSON but not a request body we accept:
      // every controller destructures req.body as an object
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return fail(400, 'Body must be a JSON object');
      }
      resolve(body);
    });

    req.on('error', reject);
  });
}

module.exports = { parseBody };
