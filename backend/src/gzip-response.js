import zlib from 'node:zlib';

// Transparent gzip wrapper for Node http responses.
//
// Strategy: capture writeHead + write + end, and if the client accepts gzip
// AND the response is compressible (json/text/html/js/css) AND not already
// encoded, compress the full body before flushing. When gzip is not wanted or
// not applicable, the original behaviour is preserved exactly (pass-through),
// so existing endpoints cannot break.
//
// We buffer write() chunks and defer the real writeHead/end until end() so we
// can set the correct content-length + content-encoding. This server writes
// complete responses (writeHead + end), so buffering is safe here.
const COMPRESSIBLE = /json|text|javascript|html|css|xml/;
const MIN_SIZE = 256;

export function wrapGzip(req, res) {
  const accept = String(req.headers['accept-encoding'] || '');
  if (!/gzip/.test(accept)) return res;

  const origWriteHead = res.writeHead.bind(res);
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  let capturedStatus = 200;
  let capturedHeaders = {};
  let chunks = [];
  let ended = false;

  res.writeHead = function writeHead(status, ...args) {
    if (ended) return origWriteHead(status, ...args);
    capturedStatus = status;
    const h = args[0];
    if (h && typeof h === 'object' && !Array.isArray(h)) capturedHeaders = { ...h };
    return res;
  };

  res.write = function write(chunk, ...args) {
    if (ended) return origWrite(chunk, ...args);
    if (chunk !== undefined && chunk !== null) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return true;
  };

  res.end = function end(chunk, encoding, cb) {
    if (ended) return origEnd(chunk, encoding, cb);
    ended = true;
    if (chunk !== undefined && chunk !== null) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const body = Buffer.concat(chunks);

    const ct = String(capturedHeaders['content-type'] || '');
    const alreadyEncoded = capturedHeaders['content-encoding'];
    const shouldGzip = body.length >= MIN_SIZE && COMPRESSIBLE.test(ct) && !alreadyEncoded;

    const finalHeaders = { ...capturedHeaders };
    let finalBody = body;

    if (shouldGzip) {
      try {
        const compressed = zlib.gzipSync(body, { level: 6 });
        if (compressed.length < body.length) {
          finalBody = compressed;
          finalHeaders['content-encoding'] = 'gzip';
          finalHeaders['content-length'] = compressed.length;
          finalHeaders['vary'] = 'Accept-Encoding';
        }
      } catch {
        // compression failed: fall through to uncompressed
      }
    }

    if (finalHeaders['content-length'] === undefined) {
      finalHeaders['content-length'] = finalBody.length;
    }

    origWriteHead(capturedStatus, finalHeaders);
    return origEnd(finalBody, encoding === undefined ? undefined : encoding, cb);
  };

  return res;
}
