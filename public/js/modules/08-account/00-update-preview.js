// ============================================================
// GitHub release updates: check quietly, explain in-app, open
// the official Release page only. No local download or patching.
// ============================================================
var UPDATE_IGNORED_VERSION_KEY = 'mineradio-update-ignored-version-v1';
var UPDATE_RELEASE_ORIGIN = 'https://github.com';
var UPDATE_RELEASE_PATH = '/Mineradio-Next/Mineradio-Next/releases';
var updatePanelCloseTimer = null;

function normalizedUpdateVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').replace(/[+].*$/, '').replace(/-.+$/, '');
}

function isSafeUpdatePageUrl(value) {
  var raw = String(value || '').trim();
  if (!raw || raw.length > 2048) return false;
  try {
    var parsed = new URL(raw);
    return parsed.origin === UPDATE_RELEASE_ORIGIN
      && !parsed.port && !parsed.username && !parsed.password
      && (parsed.pathname === UPDATE_RELEASE_PATH || parsed.pathname.indexOf(UPDATE_RELEASE_PATH + '/') === 0);
  } catch (e) {
    return false;
  }
}

function readIgnoredUpdateVersion() {
  try {
    return normalizedUpdateVersion(localStorage.getItem(UPDATE_IGNORED_VERSION_KEY));
  } catch (e) {
    return '';
  }
}

function writeIgnoredUpdateVersion(version) {
  var normalized = normalizedUpdateVersion(version);
  try {
    if (normalized) localStorage.setItem(UPDATE_IGNORED_VERSION_KEY, normalized);
    else localStorage.removeItem(UPDATE_IGNORED_VERSION_KEY);
  } catch (e) { }
  updatePreviewState.ignoredVersion = normalized;
  updatePreviewState.ignored = !!normalized && normalized === normalizedUpdateVersion(updatePreviewState.version);
}

function currentUpdateReleaseUrl() {
  return isSafeUpdatePageUrl(updatePreviewState.releaseUrl) ? updatePreviewState.releaseUrl : '';
}

function updateEntryElement() {
  return document.getElementById('update-entry');
}

function syncUpdateEntryState() {
  var entry = updateEntryElement();
  if (!entry) return;
  var available = !!updatePreviewState.updateAvailable && !updatePreviewState.ignored;
  entry.classList.add('present');
  entry.classList.toggle('available', available);
  entry.classList.toggle('checking', updatePreviewState.checkStatus === 'checking');
  entry.classList.toggle('ignored', !!updatePreviewState.updateAvailable && updatePreviewState.ignored);
  entry.title = available
    ? '发现 Mineradio Next ' + updatePreviewState.version
    : (updatePreviewState.ignored ? '已忽略 ' + updatePreviewState.version + '，点击查看' : '检查更新');
  entry.setAttribute('aria-label', entry.title);
}

function initUpdatePreview() {
  if (updatePreviewState.initialized) return;
  updatePreviewState.initialized = true;
  updatePreviewState.ignoredVersion = readIgnoredUpdateVersion();
  syncUpdateEntryState();
  renderUpdatePreviewPanel('idle');
  checkLatestUpdate({ manual: false });
}

async function checkLatestUpdate(options) {
  options = options || {};
  if (updatePreviewState.checkStatus === 'checking') return;
  var manual = options.manual === true;
  updatePreviewState.manualCheck = manual;
  updatePreviewState.checkStatus = 'checking';
  updatePreviewState.errorReason = '';
  syncUpdateEntryState();
  if (manual) {
    renderUpdatePreviewPanel('checking');
    showUpdateModal();
  }
  try {
    var data = await apiJson('/api/update/latest?t=' + Date.now());
    if (data && data.checkFailed) throw new Error(data.reason || data.error || 'UPDATE_CHECK_FAILED');
    applyLatestUpdateInfo(data);
    updatePreviewState.checkStatus = 'ready';
    syncUpdateEntryState();
    if (manual || updatePreviewState.open) {
      renderUpdatePreviewPanel(updatePreviewState.updateAvailable ? (updatePreviewState.ignored ? 'ignored' : 'release') : 'latest');
    }
  } catch (e) {
    updatePreviewState.checkStatus = 'error';
    updatePreviewState.errorReason = String(e && e.message || 'UPDATE_CHECK_FAILED');
    syncUpdateEntryState();
    if (manual || updatePreviewState.open) renderUpdatePreviewPanel('error');
  } finally {
    updatePreviewState.manualCheck = false;
  }
}

