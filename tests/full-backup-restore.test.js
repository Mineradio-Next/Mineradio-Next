'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'public/js/modules/07-fx/00a-full-backup-restore.js');
const loaderPath = path.join(root, 'public/js/index-loader.js');
const archivePath = path.join(root, 'public/js/modules/07-fx/00-preset-archive-data.js');
const cssPath = path.join(root, 'public/css/index.css');
const mainPath = path.join(root, 'desktop/main.js');
const source = fs.readFileSync(modulePath, 'utf8');
const loaderSource = fs.readFileSync(loaderPath, 'utf8');
const archiveSource = fs.readFileSync(archivePath, 'utf8');
const cssSource = fs.readFileSync(cssPath, 'utf8');
const mainSource = fs.readFileSync(mainPath, 'utf8');
const backup = require(modulePath);

function createStorage(initial = {}, failOnKey = '') {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (key === failOnKey) throw new Error('quota exceeded');
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    }
  };
}

test('collects only present allowlisted settings and keeps raw storage strings', () => {
  const storage = createStorage({
    'mineradio-local-playlist-files-v1': '[{"id":1}]',
    'mineradio-custom-lyrics-v1': '{"song":"line"}',
    'mineradio-diy-player-mode-v1': '1',
    'mineradio-listening-effects-v1': '{"enabled":true}',
    'mineradio-music-radio-favorites-v1': '["daily","rock"]',
    'mineradio-login-cookie-export-v1': 'sensitive',
    'mineradio-search-history': '["ignored"]'
  });
  const result = backup.collect(storage, 1234);

  assert.equal(result.payload.type, backup.type);
  assert.equal(result.payload.schema, 1);
  assert.equal(result.payload.exportedAt, 1234);
  assert.equal(result.payload.categories.library['mineradio-local-playlist-files-v1'], '[{"id":1}]');
  assert.equal(result.payload.categories.lyrics['mineradio-custom-lyrics-v1'], '{"song":"line"}');
  assert.equal(result.payload.categories.preferences['mineradio-diy-player-mode-v1'], '1');
  assert.equal(result.payload.categories.preferences['mineradio-listening-effects-v1'], '{"enabled":true}');
  assert.equal(result.payload.categories.preferences['mineradio-music-radio-favorites-v1'], '["daily","rock"]');
  assert.equal(result.summary.total, 5);
  assert.doesNotMatch(JSON.stringify(result.payload), /sensitive|search-history/);
});

