'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('desktop bridge owns offline downloads behind trusted IPC and a private protocol', () => {
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  const core = read('desktop/offline-music-library.js');

  assert.match(main, /registerOfflineMusicScheme\(protocol\)/);
  assert.match(main, /await offlineMusicLibrary\.installProtocol\(protocol\)/);
  assert.match(core, /mineradio-offline/);
  assert.match(core, /fileIsInsideManagedDirectory/);
  for (const channel of ['list', 'resolve', 'download', 'cancel', 'remove']) {
    const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(main, new RegExp(`ipcMain\\.handle\\('mineradio-offline-music-${escaped}'[\\s\\S]{0,180}isTrustedMainWindowIpc\\(event\\)`));
  }
  assert.match(preload, /listOfflineMusic:/);
  assert.match(preload, /resolveOfflineMusic:/);
  assert.match(preload, /downloadOfflineMusic:/);
  assert.match(preload, /cancelOfflineMusic:/);
  assert.match(preload, /removeOfflineMusic:/);
  assert.match(preload, /onOfflineMusicProgress:/);
});

test('renderer loads identity before offline playback and falls back to network resolution', () => {
  const loader = read('public/js/index-loader.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const offline = read('public/js/modules/05-playback/09a-offline-music.js');
  const identityIndex = loader.indexOf('05-playback/09-queue-snapshot-autoplay.js');
  const offlineIndex = loader.indexOf('05-playback/09a-offline-music.js');
  const playbackIndex = loader.indexOf('05-playback/13-playback-start-audio.js');

  assert.ok(identityIndex >= 0 && identityIndex < offlineIndex);
  assert.ok(offlineIndex < playbackIndex);
  assert.match(playback, /resolveOfflinePlaybackData\(song\)[\s\S]{0,180}resolveNetworkPlaybackData\(song, requestedQuality\)/);
  assert.match(offline, /resolveNetworkPlaybackData\(song, requestedQuality\)/);
  assert.match(offline, /clearOfflineMusicProgressAliases/);
  assert.doesNotMatch(offline, /download.*playlist|playlist.*download/i);
});

test('music library and cache settings expose one coherent offline workspace', () => {
  const workspace = read('public/js/modules/06-lyrics/05a-music-library-workspace.js');
  const details = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const cache = read('public/js/modules/07-fx/08-cache-storage-settings.js');
  const html = read('public/index.html');
  const main = read('desktop/main.js');
  const frontend = `${workspace}\n${details}\n${cache}\n${html}`;

  assert.match(workspace, /data-library-tab="offline"/);
  assert.match(workspace, /data-offline-play/);
  assert.match(workspace, /data-offline-remove/);
  assert.match(workspace, /musicLibraryWorkspaceState\.query\s*=\s*''/);
  assert.match(details, /id="detail-offline-action"/);
  assert.match(html, /id="cache-storage-offline-size"/);
  assert.match(cache, /usage\.offlineMusicBytes/);
  assert.match(main, /offlineMusicBytes/);
  assert.doesNotMatch(frontend, /\bLX\b|落雪|Mineradio-LX/i);
});

test('persisted metadata whitelist excludes credential-shaped and source URL fields', () => {
  const core = read('desktop/offline-music-library.js');
  const whitelistBody = /function sanitizeSongMetadata\(value\)\s*\{([\s\S]*?)\n\}/.exec(core);
  assert.ok(whitelistBody);
  assert.doesNotMatch(whitelistBody[1], /cookie|authorization|token|proxyUrl|audioUrl|signedUrl/i);
  assert.match(whitelistBody[1], /spotifyId/);
  assert.match(whitelistBody[1], /additionalSourceCode/);
});
