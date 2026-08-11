'use strict';

var MINERADIO_FULL_BACKUP_TYPE = 'mineradio-full-backup';
var MINERADIO_FULL_BACKUP_SCHEMA = 1;
var MINERADIO_FULL_BACKUP_MAX_BYTES = 32 * 1024 * 1024;
var mineradioPendingFullRestore = null;

var MINERADIO_FULL_BACKUP_CATEGORIES = {
  library: {
    label: '歌单与收藏',
    keys: [
      'mineradio-local-playlist-files-v1',
      'mineradio-playlist-reorder-v1',
      'mineradio-backup-source-likes-v1'
    ]
  },
  lyrics: {
    label: '歌词',
    keys: [
      'mineradio-custom-lyrics-v1',
      'mineradio-custom-lyric-prefs-v1',
      'mineradio-custom-lyric-fonts-v1',
      'mineradio-lyric-timing-offsets-v1'
    ]
  },
  visual: {
    label: '视觉',
    keys: [
      'mineradio-current-fx-autosave-v1',
      'mineradio-user-fx-archives-v1',
      'mineradio-custom-covers',
      'mineradio-wallpaper-engine-selection-v1',
      'mineradio-wallpaper-engine-hidden-v1',
      'mineradio-wallpaper-engine-favorites-v1',
      'mineradio-free-camera-v1'
    ]
  },
  preferences: {
    label: '播放与界面',
    keys: [
      'apex-player-volume',
      'mineradio-playback-quality-v1',
      'mineradio-audio-fade-v1',
      'mineradio-hotkey-settings-v1',
      'mineradio-diy-player-mode-v1',
      'mineradio-playlist-panel-pinned-v1',
      'mineradio-playlist-panel-tab-v1',
      'mineradio-user-capsule-auto-hide-v1',
      'mineradio-fx-fab-auto-hide-v1',
      'mineradio-controls-auto-hide-v1',
      'mineradio-close-behavior-v1',
      'mineradio-startup-autoplay-v1',
      'mineradio-startup-fast-skip-v1',
      'mineradio-startup-resume-mode-v1',
      'mineradio-cuefield-automix-v1'
    ]
  }
};

var MINERADIO_FULL_BACKUP_DENIED_KEYS = {
  'mineradio-login-cookie-export-v1': true,
  'mineradio-provider-vip-audit-v1': true,
  'mineradio-qq-playback-vip-evidence-v1': true,
  'mineradio-additional-source-enabled-v1': true
};

function mineradioFullBackupCategoryNames() {
  return Object.keys(MINERADIO_FULL_BACKUP_CATEGORIES);
}

function mineradioFullBackupIsSensitiveKey(key) {
  var value = String(key || '').toLowerCase();
  return !!MINERADIO_FULL_BACKUP_DENIED_KEYS[value]
    || /(cookie|token|secret|password|credential|session|oauth|login-workflow)/i.test(value)
    || /(additional-source|source-(script|config|credential|token)|custom-source)/i.test(value);
}

function mineradioFullBackupCategoryForKey(key) {
  var value = String(key || '');
  var categoryNames = mineradioFullBackupCategoryNames();
  for (var i = 0; i < categoryNames.length; i += 1) {
    var category = categoryNames[i];
    if (MINERADIO_FULL_BACKUP_CATEGORIES[category].keys.indexOf(value) >= 0) return category;
  }
  return '';
}

function mineradioFullBackupEmptyCounts() {
  return { library: 0, lyrics: 0, visual: 0, preferences: 0 };
}

function mineradioFullBackupByteLength(text) {
  var value = String(text || '');
  if (typeof Buffer !== 'undefined' && Buffer.byteLength) return Buffer.byteLength(value, 'utf8');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return unescape(encodeURIComponent(value)).length;
}

function collectMineradioFullBackup(storage, now) {
  var categories = {};
  var counts = mineradioFullBackupEmptyCounts();
  var categoryNames = mineradioFullBackupCategoryNames();

  categoryNames.forEach(function (category) {
    var values = {};
    MINERADIO_FULL_BACKUP_CATEGORIES[category].keys.forEach(function (key) {
      if (mineradioFullBackupIsSensitiveKey(key)) return;
      var value = storage.getItem(key);
      if (value == null) return;
      values[key] = String(value);
      counts[category] += 1;
    });
    categories[category] = values;
  });

  return {
    payload: {
      type: MINERADIO_FULL_BACKUP_TYPE,
      schema: MINERADIO_FULL_BACKUP_SCHEMA,
      app: 'Mineradio',
      exportedAt: Number(now) || Date.now(),
      categories: categories
    },
    summary: {
      counts: counts,
      total: categoryNames.reduce(function (sum, category) { return sum + counts[category]; }, 0),
      ignored: 0,
      rejected: 0
    }
  };
}

function validateMineradioFullBackupPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'BACKUP_INVALID' };
  }
  if (payload.type !== MINERADIO_FULL_BACKUP_TYPE) {
    return { ok: false, error: 'BACKUP_TYPE_INVALID' };
  }
  if (Number(payload.schema) !== MINERADIO_FULL_BACKUP_SCHEMA) {
    return { ok: false, error: 'BACKUP_SCHEMA_UNSUPPORTED' };
  }
  if (!payload.categories || typeof payload.categories !== 'object' || Array.isArray(payload.categories)) {
    return { ok: false, error: 'BACKUP_CATEGORIES_INVALID' };
  }

  var entries = {};
  var counts = mineradioFullBackupEmptyCounts();
  var ignored = 0;
  var rejected = 0;

  Object.keys(payload.categories).forEach(function (sourceCategory) {
    var values = payload.categories[sourceCategory];
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      ignored += 1;
      return;
    }
    Object.keys(values).forEach(function (key) {
      if (mineradioFullBackupIsSensitiveKey(key)) {
        rejected += 1;
        return;
      }
      var targetCategory = mineradioFullBackupCategoryForKey(key);
      if (!targetCategory || Object.prototype.hasOwnProperty.call(entries, key)) {
        ignored += 1;
        return;
      }
      if (typeof values[key] !== 'string') {
        ignored += 1;
        return;
      }
      entries[key] = values[key];
      counts[targetCategory] += 1;
    });
  });

  return {
    ok: true,
    entries: entries,
    exportedAt: Number(payload.exportedAt) || 0,
    summary: {
      counts: counts,
      total: Object.keys(entries).length,
      ignored: ignored,
      rejected: rejected
    }
  };
}

function parseMineradioFullBackupText(text) {
  var value = String(text || '');
  if (mineradioFullBackupByteLength(value) > MINERADIO_FULL_BACKUP_MAX_BYTES) {
    return { ok: false, error: 'BACKUP_TOO_LARGE' };
  }
  var payload = null;
  try { payload = JSON.parse(value); } catch (error) {
    return { ok: false, error: 'BACKUP_JSON_INVALID' };
  }
  return validateMineradioFullBackupPayload(payload);
}

function restoreMineradioFullBackup(storage, entries, transaction) {
  var keys = Object.keys(entries || {});
  var before = {};
  var written = [];

  try {
    keys.forEach(function (key) {
      var oldValue = storage.getItem(key);
      before[key] = { exists: oldValue != null, value: oldValue };
    });
    keys.forEach(function (key) {
      storage.setItem(key, entries[key]);
      written.push(key);
    });
    if (transaction && typeof transaction.commit === 'function') {
      var commitResult = transaction.commit();
      if (commitResult === false || (commitResult && commitResult.ok === false)) {
        throw new Error(commitResult && commitResult.error || 'BACKUP_TRANSACTION_COMMIT_FAILED');
      }
    }
    return { ok: true, restored: written.length };
  } catch (error) {
    var rollbackOk = true;
    written.reverse().forEach(function (key) {
      try {
        if (before[key].exists) storage.setItem(key, before[key].value);
        else storage.removeItem(key);
      } catch (rollbackError) {
        rollbackOk = false;
      }
    });
    return { ok: false, error: error, rollbackOk: rollbackOk, restored: 0 };
  }
}

function mineradioFullBackupFxDiskTransaction(entries) {
  var raw = entries && entries['mineradio-current-fx-autosave-v1'];
  if (raw == null) return null;
  var payload = null;
  try { payload = JSON.parse(raw); } catch (error) { }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'BACKUP_FX_AUTOSAVE_INVALID' };
  }
  var api = mineradioFullBackupApi();
  if (!api || typeof api.saveCurrentFxAutosaveSync !== 'function') return null;
  return {
    commit: function () {
      return api.saveCurrentFxAutosaveSync(payload);
    }
  };
}