test('rejects credential-shaped keys and classifies only explicit allowlist entries', () => {
  assert.equal(backup.isSensitiveKey('mineradio-login-cookie-export-v1'), true);
  assert.equal(backup.isSensitiveKey('mineradio-oauth-token-v1'), true);
  assert.equal(backup.isSensitiveKey('mineradio-additional-source-script-v1'), true);
  assert.equal(backup.isSensitiveKey('mineradio-source-config-v2'), true);
  assert.equal(backup.categoryForKey('mineradio-current-fx-autosave-v1'), 'visual');
  assert.equal(backup.categoryForKey('mineradio-search-history'), '');

  const result = backup.validate({
    type: backup.type,
    schema: 1,
    exportedAt: 99,
    categories: {
      unexpected: {
        'mineradio-current-fx-autosave-v1': '{"fx":true}',
        'mineradio-oauth-token-v1': 'secret',
        'mineradio-search-history': '["query"]'
      }
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.entries, { 'mineradio-current-fx-autosave-v1': '{"fx":true}' });
  assert.equal(result.summary.counts.visual, 1);
  assert.equal(result.summary.rejected, 1);
  assert.equal(result.summary.ignored, 1);
});

test('validates backup identity, schema, JSON, and UTF-8 byte length', () => {
  assert.deepEqual(backup.parse('{broken'), { ok: false, error: 'BACKUP_JSON_INVALID' });
  assert.equal(backup.validate({ type: 'other', schema: 1, categories: {} }).error, 'BACKUP_TYPE_INVALID');
  assert.equal(backup.validate({ type: backup.type, schema: 2, categories: {} }).error, 'BACKUP_SCHEMA_UNSUPPORTED');
  assert.equal(backup.byteLength('歌词'), 6);
  assert.deepEqual(backup.parse('x'.repeat(backup.maxBytes + 1)), { ok: false, error: 'BACKUP_TOO_LARGE' });
  assert.match(backup.fileName(new Date(2026, 7, 11, 9, 5).getTime()), /^Mineradio-完整备份-20260811-0905\.json$/);
});

test('restores by merge without removing unrelated current data', () => {
  const storage = createStorage({
    'mineradio-diy-player-mode-v1': '0',
    'mineradio-search-history': '["keep"]'
  });
  const result = backup.restore(storage, {
    'mineradio-diy-player-mode-v1': '1',
    'mineradio-custom-lyrics-v1': '{"new":true}'
  });

  assert.deepEqual(result, { ok: true, restored: 2 });
  assert.deepEqual(storage.snapshot(), {
    'mineradio-diy-player-mode-v1': '1',
    'mineradio-search-history': '["keep"]',
    'mineradio-custom-lyrics-v1': '{"new":true}'
  });
});

test('rolls back all completed writes when storage fails mid-restore', () => {
  const storage = createStorage({
    'mineradio-diy-player-mode-v1': '0',
    'mineradio-hotkey-settings-v1': '{"old":true}'
  }, 'mineradio-hotkey-settings-v1');
  const result = backup.restore(storage, {
    'mineradio-diy-player-mode-v1': '1',
    'mineradio-hotkey-settings-v1': '{"new":true}'
  });

  assert.equal(result.ok, false);
  assert.equal(result.rollbackOk, true);
  assert.deepEqual(storage.snapshot(), {
    'mineradio-diy-player-mode-v1': '0',
    'mineradio-hotkey-settings-v1': '{"old":true}'
  });
});

test('commits the current visual disk mirror after local writes and rolls back on disk failure', () => {
  const storage = createStorage({
    'mineradio-current-fx-autosave-v1': '{"autosavedAt":99,"old":true}',
    'mineradio-diy-player-mode-v1': '0'
  });
  let observedLocal = '';
  const result = backup.restore(storage, {
    'mineradio-current-fx-autosave-v1': '{"autosavedAt":1,"restored":true}',
    'mineradio-diy-player-mode-v1': '1'
  }, {
    commit() {
      observedLocal = storage.getItem('mineradio-current-fx-autosave-v1');
      return { ok: false, error: 'disk full' };
    }
  });

  assert.equal(observedLocal, '{"autosavedAt":1,"restored":true}');
  assert.equal(result.ok, false);
  assert.equal(result.rollbackOk, true);
  assert.deepEqual(storage.snapshot(), {
    'mineradio-current-fx-autosave-v1': '{"autosavedAt":99,"old":true}',
    'mineradio-diy-player-mode-v1': '0'
  });
});

test('integrates with original archive UI and bounded Electron JSON bridge', () => {
  assert.match(loaderSource, /00-preset-archive-data\.js'[\s\S]*00a-full-backup-restore\.js'/);
  assert.match(archiveSource, /exportMineradioFullBackup\(\)[\s\S]*完整备份/);
  assert.match(archiveSource, /importMineradioFullBackup\(\)[\s\S]*完整恢复/);
  assert.match(cssSource, /\.full-backup-modal[\s\S]*\.full-backup-dialog/);
  assert.match(source, /同名设置将被覆盖，未出现在备份中的当前数据会保留/);
  assert.match(source, /saveCurrentFxAutosaveSync/);
  assert.match(mainSource, /mineradio-export-json-file[\s\S]*JSON_FILE_TOO_LARGE/);
  assert.match(mainSource, /mineradio-import-json-file[\s\S]*statSync\(filePath\)\.size/);
  assert.doesNotMatch(source + archiveSource, /\bLX\b|\/api\/lx-/i);
});
