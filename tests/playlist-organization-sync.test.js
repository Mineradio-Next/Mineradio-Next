'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const {
  LocalPlaylistCatalog,
  normalizedPlaylist,
} = require('../desktop/local-playlist-catalog');
const { LocalMusicLibrary } = require('../desktop/local-music-library');
const { playlistFingerprint } = require('../platform-playlist-link-import');

function rendererContext() {
  const values = new Map();
  const context = vm.createContext({
    console,
    Promise,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Object,
    Array,
    Math,
    String,
    Number,
    RegExp,
    Map,
    Set,
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
    window: {},
    showToast() {},
    rebuildUserPlaylistsFromCatalog() {},
    refreshMusicLibraryWorkspace() {},
  });
  const source = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/04-local-playlist-files.js'), 'utf8');
  vm.runInContext(source, context, { filename: '04-local-playlist-files.js' });
  return context;
}

function organizerContext() {
  const context = rendererContext();
  context.__selectedPlaylist = null;
  context.musicLibrarySelectedPlaylist = () => context.__selectedPlaylist;
  context.musicLibraryTrackId = (value) => String(value && (value.localFileId || value.id) || '');
  context.hydrateCustomCover = (value) => value;
  const source = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/05b-playlist-organization.js'), 'utf8');
  vm.runInContext(source, context, { filename: '05b-playlist-organization.js' });
  return context;
}

function song(id, extra = {}) {
  return {
    id,
    songmid: id,
    name: `Song ${id}`,
    singer: 'Artist',
    source: 'netease',
    provider: 'netease',
    ...extra,
  };
}

test('durable playlist catalog preserves organization and sync metadata', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-organizer-catalog-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const customCover = 'data:image/webp;base64,AAAA';
  const catalog = new LocalPlaylistCatalog({ userDataPath: directory });
  const saved = await catalog.save([{
    id: 'link_netease_12345',
    name: 'Remote list',
    importedProvider: 'netease',
    sourceInput: 'https://music.163.com/playlist?id=12345',
    fingerprint: 'abc123',
    syncedAt: 123456,
    customCover,
    songs: [song('1', { userAdded: true })],
  }]);
  const playlist = saved.playlists[0];
  assert.equal(playlist.importedProvider, 'netease');
  assert.equal(playlist.sourceInput, 'https://music.163.com/playlist?id=12345');
  assert.equal(playlist.fingerprint, 'abc123');
  assert.equal(playlist.syncedAt, 123456);
  assert.equal(playlist.customCover, customCover);
  assert.equal(playlist.songs[0].userAdded, true);
  assert.deepEqual(new LocalPlaylistCatalog({ userDataPath: directory }).listSync().playlists, saved.playlists);
});

test('catalog rejects non-image custom cover payloads', () => {
  const playlist = normalizedPlaylist({
    id: 'playlist',
    name: 'Playlist',
    customCover: 'javascript:alert(1)',
    songs: [song('1')],
  }, 20);
  assert.equal(playlist.customCover, undefined);
});

test('playlist fingerprint changes when same-sized remote content or order changes', () => {
  const original = { id: 'link_netease_12345', songs: [song('1'), song('2')] };
  const replacement = { id: 'link_netease_12345', songs: [song('1'), song('3')] };
  const reordered = { id: 'link_netease_12345', songs: [song('2'), song('1')] };
  assert.notEqual(playlistFingerprint(original), playlistFingerprint(replacement));
  assert.notEqual(playlistFingerprint(original), playlistFingerprint(reordered));
  assert.equal(playlistFingerprint(original), playlistFingerprint({ ...original, songs: [song('1'), song('2')] }));
});

