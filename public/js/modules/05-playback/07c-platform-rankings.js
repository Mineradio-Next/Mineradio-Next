'use strict';

var HOME_PLATFORM_RANKING_PROVIDERS = ['all', 'netease', 'qq', 'kugou', 'kuwo', 'migu'];
var homePlatformRankingState = {
  provider: 'all',
  songs: [],
  loading: false,
  error: '',
  requestId: 0,
  controlsBound: false,
};

function homePlatformRankingProviderMeta(provider) {
  return {
    all: { label: '综合', short: 'ALL' },
    netease: { label: '网易云', short: 'NE' },
    qq: { label: 'QQ 音乐', short: 'QQ' },
    kugou: { label: '酷狗音乐', short: 'KG' },
    kuwo: { label: '酷我音乐', short: 'KW' },
    migu: { label: '咪咕音乐', short: 'MG' },
  }[provider] || { label: '平台', short: 'MR' };
}

function homePlatformRankingPlayIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" fill="currentColor"/></svg>';
}

function homePlatformRankingNextIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5v9l7-4.5-7-4.5Zm9.5-1v11M19 8v8M15 12h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function homePlatformRankingCollectIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15v12h-15zM8 3.8h8M8 10h8M8 14h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function homePlatformRankingCover(song) {
  song = song || {};
  if (typeof songCoverSrc === 'function') return songCoverSrc(song, 100);
  return song.cover || song.picUrl || '';
}

function homePlatformRankingRow(song, index) {
  song = song || {};
  var provider = song.rankingProvider || homePlatformRankingState.provider;
  var meta = homePlatformRankingProviderMeta(provider);
  var cover = homePlatformRankingCover(song);
  var coverHtml = cover
    ? '<img src="' + escHtml(cover) + '" alt="" loading="lazy" onerror="this.classList.add(\'is-broken\')">'
    : '<span class="home-platform-ranking-cover-empty" aria-hidden="true">' + escHtml(meta.short) + '</span>';
  var album = song.album || song.albumName || '';
  var artist = song.artist || song.singer || '未知歌手';
  var rank = Math.max(1, Number(song.rank) || index + 1);
  return '<div class="home-platform-ranking-row" role="listitem" data-home-ranking-index="' + index + '" style="--ranking-row:' + Math.min(index, 14) + '">' +
    '<button class="home-platform-ranking-main" type="button" data-home-ranking-action="play" data-home-ranking-index="' + index + '" aria-label="播放 ' + escHtml(song.name || '当前歌曲') + '">' +
    '<span class="home-platform-ranking-number' + (rank <= 3 ? ' is-top' : '') + '">' + String(rank).padStart(2, '0') + '</span>' +
    '<span class="home-platform-ranking-cover">' + coverHtml + '<span class="home-platform-ranking-cover-play">' + homePlatformRankingPlayIcon() + '</span></span>' +
    '<span class="home-platform-ranking-copy"><strong>' + escHtml(song.name || '未知歌曲') + '</strong>' +
    '<small>' + escHtml(artist + (album ? ' · ' + album : '')) + '</small></span>' +
    '<span class="home-platform-ranking-source ' + escHtml(provider) + '">' + escHtml(meta.short) + '</span></button>' +
    '<span class="home-platform-ranking-row-actions">' +
    '<button type="button" data-home-ranking-action="next" data-home-ranking-index="' + index + '" title="下一首播放" aria-label="下一首播放">' + homePlatformRankingNextIcon() + '</button>' +
    '<button type="button" data-home-ranking-action="collect" data-home-ranking-index="' + index + '" title="收藏到歌单" aria-label="收藏到歌单">' + homePlatformRankingCollectIcon() + '</button></span></div>';
}

function homePlatformRankingSkeleton() {
  return Array.from({ length: 8 }, function (_, index) {
    return '<div class="home-platform-ranking-row is-skeleton" style="--ranking-row:' + index + '">' +
      '<span class="home-platform-ranking-number"></span><span class="home-platform-ranking-cover"></span>' +
      '<span class="home-platform-ranking-copy"><strong></strong><small></small></span></div>';
  }).join('');
}

function homePlatformRankingStatusText(result) {
  result = result || {};
  var songs = Array.isArray(result.songs) ? result.songs : [];
  var prefix = result.chartTitle || homePlatformRankingProviderMeta(result.provider).label + '热歌榜';
  var failed = (result.providers || []).filter(function (item) { return item && item.ok === false; });
  var suffix = result.cached ? ' · 已使用近期榜单' : ' · 刚刚更新';
  if (failed.length) suffix += ' · ' + failed.map(function (item) { return item.label || homePlatformRankingProviderMeta(item.provider).label; }).join('、') + '暂不可用';
  return prefix + ' · ' + songs.length + ' 首' + suffix;
}

