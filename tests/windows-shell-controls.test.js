'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'public/js/modules/10-shell/04b-windows-shell-controls.js');
const { launchItemMatches, normalizeTrayPlaybackState, normalizeWindowsStartupStatus } = require('../desktop/windows-shell-state');

function makeClassList() {
  const values = new Set();
  return {
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name); },
    add(name) { values.add(name); },
    remove(name) { values.delete(name); },
    contains(name) { return values.has(name); },
  };
}

function makeContext(options = {}) {
  const calls = [];
  const control = {
    classList: makeClassList(),
    dataset: {},
    attributes: {},
    title: '',
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] || null; },
  };
  const api = {
    isDesktop: true,
    updateTrayPlayback(payload) { calls.push(['tray-state', { ...payload }]); return Promise.resolve({ ok: true }); },
    onTrayCommand(callback) { calls.push(['tray-listener']); api.trayCommand = callback; return () => {}; },
    getStartupStatus() { return Promise.resolve(options.startupStatus || { ok: true, supported: true, enabled: false }); },
    setStartupEnabled(enabled) { calls.push(['startup', enabled]); return Promise.resolve({ ok: true, supported: true, enabled }); },
  };
  const context = vm.createContext({
    console,
    Promise,
    JSON,
    Math,
    Number,
    String,
    window: { desktopWindow: api },
    document: { getElementById(id) { return id === 't-systemStartup' ? control : null; } },
    audio: { src: 'https://audio.test/song.mp3', paused: false, ended: false },
    targetVolume: 0.64,
    systemMediaSessionMetadataPayload() { return { title: '测试歌曲', artist: '测试歌手' }; },
    togglePlay() { calls.push(['toggle']); },
    prevTrack(userInitiated) { calls.push(['previous', userInitiated]); },
    nextTrack(userInitiated) { calls.push(['next', userInitiated]); },
    setVolume(value, silent) { calls.push(['volume', value, silent]); context.targetVolume = Math.max(0, Math.min(1, value)); },
    toggleMute() { calls.push(['mute']); },
    showToast(message) { calls.push(['toast', message]); },
  });
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return { context, calls, control, api };
}

async function flushPromises() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test('publishes one sanitized tray snapshot for unchanged playback state', async () => {
  const { context, calls } = makeContext();
  assert.equal(context.syncWindowsTrayPlayback(), true);
  await flushPromises();
  assert.deepEqual(calls.find((entry) => entry[0] === 'tray-state'), ['tray-state', {
    hasMedia: true,
    title: '测试歌曲',
    artist: '测试歌手',
    playing: true,
    volume: 64,
  }]);
  assert.equal(context.syncWindowsTrayPlayback(), false);
  assert.equal(calls.filter((entry) => entry[0] === 'tray-state').length, 1);
});

test('normalizes native tray state and limits untrusted renderer text', () => {
  assert.deepEqual(normalizeTrayPlaybackState({
    hasMedia: true,
    title: `  ${'歌'.repeat(140)}  `,
    artist: '  歌手\n 名称 ',
    playing: true,
    volume: 140,
  }), {
    hasMedia: true,
    title: '歌'.repeat(120),
    artist: '歌手 名称',
    playing: true,
    volume: 100,
  });
  assert.equal(normalizeTrayPlaybackState({ hasMedia: false, playing: true }).playing, false);
});

test('requires both a registered and Windows-enabled startup item', () => {
  const expected = { path: 'C:\\Apps\\Mineradio.exe', args: ['C:\\Apps\\Mineradio'] };
  assert.equal(launchItemMatches({ path: 'c:/apps/Mineradio.exe', args: ['"C:\\Apps\\Mineradio"'] }, expected), true);
  assert.deepEqual(normalizeWindowsStartupStatus({
    openAtLogin: true,
    executableWillLaunchAtLogin: true,
    launchItems: [{ path: 'C:\\Apps\\Mineradio.exe', args: ['C:\\Apps\\Mineradio'], enabled: true }],
  }, expected), {
    ok: true,
    supported: true,
    enabled: true,
    registered: true,
    systemDisabled: false,
  });
  assert.deepEqual(normalizeWindowsStartupStatus({
    openAtLogin: true,
    executableWillLaunchAtLogin: true,
    launchItems: [
      { path: 'C:\\Apps\\Mineradio.exe', args: ['C:\\Apps\\Other'], enabled: true },
      { path: 'C:\\Apps\\Mineradio.exe', args: ['C:\\Apps\\Mineradio'], enabled: false },
    ],
  }, expected), {
    ok: true,
    supported: true,
    enabled: false,
    registered: true,
    systemDisabled: true,
  });
});