test('platform refresh replaces remote rows and conservatively keeps local additions', () => {
  const context = rendererContext();
  const existing = {
    id: 'link_netease_12345',
    name: 'My renamed list',
    importedProvider: 'netease',
    sourceInput: '12345',
    customCover: 'data:image/webp;base64,AAAA',
    songs: [song('1'), song('2'), song('3', { userAdded: true })],
  };
  const incoming = {
    id: 'link_netease_12345',
    name: 'Remote renamed list',
    importedProvider: 'netease',
    sourceInput: '12345',
    fingerprint: 'new-fingerprint',
    songs: [song('1'), song('4'), song('4')],
  };
  const merged = context.mergeSynchronizedLocalPlaylist(existing, incoming, 999);
  assert.equal(merged.name, 'My renamed list');
  assert.equal(merged.customCover, existing.customCover);
  assert.deepEqual(Array.from(merged.songs, (item) => item.id), ['1', '4', '2', '3']);
  assert.equal(merged.songs[2].userAdded, true, 'legacy remote-missing song is preserved safely');
  assert.equal(merged.songs[3].userAdded, true);
  assert.equal(merged.syncedAt, 999);
  assert.equal(merged.trackCount, 4);
});

test('later platform refresh drops removed remote rows but retains explicit additions', () => {
  const context = rendererContext();
  const existing = {
    id: 'link_netease_12345',
    name: 'Synced list',
    importedProvider: 'netease',
    sourceInput: '12345',
    fingerprint: 'previous-fingerprint',
    syncedAt: 800,
    songs: [song('1'), song('2'), song('3', { userAdded: true })],
  };
  const incoming = {
    id: 'link_netease_12345',
    importedProvider: 'netease',
    sourceInput: '12345',
    fingerprint: 'next-fingerprint',
    songs: [song('1'), song('4')],
  };
  const merged = context.mergeSynchronizedLocalPlaylist(existing, incoming, 999);
  assert.deepEqual(Array.from(merged.songs, (item) => item.id), ['1', '4', '3']);
  assert.equal(merged.songs[2].userAdded, true);
});

test('playlist mutation lock rejects overlapping optimistic order writes', async () => {
  const context = organizerContext();
  const playlist = { id: 'local-list', songs: [song('1'), song('2'), song('3')] };
  let releaseSave;
  context.__selectedPlaylist = playlist;
  context.saveLocalFilePlaylistsAndWait = () => new Promise((resolve) => { releaseSave = resolve; });
  assert.equal(context.moveMusicLibraryPlaylistSong(0, 1), true);
  assert.deepEqual(Array.from(playlist.songs, (item) => item.id), ['2', '1', '3']);
  assert.equal(context.moveMusicLibraryPlaylistSong(1, 1), false);
  assert.deepEqual(Array.from(playlist.songs, (item) => item.id), ['2', '1', '3']);
  await new Promise((resolve) => setImmediate(resolve));
  releaseSave(true);
  await context.musicLibraryOrganizerState.orderWrite;
  assert.equal(context.musicLibraryOrganizerState.mutationId, '');
});

test('organizer write blocks every regular playlist mutation until persistence finishes', async () => {
  const context = organizerContext();
  const playlist = { id: 'local-list', name: 'List', songs: [song('1'), song('2')] };
  let releaseSave;
  context.localFilePlaylists = [playlist];
  context.__selectedPlaylist = playlist;
  context.saveLocalFilePlaylistsAndWait = () => new Promise((resolve) => { releaseSave = resolve; });
  assert.equal(context.moveMusicLibraryPlaylistSong(0, 1), true);
  assert.equal(context.addSongToLocalFilePlaylist('local-list', song('3')).error, 'LOCAL_PLAYLIST_BUSY');
  assert.equal(context.renameLocalFilePlaylist('local-list', 'Changed'), false);
  assert.equal(context.removeSongFromLocalFilePlaylist('local-list', 0), false);
  assert.deepEqual(Array.from(playlist.songs, (item) => item.id), ['2', '1']);
  await new Promise((resolve) => setImmediate(resolve));
  releaseSave(true);
  await context.musicLibraryOrganizerState.orderWrite;
  assert.equal(context.addSongToLocalFilePlaylist('local-list', song('3')).ok, true);
});

test('health state rejects failed IPC results and uses stable target identities', () => {
  const context = organizerContext();
  assert.throws(() => context.musicLibraryHealthSnapshot({ ok: false, error: 'READ_FAILED' }, { ok: true, missing: [] }), /READ_FAILED/);
  assert.throws(() => context.musicLibraryHealthSnapshot({ ok: true, tracks: [] }, { ok: false, error: 'AUDIT_FAILED' }), /AUDIT_FAILED/);
  const groupA = [[{ id: 'local:b' }, { id: 'local:a' }]];
  const groupB = [[{ id: 'local:a' }, { id: 'local:b' }]];
  assert.equal(context.musicLibraryHealthTargetKey(groupA, 'duplicate', 0), 'a|b');
  assert.equal(context.musicLibraryHealthTargetKey(groupA, 'duplicate', 0), context.musicLibraryHealthTargetKey(groupB, 'duplicate', 0));
});

