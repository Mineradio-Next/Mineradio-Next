#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const electronPath = path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const packagedExecutable = String(process.env.MINERADIO_ARTIST_ALBUM_QA_EXECUTABLE || '').trim();
const qaExecutable = packagedExecutable ? path.resolve(packagedExecutable) : electronPath;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = Number(server.address() && server.address().port);
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null) return Promise.resolve(child && child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`isolated artist album QA process ${child.pid} did not exit normally`)), timeoutMs);
    function finish(error, code) {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      if (error) reject(error);
      else resolve(code);
    }
    function onExit(code) { finish(null, code); }
    function onError(error) { finish(error); }
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function requestNormalChildExit(child) {
  const pid = Number(child && child.pid);
  if (!Number.isInteger(pid) || pid <= 0 || child.exitCode != null) return Promise.resolve(false);
  return new Promise(resolve => {
    const command = `$qaProcess = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($qaProcess) { [bool]$qaProcess.CloseMainWindow() } else { $true }`;
    const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    helper.stdout.on('data', chunk => { output += chunk.toString(); });
    helper.once('error', () => resolve(false));
    helper.once('exit', () => resolve(/true/i.test(output)));
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
    const rejectPending = message => {
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(message));
      }
      this.pending.clear();
    };
    socket.addEventListener('close', () => rejectPending('CDP WebSocket closed'));
    socket.addEventListener('error', () => rejectPending('CDP WebSocket failed'));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('CDP WebSocket open timed out')), 9000);
      function finish(error) {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      }
      socket.addEventListener('open', () => finish(), { once: true });
      socket.addEventListener('error', () => finish(new Error('CDP WebSocket failed to open')), { once: true });
    });
    return new CdpClient(socket);
  }

  call(method, params = {}, timeoutMs = 12000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, timeoutMs = 30000) {
    const response = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception && response.exceptionDetails.exception.description || response.exceptionDetails.text || 'renderer evaluation failed');
    }
    return response.result && response.result.value;
  }

  close() {
    try { this.socket.close(); } catch (_) {}
  }
}

async function waitForCdpTarget(port, child, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`isolated artist album QA exited before CDP was ready (${child.exitCode})`);
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const target = targets.find(item => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
      if (target && target.webSocketDebuggerUrl) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`isolated artist album QA CDP was not ready: ${lastError && lastError.message || 'timeout'}`);
}

async function waitForStableRenderer(client) {
  const initial = await client.evaluate(`(async () => {
    const deadline = performance.now() + 25000;
    while (performance.now() < deadline) {
      if (document.readyState === 'complete' && document.getElementById('track-detail-modal') && typeof openTrackDetailModal === 'function' && typeof apiJson === 'function') {
        return location.href;
      }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error('artist album renderer readiness timed out');
  })()`);
  await delay(1800);
  const stable = await client.evaluate(`document.readyState === 'complete' && location.href === ${JSON.stringify(initial)} && typeof openTrackDetailModal === 'function'`);
  assert.equal(stable, true, 'renderer navigated while artist album QA was starting');
}

async function checkArtistPage(client, width, height, song) {
  await client.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return client.evaluate(`(async () => {
    const song = ${JSON.stringify(song)};
    const endpoint = song.provider === 'qq'
      ? '/api/qq/artist/detail?mid=' + encodeURIComponent(song.artistMid) + '&limit=12'
      : '/api/artist/detail?id=' + encodeURIComponent(song.artistId) + '&limit=12';
    const probe = await apiJson(endpoint);
    openTrackDetailModal('artist', song);
    const deadline = performance.now() + 25000;
    while (performance.now() < deadline) {
      if (document.querySelectorAll('.artist-album-card').length && document.querySelectorAll('#artist-hot-songs .artist-song-item').length) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const modal = document.querySelector('.track-detail-modal');
    const body = document.getElementById('track-detail-body');
    const strip = document.querySelector('.artist-album-strip');
    const cards = Array.from(document.querySelectorAll('.artist-album-card'));
    if (!modal || !body || !strip || !cards.length) {
      return {
        viewport: [innerWidth, innerHeight],
        artist: song.artist,
        provider: song.provider,
        probeError: probe && probe.error || '',
        probeAlbumError: probe && probe.albumError || '',
        probeAlbums: probe && probe.albums && probe.albums.length || 0,
        cards: cards.length,
        albumHtml: document.getElementById('artist-albums') && document.getElementById('artist-albums').textContent || '',
      };
    }
    const modalRect = modal.getBoundingClientRect();
    const rects = cards.map(card => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    });
    const overlap = rects.some((first, index) => rects.slice(index + 1).some(second =>
      first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
    ));
    const bodyOverflowX = body.scrollWidth > body.clientWidth + 1;
    const stripWidth = strip.clientWidth;
    const stripScrollWidth = strip.scrollWidth;
    const stripScrollable = stripScrollWidth > stripWidth + 1;
    cards[0].click();
    while (performance.now() < deadline) {
      if (document.getElementById('track-detail-heading')?.textContent === '专辑详情' && document.querySelectorAll('#album-song-list .artist-song-item').length) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return {
      viewport: [innerWidth, innerHeight],
      artist: song.artist,
      provider: song.provider,
      probeAlbums: probe && probe.albums && probe.albums.length || 0,
      cards: cards.length,
      cardWidth: rects[0] && rects[0].width || 0,
      overlap,
      modalWithinViewport: modalRect.left >= 0 && modalRect.right <= innerWidth && modalRect.top >= 0 && modalRect.bottom <= innerHeight,
      bodyOverflowX,
      stripScrollable,
      stripWidth,
      stripScrollWidth,
      albumHeading: document.getElementById('track-detail-heading')?.textContent || '',
      albumSongs: document.querySelectorAll('#album-song-list .artist-song-item').length,
    };
  })()`, 40000);
}

