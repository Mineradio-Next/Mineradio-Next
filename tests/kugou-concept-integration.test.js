'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('酷狗概念版使用独立登录、播放和歌词路由', () => {
  const server = read('server.js');
  const audio = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const lyric = read('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js');
  assert.match(server, /DEFAULT_KUGOU_CONCEPT_COOKIE_FILE/);
  assert.match(server, /\/api\/kugou-concept\/login\/cookie/);
  assert.match(server, /\/api\/kugou-concept\/login\/logout|\/api\/kugou-concept\/logout/);
  assert.match(audio, /kugou-concept\/song\/url/);
  assert.match(lyric, /kugou-concept\/lyric/);
  const desktop = read('desktop/main.js');
  assert.match(desktop, /KUGOU_CONCEPT_COOKIE_FILE/);
  assert.match(desktop, /\.kugou-concept-cookie/);
});

test('酷狗概念版登录 UI 不复用普通酷狗 busy 状态', () => {
  const server = read('server.js');
  const state = read('public/js/modules/00-state/00-core-stores.js');
  const flow = read('public/js/modules/08-account/03-login-modal-flows.js');
  const logout = read('public/js/modules/08-account/04-user-modal-logout.js');
  assert.match(state, /kugouConceptWebLoginBusy/);
  assert.match(state, /kugouConceptCookieBusy/);
  assert.match(flow, /kugouConceptWebLoginBusy/);
  assert.match(flow, /kugouConceptCookieBusy/);
  assert.match(flow, /timeoutMs: 12000/);
  assert.match(flow, /Cookie 导入/);
  assert.match(flow, /setManualCookieOpenForProvider\('kugouConcept', true\)/);
  assert.match(flow, /concept-qr-ready/);
  assert.doesNotMatch(flow, /var useWebPreview = isQQ \|\| isKugou \|\| isKugouConcept/);
  const css = read('public/css/index.css');
  assert.doesNotMatch(css, /\.qr-shell\.concept-qr-provider\.concept-qr-ready\s*\{/);
  assert.match(css, /grid-template-columns:\s*34px minmax\(0, 1fr\) max-content/);
  assert.match(server, /getKugouConceptLoginInfo/);
  assert.match(server, /persistKugouConceptProfile/);
  assert.match(server, /get_userinfo_qrcode[\s\S]{0,160}appid:\s*3116/);
  assert.match(logout, /\/api\/kugou-concept\/logout/);
});

test('已登录账号使用独立身份轨道并且普通会员不重复显示', () => {
  const account = read('public/js/modules/08-account/01-login-modal-utils.js');
  const flow = read('public/js/modules/08-account/03-login-modal-flows.js');
  const css = read('public/css/index.css');
  assert.match(account, /providerVipBadge\(provider, st, '', false\)/);
  assert.match(account, /top-account-pill[\s\S]{0,180}has-membership/);
  assert.match(account, /title="' \+ identity \+ '"/);
  assert.match(flow, /login-provider-copy/);
  assert.match(flow, /login-provider-account-name/);
  assert.match(flow, /level === 'vip' \? 'VIP' : ''/);
  assert.match(flow, /ordinaryLogin[\s\S]{0,260}status-dot/);
  assert.match(flow, /accountName\.title = showIdentity \? identity : ''/);
  assert.match(css, /\.login-provider-copy\s*\{[\s\S]{0,260}overflow:\s*hidden/);
  assert.match(css, /\.login-provider-account-name\s*\{[\s\S]{0,260}text-overflow:\s*ellipsis/);
  assert.match(css, /\.login-provider-state-badge\.status-dot\s*\{[\s\S]{0,220}border-radius:\s*50%/);
});

test('酷狗概念版二维码失败时返回可操作的导入提示', () => {
  const server = read('server.js');
  assert.match(server, /酷狗概念版二维码暂时不可用，请使用 Cookie 导入/);
  assert.match(server, /}, 502\);/);
});

test('酷狗概念版账号内容使用独立路由和 Cookie', () => {
  const api = read('kugou-api.js');
  const server = read('server.js');
  const routes = [
    'recommendations',
    'user/playlists',
    'playlist/tracks',
    'song/like/check',
    'song/like',
    'playlist/add-song',
  ];
  routes.forEach((route) => assert.match(server, new RegExp('/api/kugou-concept/' + route.replace('/', '\\/'))));
  assert.match(server, /handleKugouConceptRecommendations\(kugouConceptCookie/);
  assert.match(server, /handleKugouConceptUserPlaylists\(kugouConceptCookie/);
  assert.match(server, /handleKugouConceptLikeToggle\([^\n]+kugouConceptCookie/);
  assert.match(api, /accountProvider:\s*concept \? 'kugouConcept' : 'kugou'/);
  assert.match(api, /account\.variant \+ ':' \+ String\(listid\)/);
  assert.match(api, /kugouAccountCacheScope\(cookie, opts\)/);
  assert.match(api, /account\.request\('\/v6\/add_song'[\s\S]{0,180}router:\s*'cloudlist\.service\.kugou\.com'/);
  assert.doesNotMatch(api, /account\.variant === 'concept' \? '\/cloudlist\.service\/v6\/add_song'/);
  assert.match(api, /requestedListId \? parseKugouListId\(requestedListId\) : await resolveKugouFavoriteListId/);
  assert.doesNotMatch(server, /readJSONBody\(/);
  assert.match(server, /\/api\/kugou-concept\/song\/like'[\s\S]{0,180}readRequestBody\(req\)/);
  assert.match(server, /\/api\/kugou-concept\/playlist\/add-song'[\s\S]{0,180}readRequestBody\(req\)/);
});

test('概念版账号写入能力由服务端权限驱动并保留只读降级', () => {
  const shell = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  const actions = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const detail = read('public/js/modules/06-lyrics/02-playlist-detail.js');
  assert.match(shell, /provider === 'kugouConcept' && r && r\.capabilities/);
  assert.match(shell, /r\.capabilities\.playlistWrite === false[\s\S]{0,80}pl\.readOnly = true/);
  assert.match(actions, /function songAccountWriteCapability\(provider, action\)/);
  assert.match(actions, /capabilities\.playlistWrite === false/);
  assert.match(actions, /capabilities\.likeWrite === false/);
  assert.match(actions, /!pl\.readOnly/);
  assert.match(detail, /kugouConcept: '酷狗概念版歌单'/);
  assert.match(detail, /kugouConcept: \[\]/);
});

test('概念版歌曲保留播放版本，账号操作使用 kugouConcept', () => {
  const api = read('kugou-api.js');
  const actions = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const playlist = read('public/js/modules/06-lyrics/02-playlist-detail.js');
  assert.match(api, /value\.kugouVariant = account\.variant/);
  assert.match(actions, /song\.kugouVariant === 'concept'[\s\S]{0,100}return 'kugouConcept'/);
  assert.match(actions, /kugouConcept:\s*\{[\s\S]{0,500}\/api\/kugou-concept\/song\/like/);
  assert.match(playlist, /provider === 'kugouConcept'[\s\S]{0,80}'KG\+'/);
  assert.match(playlist, /\/api\/kugou-concept\/playlist\/tracks/);
});

test('概念版播放恢复、提示和歌词缓存保持独立账号身份', () => {
  const api = require(path.join(root, 'kugou-api.js'));
  const fallback = read('public/js/modules/05-playback/11-provider-fallback.js');
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const login = read('public/js/modules/08-account/02-login-status.js');
  const lyric = read('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js');
  assert.deepEqual(api._test.kugouConceptQualityLevels('hires'), ['hires', 'lossless', 'exhigh', 'standard']);
  assert.equal(api._test.kugouConceptPlaybackCategory({ message: '会员权限不足' }, { playbackReady: true }), 'vip_required');
  assert.equal(api._test.kugouConceptPlaybackCategory({ message: 'token expired' }, { playbackReady: true }), 'login_required');
  assert.equal(api._test.kugouConceptPlaybackCategory({ message: '版权地区不可用' }, { playbackReady: true }), 'copyright_unavailable');
  assert.match(fallback, /songKugouVariant\(song\) === 'concept' \? '酷狗概念版' : '酷狗音乐'/);
  assert.match(fallback, /return 'kugouConcept'/);
  assert.match(playback, /playbackAccountProvider === 'kugouConcept'/);
  assert.match(playback, /applyKugouConceptPlaybackStatusEvidence\(data\)/);
  assert.match(playback, /openProviderLogin\(playbackAccountProvider\)/);
  assert.match(login, /function applyKugouConceptPlaybackStatusEvidence\(info\)/);
  assert.match(lyric, /provider = 'kugouConcept'/);
});

test('概念版搜索和播放处理器已导出给服务路由', () => {
  const api = require(path.join(root, 'kugou-api.js'));
  assert.equal(typeof api.handleKugouConceptSearch, 'function');
  assert.equal(typeof api.handleKugouConceptSongUrl, 'function');
  const source = read('kugou-api.js');
  assert.match(source, /page_id:\s*967177915/);
  assert.match(source, /ppage_id:\s*'356753938,823673182,967485191'/);
  assert.match(source, /appid:\s*KUGOU_CONCEPT_APPID/);
  assert.match(source, /query\.signature = conceptSignature\(query, ''\)/);
});

test('概念版推荐只保留带播放标识且未明确受限的歌曲', () => {
  const api = read('kugou-api.js');
  assert.match(api, /filter\(song => song\.name && song\.hash && song\.albumAudioId\)/);
  assert.match(api, /filter\(song => song\.playable !== false\)/);
});

test('网易云每日推荐与概念版异步推荐保持隔离', () => {
  const discover = read('public/js/modules/05-playback/03-home-discover-weather.js');
  const dashboard = read('public/js/modules/05-playback/03a-home-dashboard.js');
  assert.match(discover, /song\.provider === 'netease' && song\.source === 'netease'/);
  assert.match(discover, /song\.kugouVariant === 'concept'/);
  assert.match(discover, /homeDiscoverState\.loggedIn = !!\(data && data\.loggedIn\)/);
  assert.doesNotMatch(discover, /homeDiscoverState\.loggedIn = [^\n]*\|\| hasAnyPlatformLogin\(\)/);
  assert.match(discover, /function sanitizeHomeDiscoverSongs\(\)/);
  assert.match(discover, /function normalizeNeteaseHomeDiscoverSong\(song\)/);
  assert.match(discover, /delete song\.customCover/);
  assert.match(discover, /map\(normalizeNeteaseHomeDiscoverSong\)\.filter\(Boolean\)/);
  assert.match(dashboard, /sanitizeHomeDiscoverSongs\(\)/);
  assert.match(dashboard, /source === 'kugouConcept'[\s\S]{0,160}song\.kugouVariant === 'concept'/);
  assert.match(dashboard, /requestId !== feedState\.requestId/);
  assert.match(dashboard, /homeDiscoverState\.songs/);
  assert.doesNotMatch(
    dashboard.match(/async function loadHomePlatformFeedRecommendations[\s\S]*?\n\}/)[0],
    /homeDiscoverState\.songs\s*=/,
  );
});

test('概念版推荐和只读我喜欢具有明确降级状态', async () => {
  const api = require(path.join(root, 'kugou-api.js'));
  const recommendation = await api.handleKugouConceptRecommendations('', 12);
  const playlists = await api.handleKugouConceptUserPlaylists('');
  assert.equal(recommendation.provider, 'kugouConcept');
  assert.equal(recommendation.kugouVariant, 'concept');
  assert.equal(recommendation.error, 'KUGOU_CONCEPT_AUTH_REQUIRED');
  assert.equal(playlists.provider, 'kugouConcept');
  assert.equal(playlists.error, 'KUGOU_CONCEPT_AUTH_REQUIRED');
  const source = read('kugou-api.js');
  assert.match(source, /KUGOU_CONCEPT_LIKED_PLAYLIST_ID = 'concept-liked'/);
  assert.match(source, /mode:\s*'concept-user-songs'/);
  assert.match(source, /cloudPlaylists:\s*false, playlistWrite:\s*false, likeWrite:\s*false/);
});

test('退出概念版不会清理普通酷狗歌单，并且未接入每日 VIP 领取', () => {
  const logout = read('public/js/modules/08-account/04-user-modal-logout.js');
  const loginStatus = read('public/js/modules/08-account/02-login-status.js');
  const api = read('kugou-api.js');
  const server = read('server.js');
  assert.match(logout, /pl\.provider === 'kugouConcept' \|\| pl\.kugouVariant === 'concept'/);
  assert.match(loginStatus, /pl\.provider === 'kugouConcept' \|\| pl\.kugouVariant === 'concept'/);
  assert.match(loginStatus, /kugouConceptPlaylists = \[\]/);
  assert.doesNotMatch(api + server, /receive_vip_listen_song|upgrade_vip_reward/);
});

test('发现中心包含概念版真实每日推荐入口', () => {
  const html = read('public/index.html');
  const home = read('public/js/modules/05-playback/03a-home-dashboard.js');
  assert.match(html, /data-home-recommend-source="kugouConcept"/);
  assert.match(html, /data-home-source-pulse="kugouConcept"/);
  assert.match(home, /endpoint:\s*'\/api\/kugou-concept\/recommendations\?limit=12'/);
  assert.match(home, /\^\(qishui\|kugou\|kugouConcept\|spotify\)-song\$/);
});
