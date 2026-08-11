var backingTrackSearchBusy = false;
var backingTrackSearchSeq = 0;
var backingTrackHighlightedSong = null;
var BACKING_TRACK_QUEUE_THRESHOLD = 60;

function backingTrackArtistText(song) {
  song = song || {};
  return String(song.artist || song.singer || song.artistName || '').trim();
}

function backingTrackNormalizedText(value) {
  var text = String(value || '').toLowerCase();
  if (text.normalize) text = text.normalize('NFKC');
  return text.replace(/[\s\u00b7,，.。:：;；!！?？'"“”‘’`~()（）\[\]【】{}<>《》_\-|/\\+]+/g, '');
}

function backingTrackCleanTitle(song) {
  return String(song && (song.name || song.title) || '')
    .replace(/\s*[（(【[]\s*(?:live|现场|remaster(?:ed)?|radio\s*edit|mv)\s*[）)】\]]\s*$/i, '')
    .trim();
}

function backingTrackQuery(song) {
  song = song || {};
  var title = backingTrackCleanTitle(song);
  var artist = backingTrackArtistText(song);
  return [title, artist, '伴奏'].filter(Boolean).join(' ');
}

function backingTrackHasMarker(value) {
  return /伴奏|instrumental|karaoke|off\s*vocal|纯音乐|无人声|music\s*only/i.test(String(value || ''));
}

function backingTrackScore(song, currentSong) {
  song = song || {};
  currentSong = currentSong || {};
  var rawTitle = String(song.name || song.title || '');
  var title = backingTrackNormalizedText(rawTitle);
  var wanted = backingTrackNormalizedText(backingTrackCleanTitle(currentSong));
  var singer = backingTrackNormalizedText(backingTrackArtistText(song));
  var wantedSinger = backingTrackNormalizedText(backingTrackArtistText(currentSong));
  var marked = backingTrackHasMarker(rawTitle);
  var score = marked ? 58 : -34;
  var titleMatched = false;
  var backingBase = backingTrackNormalizedText(rawTitle.replace(
    /伴奏|instrumental|karaoke|off\s*vocal|纯音乐|无人声|music\s*only|降调版|升调版|原调|女声版|男声版/ig,
    ''
  ));
  if (wanted && backingBase === wanted) { score += 64; titleMatched = true; }
  else if (wanted && title.indexOf(wanted) === 0) { score += 54; titleMatched = true; }
  else if (wanted && title && (title.indexOf(wanted) >= 0 || wanted.indexOf(title) >= 0)) { score += 34; titleMatched = true; }
  if (titleMatched && wantedSinger && singer && (singer.indexOf(wantedSinger) >= 0 || wantedSinger.indexOf(singer) >= 0)) score += 14;
  if (/\+|串烧|medley|live|现场/i.test(rawTitle)) score -= 28;
  if (!marked && /live|现场|remix|dj\s*版?|翻唱|cover/i.test(rawTitle)) score -= 24;
  return score;
}

function backingTrackAutoQueueEligible(song, currentSong) {
  var rawTitle = String(song && (song.name || song.title) || '');
  if (!backingTrackHasMarker(rawTitle)) return false;
  if (/\+|串烧|medley|live|现场|remix|dj\s*版?|翻唱|cover/i.test(rawTitle)) return false;
  var wanted = backingTrackNormalizedText(backingTrackCleanTitle(currentSong));
  var backingBase = backingTrackNormalizedText(rawTitle.replace(
    /伴奏|instrumental|karaoke|off\s*vocal|纯音乐|无人声|music\s*only|降调版|升调版|原调|女声版|男声版/ig,
    ''
  ));
  if (!wanted || backingBase !== wanted) return false;
  var singer = backingTrackNormalizedText(backingTrackArtistText(song));
  var wantedSinger = backingTrackNormalizedText(backingTrackArtistText(currentSong));
  if (!singer || !wantedSinger) return false;
  return singer.indexOf(wantedSinger) >= 0 || wantedSinger.indexOf(singer) >= 0;
}

function rankBackingTrackCandidates(songs, currentSong) {
  return (Array.isArray(songs) ? songs : []).map(function (song, index) {
    return {
      song: song,
      score: backingTrackScore(song, currentSong),
      autoQueueEligible: backingTrackAutoQueueEligible(song, currentSong),
      index: index
    };
  }).sort(function (a, b) {
    return b.score - a.score || a.index - b.index;
  });
}

function queueBestBackingTrack(ranked, queueFn, threshold) {
  var best = ranked && ranked[0];
  threshold = isFinite(Number(threshold)) ? Number(threshold) : BACKING_TRACK_QUEUE_THRESHOLD;
  if (!best || !best.song || !best.autoQueueEligible || best.score < threshold || typeof queueFn !== 'function') return null;
  queueFn(best.song);
  return best.song;
}

function backingTrackSongKey(song, providerFn, itemKeyFn) {
  if (!song) return '';
  providerFn = providerFn || (typeof songProviderKey === 'function' ? songProviderKey : null);
  itemKeyFn = itemKeyFn || (typeof queueItemKey === 'function' ? queueItemKey : null);
  var provider = providerFn
    ? String(providerFn(song) || '')
    : String(song.provider || song.source || song.type || '');
  if (itemKeyFn) return provider + '|' + String(itemKeyFn(song) || '');
  return [
    provider,
    String(song.mid || song.id || song.hash || song.copyrightId || ''),
    backingTrackNormalizedText(song.name || song.title || ''),
    backingTrackNormalizedText(backingTrackArtistText(song))
  ].join('|');
}

function backingTrackCurrentSongUnchanged(originSongKey, activeSong, providerFn, itemKeyFn) {
  return !!originSongKey && backingTrackSongKey(activeSong, providerFn, itemKeyFn) === originSongKey;
}

function backingTrackResultClass(song, index) {
  return index === 0 && song === backingTrackHighlightedSong ? ' backing-track-best' : '';
}

function backingTrackBestTagHtml(song, index) {
  return index === 0 && song === backingTrackHighlightedSong
    ? '<span class="backing-track-best-tag">推荐伴奏</span>'
    : '';
}

function clearBackingTrackHighlight() {
  backingTrackHighlightedSong = null;
}

function setBackingTrackActionBusy(busy) {
  var button = document.getElementById('detail-backing-track-action');
  if (!button) return;
  button.classList.toggle('busy', !!busy);
  button.disabled = !!busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  button.textContent = busy ? '查找中...' : '查找伴奏';
}

async function findCurrentBackingTrack(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (backingTrackSearchBusy) return;
  var currentSong = typeof currentCoverSong === 'function' ? currentCoverSong() : null;
  if (!currentSong) {
    showToast('请先播放一首歌');
    return;
  }
  var query = backingTrackQuery(currentSong);
  if (!backingTrackCleanTitle(currentSong) || !query) {
    showToast('当前歌曲缺少可搜索的信息');
    return;
  }
  var originSongKey = backingTrackSongKey(currentSong);

  var ownSeq = ++backingTrackSearchSeq;
  var requestSeq = ++searchRequestSeq;
  backingTrackSearchBusy = true;
  backingTrackHighlightedSong = null;
  setBackingTrackActionBusy(true);
  closeTrackDetailModal();
  searchMode = 'song';
  updateSearchModeTabs();
  setSearchHistorySurface(false);
  resetSearchMusicRenderState();
  if ($input) $input.value = query;
  var searchArea = document.getElementById('search-area');
  if (searchArea) setPeek(searchArea, true, 'search');
  if ($results) {
    $results.innerHTML = '<div class="search-empty">正在查找“' + escHtml(query) + '”...</div>';
    $results.classList.add('show');
  }

  try {
    var result = await fetchMusicSearchResults(query, 'song');
    if (ownSeq !== backingTrackSearchSeq || requestSeq !== searchRequestSeq || !$input || $input.value.trim() !== query) return;
    var ranked = rankBackingTrackCandidates(result && result.songs, currentSong);
    if (!ranked.length) {
      resetSearchMusicRenderState();
      playlist = [];
      searchLastResultQuery = '';
      $results.innerHTML = '<div class="search-empty">没有找到合适的伴奏候选</div>';
      $results.classList.add('show');
      showToast('暂时没有找到伴奏');
      return;
    }

    var songs = ranked.map(function (entry) { return entry.song; });
    searchLastResultQuery = searchResultKey(query, 'song');
    rememberSearchQuery(query);
    pendingSearchProviderPages = {
      key: searchLastResultQuery,
      query: query,
      mode: 'song',
      providerPages: result.providerPages || {},
      hasMore: false
    };
    if (ranked[0].score >= BACKING_TRACK_QUEUE_THRESHOLD && ranked[0].autoQueueEligible) backingTrackHighlightedSong = ranked[0].song;
    renderSongSearchResults(songs);
    var activeSong = typeof currentCoverSong === 'function' ? currentCoverSong() : null;
    var currentSongUnchanged = backingTrackCurrentSongUnchanged(originSongKey, activeSong);
    var queued = currentSongUnchanged
      ? queueBestBackingTrack(ranked, queueSongNext, BACKING_TRACK_QUEUE_THRESHOLD)
      : null;
    if (queued) showToast('已将伴奏设为下一首: ' + (queued.name || '最佳匹配'));
    else if (!currentSongUnchanged) showToast('当前歌曲已切换，已保留伴奏候选但未修改队列');
    else showToast('已列出伴奏候选，请选择合适的版本');
    if ($input) $input.focus();
  } catch (error) {
    if (ownSeq !== backingTrackSearchSeq || requestSeq !== searchRequestSeq) return;
    resetSearchMusicRenderState();
    playlist = [];
    searchLastResultQuery = '';
    $results.innerHTML = '<div class="search-empty">伴奏搜索失败，请稍后重试</div>';
    $results.classList.add('show');
    showToast('伴奏搜索失败');
    console.warn('[BackingTrackSearch]', error);
  } finally {
    if (ownSeq === backingTrackSearchSeq) {
      backingTrackSearchBusy = false;
      setBackingTrackActionBusy(false);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BACKING_TRACK_QUEUE_THRESHOLD: BACKING_TRACK_QUEUE_THRESHOLD,
    backingTrackCleanTitle: backingTrackCleanTitle,
    backingTrackQuery: backingTrackQuery,
    backingTrackScore: backingTrackScore,
    backingTrackAutoQueueEligible: backingTrackAutoQueueEligible,
    backingTrackSongKey: backingTrackSongKey,
    backingTrackCurrentSongUnchanged: backingTrackCurrentSongUnchanged,
    rankBackingTrackCandidates: rankBackingTrackCandidates,
    queueBestBackingTrack: queueBestBackingTrack
  };
}
