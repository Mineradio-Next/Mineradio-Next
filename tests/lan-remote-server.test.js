const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');

const {
  createLanRemoteServer,
  listLanAddresses,
  normalizeCommand,
  sanitizeRemoteState,
} = require('../desktop/lan-remote-server');

const staticDir = path.join(__dirname, '..', 'public', 'remote');

function tokenFromStatus(status) {
  return new URL(status.primaryUrl).hash.replace(/^#token=/, '');
}

function apiUrl(status, pathname) {
  return `http://127.0.0.1:${status.port}${pathname}`;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

test('remote state keeps only playback-safe fields', () => {
  const state = sanitizeRemoteState({
    playing: true,
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    volume: 5,
    currentTime: 40,
    duration: 100,
    queueLength: 4,
    upcoming: [{ title: 'Next', artist: 'Singer', url: 'https://secret.test/audio' }],
    cookie: 'MUSIC_U=secret',
    audioUrl: 'https://secret.test/audio',
    localPath: 'D:\\Music\\secret.flac',
  }, 1234);

  assert.deepEqual(Object.keys(state).sort(), [
    'album', 'artist', 'artworkRevision', 'currentTime', 'duration', 'playing', 'progress',
    'queueLength', 'title', 'upcoming', 'updatedAt', 'volume',
  ].sort());
  assert.equal(state.volume, 1);
  assert.equal(state.progress, 0.4);
  assert.deepEqual(state.upcoming, [{ title: 'Next', artist: 'Singer' }]);
  assert.doesNotMatch(JSON.stringify(state), /secret\.test|MUSIC_U|D:\\\\Music/);
});

test('remote command parser accepts only the playback whitelist', () => {
  assert.deepEqual(normalizeCommand({ type: 'play' }), { type: 'play' });
  assert.deepEqual(normalizeCommand({ type: 'volume', value: 0.4278 }), { type: 'volume', value: 0.428 });
  assert.equal(normalizeCommand({ type: 'seek', value: 10 }), null);
  assert.equal(normalizeCommand({ type: 'volume', value: 1.1 }), null);
  assert.equal(normalizeCommand({ type: 'volume', value: -0.1 }), null);
  assert.equal(normalizeCommand({ type: 'login', cookie: 'secret' }), null);
});

test('LAN address discovery excludes loopback and link-local interfaces', () => {
  const addresses = listLanAddresses({
    Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    WiFi: [
      { address: '169.254.2.3', family: 'IPv4', internal: false },
      { address: '192.168.1.25', family: 'IPv4', internal: false },
    ],
    Ethernet: [{ address: '10.0.0.8', family: 4, internal: false }],
    'vEthernet (Default Switch)': [{ address: '172.28.128.1', family: 'IPv4', internal: false }],
  });
  assert.deepEqual(addresses, ['10.0.0.8', '192.168.1.25', '172.28.128.1']);
});

test('remote server requires token and forwards only valid commands', async (t) => {
  const commands = [];
  const remote = createLanRemoteServer({
    staticDir,
    getAddresses: () => ['192.168.50.8'],
    onCommand: (command) => commands.push(command),
  });
  t.after(() => remote.stop());

  remote.updateState({
    playing: true,
    title: 'Mineradio Track',
    artist: 'Singer',
    coverSource: 'https://images.example.test/cover.jpg',
    audioUrl: 'https://audio.example.test/song.mp3',
    cookie: 'secret',
  });
  const status = await remote.start();
  const token = tokenFromStatus(status);
  assert.equal(status.enabled, true);
  assert.match(status.qrDataUrl, /^data:image\/png;base64,/);
  assert.equal(token.length, 64);

  const page = await fetch(apiUrl(status, '/'));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);

  const anonymous = await fetch(apiUrl(status, '/api/state'));
  assert.equal(anonymous.status, 401);

  const stateResponse = await fetch(apiUrl(status, '/api/state'), { headers: auth(token) });
  assert.equal(stateResponse.status, 200);
  const stateBody = await stateResponse.json();
  assert.equal(stateBody.state.title, 'Mineradio Track');
  assert.doesNotMatch(JSON.stringify(stateBody), /images\.example|audio\.example|cookie|secret/i);

  const invalidCommand = await fetch(apiUrl(status, '/api/command'), {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'seek', value: 30 }),
  });
  assert.equal(invalidCommand.status, 400);

  const validCommand = await fetch(apiUrl(status, '/api/command'), {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'volume', value: 0.62 }),
  });
  assert.equal(validCommand.status, 202);
  assert.deepEqual(commands, [{ type: 'volume', value: 0.62 }]);

  const oversized = await fetch(apiUrl(status, '/api/command'), {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'play', padding: 'x'.repeat(5000) }),
  });
  assert.equal(oversized.status, 413);
});

test('stopping and reopening rotates the session token', async (t) => {
  const remote = createLanRemoteServer({ staticDir, getAddresses: () => ['192.168.20.2'] });
  t.after(() => remote.stop());
  const first = await remote.start();
  const firstToken = tokenFromStatus(first);
  await remote.stop();
  const second = await remote.start();
  const secondToken = tokenFromStatus(second);
  assert.notEqual(secondToken, firstToken);

  const stale = await fetch(apiUrl(second, '/api/state'), { headers: auth(firstToken) });
  assert.equal(stale.status, 401);
  const current = await fetch(apiUrl(second, '/api/state'), { headers: auth(secondToken) });
  assert.equal(current.status, 200);
});

test('expired sessions reject state and commands', async (t) => {
  let clock = 1000;
  const remote = createLanRemoteServer({
    staticDir,
    getAddresses: () => ['192.168.30.2'],
    now: () => clock,
    sessionMs: 60_000,
  });
  t.after(() => remote.stop());
  const status = await remote.start();
  const token = tokenFromStatus(status);
  clock += 60_001;

  const response = await fetch(apiUrl(status, '/api/state'), { headers: auth(token) });
  assert.equal(response.status, 401);
  assert.equal(remote.status().enabled, false);
});

test('desktop and mobile surfaces keep hidden states exclusive and derivative branding absent', () => {
  const desktopCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'index.css'), 'utf8');
  const mobileCss = fs.readFileSync(path.join(staticDir, 'remote.css'), 'utf8');
  const mobileHtml = fs.readFileSync(path.join(staticDir, 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '07-fx', '06a-lan-remote.js'), 'utf8');
  assert.match(desktopCss, /\.lan-remote-idle\[hidden\][\s\S]*display:\s*none\s*!important/);
  assert.match(mobileCss, /counter-reset:\s*up-next/);
  assert.match(renderer, /togglePlay\(\)|nextTrack\(true\)|prevTrack\(true\)|setVolume\(command\.value, true\)/);
  assert.doesNotMatch(`${mobileHtml}\n${renderer}`, /LX[\s_-]*Music|Mineradio-LX/i);
});