test('routes tray commands through the existing player functions', () => {
  const { context, calls } = makeContext();
  context.runWindowsTrayCommand({ command: 'toggle-play' });
  context.runWindowsTrayCommand({ command: 'previous' });
  context.runWindowsTrayCommand({ command: 'next' });
  context.runWindowsTrayCommand({ command: 'volume', value: 10 });
  context.runWindowsTrayCommand({ command: 'mute' });
  assert.ok(calls.some((entry) => entry[0] === 'toggle'));
  assert.ok(calls.some((entry) => entry[0] === 'previous' && entry[1] === true));
  assert.ok(calls.some((entry) => entry[0] === 'next' && entry[1] === true));
  assert.ok(calls.some((entry) => entry[0] === 'volume' && Math.abs(entry[1] - 0.74) < 0.001));
  assert.ok(calls.some((entry) => entry[0] === 'mute'));
});

test('reflects verified Windows startup state and toggles the requested value', async () => {
  const { context, calls, control } = makeContext({ startupStatus: { ok: true, supported: true, enabled: true } });
  assert.equal(await context.refreshSystemStartupStatus(), true);
  assert.equal(control.dataset.startupEnabled, '1');
  assert.equal(control.classList.contains('on'), true);
  context.toggleSystemStartup();
  await flushPromises();
  assert.ok(calls.some((entry) => entry[0] === 'startup' && entry[1] === false));
  assert.equal(control.dataset.startupEnabled, '0');
  assert.equal(control.classList.contains('on'), false);
  assert.ok(calls.some((entry) => entry[0] === 'toast' && entry[1] === '开机自动启动已关闭'));
});

test('shows unsupported startup state without sending a write request', async () => {
  const { context, calls, control } = makeContext({ startupStatus: { ok: false, supported: false, enabled: false } });
  assert.equal(await context.refreshSystemStartupStatus(), false);
  assert.equal(control.getAttribute('aria-disabled'), 'true');
  context.toggleSystemStartup();
  assert.equal(calls.some((entry) => entry[0] === 'startup'), false);
  assert.ok(calls.some((entry) => entry[0] === 'toast' && /不支持/.test(entry[1])));
});

test('keeps a failed startup query visibly unavailable', async () => {
  const { context, calls, control } = makeContext({ startupStatus: { ok: false, supported: true, enabled: false, error: 'QUERY_FAILED' } });
  assert.equal(await context.refreshSystemStartupStatus(), false);
  assert.equal(control.getAttribute('aria-disabled'), 'true');
  assert.equal(control.dataset.startupStatus, 'error');
  assert.match(control.title, /无法确认/);
  context.toggleSystemStartup();
  assert.equal(calls.some((entry) => entry[0] === 'startup'), false);
  assert.ok(calls.some((entry) => entry[0] === 'toast' && /无法确认/.test(entry[1])));
});

test('main process and preload expose trusted tray and verified login-item IPC', () => {
  const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');
  assert.match(main, /ipcMain\.handle\('mineradio-tray-update-playback', \(event, state\)[\s\S]{0,180}isTrustedMainWindowIpc\(event\)/);
  assert.match(main, /const options = startupLaunchOptions\(\)[\s\S]{0,100}app\.getLoginItemSettings\(options\)/);
  assert.match(main, /app\.setLoginItemSettings\(\{ \.\.\.startupLaunchOptions\(\), openAtLogin: desired \}\)/);
  assert.match(preload, /updateTrayPlayback:/);
  assert.match(preload, /onTrayCommand:/);
  assert.match(preload, /getStartupStatus:/);
  assert.match(preload, /setStartupEnabled:/);
  assert.ok(loader.indexOf('04a-system-media-session.js') < loader.indexOf('04b-windows-shell-controls.js'));
  assert.ok(loader.indexOf('04b-windows-shell-controls.js') < loader.indexOf('05-startup-bindings.js'));
  assert.doesNotMatch(fs.readFileSync(modulePath, 'utf8'), /LX\s*Music|Mineradio-LX|落雪/);
});
