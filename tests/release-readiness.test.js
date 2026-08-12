'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('release metadata consistently targets Mineradio Next', () => {
  const packageInfo = JSON.parse(read('package.json'));
  const lockInfo = JSON.parse(read('package-lock.json'));
  const html = read('public/index.html');
  const state = read('public/js/modules/00-state/01-perf-render-state.js');
  const installer = read('build/installer.nsh');
  const checksums = read('scripts/create-release-checksums.js');

  assert.equal(packageInfo.version, '2.2.0');
  assert.equal(lockInfo.version, packageInfo.version);
  assert.equal(lockInfo.packages[''].version, packageInfo.version);
  assert.equal(packageInfo.productName, 'Mineradio Next');
  assert.equal(packageInfo.build.appId, 'com.mineradio.next');
  assert.equal(packageInfo.build.win.executableName, 'Mineradio-Next');
  assert.equal(packageInfo.build.publish[0].owner, 'Mineradio-Next');
  assert.equal(packageInfo.build.publish[0].repo, 'Mineradio-Next');
  assert.equal(packageInfo.mineradio.update.owner, 'Mineradio-Next');
  assert.equal(packageInfo.mineradio.update.repo, 'Mineradio-Next');
  assert.match(html, /id="update-modal-version"[^>]*>v2\.2\.0<\/div>/);
  assert.match(state, /currentVersion:\s*'2\.2\.0'/);
  assert.match(installer, /MINERADIO_INSTALL_TITLE "Mineradio Next 安装"/);
  assert.match(checksums, /Mineradio-Next-\$\{version\}-Setup\.exe/);
  assert.match(checksums, /'latest\.yml'/);
  assert.doesNotMatch(checksums, /builder-debug/);
});

test('repository exposes guarded CI and draft release workflows', () => {
  const ci = read('.github/workflows/ci.yml');
  const release = read('.github/workflows/release.yml');
  const readme = read('README.md');

  assert.match(ci, /npm ci/);
  assert.match(ci, /npm test/);
  assert.match(ci, /npm run check/);
  assert.match(ci, /npm run security:audit/);
  assert.match(release, /tags:[\s\S]*"v\*"/);
  assert.match(release, /packageVersion[\s\S]*tagVersion/);
  assert.match(release, /draft:\s*true/);
  assert.match(release, /npm run release:checksums/);
  assert.match(release, /RELEASE_NOTES_v\$packageVersion\.md/);
  assert.match(readme, /github\.com\/Mineradio-Next\/Mineradio-Next\/releases/);
  assert.doesNotMatch(readme, /github\.com\/XxHuberrr\/Mineradio\/releases/);
});
