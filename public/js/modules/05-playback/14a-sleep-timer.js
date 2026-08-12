var SLEEP_TIMER_STORE_KEY = 'mineradio-sleep-timer-v1';
var SLEEP_TIMER_ALLOWED_MINUTES = [15, 30, 60, 90];
var sleepTimerState = { mode: 'off', deadline: 0, minutes: 0 };
var sleepTimerTickId = 0;
var sleepTimerResumeTransitionsPending = false;

function normalizeSleepTimerState(value, now) {
  now = Number(now) || Date.now();
  if (!value || typeof value !== 'object') return { mode: 'off', deadline: 0, minutes: 0 };
  var deadline = Math.round(Number(value.deadline) || 0);
  var minutes = Math.round(Number(value.minutes) || 0);
  if (SLEEP_TIMER_ALLOWED_MINUTES.indexOf(minutes) < 0) minutes = 0;
  if (value.mode === 'deadline' && deadline > now) return { mode: 'deadline', deadline: deadline, minutes: minutes };
  return { mode: 'off', deadline: 0, minutes: 0 };
}

function readSleepTimerState(now) {
  try {
    var raw = localStorage.getItem(SLEEP_TIMER_STORE_KEY);
    return normalizeSleepTimerState(raw ? JSON.parse(raw) : null, now);
  } catch (_) {
    return { mode: 'off', deadline: 0, minutes: 0 };
  }
}

function persistSleepTimerState() {
  try {
    if (sleepTimerState.mode === 'deadline') localStorage.setItem(SLEEP_TIMER_STORE_KEY, JSON.stringify(sleepTimerState));
    else localStorage.removeItem(SLEEP_TIMER_STORE_KEY);
  } catch (_) { }
}

function sleepTimerRemainingMs(now) {
  if (sleepTimerState.mode !== 'deadline') return 0;
  return Math.max(0, sleepTimerState.deadline - (Number(now) || Date.now()));
}

function formatSleepTimerRemaining(milliseconds) {
  var totalSeconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;
  if (hours) return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  return minutes + ':' + String(seconds).padStart(2, '0');
}

function sleepTimerBadgeText(now) {
  if (sleepTimerState.mode === 'track-end') return '末';
  if (sleepTimerState.mode === 'stopping') return '··';
  var remaining = sleepTimerRemainingMs(now);
  if (!remaining) return '';
  return remaining < 60000 ? '<1' : String(Math.ceil(remaining / 60000));
}

function updateSleepTimerUi(now) {
  var control = document.getElementById('sleep-timer-control');
  var button = document.getElementById('sleep-timer-btn');
  var badge = document.getElementById('sleep-timer-badge');
  var status = document.getElementById('sleep-timer-status');
  if (!control || !button) return;
  var active = sleepTimerState.mode !== 'off';
  var statusText = '未设置';
  if (sleepTimerState.mode === 'track-end') statusText = '本曲播完后停止';
  else if (sleepTimerState.mode === 'stopping') statusText = '正在停止';
  else if (sleepTimerState.mode === 'deadline') statusText = '剩余 ' + formatSleepTimerRemaining(sleepTimerRemainingMs(now));
  control.classList.toggle('active', active);
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  button.title = active ? ('定时停播 · ' + statusText) : '定时停播';
  if (badge) {
    badge.textContent = sleepTimerBadgeText(now);
    badge.classList.toggle('show', active);
  }
  if (status) status.textContent = statusText;
  document.querySelectorAll('[data-sleep-timer-minutes]').forEach(function (option) {
    var minutes = Number(option.getAttribute('data-sleep-timer-minutes'));
    var selected = sleepTimerState.mode === 'deadline' && sleepTimerState.minutes === minutes;
    option.classList.toggle('active', selected);
    option.setAttribute('aria-pressed', selected ? 'true' : 'false');
    option.disabled = sleepTimerState.mode === 'stopping';
  });
  var trackEnd = document.querySelector('[data-sleep-timer-track-end]');
  if (trackEnd) {
    trackEnd.classList.toggle('active', sleepTimerState.mode === 'track-end');
    trackEnd.setAttribute('aria-pressed', sleepTimerState.mode === 'track-end' ? 'true' : 'false');
    trackEnd.disabled = sleepTimerState.mode === 'stopping';
  }
  var cancel = document.querySelector('[data-sleep-timer-cancel]');
  if (cancel) cancel.disabled = !active || sleepTimerState.mode === 'stopping';
}

function announceSleepTimer(message) {
  var announcer = document.getElementById('sleep-timer-announcer');
  if (announcer) announcer.textContent = String(message || '');
}

