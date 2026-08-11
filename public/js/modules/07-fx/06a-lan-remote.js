var lanRemoteModalTimer = 0;
var lanRemoteStateTimer = 0;
var lanRemoteStatusTimer = 0;
var lanRemoteCommandUnsubscribe = null;
var lanRemoteLastSnapshot = '';
var lanRemoteCurrentStatus = { enabled: false };

function lanRemoteApi() {
  return typeof getDesktopWindowApi === 'function' ? getDesktopWindowApi() : (window.desktopWindow || null);
}

function lanRemoteText(value, fallback) {
  value = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return value || fallback || '';
}

function lanRemoteArtist(song) {
  if (!song) return 'Mineradio';
  if (Array.isArray(song.artists)) return song.artists.map(function (item) { return item && (item.name || item.artist) || ''; }).filter(Boolean).join(' / ') || '未知歌手';
  if (Array.isArray(song.ar)) return song.ar.map(function (item) { return item && item.name || ''; }).filter(Boolean).join(' / ') || '未知歌手';
  return lanRemoteText(song.artist || song.artists || song.singer, '未知歌手');
}

function lanRemoteAlbum(song) {
  if (!song) return '';
  var album = song.album || song.al || {};
  return lanRemoteText(typeof album === 'string' ? album : (album.name || song.albumName), '');
}

function lanRemoteCover(song) {
  if (!song) return '';
  var album = song.album || song.al || {};
  return lanRemoteText(song.customCover || song.cover || song.picUrl || song.albumPic || (album && (album.picUrl || album.cover)), '');
}

function lanRemoteCurrentSong() {
  if (typeof currentCoverSong === 'function') {
    var coverSong = currentCoverSong();
    if (coverSong) return coverSong;
  }
  return Array.isArray(playQueue) && currentIdx >= 0 && currentIdx < playQueue.length ? playQueue[currentIdx] : null;
}

function buildLanRemotePlaybackState() {
  var song = lanRemoteCurrentSong();
  var queue = Array.isArray(playQueue) ? playQueue : [];
  var upcoming = [];
  for (var offset = 1; offset <= 3 && queue.length > 1; offset += 1) {
    var index = currentIdx + offset;
    if (index >= queue.length) break;
    var item = queue[index];
    if (!item) continue;
    upcoming.push({ title: lanRemoteText(item.name || item.title, '未知歌曲'), artist: lanRemoteArtist(item) });
  }
  return {
    playing: !!(audio && !audio.paused && !audio.ended),
    title: lanRemoteText(song && (song.name || song.title), '等待播放'),
    artist: lanRemoteArtist(song),
    album: lanRemoteAlbum(song),
    volume: typeof targetVolume === 'number' ? targetVolume : 0.8,
    currentTime: audio && isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: audio && isFinite(audio.duration) ? audio.duration : 0,
    queueLength: queue.length,
    upcoming: upcoming,
    coverSource: lanRemoteCover(song),
    updatedAt: Date.now()
  };
}

function pushLanRemotePlaybackState(force) {
  var api = lanRemoteApi();
  if (!api || typeof api.updateLanRemoteState !== 'function') return;
  var payload = buildLanRemotePlaybackState();
  var signature = JSON.stringify(Object.assign({}, payload, {
    currentTime: Math.floor(payload.currentTime * 2) / 2,
    updatedAt: 0
  }));
  if (!force && signature === lanRemoteLastSnapshot) return;
  lanRemoteLastSnapshot = signature;
  api.updateLanRemoteState(payload);
}

function handleLanRemoteCommand(command) {
  if (!command || !command.type) return;
  if (command.type === 'play') {
    if (!audio || audio.paused || audio.ended) Promise.resolve(togglePlay()).catch(function () {});
  } else if (command.type === 'pause') {
    if (audio && !audio.paused && !audio.ended) Promise.resolve(togglePlay()).catch(function () {});
  } else if (command.type === 'next') {
    nextTrack(true);
  } else if (command.type === 'previous') {
    prevTrack(true);
  } else if (command.type === 'volume') {
    setVolume(command.value, true);
  }
  setTimeout(function () { pushLanRemotePlaybackState(true); }, command.type === 'volume' ? 40 : 180);
}

function ensureLanRemoteControlButton() {
  if (document.getElementById('lan-remote-control-btn')) return;
  var panel = document.getElementById('fx-panel');
  var head = panel && panel.querySelector('.fx-head');
  if (!head) return;
  var actions = head.querySelector('.fx-head-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'fx-head-actions';
    head.appendChild(actions);
  }
  var button = document.createElement('button');
  button.id = 'lan-remote-control-btn';
  button.className = 'fx-mini-btn ghost';
  button.type = 'button';
  button.textContent = '设备';
  button.title = '打开随身控制';
  button.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    openLanRemoteControl();
  });
  actions.appendChild(button);
}