function applyLatestUpdateInfo(data) {
  data = data || {};
  var release = data.release || {};
  updatePreviewState.currentVersion = normalizedUpdateVersion(data.currentVersion || updatePreviewState.currentVersion) || updatePreviewState.currentVersion;
  updatePreviewState.version = normalizedUpdateVersion(data.latestVersion || release.version || updatePreviewState.currentVersion) || updatePreviewState.currentVersion;
  updatePreviewState.configured = !!data.configured;
  updatePreviewState.preview = !!data.preview;
  updatePreviewState.updateAvailable = !!data.updateAvailable;
  updatePreviewState.releaseUrl = isSafeUpdatePageUrl(release.htmlUrl || data.htmlUrl) ? String(release.htmlUrl || data.htmlUrl).trim() : '';
  updatePreviewState.hero = cleanUpdateCopy(release.summary || data.summary, 72);
  updatePreviewState.notes = normalizeUpdateNotes(release.notes || data.notes);
  updatePreviewState.ignoredVersion = readIgnoredUpdateVersion();
  updatePreviewState.ignored = updatePreviewState.updateAvailable
    && updatePreviewState.ignoredVersion === normalizedUpdateVersion(updatePreviewState.version);
}

function cleanUpdateCopy(value, maxLength) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 96);
}

function normalizeUpdateNotes(values) {
  var seen = Object.create(null);
  var heroKey = cleanUpdateCopy(updatePreviewState.hero, 72).toLowerCase();
  return (Array.isArray(values) ? values : [])
    .map(function (item) {
      if (item && typeof item === 'object') {
        return {
          title: cleanUpdateCopy(item.title || item.name, 28),
          detail: cleanUpdateCopy(item.detail || item.description || item.text, 64)
        };
      }
      var text = cleanUpdateCopy(item, 72);
      var split = text.match(/^(.{2,24}?)[：:]\s*(.+)$/);
      return split ? { title: split[1], detail: split[2] } : { title: text, detail: '' };
    })
    .filter(function (item) {
      var key = (item.title + '|' + item.detail).toLowerCase();
      if (!item.title || seen[key] || (!item.detail && item.title.toLowerCase() === heroKey)) return false;
      seen[key] = true;
      return true;
    })
    .slice(0, 3);
}

function updateFallbackNotes() {
  return [
    { title: '播放体验更稳定', detail: '修复影响连续播放和来源切换的问题' },
    { title: '界面细节更统一', detail: '改善常用操作的排版与反馈' },
    { title: 'Windows 体验优化', detail: '修复桌面端已知问题' }
  ];
}

function openUpdatePanel() {
  if (!updatePreviewState.initialized) initUpdatePreview();
  if (updatePreviewState.checkStatus === 'checking') {
    renderUpdatePreviewPanel('checking');
    showUpdateModal();
    return;
  }
  if (updatePreviewState.checkStatus === 'idle' || updatePreviewState.checkStatus === 'error') {
    checkLatestUpdate({ manual: true });
    return;
  }
  var view = updatePreviewState.updateAvailable ? (updatePreviewState.ignored ? 'ignored' : 'release') : 'latest';
  renderUpdatePreviewPanel(view);
  showUpdateModal();
}

function showUpdateModal() {
  var mask = document.getElementById('update-modal');
  if (!mask) return;
  if (updatePanelCloseTimer) {
    clearTimeout(updatePanelCloseTimer);
    updatePanelCloseTimer = null;
  }
  if (mask.classList.contains('show')) {
    animateUpdatePanelContents();
    return;
  }
  mask.setAttribute('aria-hidden', 'false');
  openGsapModal(mask);
  updatePreviewState.open = true;
  animateUpdatePanelContents();
}