function assertArtistPage(result) {
  assert(result.probeAlbums > 0, `${result.provider} artist endpoint returned no albums: ${JSON.stringify(result)}`);
  assert(result.cards > 0 && result.cards <= 8, `${result.provider} artist album card count is invalid: ${JSON.stringify(result)}`);
  assert(result.cardWidth >= 100, `${result.provider} artist album cards are too narrow: ${JSON.stringify(result)}`);
  assert.equal(result.overlap, false, `${result.provider} artist album cards overlap`);
  assert.equal(result.modalWithinViewport, true, `${result.provider} artist modal escaped the viewport`);
  assert.equal(result.bodyOverflowX, false, `${result.provider} artist modal has horizontal overflow`);
  assert.equal(result.stripScrollable, true, `${result.provider} artist album strip is not scrollable: ${JSON.stringify(result)}`);
  assert.equal(result.albumHeading, '专辑详情', `${result.provider} album did not open`);
  assert(result.albumSongs > 0, `${result.provider} album detail returned no songs`);
}

async function main() {
  assert(process.platform === 'win32', 'artist album live check requires Windows');
  assert(fs.existsSync(qaExecutable), `artist album QA executable not found: ${qaExecutable}`);
  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-artist-albums-qa-'));
  const userDataPath = path.join(qaRoot, 'user-data');
  const cacheRoot = path.join(qaRoot, 'cache');
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(userDataPath, 'cache-settings.json'), JSON.stringify({ version: 1, rootPath: cacheRoot }), 'utf8');
  const port = await reserveLoopbackPort();
  let output = '';
  let child;
  let client;
  let cleanExit = false;
  try {
    const launchArguments = [`--remote-debugging-port=${port}`];
    if (!packagedExecutable) launchArguments.push(appRoot);
    child = spawn(qaExecutable, launchArguments, {
      cwd: appRoot,
      windowsHide: true,
      env: {
        ...process.env,
        MINERADIO_RUNTIME_NAME: `MineradioArtistAlbumsQA-${process.pid}-${Date.now()}`,
        MINERADIO_APP_USER_MODEL_ID: `com.mineradio.artist.albums.qa.${process.pid}`,
        MINERADIO_NO_DESKTOP_SHORTCUT: '1',
        MINERADIO_CREATE_DESKTOP_SHORTCUT: '0',
        MINERADIO_STARTUP_QA_USER_DATA: userDataPath,
        MINERADIO_STARTUP_QA_HIDDEN: '1',
        MINERADIO_STARTUP_QA_EXIT_MS: '60000',
        MINERADIO_KEEP_BACKGROUND_RENDERING: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-16000); });
    child.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-16000); });
    const target = await waitForCdpTarget(port, child);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.call('Runtime.enable');
    await waitForStableRenderer(client);
    const netease = await checkArtistPage(client, 1440, 900, {
      provider: 'netease', source: 'netease', type: 'song', id: 186001,
      name: '晴天', artist: '周杰伦', artistId: 6452, album: '叶惠美', albumId: 439096,
    });
    const qq = await checkArtistPage(client, 1280, 720, {
      provider: 'qq', source: 'qq', type: 'qq', id: '0039MnYb0qxYhV', mid: '0039MnYb0qxYhV',
      name: '晴天', artist: '周杰伦', artistMid: '0025NhlN2yWrP4', album: '叶惠美', albumMid: '000MkMni19ClKG',
    });
    assertArtistPage(netease);
    assertArtistPage(qq);
    console.log(JSON.stringify({ netease, qq }, null, 2));
    await client.evaluate(`desktopWindow.close('exit').catch(() => undefined)`);
    client.close();
    client = null;
    const exitCode = await waitForChildExit(child, 20000);
    cleanExit = true;
    assert.equal(exitCode, 0, `isolated artist album QA exited with ${exitCode}`);
  } catch (error) {
    if (client) client.close();
    if (child && child.exitCode == null) {
      await requestNormalChildExit(child);
      try {
        await waitForChildExit(child, 25000);
        cleanExit = true;
      } catch (_) {}
    } else if (child) {
      cleanExit = true;
    }
    if (output) error.message += `\n--- isolated Electron output ---\n${output}`;
    throw error;
  } finally {
    if (cleanExit || !child) fs.rmSync(qaRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