test('duplicate cleanup remaps playlist references to the retained local track', () => {
  const context = organizerContext();
  context.localFilePlaylists = [{
    id: 'local-list',
    songs: [{ id: 'local:remove-me', localFileId: 'remove-me', name: 'Copy', source: 'local', userAdded: true }],
  }];
  const replacement = { id: 'local:keep-me', localFileId: 'keep-me', name: 'Original', source: 'local' };
  assert.equal(context.remapMusicLibraryPlaylistTrackReferences(['remove-me'], replacement), 1);
  assert.equal(context.localFilePlaylists[0].songs[0].localFileId, 'keep-me');
  assert.equal(context.localFilePlaylists[0].songs[0].userAdded, true);
});

test('health cleanup cannot begin during another playlist mutation', async () => {
  const context = organizerContext();
  const playlist = { id: 'local-list', songs: [song('1'), song('2')] };
  let releaseSave;
  let removed = false;
  context.localFilePlaylists = [playlist];
  context.__selectedPlaylist = playlist;
  context.window.desktopWindow = { removeLocalMusicTracks: async () => { removed = true; return { ok: true, tracks: [] }; } };
  context.saveLocalFilePlaylistsAndWait = () => new Promise((resolve) => { releaseSave = resolve; });
  assert.equal(context.moveMusicLibraryPlaylistSong(0, 1), true);
  await context.removeMusicLibraryHealthIds(['missing'], 'cleanup');
  assert.equal(removed, false);
  await new Promise((resolve) => setImmediate(resolve));
  releaseSave(true);
  await context.musicLibraryOrganizerState.orderWrite;
});

test('library audit reports a moved file without deleting it', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-library-audit-'));
  const audioPath = path.join(directory, 'Track.mp3');
  fs.writeFileSync(audioPath, Buffer.from('fake-audio'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const library = new LocalMusicLibrary({
    userDataPath: directory,
    parseMetadata: async () => ({ common: { title: 'Track', artist: 'Artist' }, format: { duration: 180 } }),
  });
  const imported = await library.importFiles([{ path: audioPath }]);
  assert.equal(imported.ok, true);
  assert.equal((await library.auditTracks()).missingCount, 0);
  fs.unlinkSync(audioPath);
  const audit = await library.auditTracks();
  assert.equal(audit.missingCount, 1);
  assert.equal(audit.missing[0].name, 'Track');
  assert.equal(library.listTracksSync().count, 1, 'audit must not mutate the index');
});

test('playlist organizer is isolated in the music library and avoids derivative naming', () => {
  const organizer = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/05b-playlist-organization.js'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/05a-music-library-workspace.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/css/music-library.css'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
  const coverCrop = fs.readFileSync(path.join(root, 'public/js/modules/03-beat/05-cover-loading-crop.js'), 'utf8');
  assert.match(workspace, /data-library-tab="health"/);
  assert.match(loader, /05b-playlist-organization\.js/);
  assert.match(organizer, /data-library-organizer="sync"/);
  assert.match(organizer, /data-library-drag-handle/);
  assert.match(organizer, /health-missing:' \+ missingKey/);
  assert.match(workspace, /曲库健康/);
  assert.match(css, /\.music-library-health-summary/);
  assert.match(css, /\.music-library-playlist-hero-cover/);
  assert.match(css, /\.music-library-order-handle \{ display: none \}/);
  assert.doesNotMatch(css, /\.music-library-order-actions \{ display: none \}/);
  assert.match(preload, /auditLocalMusicLibrary/);
  assert.match(main, /mineradio-local-library-audit/);
  assert.match(coverCrop, /typeof opts\.commit === 'function'/);
  assert.doesNotMatch(organizer, /\bLX\b|落雪|衍生项目/i);
});
