const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

const OFFLINE_MUSIC_SCHEME = 'mineradio-offline';
const OFFLINE_LIBRARY_VERSION = 1;
const OFFLINE_LIBRARY_FILE = 'offline-music.json';
const OFFLINE_DIRECTORY = 'offline-music';
const MAX_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_RECORDS = 10000;
const PROGRESS_INTERVAL_MS = 120;

const AUDIO_EXTENSION_BY_MIME = new Map([
  ['audio/mpeg', '.mp3'],
  ['audio/mp3', '.mp3'],
  ['audio/flac', '.flac'],
  ['audio/x-flac', '.flac'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/ogg', '.ogg'],
  ['audio/mp4', '.m4a'],
  ['audio/aac', '.aac'],
  ['audio/opus', '.opus'],
]);

function registerOfflineMusicScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{
    scheme: OFFLINE_MUSIC_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  }]);
}

function cleanText(value, fallback = '', maxLength = 1000) {
  const text = String(value == null ? '' : value).replace(/\0/g, '').trim();
  return (text || String(fallback || '')).slice(0, maxLength);
}

function offlineTrackKey(value) {
  const raw = cleanText(value, '', 2000).toLowerCase();
  if (!raw || raw.startsWith('local:')) return '';
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function sanitizeSongMetadata(value) {
  const song = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const provider = cleanText(song.provider || song.source || song.type, 'netease', 32).toLowerCase();
  const safeProvider = /^(netease|qq|kugou|qishui|spotify|kuwo|migu)$/.test(provider) ? provider : 'netease';
  return {
    provider: safeProvider,
    source: safeProvider,
    type: safeProvider,
    id: cleanText(song.id, '', 256),
    mid: cleanText(song.mid || song.songmid, '', 256),
    hash: cleanText(song.hash || song.fileHash || song.audioHash, '', 256),
    spotifyId: cleanText(song.spotifyId, '', 256),
    spotifyUri: cleanText(song.spotifyUri || song.uri, '', 512),
    providerSongId: cleanText(song.providerSongId || song.trackId || song.track_id, '', 256),
    additionalSourceCode: cleanText(song.additionalSourceCode, '', 128),
    name: cleanText(song.name || song.title, '未知歌曲', 500),
    title: cleanText(song.name || song.title, '未知歌曲', 500),
    artist: cleanText(song.artist || song.singer, '未知歌手', 500),
    album: cleanText(song.album, '', 500),
    cover: cleanText(song.cover || song.picUrl, '', 4000),
    duration: Math.max(0, Math.min(24 * 60 * 60, Number(song.duration) || Number(song.durationMs) / 1000 || 0)),
  };
}

function normalizeContentType(value) {
  return cleanText(value, '', 200).toLowerCase().split(';')[0].trim();
}

function acceptedAudioContentType(value) {
  const type = normalizeContentType(value);
  return type.startsWith('audio/') || type === 'application/octet-stream';
}

function extensionForAudio(contentType, finalUrl) {
  const type = normalizeContentType(contentType);
  if (AUDIO_EXTENSION_BY_MIME.has(type)) return AUDIO_EXTENSION_BY_MIME.get(type);
  try {
    const extension = path.extname(new URL(finalUrl).pathname).toLowerCase();
    if (/^\.(mp3|flac|wav|ogg|m4a|aac|opus)$/.test(extension)) return extension;
  } catch (_) {}
  return '.audio';
}

function parseByteRange(value, size) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(text);
  if (!match || (!match[1] && !match[2]) || size <= 0) return { invalid: true };
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, size - Math.floor(suffix));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return { invalid: true };
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function safeUnlink(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (_) {}
}

function normalizeManagedDirectory(directory) {
  if (!path.isAbsolute(String(directory || ''))) return '';
  const resolved = path.resolve(directory);
  return path.basename(resolved).toLowerCase() === OFFLINE_DIRECTORY ? resolved : '';
}