function renderHomePlatformRankings(result) {
  var list = document.getElementById('home-platform-ranking-list');
  var status = document.getElementById('home-platform-ranking-status');
  var playAll = document.getElementById('home-platform-ranking-play-all');
  if (!list || !status) return;
  status.classList.toggle('is-error', !!homePlatformRankingState.error);
  if (homePlatformRankingState.loading && !homePlatformRankingState.songs.length) {
    status.textContent = '正在同步公开榜单';
    list.innerHTML = homePlatformRankingSkeleton();
    if (playAll) playAll.disabled = true;
    return;
  }
  if (homePlatformRankingState.error && !homePlatformRankingState.songs.length) {
    status.textContent = homePlatformRankingState.error;
    list.innerHTML = '<div class="home-platform-recommend-empty"><strong>这个榜单暂时没有回来</strong><span>可以切换其他平台，或稍后刷新当前榜单。</span></div>';
    if (playAll) playAll.disabled = true;
    return;
  }
  status.textContent = homePlatformRankingStatusText(result);
  list.innerHTML = homePlatformRankingState.songs.map(homePlatformRankingRow).join('');
  if (playAll) playAll.disabled = !homePlatformRankingState.songs.length;
}

function setHomePlatformRankingTabs(provider) {
  var root = document.getElementById('home-platform-ranking-tabs');
  if (!root) return;
  Array.prototype.forEach.call(root.querySelectorAll('[data-home-ranking-provider]'), function (tab) {
    var selected = tab.getAttribute('data-home-ranking-provider') === provider;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
}

function invalidateHomePlatformRankingRequest() {
  homePlatformRankingState.requestId += 1;
  homePlatformRankingState.loading = false;
}

async function loadHomePlatformRankings(provider, forceRefresh) {
  provider = HOME_PLATFORM_RANKING_PROVIDERS.indexOf(provider) >= 0 ? provider : 'all';
  homePlatformRankingState.provider = provider;
  homePlatformRankingState.error = '';
  homePlatformRankingState.loading = true;
  var requestId = ++homePlatformRankingState.requestId;
  setHomePlatformRankingTabs(provider);
  renderHomePlatformRankings({ provider: provider, songs: homePlatformRankingState.songs });
  try {
    var endpoint = '/api/platform-rankings?provider=' + encodeURIComponent(provider) + '&limit=30' + (forceRefresh ? '&refresh=1' : '');
    var result = await apiJson(endpoint, { timeoutMs: 65000 });
    if (requestId !== homePlatformRankingState.requestId || homePlatformRecommendationState.view !== 'rankings') return;
    if (!result || result.ok === false || !Array.isArray(result.songs)) throw new Error(result && result.error || '榜单暂不可用');
    homePlatformRankingState.songs = result.songs;
    homePlatformRankingState.error = result.songs.length ? '' : '当前平台暂时没有公开榜单';
    homePlatformRankingState.loading = false;
    renderHomePlatformRankings(result);
  } catch (error) {
    if (requestId !== homePlatformRankingState.requestId || homePlatformRecommendationState.view !== 'rankings') return;
    homePlatformRankingState.loading = false;
    homePlatformRankingState.error = '当前榜单同步失败，请切换平台或稍后重试';
    renderHomePlatformRankings({ provider: provider, songs: homePlatformRankingState.songs });
    console.warn('[PlatformRankings]', error);
  }
}

function refreshHomePlatformRankings() {
  loadHomePlatformRankings(homePlatformRankingState.provider, true);
}

function homePlatformRankingSong(index) {
  index = Number(index);
  if (!isFinite(index) || index < 0 || index >= homePlatformRankingState.songs.length) return null;
  return homePlatformRankingState.songs[index];
}

function playHomePlatformRanking(index) {
  var song = homePlatformRankingSong(index);
  if (!song || !homePlatformRankingState.songs.length) return false;
  playQueue = homePlatformRankingState.songs.map(function (item) {
    return typeof cloneSong === 'function' ? cloneSong(item) : Object.assign({}, item);
  });
  currentIdx = Math.max(0, Math.min(playQueue.length - 1, Number(index) || 0));
  homeForcedOpen = false;
  homeSuppressed = false;
  if (typeof setHomeControlsLocked === 'function') setHomeControlsLocked(false);
  if (typeof safeRenderQueuePanel === 'function') safeRenderQueuePanel('platform-ranking', { scrollCurrent: true });
  if (typeof safeShelfRebuild === 'function') safeShelfRebuild('platform-ranking', true);
  if (typeof forcePlaybackControlsInteractive === 'function') forcePlaybackControlsInteractive();
  closeHomePlatformRecommendations();
  Promise.resolve(playQueueAt(currentIdx, {
    manual: true,
    context: {
      type: 'platform-ranking',
      playlistName: homePlatformRankingProviderMeta(homePlatformRankingState.provider).label + '榜单',
    },
  })).catch(function (error) { console.warn('[PlatformRankingPlay]', error); });
  return true;
}

function queueHomePlatformRankingNext(index) {
  var song = homePlatformRankingSong(index);
  if (!song || typeof queueSongNext !== 'function') return false;
  queueSongNext(song);
  if (typeof showToast === 'function') showToast('已设为下一首: ' + (song.name || '当前歌曲'));
  return true;
}

function collectHomePlatformRanking(index) {
  var song = homePlatformRankingSong(index);
  if (!song || typeof openCollectModal !== 'function') return false;
  openCollectModal(song);
  return true;
}

function setHomeDiscoveryView(view, options) {
  options = options || {};
  view = view === 'rankings' ? 'rankings' : 'recommendations';
  homePlatformRecommendationState.view = view;
  var rankings = view === 'rankings';
  var switcher = document.getElementById('home-platform-view-switch');
  var recommendationTabs = document.getElementById('home-platform-recommend-tabs');
  var rankingTabs = document.getElementById('home-platform-ranking-tabs');
  var recommendationStatus = document.getElementById('home-platform-recommend-status');
  var rankingStatus = document.getElementById('home-platform-ranking-status');
  var recommendationList = document.getElementById('home-platform-recommend-list');
  var rankingList = document.getElementById('home-platform-ranking-list');
  var playAll = document.getElementById('home-platform-ranking-play-all');
  var title = document.getElementById('home-platform-recommend-title');
  var subtitle = document.getElementById('home-platform-recommend-subtitle');
  var refresh = document.getElementById('home-platform-recommend-refresh');
  if (switcher) Array.prototype.forEach.call(switcher.querySelectorAll('[data-home-discovery-view]'), function (tab) {
    var selected = tab.getAttribute('data-home-discovery-view') === view;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  if (recommendationTabs) recommendationTabs.hidden = rankings;
  if (recommendationStatus) recommendationStatus.hidden = rankings;
  if (recommendationList) recommendationList.hidden = rankings;
  if (rankingTabs) rankingTabs.hidden = !rankings;
  if (rankingStatus) rankingStatus.hidden = !rankings;
  if (rankingList) rankingList.hidden = !rankings;
  if (playAll) playAll.hidden = !rankings;
  if (title) title.textContent = rankings ? '平台榜单' : '平台推荐';
  if (subtitle) subtitle.textContent = rankings
    ? '汇总公开热歌榜；任一平台不可用时，其余榜单仍可浏览。'
    : '只读取平台可验证的推荐数据，不用关键词搜索替代。';
  if (refresh) refresh.textContent = rankings ? '刷新当前榜单' : '刷新当前平台';
  if (rankings) loadHomePlatformRankings(options.provider || homePlatformRankingState.provider || 'all', false);
  else loadHomePlatformRecommendations(options.source || homePlatformRecommendationState.source || 'netease', false);
}

function bindHomePlatformRankingControls() {
  if (homePlatformRankingState.controlsBound) return;
  homePlatformRankingState.controlsBound = true;
  var switcher = document.getElementById('home-platform-view-switch');
  var tabs = document.getElementById('home-platform-ranking-tabs');
  var list = document.getElementById('home-platform-ranking-list');
  var playAll = document.getElementById('home-platform-ranking-play-all');
  if (switcher) switcher.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-home-discovery-view]');
    if (!tab || !switcher.contains(tab)) return;
    setHomeDiscoveryView(tab.getAttribute('data-home-discovery-view'));
  });
  if (tabs) tabs.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-home-ranking-provider]');
    if (!tab || !tabs.contains(tab)) return;
    loadHomePlatformRankings(tab.getAttribute('data-home-ranking-provider'), false);
  });
  if (list) list.addEventListener('click', function (event) {
    var action = event.target.closest('[data-home-ranking-action]');
    if (!action || !list.contains(action)) return;
    var index = Number(action.getAttribute('data-home-ranking-index')) || 0;
    var kind = action.getAttribute('data-home-ranking-action');
    if (kind === 'play') playHomePlatformRanking(index);
    else if (kind === 'next') queueHomePlatformRankingNext(index);
    else if (kind === 'collect') collectHomePlatformRanking(index);
  });
  if (playAll) playAll.addEventListener('click', function () { playHomePlatformRanking(0); });
}

bindHomePlatformRankingControls();
