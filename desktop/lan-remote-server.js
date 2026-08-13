const crypto = require('crypto');
const dns = require('dns');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');

const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const COMMAND_TYPES = new Set(['play', 'pause', 'previous', 'next', 'volume']);
// Chromium rejects these ports before issuing an HTTP request. Since the LAN
// remote uses an OS-assigned port, discard an unsafe assignment and bind again.
const BROWSER_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540,
  548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);
const STATIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/remote.css': ['remote.css', 'text/css; charset=utf-8'],
  '/remote.js': ['remote.js', 'text/javascript; charset=utf-8'],
});

function cleanText(value, fallback, maxLength) {
  const text = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return text || fallback;
}

function finiteNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function sanitizeQueueItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    title: cleanText(item.title || item.name, '未知歌曲', 120),
    artist: cleanText(item.artist, '未知歌手', 100),
  };
}

function sanitizeRemoteState(input, now = Date.now()) {
  input = input && typeof input === 'object' ? input : {};
  const duration = finiteNumber(input.duration, 0, 0, 24 * 60 * 60);
  const currentTime = finiteNumber(input.currentTime, 0, 0, duration || 24 * 60 * 60);
  const upcoming = Array.isArray(input.upcoming)
    ? input.upcoming.slice(0, 3).map(sanitizeQueueItem).filter(Boolean)
    : [];
  return {
    playing: input.playing === true,
    title: cleanText(input.title, '等待播放', 120),
    artist: cleanText(input.artist, 'Mineradio', 100),
    album: cleanText(input.album, '', 120),
    volume: finiteNumber(input.volume, 0.8, 0, 1),
    currentTime,
    duration,
    progress: duration > 0 ? currentTime / duration : 0,
    queueLength: Math.round(finiteNumber(input.queueLength, 0, 0, 100000)),
    upcoming,
    artworkRevision: Math.max(0, Math.round(Number(input.artworkRevision) || 0)),
    updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : now,
  };
}

function normalizeCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const type = String(input.type || '').trim().toLowerCase();
  if (!COMMAND_TYPES.has(type)) return null;
  if (type !== 'volume') return { type };
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return { type, value: Math.round(value * 1000) / 1000 };
}

function isBrowserSafePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 && !BROWSER_BLOCKED_PORTS.has(port);
}

function isUsableLanAddress(address) {
  if (!net.isIP(address)) return false;
  if (address === '127.0.0.1' || address === '0.0.0.0' || address === '::1') return false;
  if (address.startsWith('169.254.') || address.toLowerCase().startsWith('fe80:')) return false;
  return true;
}

function listLanAddresses(networkInterfaces = os.networkInterfaces()) {
  const result = [];
  Object.entries(networkInterfaces || {}).forEach(([interfaceName, entries]) => {
    (entries || []).forEach((entry) => {
      if (!entry || entry.internal || !isUsableLanAddress(entry.address)) return;
      if (entry.family !== 'IPv4' && entry.family !== 4) return;
      if (result.some((item) => item.address === entry.address)) return;
      const virtual = /vethernet|hyper-v|default switch|wsl|virtual|vmware|virtualbox|tailscale|zerotier|bluetooth|蓝牙|vpn|tap|tun/i.test(interfaceName);
      const privateAddress = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address);
      result.push({ address: entry.address, virtual, privateAddress, interfaceName });
    });
  });
  return result.sort((a, b) => {
    return Number(a.virtual) - Number(b.virtual)
      || Number(b.privateAddress) - Number(a.privateAddress)
      || a.interfaceName.localeCompare(b.interfaceName)
      || a.address.localeCompare(b.address);
  }).map((item) => item.address);
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  if (!net.isIP(value)) return true;
  if (value === '::1' || value === '0.0.0.0' || value === '::') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  if (net.isIPv4(value)) {
    return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
  }
  return false;
}

