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

test('酷狗概念版二维码失败时返回可操作的导入提示', () => {
  const server = read('server.js');
  assert.match(server, /酷狗概念版二维码暂时不可用，请使用 Cookie 导入/);
  assert.match(server, /}, 502\);/);
});
