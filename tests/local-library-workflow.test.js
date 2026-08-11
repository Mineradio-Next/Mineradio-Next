const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  LocalPlaylistCatalog,
  normalizeCatalog,
} = require('../desktop/local-playlist-catalog');

function track(id, overrides = {}) {
  return {
    id,
    name: `Song ${id}`,
    singer: 'Artist',
    source: 'netease',
    provider: 'netease',
    ...overrides,
  };
}

test('local playlist catalog deduplicates songs and survives a disk reload', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-playlist-catalog-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const catalog = new LocalPlaylistCatalog({ userDataPath: root });
  const saved = await catalog.save([{
    id: 'playlist-one',
    name: 'My Playlist',
    creator: 'Mineradio',
    songs: [track('1'), track('1'), track('2', { importedMeta: { albumId: 'album-2', nested: { rejected: true } } })],
  }]);

  assert.equal(saved.ok, true);
  assert.equal(saved.count, 1);
  assert.equal(saved.playlists[0].songs.length, 2);
  assert.deepEqual(saved.playlists[0].songs[1].importedMeta, { albumId: 'album-2' });
  assert.deepEqual(new LocalPlaylistCatalog({ userDataPath: root }).listSync(), saved);
});

test('serialized catalog writes keep the final complete snapshot', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-playlist-serialized-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const catalog = new LocalPlaylistCatalog({ userDataPath: root });
  const first = catalog.save([{ id: 'first', name: 'First', songs: [track('1')] }]);
  const second = catalog.save([{ id: 'second', name: 'Second', songs: [track('2')] }]);
  await Promise.all([first, second]);
  const restored = new LocalPlaylistCatalog({ userDataPath: root }).listSync();
  assert.equal(restored.count, 1);
  assert.equal(restored.playlists[0].name, 'Second');
});

test('catalog normalizer preserves local playback identity and rejects unusable rows', () => {
  const playlists = normalizeCatalog([{
    id: 'local-list',
    name: 'Local List',
    songs: [
      track('local:abc', {
        source: 'local',
        provider: 'local',
        localFileId: 'abc',
        localUrl: 'mineradio-local://audio/abc',
        localPath: 'Album/Song.flac',
      }),
      { id: '', name: '', source: 'local' },
    ],
  }]);
  assert.equal(playlists.length, 1);
  assert.equal(playlists[0].songs.length, 1);
  assert.equal(playlists[0].songs[0].localFileId, 'abc');
  assert.equal(playlists[0].songs[0].localPath, 'Album/Song.flac');
});

test('native playlist payload uses Mineradio format while old compressed payloads remain readable', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '06-lyrics', '04-local-playlist-files.js'), 'utf8');
  const values = new Map();
  const context = vm.createContext({
    console,
    Date,
    Math,
    Promise,
    JSON,
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    },
    window: {},
    showToast() {},
  });
  vm.runInContext(source, context);
  const normalized = context.normalizeLocalPlaylistPayload({
    type: 'mineradio_playlist_v1',
    data: { id: 'native', name: 'Native', list: [track('1')] },
  });
  const payload = context.localPlaylistExportPayload(normalized);

  assert.equal(normalized.songs.length, 1);
  assert.equal(payload.type, 'mineradio_playlist_v1');
  assert.match(source, /payload\.type !== 'playListPart_v2'/);
  assert.match(source, /input\.accept = '\.mrpl,\.lxmc/);
  assert.match(source, /\.mrpl'/);
});

test('durable playlist catalog wins over stale browser storage and migrates only when disk is empty', async () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '06-lyrics', '04-local-playlist-files.js'), 'utf8');

  async function boot(browserPlaylists, diskPlaylists) {
    const values = new Map([["mineradio-local-playlist-files-v1", JSON.stringify(browserPlaylists)]]);
    const saves = [];
    const context = vm.createContext({
      console,
      Date,
      Math,
      Promise,
      JSON,
      localStorage: {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
      },
      window: {
        desktopWindow: {
          listLocalPlaylists: async () => ({ ok: true, playlists: diskPlaylists }),
          saveLocalPlaylists: async (playlists) => { saves.push(playlists); return { ok: true, playlists }; },
        },
      },
      showToast() {},
    });
    vm.runInContext(source, context);
    await context.localPlaylistCatalogReady;
    return { context, saves };
  }

  const stale = [{ id: 'same', name: 'Stale', songs: [track('old')] }];
  const durable = [{ id: 'same', name: 'Durable', songs: [track('new')] }];
  const preferred = await boot(stale, durable);
  assert.equal(preferred.context.localFilePlaylists[0].name, 'Durable');
  assert.equal(preferred.saves.length, 0);

  const migrated = await boot(stale, []);
  assert.equal(migrated.context.localFilePlaylists[0].name, 'Stale');
  assert.equal(migrated.saves.length, 1);
});

test('independent music library workspace owns management without derivative naming', () => {
  const root = path.join(__dirname, '..');
  const workspace = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '06-lyrics', '05a-music-library-workspace.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'css', 'music-library.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public', 'js', 'index-loader.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '05-playback', '03a-home-dashboard.js'), 'utf8');
  const queue = fs.readFileSync(path.join(root, 'public', 'js', 'modules', '05-playback', '10-queue-actions.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');

  assert.match(html, /id="music-library-btn"/);
  assert.match(html, /css\/music-library\.css/);
  assert.match(loader, /05a-music-library-workspace\.js/);
  assert.match(home, /openMusicLibraryWorkspace\('local'\)/);
  assert.match(workspace, /data-library-tab="local"/);
  assert.match(workspace, /data-library-tab="playlists"/);
  assert.match(workspace, /data-library-tab="import"/);
  assert.match(workspace, /removeLocalMusicTracks/);
  assert.match(workspace, /MUSIC_LIBRARY_BATCH_SIZE\s*=\s*80/);
  assert.match(workspace, /queueSongNext/);
  assert.match(queue, /function queueSongs/);
  assert.match(main, /extensions: \['mrpl'\]/);
  assert.doesNotMatch(workspace, /LX|落雪/i);
  assert.doesNotMatch(css, /LX|落雪/i);
});
