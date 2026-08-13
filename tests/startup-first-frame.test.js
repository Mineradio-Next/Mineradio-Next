'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('the main window never exposes Chromium white before the splash first frame', () => {
  const main = read('desktop/main.js');
  const preload = read('desktop/preload.js');
  const startup = read('desktop/startup.html');
  const html = read('public/index.html');

  assert.match(main, /show:\s*false,[\s\S]*transparent:\s*true,[\s\S]*backgroundColor:\s*'#010304'/);
  assert.match(preload, /scheduleStartupFirstFrameProbe\(\)[\s\S]*window\.addEventListener\('DOMContentLoaded'/);
  assert.match(preload, /requestAnimationFrame\(\(\)\s*=>\s*requestAnimationFrame\(\(\)\s*=>/);
  assert.match(preload, /splashCoversViewport \|\| rootCoversViewport/);
  assert.match(preload, /rootCoversViewport = window\.innerWidth > 0[\s\S]*isOpaqueDarkStartupColor\(htmlColor\)/);
  assert.match(preload, /ipcRenderer\.send\('mineradio-startup-first-frame-ready'/);
  assert.match(preload, /reportStartupFirstFrame:\s*\(\)\s*=>\s*reportStartupFirstFrame\(\)/);
  assert.match(preload, /documentKind:\s*'main'/);
  assert.match(main, /async function createStartupShellWindow\(owner, bounds\)[\s\S]*skipTaskbar:\s*true[\s\S]*backgroundColor:\s*'#010304'[\s\S]*shellWindow\.loadFile\(startupShell\)[\s\S]*shellWindow\.show\(\)/);
  assert.match(main, /payload\.documentKind !== 'main'[\s\S]*event\.senderFrame !== win\.webContents\.mainFrame/);
  assert.match(main, /await revealMainWindowAfterFirstFrame\(win, firstFrameSignal\.promise\)/);
  assert.match(main, /showMainWindowSafely\(win, 'renderer-first-frame'\)[\s\S]*win\.setBackgroundColor\('#00000000'\)/);
  assert.match(main, /writeStartupState\('main-frame-visible'/);
  assert.match(main, /Promise\.all\(\[[\s\S]*createStartupShellWindow\(win, initialBounds\)[\s\S]*ensureLocalServerStarted\(\)[\s\S]*startupDelay\(STARTUP_SHELL_MIN_VISIBLE_MS\)/);
  assert.match(main, /const STARTUP_HANDOFF_EXIT_MS = 340/);
  assert.match(main, /async function handoffStartupShellToMainWindow\(win\)[\s\S]*shellWindow\.setParentWindow\(win\)[\s\S]*showMainWindowSafely\(win, 'renderer-first-frame'\)[\s\S]*startup-handoff-leaving[\s\S]*startupDelay\(STARTUP_HANDOFF_EXIT_MS\)[\s\S]*closeStartupShellWindow\(win\)[\s\S]*await startMainSplashAfterHandoff\(win\)/);
  assert.match(main, /writeStartupState\('startup-handoff-start'[\s\S]*writeStartupState\('startup-handoff-complete'/);
  assert.match(main, /await handoffStartupShellToMainWindow\(win\)/);
  assert.doesNotMatch(main, /setWindowOpacitySafely|animateStartupWindowCrossfade|crossfadeStartupShellToMainWindow/);
  assert.doesNotMatch(main, /showMainWindowSafely\(win, 'renderer-first-frame'\);\s*closeStartupShellWindow\(win\);\s*writeStartupState\('main-frame-visible'/);
  assert.doesNotMatch(main, /win\.once\('ready-to-show',\s*\(\)\s*=>\s*showMainWindowSafely/);
  assert.doesNotMatch(main, /win\.webContents\.on\('dom-ready',\s*\(\)\s*=>\s*\{\s*showMainWindowSafely/);
  assert.match(main, /showMainWindowSafely\(win, 'watchdog'\)/);
  assert.match(main, /const STARTUP_FIRST_FRAME_TIMEOUT_MS = 9000/);
  assert.match(main, /framePromise,[\s\S]*STARTUP_FIRST_FRAME_TIMEOUT_MS,[\s\S]*'renderer first frame'/);
  assert.match(startup, /is-leaving \.boot[\s\S]*opacity:\s*0[\s\S]*scale\(\.992\)/);
  assert.match(startup, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(startup, /正在进入播放器/);

  const firstFrameStyle = /<style id="startup-first-frame">([\s\S]*?)<\/style>/.exec(html);
  assert.ok(firstFrameStyle, 'index.html must provide a first-frame style before external assets');
  assert.match(firstFrameStyle[1], /html, body\s*\{[^}]*background:\s*#010304/);
  assert.match(firstFrameStyle[1], /#startup-handoff-bridge[\s\S]*background:\s*#010304/);
  assert.match(html, /<html lang="zh-CN" class="startup-handoff-pending">/);
  assert.match(html, /id="startup-handoff-bridge"[\s\S]*正在进入播放器/);
  assert.match(html, /window\.__mineradioStartupHandoffReleasedAt = performance\.now\(\)[\s\S]*classList\.remove\('startup-handoff-pending'\)/);
  assert.match(preload, /handoffPending \? handoffCoversViewport/);
  assert.match(preload, /handoffPending && document\.readyState === 'loading'\) return false/);
  assert.match(preload, /handoffReady:\s*handoffPending \? handoffCoversViewport : true/);
  assert.match(main, /payload\.handoffReady !== true/);
  assert.match(main, /main-splash-started[\s\S]*mainSplashReleaseOk:\s*ok/);
  assert.doesNotMatch(main, /startMainSplashAfterHandoff[\s\S]{0,900}requestAnimationFrame/);
  assert.match(main, /MINERADIO_STARTUP_QA_FORCE_SPLASH === '1'[\s\S]*startupForceSplash=1/);
  assert.ok(
    html.indexOf('id="startup-first-frame"') < html.indexOf('rel="stylesheet"'),
    'the first-frame background must precede external stylesheets',
  );
  assert.ok(
    html.indexOf('id="startup-first-frame-probe"') < html.indexOf('src="vendor/three.r128.min.js"'),
    'the renderer first-frame probe must run before blocking application assets',
  );
  assert.match(html, /requestAnimationFrame\(\(\)\s*=>\s*requestAnimationFrame[\s\S]*desktopWindow\.reportStartupFirstFrame\(\)/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com[^>]+rel="stylesheet"/);
  assert.match(html, /fonts\.googleapis\.com[^>]+rel="preload" as="style"/);
});
