// Pure helpers to inspect an uploaded image BEFORE any image library decodes it.
// No dependencies, so they can be tested without libgd.

const MAX_PIXELS = 16_000_000; // 12 MP phone photos (4032x3024) must fit

// Never trust the file extension or the MIME type the client claims:
// look at the first bytes (the "magic number") of the data itself.
function sniffType(buf) {
  if (
    buf.length > 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  return null;
}

// Read width/height from the file headers without decoding the pixels.
// This blocks "decompression bombs": tiny files that expand to gigabytes of pixels.
function readDimensions(buf, type) {
  if (type === 'png') {
    // signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4)
    if (buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (type === 'jpeg') {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2; // markers with no length field
        continue;
      }
      // Start-Of-Frame markers carry the dimensions
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  return null;
}

// Returns { type } if the buffer is an acceptable image, otherwise { error }.
function inspect(buf) {
  const type = sniffType(buf);
  if (!type) return { error: 'Only PNG and JPEG images are accepted' };
  const dims = readDimensions(buf, type);
  if (!dims || dims.width < 1 || dims.height < 1) return { error: 'Unreadable image' };
  if (dims.width * dims.height > MAX_PIXELS) return { error: 'Image dimensions too large' };
  return { type, ...dims };
}

// "data:image/png;base64,AAAA..." -> Buffer, or null if the shape is wrong.
function dataUrlToBuffer(str) {
  if (typeof str !== 'string') return null;
  const m = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(str);
  return m ? Buffer.from(m[1], 'base64') : null;
}

module.exports = { sniffType, readDimensions, inspect, dataUrlToBuffer, MAX_PIXELS };