function closeUpdatePanel() {
  if (updatePanelCloseTimer) {
    clearTimeout(updatePanelCloseTimer);
    updatePanelCloseTimer = null;
  }
  closeUpdateMoreMenu();
  var mask = document.getElementById('update-modal');
  closeGsapModal(mask, function () {
    updatePreviewState.open = false;
    if (mask) mask.setAttribute('aria-hidden', 'true');
  });
}

function renderUpdatePreviewPanel(view) {
  view = view || (updatePreviewState.updateAvailable ? 'release' : 'latest');
  var modal = document.querySelector('#update-modal .update-modal');
  var releaseContent = document.getElementById('update-release-content');
  var statusContent = document.getElementById('update-status-content');
  if (!modal || !releaseContent || !statusContent) return;
  modal.dataset.updateView = view;
  var releaseVisible = view === 'release';
  releaseContent.hidden = !releaseVisible;
  statusContent.hidden = releaseVisible;
  if (releaseVisible) renderUpdateReleaseContent();
  else renderUpdateStatusContent(view);
}

function renderUpdateReleaseContent() {
  var version = document.getElementById('update-modal-version');
  var hero = document.getElementById('update-hero-main');
  var sub = document.getElementById('update-hero-sub');
  var list = document.getElementById('update-list');
  var primary = document.getElementById('update-primary-btn');
  if (version) version.textContent = updatePreviewState.version;
  if (hero) hero.textContent = updatePreviewState.hero || '音乐不间断，细节更顺手';
  if (sub) sub.textContent = '这一版集中改善播放稳定性和 Windows 桌面体验';
  var notes = updatePreviewState.notes.length ? updatePreviewState.notes : updateFallbackNotes();
  if (list) {
    list.innerHTML = notes.map(function (item, index) {
      return '<article class="update-item"><span class="update-item-index">'
        + String(index + 1).padStart(2, '0')
        + '</span><div><strong>' + escHtml(item.title) + '</strong>'
        + (item.detail ? '<span>' + escHtml(item.detail) + '</span>' : '')
        + '</div></article>';
    }).join('');
  }
  if (primary) primary.disabled = !currentUpdateReleaseUrl();
}

function renderUpdateStatusContent(view) {
  var icon = document.getElementById('update-status-icon');
  var title = document.getElementById('update-status-title');
  var copy = document.getElementById('update-status-copy');
  var primary = document.getElementById('update-status-primary');
  var restore = document.getElementById('update-restore-btn');
  if (!icon || !title || !copy || !primary || !restore) return;
  restore.hidden = true;
  primary.textContent = '知道了';
  primary.onclick = closeUpdatePanel;
  if (view === 'checking') {
    icon.textContent = '';
    icon.className = 'update-status-icon checking';
    title.textContent = '正在检查更新';
    copy.textContent = '正在连接 GitHub Releases';
    primary.textContent = '关闭';
  } else if (view === 'error') {
    icon.textContent = '↻';
    icon.className = 'update-status-icon error';
    title.textContent = '暂时无法检查更新';
    copy.textContent = '不会影响播放，恢复网络后可以重新检查';
    primary.textContent = '重新检查';
    primary.onclick = function () { checkLatestUpdate({ manual: true }); };
  } else if (view === 'ignored') {
    icon.textContent = '–';
    icon.className = 'update-status-icon ignored';
    title.textContent = '已忽略 ' + updatePreviewState.version;
    copy.textContent = '更高版本发布后仍会正常提醒';
    restore.hidden = false;
  } else {
    icon.textContent = '✓';
    icon.className = 'update-status-icon';
    title.textContent = '已经是最新版本';
    copy.textContent = '当前使用 Mineradio Next ' + updatePreviewState.currentVersion;
  }
}

function remindUpdateLater() {
  updatePreviewState.remindedLater = true;
  closeUpdatePanel();
}