function ensureLanRemoteModal() {
  var modal = document.getElementById('lan-remote-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'lan-remote-modal';
  modal.className = 'lan-remote-modal';
  modal.innerHTML =
    '<div class="lan-remote-dialog" role="dialog" aria-modal="true" aria-labelledby="lan-remote-title">' +
    '<div class="lan-remote-head"><div><div class="lan-remote-kicker">MINERADIO · LOCAL DEVICE</div><div id="lan-remote-title" class="lan-remote-title">随身控制</div></div>' +
    '<button class="lan-remote-close" type="button" aria-label="关闭随身控制">×</button></div>' +
    '<div id="lan-remote-idle" class="lan-remote-idle">' +
    '<div class="lan-remote-route" aria-hidden="true"><div><i class="computer"></i><span>本机</span></div><b></b><div><i class="wifi"></i><span>同一 Wi-Fi</span></div><b></b><div><i class="phone"></i><span>手机</span></div></div>' +
    '<p>开启后生成一次性连接，主音乐服务仍只在这台电脑上运行。</p></div>' +
    '<div id="lan-remote-active" class="lan-remote-active" hidden>' +
    '<div class="lan-remote-qr"><img id="lan-remote-qr-image" alt="随身控制二维码"></div>' +
    '<div class="lan-remote-session"><div class="lan-remote-session-state"><i></i><span id="lan-remote-state-label">等待手机连接</span></div>' +
    '<div class="lan-remote-address"><small>局域网地址</small><strong id="lan-remote-address-text">—</strong></div>' +
    '<div class="lan-remote-session-grid"><div><small>设备</small><strong id="lan-remote-clients">0</strong></div><div><small>剩余</small><strong id="lan-remote-expiry">—</strong></div></div>' +
    '<button id="lan-remote-copy" class="lan-remote-copy" type="button">复制连接</button></div></div>' +
    '<div id="lan-remote-error" class="lan-remote-error" hidden></div>' +
    '<div class="lan-remote-foot"><span>只允许播放控制，不同步账号和音频地址。</span>' +
    '<div><button id="lan-remote-stop" class="lan-remote-secondary" type="button" hidden>停用</button><button id="lan-remote-start" class="lan-remote-primary" type="button">开启随身控制</button></div></div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function (event) {
    if (event.target === modal || event.target.closest('.lan-remote-close')) closeLanRemoteControl();
  });
  modal.querySelector('#lan-remote-start').addEventListener('click', startLanRemoteControl);
  modal.querySelector('#lan-remote-stop').addEventListener('click', stopLanRemoteControl);
  modal.querySelector('#lan-remote-copy').addEventListener('click', copyLanRemoteConnection);
  return modal;
}

function lanRemoteErrorText(error) {
  var code = String(error || '');
  if (code === 'REMOTE_NO_LAN_ADDRESS') return '没有找到可用的局域网地址，请先连接 Wi-Fi 或有线网络。';
  if (code === 'REMOTE_UNTRUSTED_SENDER') return '当前窗口无法开启随身控制。';
  return '随身控制暂时没有启动，请稍后重试。';
}

function lanRemoteRemaining(expiresAt) {
  var remaining = Math.max(0, Number(expiresAt) - Date.now());
  if (!remaining) return '已结束';
  var hours = Math.floor(remaining / 3600000);
  var minutes = Math.max(1, Math.ceil((remaining % 3600000) / 60000));
  return hours ? hours + 'h ' + minutes + 'm' : minutes + 'm';
}

