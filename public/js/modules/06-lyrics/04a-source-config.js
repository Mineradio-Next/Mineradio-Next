/* Optional source scripts. Built-in providers remain the default playback path. */
var ADDITIONAL_SOURCE_ENABLED_KEY = 'mineradio-additional-source-enabled-v1';
var additionalSourcePanelRequest = 0;
var additionalSourceInstalledCount = 0;

function additionalSourceEnabled() {
  return localStorage.getItem(ADDITIONAL_SOURCE_ENABLED_KEY) === '1';
}

function setAdditionalSourceEnabled(enabled) {
  localStorage.setItem(ADDITIONAL_SOURCE_ENABLED_KEY, enabled ? '1' : '0');
}

function additionalSourceCodeForSong(song) {
  var provider = typeof songProviderKey === 'function' ? songProviderKey(song) : String(song && (song.source || song.provider) || '');
  if (provider === 'qq') return 'tx';
  if (provider === 'kugou') return 'kg';
  if (provider === 'netease') return 'wy';
  return '';
}

function additionalSourceMusicInfo(song) {
  song = song || {};
  return {
    id: song.id || song.songmid || song.mid || song.hash || '',
    songmid: song.songmid || song.mid || song.id || song.hash || '',
    mid: song.mid || song.songmid || song.id || '',
    hash: song.hash || song.fileHash || song.audioHash || '',
    name: song.name || song.title || '',
    title: song.title || song.name || '',
    singer: song.singer || song.artist || '',
    artist: song.artist || song.singer || '',
    album: song.album || song.albumName || '',
    albumName: song.albumName || song.album || '',
    albumId: song.albumId || song.album_id || '',
    interval: song.interval || song.duration || '',
    copyrightId: song.copyrightId || '',
    strMediaMid: song.strMediaMid || song.mediaMid || '',
    meta: song.meta && typeof song.meta === 'object' ? song.meta : {}
  };
}

async function resolveAdditionalSourcePlayback(song, quality) {
  if (!additionalSourceEnabled()) return null;
  var source = additionalSourceCodeForSong(song);
  if (!source) return null;
  var result = await apiJson('/api/source-config/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: source, musicInfo: additionalSourceMusicInfo(song), quality: quality || '128k' }),
    timeoutMs: 7600
  });
  if (!result || result.ok !== true || !result.url) return null;
  return {
    url: result.url,
    proxyUrl: result.proxyUrl || '',
    level: result.quality || '',
    provider: 'additional-source',
    source: 'additional-source',
    resolver: result.resolver || '',
    headers: result.headers || {}
  };
}

async function resolveAdditionalSourceLyrics(song) {
  if (!additionalSourceEnabled()) return null;
  var source = additionalSourceCodeForSong(song);
  if (!source) return null;
  var result = await apiJson('/api/source-config/lyric', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: source, musicInfo: additionalSourceMusicInfo(song) }),
    timeoutMs: 7600
  });
  if (!result || result.ok !== true || !(result.lyric || result.tlyric || result.lxlyric)) return null;
  return result;
}

function closeSourceConfigPanel() {
  var mask = document.getElementById('source-config-modal');
  if (!mask) return;
  closeGsapModal(mask, function () { mask.remove(); });
}

function sourceConfigErrorText(error) {
  var code = String(error || 'SOURCE_CONFIG_FAILED');
  var labels = {
    SOURCE_NOT_CONFIGURED: '还没有启用的来源配置',
    LX_SOURCE_NOT_CONFIGURED: '还没有启用的来源配置',
    LX_SOURCE_FILE_INVALID: '脚本文件无效或过大',
    LX_SOURCE_REQUEST_HANDLER_MISSING: '脚本没有提供兼容的请求入口',
    LX_SOURCE_INIT_TIMEOUT: '脚本初始化超时',
    LX_SOURCE_URL_INVALID: '链接地址无效'
  };
  return labels[code] || '操作未完成：' + code;
}

function sourceConfigModal() {
  return document.getElementById('source-config-modal');
}