function setSleepTimerPanelOpen(open) {
  var control = document.getElementById('sleep-timer-control');
  var button = document.getElementById('sleep-timer-btn');
  if (!control || !button) return false;
  control.classList.toggle('open', !!open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open && control.contains(document.activeElement) && document.activeElement !== button) {
    try { button.focus({ preventScroll: true }); } catch (_) { button.focus(); }
  }
  return !!open;
}

function toggleSleepTimerPanel(event) {
  if (event) event.stopPropagation();
  var control = document.getElementById('sleep-timer-control');
  if (!control) return;
  var nextOpen = !control.classList.contains('open');
  document.querySelectorAll('.volume-control.open,.listening-effects-control.open,.quality-control.open,.sleep-timer-control.open,.playback-tuning-control.open').forEach(function (node) {
    if (node !== control) node.classList.remove('open');
  });
  if (typeof setPlaybackTuningPanelOpen === 'function') setPlaybackTuningPanelOpen(false);
  setSleepTimerPanelOpen(nextOpen);
  if (nextOpen && typeof positionPlayerNestedToolPanel === 'function') {
    positionPlayerNestedToolPanel(control, '.sleep-timer-popover');
  }
}

function sleepTimerCancelUpcomingTransitions(reason) {
  if (typeof resetCuefieldAutoMix === 'function') resetCuefieldAutoMix(reason || 'sleep-timer');
  if (
    typeof albumGaplessState !== 'undefined'
    && albumGaplessState
    && albumGaplessState.preload
    && albumGaplessState.preload.mixStarted
    && typeof restoreAlbumGaplessOutgoingIfCurrent === 'function'
  ) restoreAlbumGaplessOutgoingIfCurrent(albumGaplessState.preload, 120);
  if (typeof clearAlbumGaplessPreload === 'function') clearAlbumGaplessPreload(reason || 'sleep-timer');
}

function sleepTimerResumeUpcomingTransitions(reason) {
  if (!audio || audio.ended) {
    sleepTimerResumeTransitionsPending = false;
    return false;
  }
  if (audio.paused) {
    sleepTimerResumeTransitionsPending = true;
    return false;
  }
  sleepTimerResumeTransitionsPending = false;
  if (typeof scheduleCuefieldAutoMixPrepare === 'function' && typeof cuefieldAutoMixEnabled !== 'undefined' && cuefieldAutoMixEnabled) {
    scheduleCuefieldAutoMixPrepare(trackSwitchToken, currentIdx, 320);
  }
  if (typeof scheduleAlbumGaplessPreloadForCurrent === 'function') {
    Promise.resolve(scheduleAlbumGaplessPreloadForCurrent(trackSwitchToken, reason || 'sleep-timer-resume')).catch(function () { });
  }
  return true;
}

function resumeSleepTimerTransitionsAfterPlaybackStart() {
  if (!sleepTimerResumeTransitionsPending) return false;
  return sleepTimerResumeUpcomingTransitions('sleep-timer-playback-resumed');
}

function setSleepTimerMinutes(minutes) {
  if (sleepTimerState.mode === 'stopping') return false;
  minutes = Math.round(Number(minutes) || 0);
  if (SLEEP_TIMER_ALLOWED_MINUTES.indexOf(minutes) < 0) return false;
  var resumeTransitions = sleepTimerState.mode === 'track-end';
  sleepTimerState = { mode: 'deadline', deadline: Date.now() + minutes * 60000, minutes: minutes };
  persistSleepTimerState();
  updateSleepTimerUi();
  if (resumeTransitions) sleepTimerResumeUpcomingTransitions('sleep-timer-minutes');
  announceSleepTimer('已设置 ' + minutes + ' 分钟后停止播放');
  if (typeof showToast === 'function') showToast('将在 ' + minutes + ' 分钟后停止播放');
  return true;
}

function setSleepTimerTrackEnd() {
  if (sleepTimerState.mode === 'stopping') return false;
  if (!audio || !audio.src || audio.ended) {
    if (typeof showToast === 'function') showToast('请先播放一首歌曲');
    return false;
  }
  sleepTimerCancelUpcomingTransitions('sleep-timer-track-end');
  sleepTimerState = { mode: 'track-end', deadline: 0, minutes: 0 };
  persistSleepTimerState();
  updateSleepTimerUi();
  announceSleepTimer('已设置本曲播完后停止');
  if (typeof showToast === 'function') showToast('将在本曲播完后停止');
  return true;
}