function renderLanRemoteStatus(status) {
  lanRemoteCurrentStatus = status || { enabled: false };
  var modal = ensureLanRemoteModal();
  var active = lanRemoteCurrentStatus.enabled === true;
  var idle = modal.querySelector('#lan-remote-idle');
  var activePanel = modal.querySelector('#lan-remote-active');
  var error = modal.querySelector('#lan-remote-error');
  var start = modal.querySelector('#lan-remote-start');
  var stop = modal.querySelector('#lan-remote-stop');
  idle.hidden = active;
  activePanel.hidden = !active;
  start.hidden = active;
  stop.hidden = !active;
  error.hidden = !lanRemoteCurrentStatus.error;
  error.textContent = lanRemoteCurrentStatus.error ? lanRemoteErrorText(lanRemoteCurrentStatus.error) : '';
  modal.classList.toggle('session-active', active);
  if (!active) return;
  modal.querySelector('#lan-remote-qr-image').src = lanRemoteCurrentStatus.qrDataUrl || '';
  modal.querySelector('#lan-remote-address-text').textContent = lanRemoteCurrentStatus.displayAddress || '—';
  modal.querySelector('#lan-remote-clients').textContent = String(Number(lanRemoteCurrentStatus.clients) || 0);
  modal.querySelector('#lan-remote-expiry').textContent = lanRemoteRemaining(lanRemoteCurrentStatus.expiresAt);
  modal.querySelector('#lan-remote-state-label').textContent = lanRemoteCurrentStatus.clients > 0 ? '手机已连接' : '等待手机连接';
  modal.classList.toggle('has-client', lanRemoteCurrentStatus.clients > 0);
}

function refreshLanRemoteStatus() {
  var api = lanRemoteApi();
  if (!api || typeof api.getLanRemoteStatus !== 'function') return Promise.resolve({ ok: false, enabled: false, error: 'REMOTE_DESKTOP_ONLY' });
  return Promise.resolve(api.getLanRemoteStatus()).then(function (status) {
    renderLanRemoteStatus(status);
    return status;
  }).catch(function (error) {
    var result = { ok: false, enabled: false, error: String(error && error.message || error) };
    renderLanRemoteStatus(result);
    return result;
  });
}

function startLanRemoteControl() {
  var api = lanRemoteApi();
  var modal = ensureLanRemoteModal();
  var button = modal.querySelector('#lan-remote-start');
  if (!api || typeof api.startLanRemote !== 'function' || button.disabled) return;
  button.disabled = true;
  button.textContent = '正在开启…';
  pushLanRemotePlaybackState(true);
  Promise.resolve(api.startLanRemote()).then(function (status) {
    renderLanRemoteStatus(status);
    if (status && status.enabled) showToast('随身控制已开启');
  }).catch(function (error) {
    renderLanRemoteStatus({ ok: false, enabled: false, error: String(error && error.message || error) });
  }).finally(function () {
    button.disabled = false;
    button.textContent = '开启随身控制';
  });
}

function stopLanRemoteControl() {
  var api = lanRemoteApi();
  if (!api || typeof api.stopLanRemote !== 'function') return;
  Promise.resolve(api.stopLanRemote()).then(function (status) {
    renderLanRemoteStatus(status);
    showToast('随身控制已停用');
  }).catch(function () {
    renderLanRemoteStatus({ ok: false, enabled: false, error: 'REMOTE_STOP_FAILED' });
  });
}

function copyLanRemoteConnection() {
  var url = lanRemoteCurrentStatus && lanRemoteCurrentStatus.primaryUrl;
  var api = lanRemoteApi();
  if (!url || !api || typeof api.copyText !== 'function') return;
  api.copyText(url);
  showToast('连接已复制');
}

function openLanRemoteControl() {
  var modal = ensureLanRemoteModal();
  clearTimeout(lanRemoteModalTimer);
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  refreshLanRemoteStatus();
  clearInterval(lanRemoteStatusTimer);
  lanRemoteStatusTimer = setInterval(refreshLanRemoteStatus, 1400);
}

function closeLanRemoteControl() {
  var modal = document.getElementById('lan-remote-modal');
  if (!modal) return;
  clearInterval(lanRemoteStatusTimer);
  lanRemoteStatusTimer = 0;
  modal.classList.add('closing');
  lanRemoteModalTimer = setTimeout(function () {
    modal.classList.remove('show', 'closing');
    modal.setAttribute('aria-hidden', 'true');
  }, 220);
}

function bindLanRemoteControl() {
  ensureLanRemoteControlButton();
  ensureLanRemoteModal();
  var api = lanRemoteApi();
  if (api && typeof api.onLanRemoteCommand === 'function' && !lanRemoteCommandUnsubscribe) {
    lanRemoteCommandUnsubscribe = api.onLanRemoteCommand(handleLanRemoteCommand);
  }
  clearInterval(lanRemoteStateTimer);
  pushLanRemotePlaybackState(true);
  lanRemoteStateTimer = setInterval(function () { pushLanRemotePlaybackState(false); }, 700);
}

document.addEventListener('keydown', function (event) {
  var modal = document.getElementById('lan-remote-modal');
  if (event.key !== 'Escape' || !modal || !modal.classList.contains('show')) return;
  event.preventDefault();
  event.stopPropagation();
  closeLanRemoteControl();
}, true);