function sourceConfigSetHint(text, isError) {
  var hint = document.getElementById('source-config-hint');
  if (!hint) return;
  hint.textContent = text || '';
  hint.style.color = isError ? 'rgba(255, 157, 157, .92)' : '';
}

function renderSourceConfigToggle(enabled) {
  var toggle = document.getElementById('source-config-enabled');
  if (!toggle) return;
  var available = additionalSourceInstalledCount > 0;
  var active = available && !!enabled;
  toggle.disabled = !available;
  toggle.classList.toggle('on', active);
  toggle.classList.toggle('unavailable', !available);
  toggle.setAttribute('aria-checked', active ? 'true' : 'false');
  toggle.setAttribute('aria-disabled', available ? 'false' : 'true');
  var state = toggle.querySelector('[data-source-enabled-state]');
  if (state) state.textContent = available ? (active ? '已开启' : '已关闭') : '未配置';
}

function renderSourceConfigList(payload) {
  var list = document.getElementById('source-config-list');
  if (!list) return;
  var records = Array.isArray(payload && payload.installed) ? payload.installed : [];
  additionalSourceInstalledCount = records.length;
  var count = document.getElementById('source-config-count');
  if (count) count.textContent = records.length + ' 个';
  if (!records.length) {
    list.innerHTML = '<div class="source-config-empty">暂无备用音源</div>';
    return;
  }
  list.innerHTML = records.map(function (record) {
    var active = !!record.active;
    return '<div class="source-config-row' + (active ? ' active' : '') + '" data-source-config-id="' + escHtml(record.id) + '">' +
      '<div class="source-config-copy"><strong>' + escHtml(record.name || '未命名来源') + '</strong><small>' + escHtml([record.version, record.author].filter(Boolean).join(' · ') || '来源脚本') + '</small></div>' +
      '<div class="source-config-row-actions">' +
        (active ? '<span class="source-config-current"><i></i>当前</span>' : '<button class="modal-btn source-config-row-btn" type="button" data-source-action="select">启用</button>') +
        '<button class="modal-btn source-config-row-btn" type="button" data-source-action="delete" title="移除">移除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function refreshSourceConfigPanel() {
  var request = ++additionalSourcePanelRequest;
  sourceConfigSetHint('正在读取来源配置...');
  try {
    var result = await apiJson('/api/source-config/status', { timeoutMs: 5000 });
    if (request !== additionalSourcePanelRequest) return;
    renderSourceConfigList(result || {});
    renderSourceConfigToggle(additionalSourceEnabled());
    var sourceNames = result && result.sources ? Object.keys(result.sources) : [];
    sourceConfigSetHint(sourceNames.length ? ('当前音源支持：' + sourceNames.join(' / ')) : '内置平台优先 · 备用音源未配置');
  } catch (error) {
    if (request !== additionalSourcePanelRequest) return;
    renderSourceConfigList({ installed: [] });
    sourceConfigSetHint(sourceConfigErrorText(error && error.message), true);
  }
}

async function importSourceConfig(payload) {
  sourceConfigSetHint('正在验证并保存来源配置...');
  var result = await apiJson('/api/source-config/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), timeoutMs: 18000
  });
  if (!result || result.ok !== true) throw new Error(result && result.error || 'SOURCE_IMPORT_FAILED');
  await refreshSourceConfigPanel();
  sourceConfigSetHint('来源配置已保存。打开开关后，才会在原平台播放失败时参与回退。');
}

function openSourceConfigFilePicker() {
  var input = document.getElementById('source-config-file-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'source-config-file-input';
    input.type = 'file';
    input.accept = '.js,text/javascript,application/javascript,text/plain';
    input.hidden = true;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { sourceConfigSetHint('脚本文件不能超过 5 MB', true); return; }
      var reader = new FileReader();
      reader.onerror = function () { sourceConfigSetHint('读取脚本文件失败', true); };
      reader.onload = function () {
        importSourceConfig({ script: String(reader.result || ''), fileName: file.name })
          .catch(function (error) { sourceConfigSetHint(sourceConfigErrorText(error && error.message), true); });
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
  }
  input.click();
}

function openSourceConfigPanel() {
  closeSourceConfigPanel();
  var mask = document.createElement('div');
  mask.id = 'source-config-modal';
  mask.className = 'modal-mask';
  mask.innerHTML =
    '<div class="modal source-config-modal">' +
      '<h2>备用音源</h2>' +
      '<div class="source-config-section-head"><span>备用播放</span><small>内置平台始终优先</small></div>' +
      '<button id="source-config-enabled" class="fx-toggle source-config-toggle" type="button" role="switch" aria-checked="false" data-source-action="toggle">' +
        '<span class="source-config-toggle-copy"><strong>自动尝试备用音源</strong><small data-source-enabled-state>未配置</small></span><span class="dot"></span>' +
      '</button>' +
      '<div class="source-config-section-head"><span>添加音源</span><small>脚本文件或链接</small></div>' +
      '<div class="source-config-import">' +
        '<button class="modal-btn source-config-file-btn" type="button" data-source-action="file">选择脚本文件</button>' +
        '<div class="collect-create source-config-url-import">' +
          '<input id="source-config-url" type="url" placeholder="粘贴来源脚本链接" spellcheck="false">' +
          '<button class="modal-btn primary" type="button" data-source-action="url">导入</button>' +
        '</div>' +
      '</div>' +
      '<div class="source-config-section-head source-config-list-head"><span>已安装</span><small id="source-config-count">0 个</small></div>' +
      '<div id="source-config-list" class="source-config-list"></div>' +
      '<div id="source-config-hint" class="playlist-import-hint"></div>' +
      '<div class="btn-row"><button class="modal-btn" type="button" data-source-action="close">关闭</button></div>' +
    '</div>';
  document.body.appendChild(mask);
  mask.addEventListener('click', function (event) {
    if (event.target === mask || event.target.closest('[data-source-action="close"]')) { closeSourceConfigPanel(); return; }
    var action = event.target.closest('[data-source-action]');
    if (!action) return;
    var type = action.getAttribute('data-source-action');
    if (type === 'file') { openSourceConfigFilePicker(); return; }
    if (type === 'toggle') {
      var enabled = !additionalSourceEnabled();
      setAdditionalSourceEnabled(enabled);
      renderSourceConfigToggle(enabled);
      sourceConfigSetHint(enabled ? '附加来源已开启 · 内置平台仍然优先' : '附加来源已关闭');
      return;
    }
    if (type === 'url') {
      var input = document.getElementById('source-config-url');
      var sourceUrl = String(input && input.value || '').trim();
      if (!sourceUrl) { sourceConfigSetHint('请输入来源脚本链接', true); return; }
      importSourceConfig({ url: sourceUrl }).catch(function (error) { sourceConfigSetHint(sourceConfigErrorText(error && error.message), true); });
      return;
    }
    var row = action.closest('[data-source-config-id]');
    var id = row && row.getAttribute('data-source-config-id');
    if (!id) return;
    if (type === 'select') {
      sourceConfigSetHint('正在切换来源配置...');
      apiJson('/api/source-config/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }), timeoutMs: 12000 })
        .then(function (result) {
          if (!result || result.ok !== true) throw new Error(result && result.error || 'SOURCE_SELECT_FAILED');
          return refreshSourceConfigPanel();
        }).catch(function (error) { sourceConfigSetHint(sourceConfigErrorText(error && error.message), true); });
      return;
    }
    if (type === 'delete') {
      sourceConfigSetHint('正在移除来源配置...');
      apiJson('/api/source-config/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }), timeoutMs: 12000 })
        .then(function (result) {
          if (!result || result.ok !== true) throw new Error(result && result.error || 'SOURCE_DELETE_FAILED');
          return refreshSourceConfigPanel();
        }).catch(function (error) { sourceConfigSetHint(sourceConfigErrorText(error && error.message), true); });
    }
  });
  openGsapModal(mask);
  refreshSourceConfigPanel();
}
