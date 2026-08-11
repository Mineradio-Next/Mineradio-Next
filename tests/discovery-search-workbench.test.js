'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(appRoot, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'public', 'css', 'index.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '03a-home-dashboard.js'), 'utf8');
const search = fs.readFileSync(path.join(appRoot, 'public', 'js', 'modules', '05-playback', '07-search.js'), 'utf8');

function namedFunctionSource(source, name) {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  if (!declaration) return '';
  const start = source.indexOf('{', declaration.index + declaration[0].length);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return source.slice(declaration.index, index + 1);
  }
  return '';
}

test('existing discovery surface owns the new source pulse and state language', () => {
  assert.match(html, /id="home-platform-recommend-mask"/);
  assert.match(html, /id="home-platform-source-pulse"/);
  for (const source of ['netease', 'qishui', 'qq', 'kugou', 'spotify']) {
    assert.match(html, new RegExp(`data-home-source-pulse="${source}"`));
  }
  assert.match(dashboard, /function homePlatformSourcePulseState/);
  assert.match(dashboard, /data-state="' \+ state/);
  assert.match(dashboard, /需要连接账号|来源暂不可用|没有可展示内容/);
  assert.match(css, /\.home-platform-source-pulse-item\[data-state="ready"\]/);
  assert.doesNotMatch(html, /音乐发现中心|\bLX\b/);
});

test('search content filters separate studio and derivative versions without changing source data', () => {
  const functions = ['searchVersionSignature', 'searchLooksLikeDerivative', 'searchSongIsVersion', 'filterSearchSongs']
    .map(name => namedFunctionSource(search, name)).join('\n');
  const context = vm.createContext({});
  vm.runInContext(functions, context);
  const songs = [
    { name: '晴天', album: '叶惠美' },
    { name: '晴天 (Live)', album: '演唱会' },
    { name: '晴天 伴奏', album: 'Instrumental' },
  ];
  assert.deepEqual(Array.from(context.filterSearchSongs(songs, 'all'), song => song.name), ['晴天', '晴天 (Live)', '晴天 伴奏']);
  assert.deepEqual(Array.from(context.filterSearchSongs(songs, 'original'), song => song.name), ['晴天']);
  assert.deepEqual(Array.from(context.filterSearchSongs(songs, 'version'), song => song.name), ['晴天 (Live)', '晴天 伴奏']);
});

test('top search adds context and working local filters without another search entry', () => {
  assert.equal((html.match(/id="search-area"/g) || []).length, 1);
  assert.match(html, /id="search-context"/);
  assert.match(html, /data-search-content-filter="all"/);
  assert.match(html, /data-search-content-filter="original"/);
  assert.match(html, /data-search-content-filter="version"/);
  assert.match(search, /function setSearchContentFilter/);
  assert.match(search, /playlist = searchMusicRenderState\.songs/);
  assert.match(search, /searchMusicRenderState\.allSongs/);
  assert.match(css, /\.search-content-tabs button\.active/);
  assert.match(search, /function searchBackdropNeedsDepth/);
  assert.match(css, /#search-area\.search-backdrop-deep #search-results\.show/);
});