function ignoreCurrentUpdateVersion() {
  if (!updatePreviewState.updateAvailable) return;
  writeIgnoredUpdateVersion(updatePreviewState.version);
  closeUpdateMoreMenu();
  syncUpdateEntryState();
  renderUpdatePreviewPanel('ignored');
  if (typeof showToast === 'function') showToast('已忽略 ' + updatePreviewState.version + '，更高版本仍会提醒');
}

function restoreIgnoredUpdateVersion() {
  writeIgnoredUpdateVersion('');
  syncUpdateEntryState();
  renderUpdatePreviewPanel(updatePreviewState.updateAvailable ? 'release' : 'latest');
  if (typeof showToast === 'function') showToast('版本提醒已恢复');
}

function toggleUpdateMoreMenu(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  var menu = document.getElementById('update-more-menu');
  var button = document.getElementById('update-more-btn');
  if (!menu || !button) return;
  var opening = menu.hidden;
  menu.hidden = !opening;
  button.setAttribute('aria-expanded', opening ? 'true' : 'false');
}

function closeUpdateMoreMenu() {
  var menu = document.getElementById('update-more-menu');
  var button = document.getElementById('update-more-btn');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

async function copyCurrentUpdateAddress() {
  var target = currentUpdateReleaseUrl();
  if (!target) return;
  closeUpdateMoreMenu();
  try {
    await navigator.clipboard.writeText(target);
    if (typeof showToast === 'function') showToast('更新地址已复制');
  } catch (e) {
    if (typeof showToast === 'function') showToast('暂时无法复制更新地址');
  }
}

async function openCurrentUpdateRelease() {
  if (updatePreviewState.status === 'opening') return;
  var target = currentUpdateReleaseUrl();
  if (!target) {
    if (typeof showToast === 'function') showToast('这个版本还没有可用的 Release 页面');
    return;
  }
  updatePreviewState.status = 'opening';
  var button = document.getElementById('update-primary-btn');
  var label = document.getElementById('update-btn-label');
  if (button) button.disabled = true;
  if (label) label.textContent = '正在打开 GitHub';
  try {
    var result = window.desktopWindow && typeof window.desktopWindow.openUpdatePage === 'function'
      ? await window.desktopWindow.openUpdatePage(target)
      : { ok: !!window.open(target, '_blank', 'noopener') };
    if (!result || result.ok === false) throw new Error(result && result.error || 'OPEN_UPDATE_PAGE_FAILED');
    if (label) label.textContent = 'GitHub 页面已打开';
    if (typeof showToast === 'function') showToast('已在系统浏览器打开官方 Release 页面');
    updatePanelCloseTimer = setTimeout(function () {
      updatePanelCloseTimer = null;
      closeUpdatePanel();
    }, 520);
  } catch (e) {
    if (label) label.textContent = '重试打开 GitHub';
    if (typeof showToast === 'function') showToast('暂时无法打开 GitHub Release 页面');
  } finally {
    updatePreviewState.status = 'idle';
    if (button) button.disabled = !target;
  }
}

function animateUpdatePanelContents() {
  if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var modal = document.querySelector('#update-modal .update-modal');
  if (!modal) return;
  var parts = modal.querySelectorAll('[hidden] *');
  if (parts && parts.length) window.gsap.set(parts, { clearProps: 'all' });
  var visible = modal.querySelectorAll(
    '.update-release-content:not([hidden]) > *, .update-status-content:not([hidden]) > *'
  );
  if (!visible.length) return;
  window.gsap.fromTo(visible,
    { autoAlpha: 0, y: 6, filter: 'blur(3px)' },
    { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.24, stagger: 0.025, ease: 'power3.out', delay: 0.03, overwrite: true }
  );
}

document.addEventListener('click', function (event) {
  var menu = document.getElementById('update-more-menu');
  var button = document.getElementById('update-more-btn');
  if (!menu || menu.hidden) return;
  if (menu.contains(event.target) || (button && button.contains(event.target))) return;
  closeUpdateMoreMenu();
});
