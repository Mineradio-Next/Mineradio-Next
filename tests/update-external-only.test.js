'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
const serverText = read('server.js');
const updateUiText = read('public/js/modules/08-account/00-update-preview.js');
const htmlText = read('public/index.html');
const cssText = read('public/css/index.css');
const modalUtilsText = read('public/js/modules/08-account/01-login-modal-utils.js');
const shortcutText = read('public/js/modules/10-shell/01-viewport-resize-shortcuts.js');
const packageData = JSON.parse(read('package.json'));

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `missing ${name}`);
  assert.notEqual(end, -1, `missing ${nextName}`);
  return source.slice(start, end);
}

function standaloneFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
      opened = true;
    } else if (source[index] === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated ${name}`);
}

test('update source is the official Mineradio Next GitHub Releases page only', () => {
  assert.equal(packageData.mineradio.update.provider, 'github');
  assert.equal(packageData.mineradio.update.owner, 'Mineradio-Next');
  assert.equal(packageData.mineradio.update.repo, 'Mineradio-Next');
  assert.equal(packageData.mineradio.update.preview, false);
  assert.equal(packageData.mineradio.update.mirrors, undefined);
  assert.match(serverText, /parsed\.hostname\.toLowerCase\(\) !== 'github\.com'/);
  assert.match(serverText, /const releaseRoot = `\/\$\{UPDATE_CONFIG\.owner\}\/\$\{UPDATE_CONFIG\.repo\}\/releases`/);
  assert.doesNotMatch(serverText, /MINERADIO_UPDATE_MIRRORS|ghfast|gh-proxy|llkk/);

  const sandbox = { URL, UPDATE_CONFIG: { owner: 'Mineradio-Next', repo: 'Mineradio-Next' } };
  vm.runInNewContext(functionSource(serverText, 'safeExternalUpdateUrl', 'normalizeManifestUpdateInfo'), sandbox);
  assert.equal(
    sandbox.safeExternalUpdateUrl('https://github.com/Mineradio-Next/Mineradio-Next/releases/tag/v2.3.0'),
    'https://github.com/Mineradio-Next/Mineradio-Next/releases/tag/v2.3.0'
  );
  assert.equal(sandbox.safeExternalUpdateUrl('https://github.com/another/repo/releases/tag/v1'), '');
  assert.equal(sandbox.safeExternalUpdateUrl('https://example.com/Mineradio-Next/Mineradio-Next/releases'), '');
  assert.equal(sandbox.safeExternalUpdateUrl('http://github.com/Mineradio-Next/Mineradio-Next/releases'), '');
  assert.equal(sandbox.safeExternalUpdateUrl('https://github.com:8443/Mineradio-Next/Mineradio-Next/releases'), '');
  assert.equal(sandbox.safeExternalUpdateUrl('https://user:pass@github.com/Mineradio-Next/Mineradio-Next/releases'), '');
});

test('renderer keeps update delivery external and has no installer or mirror workflow', () => {
  assert.match(updateUiText, /desktopWindow\.openUpdatePage\(target\)/);
  assert.match(updateUiText, /UPDATE_RELEASE_ORIGIN = 'https:\/\/github\.com'/);
  assert.match(updateUiText, /UPDATE_RELEASE_PATH = '\/Mineradio-Next\/Mineradio-Next\/releases'/);
  assert.match(htmlText, /前往 GitHub 更新/);
  assert.match(updateUiText, /remindedLater/);
  assert.match(updateUiText, /UPDATE_IGNORED_VERSION_KEY/);
  assert.match(updateUiText, /restoreIgnoredUpdateVersion/);
  assert.match(updateUiText, /var updatePanelCloseTimer = null/);
  assert.match(updateUiText, /showUpdateModal\(\)[\s\S]*clearTimeout\(updatePanelCloseTimer\)/);
  assert.doesNotMatch(updateUiText, /setTimeout\(closeUpdatePanel/);
  assert.doesNotMatch(updateUiText, /\/api\/update\/(?:download|patch)/);
  assert.doesNotMatch(updateUiText, /openUpdateInstaller|downloadPages|download-source|网盘|镜像/);

  assert.match(serverText, /error:\s*'UPDATE_EXTERNAL_ONLY'/);
  assert.doesNotMatch(serverText, /startUpdateDownloadJob|startUpdatePatchJob|updateDownloadJobs|UPDATE_DOWNLOAD_DIR|pickPatchAsset/);
});

test('A update modal preserves the approved typography, actions, and quiet states', () => {
  assert.match(htmlText, new RegExp(`id="update-modal-version"[^>]*>${packageData.version.replace(/\./g, '\\.')}<\/div>`));
  assert.match(htmlText, /MINERADIO NEXT · 新版本/);
  assert.match(htmlText, /id="update-primary-btn"[\s\S]*前往 GitHub 更新/);
  assert.match(htmlText, /onclick="remindUpdateLater\(\)"[\s\S]*稍后提醒/);
  assert.match(htmlText, /onclick="ignoreCurrentUpdateVersion\(\)"[\s\S]*忽略此版本/);
  assert.match(htmlText, /id="update-status-content"/);
  assert.match(cssText, /\.modal\.update-modal\s*\{[\s\S]*max-width:\s*440px/);
  assert.match(cssText, /\.update-version\s*\{[\s\S]*font-size:\s*32px[\s\S]*font-variant-numeric:\s*tabular-nums/);
  assert.match(cssText, /\.update-hero-main\s*\{[\s\S]*font-size:\s*15px/);
  assert.match(cssText, /\.update-primary-btn\s*\{[\s\S]*background:\s*#ff5367/);
  assert.match(cssText, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(modalUtilsText, /compactUpdateMotion = mask\.id === 'update-modal'/);
  assert.match(modalUtilsText, /duration: reduceUpdateMotion \? 0\.16 : \(compactUpdateMotion \? 0\.28 : 0\.68\)/);
  assert.match(modalUtilsText, /duration: reduceUpdateMotion \? 0\.16 : \(compactUpdateMotion \? 0\.22 : 0\.34\)/);
  assert.match(modalUtilsText, /reduceUpdateMotion[\s\S]*prefers-reduced-motion: reduce/);
  assert.match(modalUtilsText, /ease: compactUpdateMotion \? 'power2\.out' : 'power2\.in'/);
  assert.match(shortcutText, /updateModal\.classList\.contains\('show'\)[\s\S]*closeUpdatePanel\(\)/);
  assert.match(updateUiText, /duration: 0\.24, stagger: 0\.025[\s\S]*delay: 0\.03/);
  assert.doesNotMatch(htmlText, /update-download-sources|New release|查看更新页面/);
});

test('automatic failures stay quiet while manual checks have an inline retry state', () => {
  assert.match(serverText, /checkFailed:\s*!!reason/);
  assert.match(updateUiText, /if \(data && data\.checkFailed\) throw new Error/);
  assert.match(updateUiText, /if \(manual \|\| updatePreviewState\.open\) renderUpdatePreviewPanel\('error'\)/);
  assert.match(updateUiText, /if \(manual\) \{[\s\S]*renderUpdatePreviewPanel\('checking'\);[\s\S]*showUpdateModal\(\)/);
  assert.match(updateUiText, /if \(manual \|\| updatePreviewState\.open\)[\s\S]*renderUpdatePreviewPanel/);
  assert.match(updateUiText, /不会影响播放，恢复网络后可以重新检查/);
});

test('release template exposes only the intended summary and highlights in-app', () => {
  const template = read('.github/RELEASE_TEMPLATE.md');
  assert.match(template, /mineradio-update-summary:start[\s\S]*mineradio-update-summary:end/);
  assert.match(template, /mineradio-update-highlights:start[\s\S]*mineradio-update-highlights:end/);
  assert.match(serverText, /function extractReleasePresentation\(body\)/);

  const sandbox = {};
  vm.runInNewContext([
    standaloneFunctionSource(serverText, 'cleanReleaseLine'),
    standaloneFunctionSource(serverText, 'extractReleaseNotes'),
    standaloneFunctionSource(serverText, 'extractReleasePresentation'),
  ].join('\n'), sandbox);
  const parsed = sandbox.extractReleasePresentation(`
# Mineradio Next v2.3.0
<!-- mineradio-update-summary:start -->
播放更稳，桌面体验更完整
<!-- mineradio-update-summary:end -->
## 本次更新
<!-- mineradio-update-highlights:start -->
- 连续播放：修复来源切换后的中断
- 桌面歌词：改善高 DPI 下的清晰度
- 曲库整理：批量操作反馈更明确
<!-- mineradio-update-highlights:end -->
## 安装
- 安装包：Mineradio-Next-2.3.0-Setup.exe
`);
  assert.equal(parsed.summary, '播放更稳，桌面体验更完整');
  assert.deepEqual(Array.from(parsed.notes), [
    '连续播放：修复来源切换后的中断',
    '桌面歌词：改善高 DPI 下的清晰度',
    '曲库整理：批量操作反馈更明确',
  ]);
});

test('update UI has an isolated multi-state visual QA entry', () => {
  const liveQa = read('scripts/check-update-ui-live.js');
  assert.equal(packageData.scripts['qa:update-ui'], 'node scripts/check-update-ui-live.js');
  assert.equal(packageData.scripts['qa:update-ui:review'], 'node scripts/check-update-ui-live.js --review');
  assert.match(liveQa, /MINERADIO_STARTUP_QA_USER_DATA:\s*userDataPath/);
  assert.match(liveQa, /MINERADIO_STARTUP_QA_VISIBLE:\s*'1'/);
  assert.match(liveQa, /release-1280x720/);
  assert.match(liveQa, /release-long-1440x900-hidpi/);
  assert.match(liveQa, /latest-1280x720/);
  assert.match(liveQa, /error-1280x720/);
  assert.match(liveQa, /ignored-1280x720/);
  assert.match(liveQa, /Page\.captureScreenshot/);
});