function mineradioFullBackupErrorLabel(code) {
  var labels = {
    BACKUP_INVALID: '备份内容无效',
    BACKUP_TYPE_INVALID: '这不是 Mineradio 完整备份',
    BACKUP_SCHEMA_UNSUPPORTED: '备份版本暂不支持',
    BACKUP_CATEGORIES_INVALID: '备份分类结构无效',
    BACKUP_TOO_LARGE: '备份文件超过 32 MB',
    BACKUP_JSON_INVALID: '备份文件不是有效 JSON',
    BACKUP_FX_AUTOSAVE_INVALID: '备份中的当前视觉设置无效'
  };
  return labels[code] || '完整备份读取失败';
}

function mineradioFullBackupDateLabel(timestamp) {
  if (!Number(timestamp)) return '未记录';
  try { return new Date(Number(timestamp)).toLocaleString('zh-CN', { hour12: false }); }
  catch (error) { return '未记录'; }
}

function mineradioFullBackupFileName(now) {
  var date = new Date(Number(now) || Date.now());
  var stamp = date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0')
    + '-'
    + String(date.getHours()).padStart(2, '0')
    + String(date.getMinutes()).padStart(2, '0');
  return 'Mineradio-完整备份-' + stamp + '.json';
}

function mineradioFullBackupApi() {
  return typeof window !== 'undefined' && window.desktopWindow ? window.desktopWindow : null;
}

function mineradioFullBackupToast(message) {
  if (typeof showToast === 'function') showToast(message);
}

function downloadMineradioFullBackup(text, fileName) {
  var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function exportMineradioFullBackup() {
  var result = collectMineradioFullBackup(localStorage, Date.now());
  var text = JSON.stringify(result.payload, null, 2);
  if (mineradioFullBackupByteLength(text) > MINERADIO_FULL_BACKUP_MAX_BYTES) {
    mineradioFullBackupToast('完整备份超过 32 MB，请先删除过大的自定义字体');
    return Promise.resolve(false);
  }
  var fileName = mineradioFullBackupFileName(result.payload.exportedAt);
  var api = mineradioFullBackupApi();
  if (api && typeof api.exportJsonFile === 'function') {
    return api.exportJsonFile({ defaultName: fileName, text: text }).then(function (response) {
      if (response && response.ok) {
        mineradioFullBackupToast('完整备份已导出，共 ' + result.summary.total + ' 项');
        return true;
      }
      if (!response || !response.canceled) mineradioFullBackupToast('完整备份导出失败');
      return false;
    }).catch(function () {
      mineradioFullBackupToast('完整备份导出失败');
      return false;
    });
  }
  downloadMineradioFullBackup(text, fileName);
  mineradioFullBackupToast('完整备份已导出，共 ' + result.summary.total + ' 项');
  return Promise.resolve(true);
}

function ensureMineradioFullRestoreModal() {
  var modal = document.getElementById('full-backup-restore-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'full-backup-restore-modal';
  modal.className = 'full-backup-modal';
  modal.innerHTML =
    '<div class="full-backup-dialog" role="dialog" aria-modal="true" aria-labelledby="full-backup-title">' +
    '<div class="full-backup-head">' +
    '<div><div class="full-backup-title" id="full-backup-title">恢复完整备份</div>' +
    '<div class="full-backup-sub">只恢复可迁移设置，不包含账号、来源脚本和本地媒体文件。</div></div>' +
    '<button class="full-backup-close" type="button" aria-label="关闭" onclick="closeMineradioFullRestoreModal()">×</button>' +
    '</div>' +
    '<div id="full-backup-summary" class="full-backup-summary"></div>' +
    '<div class="full-backup-foot">' +
    '<div class="full-backup-merge-note">同名设置将被覆盖，未出现在备份中的当前数据会保留。</div>' +
    '<div class="full-backup-actions">' +
    '<button type="button" class="ghost" onclick="closeMineradioFullRestoreModal()">取消</button>' +
    '<button type="button" class="primary" onclick="confirmMineradioFullRestore()">确认恢复</button>' +
    '</div></div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function (event) {
    if (event.target === modal) closeMineradioFullRestoreModal();
  });
  return modal;
}