function baseHeaders(contentType) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, { ...baseHeaders('application/json; charset=utf-8'), 'Content-Length': body.length });
  response.end(body);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('REMOTE_BODY_TOO_LARGE');
        error.statusCode = 413;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (_) {
        const error = new Error('REMOTE_BODY_INVALID');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function bearerToken(request) {
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(String(request.headers.authorization || '').trim());
  return match ? match[1].toLowerCase() : '';
}

function tokensEqual(expected, actual) {
  if (!expected || !actual || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function clientAddress(request) {
  return String(request.socket && request.socket.remoteAddress || '')
    .replace(/^::ffff:/, '')
    .slice(0, 80);
}

async function resolvePublicImageUrl(source) {
  const url = new URL(source);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('REMOTE_ARTWORK_PROTOCOL');
  if (url.username || url.password || /(^|\.)localhost$/i.test(url.hostname) || /\.local$/i.test(url.hostname)) {
    throw new Error('REMOTE_ARTWORK_HOST');
  }
  const resolved = await dns.promises.lookup(url.hostname, { family: 0 });
  if (!resolved || isPrivateAddress(resolved.address)) throw new Error('REMOTE_ARTWORK_PRIVATE_HOST');
  return { url, resolved };
}

async function fetchArtwork(source, redirects = 0) {
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/i.exec(source);
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_ARTWORK_BYTES) throw new Error('REMOTE_ARTWORK_TOO_LARGE');
    return { buffer, contentType: match[1].toLowerCase() };
  }
  if (redirects > 3) throw new Error('REMOTE_ARTWORK_REDIRECTS');
  const { url, resolved } = await resolvePublicImageUrl(source);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8', 'User-Agent': 'Mineradio-LAN-Remote/1.0' },
      lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
      timeout: 5000,
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const redirected = new URL(response.headers.location, url).toString();
        fetchArtwork(redirected, redirects + 1).then(resolve, reject);
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';')[0].toLowerCase();
      if (response.statusCode !== 200 || !/^image\/(png|jpeg|webp|gif|avif)$/.test(contentType)) {
        response.resume();
        reject(new Error('REMOTE_ARTWORK_RESPONSE'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_ARTWORK_BYTES) {
          response.destroy(new Error('REMOTE_ARTWORK_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('REMOTE_ARTWORK_TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}

function createLanRemoteServer(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const staticDir = options.staticDir || path.join(__dirname, '..', 'public', 'remote');
  const getAddresses = typeof options.getAddresses === 'function' ? options.getAddresses : listLanAddresses;
  const onCommand = typeof options.onCommand === 'function' ? options.onCommand : () => {};
  const sessionMs = Math.max(60_000, Number(options.sessionMs) || SESSION_MS);
  let server = null;
  let token = '';
  let expiresAt = 0;
  let addresses = [];
  let state = sanitizeRemoteState({}, now());
  let coverSource = '';
  let artworkCache = null;
  let startPromise = null;
  let expiryTimer = null;
  let qrDataUrl = '';
  const clients = new Map();
  const commandWindows = new Map();

  function enabled() {
    return !!(server && server.listening && token && expiresAt > now());
  }

  function status() {
    if (!enabled()) return { ok: true, enabled: false, clients: 0 };
    const port = server.address().port;
    const primaryUrl = `http://${addresses[0]}:${port}/#token=${token}`;
    const activeSince = now() - 15_000;
    const connectedClients = Array.from(clients.values()).filter((seenAt) => seenAt >= activeSince).length;
    return {
      ok: true,
      enabled: true,
      port,
      addresses: addresses.slice(),
      primaryUrl,
      displayAddress: `http://${addresses[0]}:${port}`,
      qrDataUrl,
      expiresAt,
      clients: connectedClients,
    };
  }

  function authorized(request) {
    return enabled() && tokensEqual(token, bearerToken(request));
  }

  function noteClient(request) {
    const address = clientAddress(request);
    if (address) clients.set(address, now());
    return address || 'unknown';
  }

  function withinCommandRate(address) {
    const windowStart = now() - 10_000;
    const events = (commandWindows.get(address) || []).filter((timestamp) => timestamp >= windowStart);
    if (events.length >= 30) return false;
    events.push(now());
    commandWindows.set(address, events);
    return true;
  }

  async function serveArtwork(response) {
    if (!coverSource) {
      response.writeHead(204, baseHeaders());
      response.end();
      return;
    }
    try {
      if (!artworkCache || artworkCache.source !== coverSource) {
        const fetched = await fetchArtwork(coverSource);
        artworkCache = { source: coverSource, ...fetched };
      }
      response.writeHead(200, {
        ...baseHeaders(artworkCache.contentType),
        'Content-Length': artworkCache.buffer.length,
      });
      response.end(artworkCache.buffer);
    } catch (_) {
      response.writeHead(204, baseHeaders());
      response.end();
    }
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url || '/', 'http://mineradio.local');
    const staticFile = STATIC_FILES[url.pathname];
    if (request.method === 'GET' && staticFile) {
      try {
        const body = fs.readFileSync(path.join(staticDir, staticFile[0]));
        response.writeHead(200, { ...baseHeaders(staticFile[1]), 'Content-Length': body.length });
        response.end(body);
      } catch (_) {
        sendJson(response, 404, { ok: false, error: 'REMOTE_ASSET_NOT_FOUND' });
      }
      return;
    }
    if (url.pathname === '/api/state' && request.method === 'GET') {
      if (!authorized(request)) {
        sendJson(response, 401, { ok: false, error: expiresAt && expiresAt <= now() ? 'REMOTE_SESSION_EXPIRED' : 'REMOTE_UNAUTHORIZED' });
        return;
      }
      noteClient(request);
      sendJson(response, 200, { ok: true, state });
      return;
    }
    if (url.pathname === '/api/artwork' && request.method === 'GET') {
      if (!authorized(request)) {
        sendJson(response, 401, { ok: false, error: 'REMOTE_UNAUTHORIZED' });
        return;
      }
      noteClient(request);
      await serveArtwork(response);
      return;
    }
    if (url.pathname === '/api/command' && request.method === 'POST') {
      if (!authorized(request)) {
        sendJson(response, 401, { ok: false, error: 'REMOTE_UNAUTHORIZED' });
        return;
      }
      const address = noteClient(request);
      if (!withinCommandRate(address)) {
        sendJson(response, 429, { ok: false, error: 'REMOTE_RATE_LIMITED' });
        return;
      }
      try {
        const command = normalizeCommand(await readJsonBody(request));
        if (!command) {
          sendJson(response, 400, { ok: false, error: 'REMOTE_COMMAND_INVALID' });
          return;
        }
        await Promise.resolve(onCommand(command));
        sendJson(response, 202, { ok: true, accepted: command.type });
      } catch (error) {
        sendJson(response, error.statusCode || 500, { ok: false, error: error.message || 'REMOTE_COMMAND_FAILED' });
      }
      return;
    }
    sendJson(response, 404, { ok: false, error: 'REMOTE_NOT_FOUND' });
  }

  async function start() {
    if (enabled()) {
      const current = status();
      if (!qrDataUrl) qrDataUrl = await QRCode.toDataURL(current.primaryUrl, { width: 360, margin: 1, color: { dark: '#07110f', light: '#f3f7f5' } });
      current.qrDataUrl = qrDataUrl;
      return current;
    }
    if (startPromise) return startPromise;
    startPromise = (async () => {
      addresses = getAddresses();
      if (!addresses.length) return { ok: false, enabled: false, error: 'REMOTE_NO_LAN_ADDRESS' };
      token = crypto.randomBytes(32).toString('hex');
      expiresAt = now() + sessionMs;
      clients.clear();
      commandWindows.clear();
      server = http.createServer((request, response) => {
        handleRequest(request, response).catch(() => sendJson(response, 500, { ok: false, error: 'REMOTE_SERVER_FAILED' }));
      });
      let safePort = false;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await new Promise((resolve, reject) => {
          const onError = (error) => {
            server.off('listening', onListening);
            reject(error);
          };
          const onListening = () => {
            server.off('error', onError);
            resolve();
          };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(0, '0.0.0.0');
        });
        if (isBrowserSafePort(server.address().port)) {
          safePort = true;
          break;
        }
        await new Promise((resolve) => server.close(resolve));
      }
      if (!safePort) throw new Error('REMOTE_NO_BROWSER_SAFE_PORT');
      const current = status();
      qrDataUrl = await QRCode.toDataURL(current.primaryUrl, { width: 360, margin: 1, color: { dark: '#07110f', light: '#f3f7f5' } });
      current.qrDataUrl = qrDataUrl;
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => { stop().catch(() => {}); }, Math.max(1000, expiresAt - now()));
      if (expiryTimer.unref) expiryTimer.unref();
      return current;
    })().catch(async (error) => {
      await stop();
      return { ok: false, enabled: false, error: error.code || error.message || 'REMOTE_START_FAILED' };
    }).finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  async function stop() {
    const closing = server;
    server = null;
    token = '';
    expiresAt = 0;
    addresses = [];
    qrDataUrl = '';
    clearTimeout(expiryTimer);
    expiryTimer = null;
    clients.clear();
    commandWindows.clear();
    if (!closing) return { ok: true, enabled: false };
    await new Promise((resolve) => closing.close(() => resolve()));
    return { ok: true, enabled: false };
  }

  function updateState(input) {
    input = input && typeof input === 'object' ? input : {};
    const nextCover = cleanText(input.coverSource, '', 4096);
    if (nextCover !== coverSource) {
      coverSource = nextCover;
      artworkCache = null;
      input = { ...input, artworkRevision: state.artworkRevision + 1 };
    }
    state = sanitizeRemoteState(input, now());
    return state;
  }

  return { start, stop, status, updateState };
}

module.exports = {
  COMMAND_TYPES,
  createLanRemoteServer,
  isBrowserSafePort,
  isPrivateAddress,
  listLanAddresses,
  normalizeCommand,
  sanitizeRemoteState,
};
