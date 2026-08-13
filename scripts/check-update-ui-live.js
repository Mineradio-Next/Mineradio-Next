#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const electronPath = path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const outputDir = path.join(appRoot, 'output', 'update-ui-qa');
const callTimeoutMs = 9000;
const reviewMode = process.argv.includes('--review');

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(Number(address.port)));
    });
  });
}

async function waitForCdp(port, child) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`isolated update QA exited before CDP was ready (${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        if (targets.some(item => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''))) return;
      }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('isolated update QA CDP was not ready');
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode != null) return Promise.resolve(child && child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('isolated update QA did not exit normally')), timeoutMs);
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

async function connectClient(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const target = targets.find(item => item.type === 'page' && /127\.0\.0\.1/.test(item.url || ''));
  assert(target && target.webSocketDebuggerUrl, 'Mineradio page target was not found');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP WebSocket open timed out')), callTimeoutMs);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket failed')); }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  function call(method, params = {}, timeoutMs = callTimeoutMs) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, timeoutMs);
      pending.set(id, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(error) { clearTimeout(timer); reject(error); },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression, timeoutMs = callTimeoutMs) {
    const result = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result && result.result.value;
  }
  return { socket, call, evaluate };
}

function assertLayout(snapshot) {
  assert(snapshot.modal.width <= 441, `${snapshot.name}: update panel is wider than 440px`);
  assert(snapshot.modal.left >= 0 && snapshot.modal.right <= snapshot.viewport.width, `${snapshot.name}: update panel leaves viewport horizontally`);
  assert(snapshot.modal.top >= 0 && snapshot.modal.bottom <= snapshot.viewport.height, `${snapshot.name}: update panel leaves viewport vertically`);
  assert(Math.abs(snapshot.modalCenterX - snapshot.viewport.width / 2) < 2, `${snapshot.name}: update panel is not horizontally centered`);
  assert(Math.abs(snapshot.modalCenterY - snapshot.viewport.height / 2) < 2, `${snapshot.name}: update panel is not vertically centered (${snapshot.modalCenterY} vs ${snapshot.viewport.height / 2})`);
  assert.equal(snapshot.overflowing.length, 0, `${snapshot.name}: overflowing text: ${snapshot.overflowing.join(', ')}`);
  assert.equal(snapshot.actionOverlap, false, `${snapshot.name}: action buttons overlap`);
  assert.match(snapshot.fontFamily, /Noto Sans SC|PingFang SC|HarmonyOS Sans SC|Alibaba PuHuiTi|system-ui/i);
  assert.match(snapshot.modalBackground, /linear-gradient/i, `${snapshot.name}: user glass preset overrode update material`);
  assert.equal(snapshot.maskReadable, true, `${snapshot.name}: update mask is too transparent`);
}

async function main() {
  assert(process.platform === 'win32', 'update UI live check requires Windows');
  assert(fs.existsSync(electronPath), `Electron executable not found: ${electronPath}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mineradio-update-ui-qa-'));
  const userDataPath = path.join(qaRoot, 'user-data');
  const cacheRoot = path.join(qaRoot, 'cache');
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(path.join(userDataPath, 'cache-settings.json'), JSON.stringify({ version: 1, rootPath: cacheRoot }), 'utf8');
  const port = await reserveLoopbackPort();
  let child;
  let client;
  let output = '';
  try {
    child = spawn(electronPath, [`--remote-debugging-port=${port}`, appRoot], {
      cwd: appRoot,
      windowsHide: true,
      env: {
        ...process.env,
        MINERADIO_RUNTIME_NAME: `MineradioUpdateUiQA-${process.pid}-${Date.now()}`,
        MINERADIO_APP_USER_MODEL_ID: `com.mineradio.update-ui.qa.${process.pid}`,
        MINERADIO_NO_DESKTOP_SHORTCUT: '1',
        MINERADIO_CREATE_DESKTOP_SHORTCUT: '0',
        MINERADIO_STARTUP_QA_USER_DATA: userDataPath,
        ...(reviewMode
          ? { MINERADIO_STARTUP_QA_VISIBLE: '1' }
          : { MINERADIO_STARTUP_QA_HIDDEN: '1', MINERADIO_STARTUP_QA_EXIT_MS: '60000' }),
        MINERADIO_KEEP_BACKGROUND_RENDERING: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-16000); });
    child.stderr.on('data', chunk => { output = (output + chunk.toString()).slice(-16000); });
    await waitForCdp(port, child);
    client = await connectClient(port);
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    const ready = await client.evaluate(`(async () => {
      const deadline = performance.now() + 20000;
      while (performance.now() < deadline) {
        if (document.readyState === 'complete' && typeof renderUpdatePreviewPanel === 'function' && typeof dismissSplash === 'function') return true;
        await new Promise(resolve => setTimeout(resolve, 60));
      }
      return false;
    })()`, 25000);
    assert.equal(ready, true, 'update UI did not become ready');
    await client.evaluate(`(() => {
      document.documentElement.classList.add('control-glass-svg-ok');
      document.body.classList.add('empty-home-active');
      return true;
    })()`);
    const handoffComplete = await client.evaluate(`(async () => {
      const deadline = performance.now() + 8000;
      while (performance.now() < deadline) {
        const bridge = document.getElementById('startup-handoff-bridge');
        if (!document.documentElement.classList.contains('startup-handoff-pending')
          && (!bridge || bridge.hidden || getComputedStyle(bridge).visibility === 'hidden')) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return false;
    })()`, 10000);
    assert.equal(handoffComplete, true, 'startup handoff did not finish before update UI QA');
    const splashComplete = await client.evaluate(`(async () => {
      dismissSplash({ instant: true });
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        const splash = document.getElementById('splash');
        if (!splash || splash.style.display === 'none' || splash.classList.contains('hide')) return true;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return false;
    })()`, 5000);
    assert.equal(splashComplete, true, 'splash did not finish before update UI QA');

    if (reviewMode) {
      await client.evaluate(`(() => {
        updatePreviewState.currentVersion = '2.2.0';
        updatePreviewState.version = '2.3.0';
        updatePreviewState.updateAvailable = true;
        updatePreviewState.ignored = false;
        updatePreviewState.releaseUrl = 'https://github.com/Mineradio-Next/Mineradio-Next/releases/tag/v2.3.0';
        updatePreviewState.hero = '\u64ad\u653e\u66f4\u7a33\uff0c\u684c\u9762\u4f53\u9a8c\u66f4\u5b8c\u6574';
        updatePreviewState.notes = [
          { title: '\u8fde\u7eed\u64ad\u653e', detail: '\u4fee\u590d\u6765\u6e90\u5207\u6362\u540e\u7684\u4e2d\u65ad' },
          { title: '\u684c\u9762\u6b4c\u8bcd', detail: '\u6539\u5584\u9ad8 DPI \u4e0b\u7684\u6e05\u6670\u5ea6' },
          { title: '\u66f2\u5e93\u6574\u7406', detail: '\u6279\u91cf\u64cd\u4f5c\u53cd\u9988\u66f4\u660e\u786e' },
        ];
        renderUpdatePreviewPanel('release');
        showUpdateModal();
        return true;
      })()`);
      console.log('Mineradio Next update review is ready. Close the review client to finish.');
      const exitCode = await waitForExit(child, 24 * 60 * 60 * 1000);
      assert.equal(exitCode, 0, `isolated update review exited with ${exitCode}`);
      return;
    }

    const scenarios = [
      { name: 'release-1280x720', view: 'release', width: 1280, height: 720, scale: 1, long: false },
      { name: 'release-long-1440x900-hidpi', view: 'release', width: 1440, height: 900, scale: 1.5, long: true },
      { name: 'latest-1280x720', view: 'latest', width: 1280, height: 720, scale: 1, long: false },
      { name: 'error-1280x720', view: 'error', width: 1280, height: 720, scale: 1, long: false },
      { name: 'ignored-1280x720', view: 'ignored', width: 1280, height: 720, scale: 1, long: false },
    ];
    const report = [];
    for (const scenario of scenarios) {
      await client.call('Emulation.setDeviceMetricsOverride', {
        width: scenario.width,
        height: scenario.height,
        deviceScaleFactor: scenario.scale,
        mobile: false,
      });
      const snapshot = await client.evaluate(`(async () => {
        updatePreviewState.currentVersion = '2.2.0';
        updatePreviewState.version = '2.3.0';
        updatePreviewState.updateAvailable = true;
        updatePreviewState.ignored = ${scenario.view === 'ignored'};
        updatePreviewState.releaseUrl = 'https://github.com/Mineradio-Next/Mineradio-Next/releases/tag/v2.3.0';
        updatePreviewState.hero = ${JSON.stringify(scenario.long ? '播放体验、桌面交互与多来源曲库在这一版获得了更加稳定而完整的更新' : '播放更稳，桌面体验更完整')};
        updatePreviewState.notes = ${JSON.stringify(scenario.long ? [
          { title: '连续播放与来源切换', detail: '改善较长歌单连续播放、来源失效恢复以及切歌时的状态反馈' },
          { title: '桌面歌词和高分辨率显示', detail: '调整字体清晰度、内容间距与高 DPI 环境下的阅读体验' },
          { title: '音乐库整理工作流', detail: '统一收藏、历史记录与本地歌曲批量管理现在更加清楚顺手' },
        ] : [
          { title: '连续播放', detail: '修复来源切换后的中断' },
          { title: '桌面歌词', detail: '改善高 DPI 下的清晰度' },
          { title: '曲库整理', detail: '批量操作反馈更明确' },
        ])};
        renderUpdatePreviewPanel(${JSON.stringify(scenario.view)});
        showUpdateModal();
        await new Promise(resolve => setTimeout(resolve, 120));
        const modal = document.querySelector('#update-modal .update-modal');
        const mask = document.getElementById('update-modal');
        if (window.gsap) {
          const visibleParts = modal.querySelectorAll('.update-release-content:not([hidden]) > *, .update-status-content:not([hidden]) > *');
          window.gsap.killTweensOf(mask);
          window.gsap.killTweensOf(modal);
          window.gsap.killTweensOf(visibleParts);
          window.gsap.set(mask, { display: 'flex', visibility: 'visible', opacity: 1 });
          window.gsap.set(modal, { opacity: 1, visibility: 'visible', y: 0, scale: 1, filter: 'blur(0px)' });
          window.gsap.set(visibleParts, { opacity: 1, visibility: 'visible', y: 0, filter: 'blur(0px)' });
        }
        await new Promise(resolve => setTimeout(resolve, 40));
        const modalRect = modal.getBoundingClientRect();
        const actionButtons = Array.from(modal.querySelectorAll('.update-actions button:not([hidden]), .update-status-actions button:not([hidden])'));
        const actionRects = actionButtons.map(node => node.getBoundingClientRect());
        const actionOverlap = actionRects.some((first, index) => actionRects.slice(index + 1).some(second =>
          first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
        ));
        const textNodes = Array.from(modal.querySelectorAll('.update-kicker,.update-version,.update-hero-main,.update-hero-sub,.update-item strong,.update-item span,.update-status-title,.update-status-copy,button'))
          .filter(node => node.offsetParent !== null);
        const overflowing = textNodes.filter(node => {
          const nodeStyle = getComputedStyle(node);
          const clipsX = /hidden|clip|auto|scroll/.test(nodeStyle.overflowX);
          const clipsY = /hidden|clip|auto|scroll/.test(nodeStyle.overflowY);
          return (clipsX && node.scrollWidth > node.clientWidth + 1) || (clipsY && node.scrollHeight > node.clientHeight + 1);
        })
          .map(node => (node.id || node.className || node.textContent.slice(0, 18)) + ':' + node.scrollWidth + 'x' + node.scrollHeight + '/' + node.clientWidth + 'x' + node.clientHeight);
        const style = getComputedStyle(modal);
        const maskStyle = getComputedStyle(mask);
        return {
          name: ${JSON.stringify(scenario.name)},
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
          modal: { left: modalRect.left, right: modalRect.right, top: modalRect.top, bottom: modalRect.bottom, width: modalRect.width, height: modalRect.height },
          modalCenterX: modalRect.left + modalRect.width / 2,
          modalCenterY: modalRect.top + modalRect.height / 2,
          overflowing,
          actionOverlap,
          fontFamily: style.fontFamily,
          modalBackground: style.backgroundImage,
          maskReadable: parseFloat(maskStyle.backgroundColor.split(',').pop()) >= .68,
          typography: {
            version: getComputedStyle(document.getElementById('update-modal-version')).fontSize,
            headline: getComputedStyle(document.getElementById('update-hero-main')).fontSize,
            body: getComputedStyle(document.getElementById('update-hero-sub')).fontSize,
          },
        };
      })()`);
      assertLayout(snapshot);
      const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fs.writeFileSync(path.join(outputDir, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
      report.push(snapshot);
    }
    fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    await client.evaluate(`desktopWindow.close('exit').catch(() => undefined)`);
    const exitCode = await waitForExit(child, 20000);
    assert.equal(exitCode, 0, `isolated update QA exited with ${exitCode}`);
    console.log(JSON.stringify({ ok: true, outputDir, scenarios: report }, null, 2));
  } catch (error) {
    if (output) error.message += `\n--- isolated Electron output ---\n${output}`;
    throw error;
  } finally {
    if (client && client.socket) {
      try { client.socket.close(); } catch (_) {}
    }
    if (child && child.exitCode == null) {
      try { child.kill(); } catch (_) {}
      try { await waitForExit(child, 10000); } catch (_) {}
    }
    fs.rmSync(qaRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