function renderMineradioFullRestoreSummary(result) {
  var modal = ensureMineradioFullRestoreModal();
  var summary = modal.querySelector('#full-backup-summary');
  var counts = result.summary.counts;
  var cards = mineradioFullBackupCategoryNames().map(function (category) {
    return '<div class="full-backup-stat"><span>'
      + MINERADIO_FULL_BACKUP_CATEGORIES[category].label
      + '</span><strong>' + counts[category] + '</strong></div>';
  }).join('');
  var ignored = result.summary.ignored + result.summary.rejected;
  summary.innerHTML =
    '<div class="full-backup-source"><span>备份时间</span><strong>'
    + mineradioFullBackupDateLabel(result.exportedAt)
    + '</strong></div>' +
    '<div class="full-backup-stats">' + cards + '</div>' +
    '<div class="full-backup-total"><span>将恢复 <strong>' + result.summary.total + '</strong> 项设置</span>' +
    '<span>' + (ignored ? ('已安全忽略 ' + ignored + ' 项') : '未发现额外数据') + '</span></div>';
}

function prepareMineradioFullRestore(text) {
  var parsed = parseMineradioFullBackupText(text);
  if (!parsed.ok) {
    mineradioFullBackupToast(mineradioFullBackupErrorLabel(parsed.error));
    return false;
  }
  mineradioPendingFullRestore = parsed;
  renderMineradioFullRestoreSummary(parsed);
  ensureMineradioFullRestoreModal().classList.add('show');
  return true;
}

function closeMineradioFullRestoreModal() {
  var modal = typeof document !== 'undefined' && document.getElementById('full-backup-restore-modal');
  if (modal) modal.classList.remove('show');
  mineradioPendingFullRestore = null;
}

function confirmMineradioFullRestore() {
  if (!mineradioPendingFullRestore) return false;
  var transaction = mineradioFullBackupFxDiskTransaction(mineradioPendingFullRestore.entries);
  if (transaction && transaction.error) {
    mineradioFullBackupToast(mineradioFullBackupErrorLabel(transaction.error));
    closeMineradioFullRestoreModal();
    return false;
  }
  var result = restoreMineradioFullBackup(localStorage, mineradioPendingFullRestore.entries, transaction);
  if (!result.ok) {
    mineradioFullBackupToast(result.rollbackOk
      ? '恢复失败，已撤销本次写入'
      : '恢复失败，部分数据无法自动撤销');
    closeMineradioFullRestoreModal();
    return false;
  }
  var restored = result.restored;
  closeMineradioFullRestoreModal();
  mineradioFullBackupToast('已恢复 ' + restored + ' 项设置，正在重新载入');
  setTimeout(function () { window.location.reload(); }, 450);
  return true;
}

function readMineradioFullBackupBrowserFile(file) {
  if (!file || !/\.json$/i.test(file.name || '')) {
    mineradioFullBackupToast('请选择 JSON 完整备份');
    return;
  }
  if (Number(file.size) > MINERADIO_FULL_BACKUP_MAX_BYTES) {
    mineradioFullBackupToast('备份文件超过 32 MB');
    return;
  }
  var reader = new FileReader();
  reader.onload = function (event) { prepareMineradioFullRestore(event.target && event.target.result); };
  reader.onerror = function () { mineradioFullBackupToast('完整备份读取失败'); };
  reader.readAsText(file, 'utf-8');
}

function importMineradioFullBackup() {
  var api = mineradioFullBackupApi();
  if (api && typeof api.importJsonFile === 'function') {
    api.importJsonFile().then(function (response) {
      if (response && response.ok) prepareMineradioFullRestore(response.text);
      else if (!response || !response.canceled) mineradioFullBackupToast('完整备份读取失败');
    }).catch(function () { mineradioFullBackupToast('完整备份读取失败'); });
    return;
  }
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function () {
    var file = input.files && input.files[0];
    if (file) readMineradioFullBackupBrowserFile(file);
  };
  input.click();
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMineradioFullRestoreModal();
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    type: MINERADIO_FULL_BACKUP_TYPE,
    schema: MINERADIO_FULL_BACKUP_SCHEMA,
    maxBytes: MINERADIO_FULL_BACKUP_MAX_BYTES,
    categories: MINERADIO_FULL_BACKUP_CATEGORIES,
    isSensitiveKey: mineradioFullBackupIsSensitiveKey,
    categoryForKey: mineradioFullBackupCategoryForKey,
    byteLength: mineradioFullBackupByteLength,
    collect: collectMineradioFullBackup,
    validate: validateMineradioFullBackupPayload,
    parse: parseMineradioFullBackupText,
    restore: restoreMineradioFullBackup,
    createFxDiskTransaction: mineradioFullBackupFxDiskTransaction,
    fileName: mineradioFullBackupFileName
  };
}