function fileIsInsideManagedDirectory(filePath, directory, key = '') {
  const managedDirectory = normalizeManagedDirectory(directory);
  if (!managedDirectory || !path.isAbsolute(String(filePath || ''))) return false;
  const resolved = path.resolve(filePath);
  if (path.dirname(resolved) !== managedDirectory) return false;
  if (!key) return true;
  return new RegExp(`^${key}-[a-z0-9]+\\.(?:mp3|flac|wav|ogg|m4a|aac|opus|audio)$`, 'i').test(path.basename(resolved));
}

class OfflineMusicLibrary {
  constructor(options = {}) {
    this.userDataPath = path.resolve(options.userDataPath || process.cwd());
    this.indexPath = path.join(this.userDataPath, OFFLINE_LIBRARY_FILE);
    this.getCacheRoot = typeof options.getCacheRoot === 'function'
      ? options.getCacheRoot
      : () => path.join(this.userDataPath, 'cache');
    this.fetch = options.fetch || globalThis.fetch;
    this.maxAudioBytes = Math.max(1024, Number(options.maxAudioBytes) || MAX_AUDIO_BYTES);
    this.records = new Map();
    this.order = [];
    this.managedDirectories = new Set([this.cacheDirectory()]);
    this.jobs = new Map();
    this.protocolInstalled = false;
    this.mutation = Promise.resolve();
    this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    this.loadIndex();
    this.cleanupPartFiles().catch(() => {});
  }

  cacheDirectory() {
    return path.join(path.resolve(this.getCacheRoot()), OFFLINE_DIRECTORY);
  }

  loadIndex() {
    try {
      const stat = fs.statSync(this.indexPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_INDEX_BYTES) return;
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      if (!parsed || parsed.version !== OFFLINE_LIBRARY_VERSION || !Array.isArray(parsed.records)) return;
      const indexedDirectories = Array.isArray(parsed.managedDirectories) ? parsed.managedDirectories : [];
      for (const directory of indexedDirectories.slice(0, 32)) {
        const normalized = normalizeManagedDirectory(directory);
        if (normalized) this.managedDirectories.add(normalized);
      }
      for (const source of parsed.records.slice(0, MAX_RECORDS)) {
        const key = cleanText(source && source.key, '', 24).toLowerCase();
        const audioPath = path.resolve(String(source && source.audioPath || ''));
        const managed = [...this.managedDirectories].some((directory) => fileIsInsideManagedDirectory(audioPath, directory, key));
        if (!/^[a-f0-9]{24}$/.test(key) || !managed || this.records.has(key)) continue;
        const record = {
          key,
          audioPath,
          contentType: normalizeContentType(source.contentType) || 'application/octet-stream',
          bytes: Math.max(0, Number(source.bytes) || 0),
          quality: cleanText(source.quality, '', 64),
          savedAt: Math.max(0, Number(source.savedAt) || 0),
          lastPlayedAt: Math.max(0, Number(source.lastPlayedAt) || 0),
          song: sanitizeSongMetadata(source.song),
        };
        this.records.set(key, record);
        this.order.push(key);
      }
    } catch (_) {}
  }

  serializeRecord(record) {
    let available = false;
    try {
      const stat = fs.statSync(record.audioPath);
      available = stat.isFile() && stat.size > 0 && (!record.bytes || stat.size === record.bytes);
    } catch (_) {}
    return {
      key: record.key,
      offlineUrl: `${OFFLINE_MUSIC_SCHEME}://track/${record.key}`,
      contentType: record.contentType,
      bytes: record.bytes,
      quality: record.quality,
      savedAt: record.savedAt,
      lastPlayedAt: record.lastPlayedAt,
      available,
      song: { ...record.song },
    };
  }

