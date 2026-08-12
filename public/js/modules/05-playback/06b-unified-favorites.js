(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.keys(api).forEach(function (key) { root[key] = api[key]; });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FAVORITE_CATALOG_KEY = 'mineradio-favorite-catalog-v1';
  var FAVORITE_CATALOG_LIMIT = 1500;
  var FAVORITE_SONG_FIELDS = [
    'provider', 'source', 'type', 'id', 'mid', 'songmid', 'mediaMid', 'media_mid', 'qqId',
    'spotifyId', 'spotifyUri', 'uri', 'albumUri', 'hash', 'fileHash', 'audioHash',
    'providerSongId', 'trackId', 'track_id', 'albumId', 'album_id', 'albumMid', 'albummid',
    'albumAudioId', 'album_audio_id', 'mixSongId', 'hqHash', 'sqHash', 'resHash',
    'name', 'title', 'artist', 'album', 'cover', 'duration', 'durationMs', 'dt', 'fee',
    'playable', 'playbackMode', 'recommendationSource', 'programId', 'radioId', 'radioName',
    'localKey', 'localFileId', 'additionalSourceCode'
  ];

  function favoriteFiniteTime(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
  }

  function favoriteProvider(song) {
    song = song || {};
    var backupCode = String(song.additionalSourceCode || '').toLowerCase();
    if (backupCode === 'kw') return 'kuwo';
    if (backupCode === 'mg') return 'migu';
    var provider = String(song.provider || song.source || song.type || '').toLowerCase();
    if (song.spotifyId || /^spotify:track:/i.test(String(song.spotifyUri || song.uri || ''))) return 'spotify';
    if (song.hash || song.audioHash || song.fileHash) return provider || 'kugou';
    if (song.localKey || song.localFileId || song.type === 'local') return 'local';
    return provider || 'netease';
  }

  function favoriteSongIdentity(song) {
    song = song || {};
    var provider = favoriteProvider(song);
    var id = '';
    if (provider === 'spotify') id = song.spotifyId || song.providerSongId || song.id || String(song.spotifyUri || song.uri || '').split(':').pop();
    else if (provider === 'kugou') id = song.hash || song.audioHash || song.fileHash || song.providerSongId || song.id;
    else if (provider === 'qishui') id = song.providerSongId || song.trackId || song.track_id || song.id;
    else if (provider === 'qq') id = song.mid || song.songmid || song.id;
    else if (provider === 'local') id = song.localFileId || song.localKey || song.id;
    else id = song.id;
    id = String(id == null ? '' : id).trim();
    if (provider === 'kugou') id = id.toLowerCase();
    if (id) return provider + ':' + id;
    var name = String(song.name || song.title || '').trim().toLowerCase();
    var artist = String(song.artist || '').trim().toLowerCase();
    return name ? provider + ':text:' + name + '|' + artist : '';
  }

  function favoriteSongSnapshot(song) {
    song = song || {};
    var out = {};
    FAVORITE_SONG_FIELDS.forEach(function (key) {
      var value = song[key];
      if (value == null || value === '') return;
      if (typeof value === 'string') value = value.slice(0, key === 'cover' ? 2048 : 512);
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    });
    if (Array.isArray(song.artists)) {
      out.artists = song.artists.slice(0, 6).map(function (item) {
        if (typeof item === 'string') return item.slice(0, 160);
        if (!item || typeof item !== 'object') return null;
        return { id: String(item.id || '').slice(0, 160), name: String(item.name || '').slice(0, 160) };
      }).filter(Boolean);
    }
    return out;
  }

  function normalizeFavoriteEntry(entry, now) {
    if (!entry || typeof entry !== 'object') return null;
    var song = favoriteSongSnapshot(entry.song || entry);
    var key = favoriteSongIdentity(song);
    if (!key || !(song.name || song.title)) return null;
    var savedAt = favoriteFiniteTime(entry.savedAt, now);
    return {
      key: key,
      savedAt: savedAt,
      updatedAt: favoriteFiniteTime(entry.updatedAt, savedAt),
      synced: entry.synced !== false,
      song: song
    };
  }

  function normalizeFavoriteCatalog(value, now) {
    now = favoriteFiniteTime(now, Date.now());
    var rows = Array.isArray(value) ? value : value && Array.isArray(value.entries) ? value.entries : [];
    var seen = Object.create(null);
    return rows.map(function (entry) { return normalizeFavoriteEntry(entry, now); }).filter(Boolean).sort(function (a, b) {
      return b.updatedAt - a.updatedAt || b.savedAt - a.savedAt;
    }).filter(function (entry) {
      if (!entry || seen[entry.key]) return false;
      seen[entry.key] = true;
      return true;
    }).slice(0, FAVORITE_CATALOG_LIMIT);
  }

  function mergeFavoriteEntry(entries, song, liked, options) {
    options = options || {};
    var now = favoriteFiniteTime(options.now, Date.now());
    var key = favoriteSongIdentity(song);
    var normalized = normalizeFavoriteCatalog(entries, now).filter(function (entry) { return entry.key !== key; });
    if (!liked || !key) return normalized;
    var previous = normalizeFavoriteCatalog(entries, now).find(function (entry) { return entry.key === key; });
    normalized.unshift({
      key: key,
      savedAt: previous ? previous.savedAt : now,
      updatedAt: now,
      synced: options.synced !== false,
      song: favoriteSongSnapshot(song)
    });
    return normalizeFavoriteCatalog(normalized, now);
  }

  var favoriteCatalogEntries = [];
  var favoriteCatalogRefreshState = { loading: false, error: '', promise: null, refreshedAt: 0 };
  if (typeof localStorage !== 'undefined') {
    try { favoriteCatalogEntries = normalizeFavoriteCatalog(JSON.parse(localStorage.getItem(FAVORITE_CATALOG_KEY) || '[]')); } catch (_) { favoriteCatalogEntries = []; }
  }

  function saveFavoriteCatalog() {
    var normalized = normalizeFavoriteCatalog(favoriteCatalogEntries);
    favoriteCatalogEntries.splice.apply(favoriteCatalogEntries, [0, favoriteCatalogEntries.length].concat(normalized));
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(FAVORITE_CATALOG_KEY, JSON.stringify(favoriteCatalogEntries)); } catch (_) {}
    }
    return favoriteCatalogEntries;
  }

  function favoriteCatalogEntry(songOrKey) {
    var key = typeof songOrKey === 'string' ? songOrKey : favoriteSongIdentity(songOrKey);
    return favoriteCatalogEntries.find(function (entry) { return entry.key === key; }) || null;
  }

  function setFavoriteCatalogSong(song, liked, options) {
    var next = mergeFavoriteEntry(favoriteCatalogEntries, song, liked, options);
    favoriteCatalogEntries.splice.apply(favoriteCatalogEntries, [0, favoriteCatalogEntries.length].concat(next));
    saveFavoriteCatalog();
    if (typeof refreshMusicLibraryWorkspace === 'function') refreshMusicLibraryWorkspace('favorite-catalog');
    return favoriteCatalogEntry(song);
  }

  function markFavoriteCatalogSongs(songs, options) {
    (Array.isArray(songs) ? songs : []).forEach(function (song) {
      var next = mergeFavoriteEntry(favoriteCatalogEntries, song, true, options);
      favoriteCatalogEntries.splice.apply(favoriteCatalogEntries, [0, favoriteCatalogEntries.length].concat(next));
    });
    saveFavoriteCatalog();
    if (typeof refreshMusicLibraryWorkspace === 'function') refreshMusicLibraryWorkspace('favorite-catalog-batch');
    return favoriteCatalogEntries;
  }

  function favoriteProviderTitle(song) {
    if (typeof songSourceLabel === 'function') return songSourceLabel(song);
    return ({ netease: '网易云', qq: 'QQ 音乐', kugou: '酷狗', qishui: '汽水音乐', spotify: 'Spotify', kuwo: '酷我', migu: '咪咕', local: '本地音乐' })[favoriteProvider(song)] || '其他来源';
  }

  function favoriteCanToggle(song) {
    if (typeof isBackupSourceSong === 'function' && isBackupSourceSong(song)) return true;
    var adapter = typeof songAccountAdapter === 'function' ? songAccountAdapter(song) : null;
    return !!(adapter && adapter.like && adapter.likeUrl);
  }

  function favoriteFilteredEntries() {
    var state = typeof musicLibraryWorkspaceState === 'object' ? musicLibraryWorkspaceState : {};
    var query = String(state.query || '').trim().toLowerCase();
    var provider = String(state.favoriteProvider || 'all');
    var scope = String(state.favoriteScope || 'all');
    return favoriteCatalogEntries.filter(function (entry) {
      var song = entry.song || {};
      var songProvider = favoriteProvider(song);
      if (provider !== 'all' && songProvider !== provider) return false;
      if (scope === 'synced' && entry.synced === false) return false;
      if (scope === 'local' && entry.synced !== false) return false;
      if (!query) return true;
      return [song.name, song.title, song.artist, song.album, favoriteProviderTitle(song)].join(' ').toLowerCase().indexOf(query) >= 0;
    });
  }

  function favoritePlaylistCandidates() {
    if (typeof userPlaylists === 'undefined') return [];
    return (userPlaylists || []).filter(function (playlist) {
      if (!playlist || playlist.localFile) return false;
      return Number(playlist.specialType || 0) === 5 || /我喜欢|喜欢的音乐|liked/i.test(String(playlist.name || ''));
    });
  }

  async function refreshUnifiedFavoriteCatalog(force) {
    if (favoriteCatalogRefreshState.loading && favoriteCatalogRefreshState.promise) return favoriteCatalogRefreshState.promise;
    favoriteCatalogRefreshState.loading = true;
    favoriteCatalogRefreshState.error = '';
    if (typeof refreshMusicLibraryWorkspace === 'function') refreshMusicLibraryWorkspace('favorites-refresh-start');
    favoriteCatalogRefreshState.promise = Promise.resolve(typeof refreshUserPlaylists === 'function' ? refreshUserPlaylists(force === true) : null).then(async function () {
      var lists = favoritePlaylistCandidates();
      var failures = 0;
      await Promise.all(lists.map(async function (playlist) {
        try {
          var provider = typeof playlistAccountProvider === 'function' ? playlistAccountProvider(playlist) : favoriteProvider(playlist);
          if (typeof playlistTracksEndpoint !== 'function' || typeof apiJson !== 'function') return;
          var offset = 0;
          var pages = 0;
          var hasMore = true;
          while (hasMore && offset < FAVORITE_CATALOG_LIMIT && pages < 20) {
            var endpoint = playlistTracksEndpoint(provider, playlist.id, { offset: offset, limit: Math.min(200, FAVORITE_CATALOG_LIMIT - offset) });
            var result = await apiJson(endpoint, { timeoutMs: 16000 });
            var tracks = result && result.tracks || [];
            if (result && result.error && !tracks.length) throw new Error(result.message || result.error);
            if (typeof markSongsLiked === 'function') markSongsLiked(tracks, true);
            else markFavoriteCatalogSongs(tracks, { synced: true });
            var nextOffset = Math.max(Number(result && result.nextOffset) || 0, offset + tracks.length);
            hasMore = !!(result && result.hasMore) && tracks.length > 0 && nextOffset > offset;
            offset = nextOffset;
            pages += 1;
          }
        } catch (error) {
          failures += 1;
          console.warn('[FavoriteCatalog]', playlist && playlist.name || '', error);
        }
      }));
      favoriteCatalogRefreshState.error = failures ? '部分平台收藏暂时未同步，已保留本机记录' : '';
      favoriteCatalogRefreshState.refreshedAt = Date.now();
      return favoriteCatalogEntries;
    }).catch(function (error) {
      favoriteCatalogRefreshState.error = '平台收藏刷新失败，已保留本机记录';
      console.warn('[FavoriteCatalog]', error);
      return favoriteCatalogEntries;
    }).finally(function () {
      favoriteCatalogRefreshState.loading = false;
      favoriteCatalogRefreshState.promise = null;
      if (typeof refreshMusicLibraryWorkspace === 'function') refreshMusicLibraryWorkspace('favorites-refresh-complete');
    });
    return favoriteCatalogRefreshState.promise;
  }

  function renderMusicLibraryFavorites() {
    var content = document.getElementById('music-library-content');
    if (!content) return;
    var state = musicLibraryWorkspaceState;
    var entries = favoriteFilteredEntries();
    var visible = entries.slice(0, state.favoriteVisible || 80);
    var providers = Object.create(null);
    var localCount = 0;
    favoriteCatalogEntries.forEach(function (entry) {
      providers[favoriteProvider(entry.song)] = favoriteProviderTitle(entry.song);
      if (entry.synced === false) localCount += 1;
    });
    var providerOptions = Object.keys(providers).sort().map(function (key) {
      return '<option value="' + escHtml(key) + '"' + (state.favoriteProvider === key ? ' selected' : '') + '>' + escHtml(providers[key]) + '</option>';
    }).join('');
    content.innerHTML = '<div class="music-library-favorites">' +
      '<section class="music-library-favorite-summary"><div><span class="music-library-kicker">收藏中心</span><h3>留住想再听的歌</h3><p>平台红心与本机收藏在这里汇总；每条记录保留真实来源，平台暂时不可用也不会清掉已有收藏。</p>' + (favoriteCatalogRefreshState.error ? '<small class="music-library-favorite-warning">' + escHtml(favoriteCatalogRefreshState.error) + '</small>' : '') + '</div>' +
      '<div class="music-library-history-metrics"><span><strong>' + favoriteCatalogEntries.length + '</strong><small>收藏歌曲</small></span><span><strong>' + Object.keys(providers).length + '</strong><small>音乐来源</small></span><span><strong>' + localCount + '</strong><small>本机收藏</small></span></div></section>' +
      '<div class="music-library-toolbar favorites"><label class="music-library-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="music-library-search" type="search" value="' + escHtml(state.query || '') + '" placeholder="搜索收藏歌曲、歌手或专辑" autocomplete="off"></label>' +
      '<select id="music-library-favorite-scope" class="music-library-select" aria-label="收藏位置"><option value="all">全部收藏</option><option value="synced"' + (state.favoriteScope === 'synced' ? ' selected' : '') + '>平台同步</option><option value="local"' + (state.favoriteScope === 'local' ? ' selected' : '') + '>本机收藏</option></select>' +
      '<select id="music-library-favorite-provider" class="music-library-select" aria-label="音乐来源"><option value="all">全部来源</option>' + providerOptions + '</select>' +
      '<button type="button" class="music-library-command" data-favorite-refresh' + (favoriteCatalogRefreshState.loading ? ' disabled' : '') + '>' + (favoriteCatalogRefreshState.loading ? '同步中…' : '同步收藏') + '</button>' +
      '<button type="button" class="music-library-command primary" data-library-action="play-favorites">播放结果</button>' +
      '<button type="button" class="music-library-command" data-library-action="queue-favorites">加入队列</button></div>' +
      '<div class="music-library-favorite-list">' + (visible.length ? visible.map(function (entry, index) {
        var song = entry.song || {};
        return '<div class="music-library-favorite-row" style="--row-index:' + index + '"><button type="button" class="music-library-track" data-favorite-play="' + escHtml(entry.key) + '">' + musicLibraryCoverHtml(song) + '<span><strong>' + escHtml(song.name || song.title || '未知歌曲') + '</strong><small>' + escHtml(song.artist || '未知歌手') + '</small></span></button>' +
          '<span class="music-library-meta"><strong>' + escHtml(song.album || '未知专辑') + '</strong><small>' + escHtml(favoriteProviderTitle(song)) + '</small></span>' +
          '<span class="music-library-favorite-origin"><strong>' + (entry.synced === false ? '本机收藏' : '平台同步') + '</strong><small>' + escHtml(typeof listenHistoryRelativeTime === 'function' ? listenHistoryRelativeTime(entry.savedAt) : '') + '</small></span>' +
          '<span class="music-library-row-actions"><button type="button" data-favorite-detail="' + escHtml(entry.key) + '" title="歌曲详情" aria-label="歌曲详情">i</button><button type="button" data-favorite-next="' + escHtml(entry.key) + '" title="下一首播放" aria-label="下一首播放">+</button><button type="button" class="liked" data-favorite-like="' + escHtml(entry.key) + '" title="' + (favoriteCanToggle(song) ? '取消红心' : '当前来源收藏只读') + '" aria-label="' + (favoriteCanToggle(song) ? '取消红心' : '当前来源收藏只读') + '"' + (favoriteCanToggle(song) ? '' : ' disabled') + '>' + (typeof heartIconSvg === 'function' ? heartIconSvg() : '♥') + '</button></span></div>';
      }).join('') : '<div class="music-library-empty"><strong>' + (favoriteCatalogEntries.length ? '没有符合条件的收藏' : (favoriteCatalogRefreshState.loading ? '正在同步收藏…' : '还没有收藏歌曲')) + '</strong><span>在搜索结果、播放队列或歌曲详情点亮红心后，会出现在这里</span></div>') +
      (entries.length > visible.length ? '<button class="music-library-more" type="button" data-library-action="more-favorites">继续显示 · ' + (entries.length - visible.length) + ' 首</button>' : '') + '</div></div>';
  }

  return {
    FAVORITE_CATALOG_KEY: FAVORITE_CATALOG_KEY,
    FAVORITE_CATALOG_LIMIT: FAVORITE_CATALOG_LIMIT,
    favoriteSongIdentity: favoriteSongIdentity,
    favoriteSongSnapshot: favoriteSongSnapshot,
    normalizeFavoriteCatalog: normalizeFavoriteCatalog,
    mergeFavoriteEntry: mergeFavoriteEntry,
    favoriteCatalogEntries: favoriteCatalogEntries,
    favoriteCatalogRefreshState: favoriteCatalogRefreshState,
    favoriteCatalogEntry: favoriteCatalogEntry,
    setFavoriteCatalogSong: setFavoriteCatalogSong,
    markFavoriteCatalogSongs: markFavoriteCatalogSongs,
    favoriteFilteredEntries: favoriteFilteredEntries,
    refreshUnifiedFavoriteCatalog: refreshUnifiedFavoriteCatalog,
    renderMusicLibraryFavorites: renderMusicLibraryFavorites
  };
});