function cancelSleepTimer(options) {
  options = options || {};
  if (sleepTimerState.mode === 'stopping') return false;
  var wasActive = sleepTimerState.mode !== 'off';
  var resumeTransitions = sleepTimerState.mode === 'track-end';
  sleepTimerState = { mode: 'off', deadline: 0, minutes: 0 };
  persistSleepTimerState();
  updateSleepTimerUi();
  if (resumeTransitions) sleepTimerResumeUpcomingTransitions('sleep-timer-cancel');
  if (wasActive) announceSleepTimer('定时停播已取消');
  if (wasActive && !options.silent && typeof showToast === 'function') showToast('定时停播已取消');
  return wasActive;
}

function sleepTimerBlocksUpcomingTransition() {
  return sleepTimerState.mode === 'track-end' || sleepTimerState.mode === 'stopping';
}

function consumeSleepTimerOnTrackEnd() {
  if (sleepTimerState.mode === 'stopping') {
    playing = false;
    if (typeof setPlayIcon === 'function') setPlayIcon(false);
    return true;
  }
  if (sleepTimerState.mode !== 'track-end') return false;
  sleepTimerCancelUpcomingTransitions('sleep-timer-complete');
  sleepTimerState = { mode: 'off', deadline: 0, minutes: 0 };
  persistSleepTimerState();
  playing = false;
  if (typeof setPlayIcon === 'function') setPlayIcon(false);
  if (typeof updateListenStatsTick === 'function') updateListenStatsTick(true);
  if (typeof syncPlaybackStateFromAudioEvent === 'function') syncPlaybackStateFromAudioEvent('sleep-timer-track-end');
  updateSleepTimerUi();
  announceSleepTimer('本曲已播完，播放已停止');
  if (typeof showToast === 'function') showToast('本曲已播完，播放已停止');
  return true;
}

async function executeSleepTimerDeadline(now) {
  var timestamp = Number(now) || Date.now();
  if (sleepTimerState.mode !== 'deadline' || sleepTimerState.deadline > timestamp) return false;
  var expiredState = sleepTimerState;
  sleepTimerState = { mode: 'stopping', deadline: expiredState.deadline, minutes: expiredState.minutes };
  updateSleepTimerUi(timestamp);
  sleepTimerCancelUpcomingTransitions('sleep-timer-deadline');
  try {
    if (audio && !audio.paused && !audio.ended) {
      if (typeof fadeOutAndPauseAudio === 'function') await fadeOutAndPauseAudio();
      else audio.pause();
    }
  } catch (error) {
    console.warn('[SleepTimer] fade stop failed:', error && (error.message || error));
  }
  if (audio && !audio.paused && !audio.ended) {
    try { audio.pause(); } catch (_) { }
  }
  if (typeof restorePlaybackGain === 'function') restorePlaybackGain();
  playing = false;
  if (typeof setPlayIcon === 'function') setPlayIcon(false);
  if (typeof updateListenStatsTick === 'function') updateListenStatsTick(true);
  if (typeof syncPlaybackStateFromAudioEvent === 'function') syncPlaybackStateFromAudioEvent('sleep-timer-deadline');
  sleepTimerState = { mode: 'off', deadline: 0, minutes: 0 };
  persistSleepTimerState();
  updateSleepTimerUi(timestamp);
  announceSleepTimer('定时结束，播放已停止');
  if (typeof showToast === 'function') showToast('定时结束，播放已停止');
  return true;
}

function tickSleepTimer() {
  if (sleepTimerState.mode === 'deadline' && sleepTimerRemainingMs() <= 0) {
    Promise.resolve(executeSleepTimerDeadline()).catch(function (error) {
      console.warn('[SleepTimer]', error && (error.message || error));
    });
    return;
  }
  updateSleepTimerUi();
}

function bindSleepTimerControls() {
  document.querySelectorAll('[data-sleep-timer-minutes]').forEach(function (button) {
    button.addEventListener('click', function () {
      setSleepTimerMinutes(button.getAttribute('data-sleep-timer-minutes'));
    });
  });
  var trackEnd = document.querySelector('[data-sleep-timer-track-end]');
  if (trackEnd) trackEnd.addEventListener('click', setSleepTimerTrackEnd);
  var cancel = document.querySelector('[data-sleep-timer-cancel]');
  if (cancel) cancel.addEventListener('click', function () { cancelSleepTimer(); });
  document.addEventListener('click', function (event) {
    var control = document.getElementById('sleep-timer-control');
    if (control && !control.contains(event.target)) setSleepTimerPanelOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setSleepTimerPanelOpen(false);
  });
}

function initSleepTimer() {
  sleepTimerState = readSleepTimerState();
  persistSleepTimerState();
  bindSleepTimerControls();
  updateSleepTimerUi();
  if (sleepTimerTickId) clearInterval(sleepTimerTickId);
  sleepTimerTickId = setInterval(tickSleepTimer, 1000);
}