  listSync() {
    const tracks = this.order.map((key) => this.records.get(key)).filter(Boolean).map((record) => this.serializeRecord(record));
    const jobs = [...this.jobs.values()].map((job) => ({
      key: job.key,
      receivedBytes: job.receivedBytes,
      totalBytes: job.totalBytes,
      startedAt: job.startedAt,
      song: { ...job.song },
    }));
    return {
      ok: true,
      version: OFFLINE_LIBRARY_VERSION,
      count: tracks.length,
      bytes: tracks.reduce((sum, item) => sum + (item.available ? item.bytes : 0), 0),
      tracks,
      jobs,
    };
  }

  resolve(rawKey) {
    const key = offlineTrackKey(rawKey);
    const record = key && this.records.get(key);
    if (!record) return { ok: true, hit: false, key };
    const item = this.serializeRecord(record);
    if (!item.available) return { ok: true, hit: false, broken: true, key };
    return { ok: true, hit: true, key, ...item };
  }

  async persistSnapshot(order = this.order, records = this.records) {
    await fs.promises.mkdir(this.userDataPath, { recursive: true });
    const payload = {
      version: OFFLINE_LIBRARY_VERSION,
      updatedAt: Date.now(),
      managedDirectories: [...this.managedDirectories],
      records: order.map((key) => records.get(key)).filter(Boolean),
    };
    const text = JSON.stringify(payload);
    if (Buffer.byteLength(text, 'utf8') > MAX_INDEX_BYTES) throw Object.assign(new Error('OFFLINE_INDEX_TOO_LARGE'), { code: 'OFFLINE_INDEX_TOO_LARGE' });
    const temporary = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, text, 'utf8');
      await fs.promises.rename(temporary, this.indexPath);
    } catch (error) {
      safeUnlink(temporary);
      throw error;
    }
  }

  emitProgress(job, status, error = '') {
    const now = Date.now();
    if (status === 'downloading' && now - (job.lastProgressAt || 0) < PROGRESS_INTERVAL_MS) return null;
    job.lastProgressAt = now;
    const payload = {
      key: job.key,
      status,
      receivedBytes: job.receivedBytes,
      totalBytes: job.totalBytes,
      startedAt: job.startedAt,
      error: cleanText(error, '', 500),
      song: { ...job.song },
    };
    try { this.onProgress(payload); } catch (_) {}
    return payload;
  }

  async fetchAudio(url, signal) {
    let current = new URL(String(url || ''));
    if (!/^https?:$/.test(current.protocol)) throw Object.assign(new Error('OFFLINE_SOURCE_URL_INVALID'), { code: 'OFFLINE_SOURCE_URL_INVALID' });
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const response = await this.fetch(current, { method: 'GET', redirect: 'manual', signal, headers: { Accept: 'audio/*,application/octet-stream;q=0.8' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) throw Object.assign(new Error('OFFLINE_REDIRECT_LIMIT'), { code: 'OFFLINE_REDIRECT_LIMIT' });
        current = new URL(location, current);
        if (!/^https?:$/.test(current.protocol)) throw Object.assign(new Error('OFFLINE_REDIRECT_INVALID'), { code: 'OFFLINE_REDIRECT_INVALID' });
        continue;
      }
      if (!response.ok || !response.body) throw Object.assign(new Error(`OFFLINE_HTTP_${response.status}`), { code: `OFFLINE_HTTP_${response.status}` });
      return { response, finalUrl: current.href };
    }
    throw Object.assign(new Error('OFFLINE_REDIRECT_LIMIT'), { code: 'OFFLINE_REDIRECT_LIMIT' });
  }

  async download(payload = {}) {
    if (typeof this.fetch !== 'function') return { ok: false, error: 'OFFLINE_FETCH_UNAVAILABLE' };
    const key = offlineTrackKey(payload.key);
    if (!key) return { ok: false, error: 'OFFLINE_TRACK_KEY_INVALID' };
    if (this.jobs.has(key)) return { ok: false, key, active: true, error: 'OFFLINE_DOWNLOAD_ACTIVE' };
    const song = sanitizeSongMetadata(payload.song);
    const controller = new AbortController();
    const job = { key, song, controller, receivedBytes: 0, totalBytes: 0, startedAt: Date.now(), partPath: '', lastProgressAt: 0 };
    this.jobs.set(key, job);
    this.emitProgress(job, 'starting');
    try {
      const { response, finalUrl } = await this.fetchAudio(payload.url, controller.signal);
      const contentType = normalizeContentType(response.headers.get('content-type'));
      if (!acceptedAudioContentType(contentType)) throw Object.assign(new Error('OFFLINE_CONTENT_TYPE_REJECTED'), { code: 'OFFLINE_CONTENT_TYPE_REJECTED' });
      const declaredBytes = Number(response.headers.get('content-length')) || 0;
      if (declaredBytes > this.maxAudioBytes) throw Object.assign(new Error('OFFLINE_AUDIO_TOO_LARGE'), { code: 'OFFLINE_AUDIO_TOO_LARGE' });
      job.totalBytes = declaredBytes;
      const directory = this.cacheDirectory();
      await fs.promises.mkdir(directory, { recursive: true });
      this.managedDirectories.add(directory);
      const extension = extensionForAudio(contentType, finalUrl);
      const finalPath = path.join(directory, `${key}-${Date.now().toString(36)}${extension}`);
      job.partPath = path.join(directory, `.${key}.${process.pid}.${Date.now()}.part`);
      const output = fs.createWriteStream(job.partPath, { flags: 'wx' });
      const stream = Readable.fromWeb(response.body);
      try {
        for await (const chunk of stream) {
          if (controller.signal.aborted) throw Object.assign(new Error('OFFLINE_DOWNLOAD_CANCELLED'), { code: 'OFFLINE_DOWNLOAD_CANCELLED' });
          const buffer = Buffer.from(chunk);
          job.receivedBytes += buffer.length;
          if (job.receivedBytes > this.maxAudioBytes) throw Object.assign(new Error('OFFLINE_AUDIO_TOO_LARGE'), { code: 'OFFLINE_AUDIO_TOO_LARGE' });
          if (!output.write(buffer)) await new Promise((resolve, reject) => { output.once('drain', resolve); output.once('error', reject); });
          this.emitProgress(job, 'downloading');
        }
        await new Promise((resolve, reject) => { output.end(resolve); output.once('error', reject); });
      } catch (error) {
        output.destroy();
        throw error;
      }
      if (!job.receivedBytes || (declaredBytes && declaredBytes !== job.receivedBytes)) throw Object.assign(new Error('OFFLINE_AUDIO_SIZE_MISMATCH'), { code: 'OFFLINE_AUDIO_SIZE_MISMATCH' });
      const operation = async () => {
        const previous = this.records.get(key);
        await fs.promises.rename(job.partPath, finalPath);
        job.partPath = '';
        const record = {
          key,
          audioPath: finalPath,
          contentType: contentType || 'application/octet-stream',
          bytes: job.receivedBytes,
          quality: cleanText(payload.quality, '', 64),
          savedAt: Date.now(),
          lastPlayedAt: previous && previous.lastPlayedAt || 0,
          song,
        };
        const records = new Map(this.records);
        const order = this.order.filter((item) => item !== key);
        records.set(key, record);
        order.unshift(key);
        try {
          await this.persistSnapshot(order, records);
        } catch (error) {
          safeUnlink(finalPath);
          throw error;
        }
        this.records = records;
        this.order = order;
        if (previous && previous.audioPath !== finalPath) safeUnlink(previous.audioPath);
        return this.serializeRecord(record);
      };
      const committed = this.mutation.then(operation, operation);
      this.mutation = committed.catch(() => {});
      const item = await committed;
      this.emitProgress(job, 'complete');
      return { ok: true, key, item };
    } catch (error) {
      safeUnlink(job.partPath);
      const code = error && (error.code || error.name === 'AbortError' && 'OFFLINE_DOWNLOAD_CANCELLED' || error.message) || 'OFFLINE_DOWNLOAD_FAILED';
      this.emitProgress(job, code === 'OFFLINE_DOWNLOAD_CANCELLED' ? 'cancelled' : 'failed', code);
      return { ok: false, key, cancelled: code === 'OFFLINE_DOWNLOAD_CANCELLED', error: code };
    } finally {
      this.jobs.delete(key);
    }
  }

  cancel(rawKey) {
    const key = offlineTrackKey(rawKey);
    const job = key && this.jobs.get(key);
    if (!job) return { ok: true, key, cancelled: false };
    job.controller.abort();
    return { ok: true, key, cancelled: true };
  }

  remove(rawKey) {
    const key = offlineTrackKey(rawKey);
    const operation = async () => {
      const record = key && this.records.get(key);
      if (!record) return this.listSync();
      const records = new Map(this.records);
      const order = this.order.filter((item) => item !== key);
      records.delete(key);
      await this.persistSnapshot(order, records);
      this.records = records;
      this.order = order;
      safeUnlink(record.audioPath);
      return this.listSync();
    };
    const pending = this.mutation.then(operation, operation);
    this.mutation = pending.catch(() => {});
    return pending;
  }

  async cleanupPartFiles() {
    const roots = new Set([this.cacheDirectory(), ...this.managedDirectories]);
    for (const directory of roots) {
      let entries = [];
      try { entries = await fs.promises.readdir(directory, { withFileTypes: true }); } catch (_) { continue; }
      await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.part')).map((entry) => fs.promises.unlink(path.join(directory, entry.name)).catch(() => {})));
    }
  }

  dispose() {
    for (const job of this.jobs.values()) job.controller.abort();
    for (const job of this.jobs.values()) safeUnlink(job.partPath);
    this.jobs.clear();
  }

  recordForRequest(requestUrl) {
    try {
      const url = new URL(requestUrl);
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, '')).toLowerCase();
      if (url.hostname !== 'track' || !/^[a-f0-9]{24}$/.test(key)) return null;
      const record = this.records.get(key);
      return record && [...this.managedDirectories].some((directory) => fileIsInsideManagedDirectory(record.audioPath, directory, key)) ? record : null;
    } catch (_) {
      return null;
    }
  }

  async mediaResponse(request) {
    const method = String(request && request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const record = this.recordForRequest(request && request.url);
    if (!record) return new Response('Not found', { status: 404 });
    let stat;
    try { stat = await fs.promises.stat(record.audioPath); } catch (_) { return new Response('Not found', { status: 404 }); }
    if (!stat.isFile() || !stat.size) return new Response('Not found', { status: 404 });
    const rangeHeader = request.headers && request.headers.get ? request.headers.get('range') : '';
    const range = rangeHeader ? parseByteRange(rangeHeader, stat.size) : null;
    if (range && range.invalid) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    const start = range ? range.start : 0;
    const end = range ? range.end : stat.size - 1;
    const headers = {
      'Content-Type': record.contentType || 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    };
    const origin = request.headers && request.headers.get ? String(request.headers.get('origin') || '') : '';
    if (/^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers.Vary = 'Origin';
    }
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    if (method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
    return new Response(Readable.toWeb(fs.createReadStream(record.audioPath, { start, end })), { status: range ? 206 : 200, headers });
  }

  async installProtocol(protocol) {
    if (this.protocolInstalled) return;
    await protocol.handle(OFFLINE_MUSIC_SCHEME, (request) => this.mediaResponse(request));
    this.protocolInstalled = true;
  }
}

module.exports = {
  OFFLINE_MUSIC_SCHEME,
  OfflineMusicLibrary,
  acceptedAudioContentType,
  offlineTrackKey,
  parseByteRange,
  registerOfflineMusicScheme,
  sanitizeSongMetadata,
};
