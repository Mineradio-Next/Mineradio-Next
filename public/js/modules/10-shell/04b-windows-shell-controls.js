var windowsShellControlsInitialized = false;
var windowsTrayPlaybackLastKey = '';
var windowsTrayPlaybackPending = false;
var windowsStartupRequestPending = false;

function windowsShellApi() {
  return window.desktopWindow && window.desktopWindow.isDesktop ? window.desktopWindow : null;
}

function windowsTrayPlaybackPayload() {
  var meta = typeof systemMediaSessionMetadataPayload === 'function' ? systemMediaSessionMetadataPayload() : null;
  var hasMedia = !!(typeof audio !== 'undefined' && audio && audio.src && meta);
  return {
    hasMedia: hasMedia,
    title: hasMedia ? String(meta.title || '') : '',
    artist: hasMedia ? String(meta.artist || '') : '',
    playing: hasMedia && !audio.paused && !audio.ended,
    volume: Math.max(0, Math.min(100, Math.round((Number(targetVolume) || 0) * 100)))
  };
}

function syncWindowsTrayPlayback(force) {
  var api = windowsShellApi();
  if (!api || typeof api.updateTrayPlayback !== 'function') return false;
  var payload = windowsTrayPlaybackPayload();
  var key = JSON.stringify(payload);
  if (!force && (key === windowsTrayPlaybackLastKey || windowsTrayPlaybackPending)) return false;
  windowsTrayPlaybackLastKey = key;
  windowsTrayPlaybackPending = true;
  var failed = false;
  Promise.resolve(api.updateTrayPlayback(payload)).catch(function (error) {
    failed = true;
    windowsTrayPlaybackLastKey = '';
    console.warn('[WindowsShell] tray sync failed:', error);
  }).finally(function () {
    windowsTrayPlaybackPending = false;
    if (!failed && JSON.stringify(windowsTrayPlaybackPayload()) !== windowsTrayPlaybackLastKey) syncWindowsTrayPlayback();
  });
  return true;
}

function runWindowsTrayCommand(payload) {
  var command = String(payload && payload.command || '');
  if (command === 'toggle-play') {
    if (typeof togglePlay === 'function') togglePlay();
  } else if (command === 'previous') {
    if (typeof prevTrack === 'function') prevTrack(true);
  } else if (command === 'next') {
    if (typeof nextTrack === 'function') nextTrack(true);
  } else if (command === 'volume') {
    if (typeof setVolume === 'function') setVolume((Number(targetVolume) || 0) + (Number(payload.value) || 0) / 100, false);
  } else if (command === 'mute') {
    if (typeof toggleMute === 'function') toggleMute();
  }
}

function applySystemStartupStatus(status) {
  var control = document.getElementById('t-systemStartup');
  if (!control) return;
  var supported = !!(status && status.supported !== false);
  var available = !!(supported && status && status.ok === true);
  var enabled = !!(available && status.enabled === true);
  control.classList.toggle('on', enabled);
  control.classList.toggle('disabled', !available);
  control.setAttribute('aria-disabled', available ? 'false' : 'true');
  control.dataset.startupEnabled = enabled ? '1' : '0';
  control.dataset.startupStatus = available ? 'ready' : (supported ? 'error' : 'unsupported');
  if (!supported) control.title = '当前系统不支持开机自动启动';
  else if (!available) control.title = '暂时无法确认 Windows 开机启动状态';
  else if (status.systemDisabled) control.title = '启动项已被 Windows 禁用';
  else control.title = enabled ? '已随 Windows 登录自动启动' : '登录 Windows 后自动打开 Mineradio';
}

function refreshSystemStartupStatus() {
  var api = windowsShellApi();
  if (!api || typeof api.getStartupStatus !== 'function') {
    applySystemStartupStatus({ ok: false, supported: false, enabled: false });
    return Promise.resolve(false);
  }
  return Promise.resolve(api.getStartupStatus()).then(function (status) {
    applySystemStartupStatus(status);
    return !!(status && status.ok);
  }).catch(function (error) {
    console.warn('[WindowsShell] startup status failed:', error);
    applySystemStartupStatus({ ok: false, supported: true, enabled: false });
    return false;
  });
}

function toggleSystemStartup() {
  if (windowsStartupRequestPending) return;
  var api = windowsShellApi();
  var control = document.getElementById('t-systemStartup');
  if (!api || typeof api.setStartupEnabled !== 'function' || (control && control.getAttribute('aria-disabled') === 'true')) {
    showToast(control && control.dataset.startupStatus === 'error' ? '暂时无法确认开机启动状态' : '当前系统不支持开机自动启动');
    return;
  }
  var desired = !(control && control.dataset.startupEnabled === '1');
  windowsStartupRequestPending = true;
  if (control) control.classList.add('pending');
  Promise.resolve(api.setStartupEnabled(desired)).then(function (status) {
    applySystemStartupStatus(status);
    if (!status || status.ok !== true || status.enabled !== desired) throw new Error(status && status.error || 'STARTUP_UPDATE_FAILED');
    showToast(desired ? '开机自动启动已开启' : '开机自动启动已关闭');
  }).catch(function (error) {
    console.warn('[WindowsShell] startup update failed:', error);
    showToast('开机自动启动设置失败');
    refreshSystemStartupStatus();
  }).finally(function () {
    windowsStartupRequestPending = false;
    if (control) control.classList.remove('pending');
  });
}

function initWindowsShellControls() {
  var api = windowsShellApi();
  if (!api) {
    applySystemStartupStatus({ ok: false, supported: false, enabled: false });
    return false;
  }
  if (!windowsShellControlsInitialized) {
    windowsShellControlsInitialized = true;
    if (typeof api.onTrayCommand === 'function') api.onTrayCommand(runWindowsTrayCommand);
  }
  refreshSystemStartupStatus();
  syncWindowsTrayPlayback(true);
  return true;
}

window.toggleSystemStartup = toggleSystemStartup;
