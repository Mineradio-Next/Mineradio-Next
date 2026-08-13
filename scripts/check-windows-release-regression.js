'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'win32') {
  process.stdout.write('Windows release regression skipped: Windows is required\n');
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(packageInfo.version || '').trim();
const qaProductName = 'Mineradio Next Release QA';
const qaExecutableName = 'Mineradio-Next-Release-QA';
const qaInstallDirName = 'Mineradio-Next-Release-QA';
const qaDataDirectoryName = 'Mineradio Next Release QA';
const qaOutput = path.join(root, 'dist-release-qa');
const qaInstaller = path.join(qaOutput, `Mineradio-Next-Release-QA-${version}-Setup.exe`);
const qaInstallDir = path.join(process.env.LOCALAPPDATA, 'Programs', qaInstallDirName);
const qaExe = path.join(qaInstallDir, `${qaExecutableName}.exe`);
const qaUninstaller = path.join(qaInstallDir, `Uninstall ${qaExecutableName}.exe`);
const qaUserData = path.join(process.env.APPDATA, qaDataDirectoryName);
const desktopShortcut = path.join(process.env.USERPROFILE, 'Desktop', `${qaProductName}.lnk`);
const startMenuShortcut = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${qaProductName}.lnk`);
const reportDir = path.join(root, 'reports', 'release-qa');
const reportPath = path.join(reportDir, 'latest.json');
const sentinelName = '.release-qa-user-data-sentinel.json';
const sentinelPath = path.join(qaUserData, sentinelName);
const installerMarker = path.join(qaInstallDir, '.mineradio-next-release-qa-root');
const formalInstallDirFallback = path.join(process.env.LOCALAPPDATA, 'Programs', 'Mineradio-Next');
const noBuild = process.argv.includes('--no-build');
const startedAt = new Date();
const checks = [];

function record(name, detail = '') {
  checks.push({ name, ok: true, detail });
  process.stdout.write(`[release-qa] OK  ${name}${detail ? `: ${detail}` : ''}\n`);
}

function fail(name, error) {
  checks.push({ name, ok: false, detail: String(error && error.message || error) });
  throw error;
}

function run(file, args, options = {}) {
  const result = childProcess.spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout || 180000,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(file)} exited with ${result.status}\n${result.stdout || ''}\n${result.stderr || ''}`.trim());
  }
  return result;
}

function powershell(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout: 60000 }).stdout.trim();
}

function removeQaPath(target, expectedParent, expectedName) {
  if (!fs.existsSync(target)) return;
  assert.equal(path.dirname(path.resolve(target)).toLowerCase(), path.resolve(expectedParent).toLowerCase());
  assert.equal(path.basename(path.resolve(target)).toLowerCase(), expectedName.toLowerCase());
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

function waitUntil(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    childProcess.spawnSync('ping.exe', ['127.0.0.1', '-n', '2'], { windowsHide: true, stdio: 'ignore' });
  }
  throw new Error(message);
}

function registryEntries() {
  const raw = powershell(`
    Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq '${qaProductName}' -or $_.DisplayName -like '${qaProductName} *' } |
      Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString,PSPath |
      ConvertTo-Json -Compress
  `);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function formalInstallPath() {
  const raw = powershell(`
    Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -like 'Mineradio Next*' -and $_.DisplayName -notlike '${qaProductName}*' } |
      Select-Object -First 1 -ExpandProperty InstallLocation
  `);
  return raw ? path.resolve(raw) : path.resolve(formalInstallDirFallback);
}

function shortcutTarget(shortcut) {
  return powershell(`$w = New-Object -ComObject WScript.Shell; $w.CreateShortcut('${shortcut.replace(/'/g, "''")}').TargetPath`);
}

function shortcutAppUserModelId(shortcut) {
  const escapedDirectory = path.dirname(shortcut).replace(/'/g, "''");
  const escapedName = path.basename(shortcut).replace(/'/g, "''");
  return powershell(`$s = New-Object -ComObject Shell.Application; $item = $s.Namespace('${escapedDirectory}').ParseName('${escapedName}'); $item.ExtendedProperty('System.AppUserModel.ID')`);
}

function fileVersionInfo(executable) {
  const escaped = executable.replace(/'/g, "''");
  const raw = powershell(`(Get-Item -LiteralPath '${escaped}').VersionInfo | Select-Object FileDescription,ProductName,FileVersion,ProductVersion,OriginalFilename | ConvertTo-Json -Compress`);
  return JSON.parse(raw);
}

function qaProcesses() {
  const raw = powershell(`Get-CimInstance Win32_Process -Filter "Name='${qaExecutableName}.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function stopQaProcesses() {
  for (const processInfo of qaProcesses()) {
    if (!processInfo.ExecutablePath || path.resolve(processInfo.ExecutablePath).toLowerCase() !== qaExe.toLowerCase()) continue;
    powershell(`Stop-Process -Id ${Number(processInfo.ProcessId)} -Force -ErrorAction SilentlyContinue`);
  }
}

function uninstallQaIfPresent() {
  stopQaProcesses();
  if (fs.existsSync(qaUninstaller)) {
    run(qaUninstaller, ['/S', '/currentuser', '/MINERADIO-UNINSTALL-SHELL'], { timeout: 180000 });
    waitUntil(() => !fs.existsSync(qaInstallDir), 30000, `QA uninstall did not remove ${qaInstallDir}`);
  }
  cleanupQaResidue();
}

function cleanupQaResidue() {
  for (const entry of registryEntries()) {
    const psPath = String(entry.PSPath || '').replace(/^Microsoft\.PowerShell\.Core\\Registry::/, 'Registry::');
    if (psPath) powershell(`Remove-Item -LiteralPath '${psPath.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`);
  }
  for (const shortcut of [desktopShortcut, startMenuShortcut]) {
    if (fs.existsSync(shortcut)) fs.rmSync(shortcut, { force: true });
  }
  removeQaPath(qaInstallDir, path.join(process.env.LOCALAPPDATA, 'Programs'), qaInstallDirName);
}

function buildQaInstaller() {
  const build = JSON.parse(JSON.stringify(packageInfo.build));
  build.appId = 'com.mineradio.next.release-qa';
  build.productName = qaProductName;
  build.directories.output = 'dist-release-qa';
  build.afterPack = 'build/after-pack.js';
  build.win.executableName = qaExecutableName;
  build.win.signExecutable = false;
  build.nsis = {
    ...build.nsis,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: qaProductName,
    include: 'build/installer-release-qa.nsh',
    artifactName: `Mineradio-Next-Release-QA-${version}-Setup.\${ext}`,
  };
  build.publish = null;
  const config = {
    ...build,
    extraMetadata: {
      name: 'mineradio-next-release-qa',
      productName: qaProductName,
      version,
      mineradio: {
        dataDirectoryName: qaDataDirectoryName,
        runtimeName: qaProductName,
        appUserModelId: 'com.mineradio.next.release-qa',
        update: { disabled: true, provider: 'none', preview: false },
      },
    },
  };
  fs.mkdirSync(qaOutput, { recursive: true });
  const configPath = path.join(qaOutput, 'release-qa.electron-builder.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  run(process.execPath, [path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'), '--config', configPath, '--win', 'nsis', '--publish', 'never'], { timeout: 600000 });
  assert(fs.existsSync(qaInstaller), `QA installer was not produced: ${qaInstaller}`);
  record('QA installer build', path.basename(qaInstaller));
}

function installQa(label, expectDesktopShortcut) {
  const args = ['/S', '/currentuser'];
  if (!expectDesktopShortcut) args.push('/MINERADIO-NO-DESKTOP');
  run(qaInstaller, args);
  assert(fs.existsSync(qaExe), `${label}: installed executable is missing`);
  assert(fs.existsSync(qaUninstaller), `${label}: uninstaller is missing`);
  assert(fs.existsSync(installerMarker), `${label}: trusted install marker is missing`);
  const marker = fs.readFileSync(installerMarker, 'utf8');
  assert.match(marker, /appId=com\.mineradio\.next\.release-qa/);
  const registry = registryEntries();
  assert.equal(registry.length, 1, `${label}: expected one QA uninstall registry entry`);
  assert.equal(path.resolve(registry[0].InstallLocation).toLowerCase(), qaInstallDir.toLowerCase());
  assert.equal(String(registry[0].DisplayVersion), version);
  assert(fs.existsSync(startMenuShortcut), `${label}: start menu shortcut is missing`);
  assert.equal(path.resolve(shortcutTarget(startMenuShortcut)).toLowerCase(), qaExe.toLowerCase());
  assert.equal(shortcutAppUserModelId(startMenuShortcut), 'com.mineradio.next.release-qa');
  if (expectDesktopShortcut) {
    assert(fs.existsSync(desktopShortcut), `${label}: desktop shortcut is missing`);
    assert.equal(path.resolve(shortcutTarget(desktopShortcut)).toLowerCase(), qaExe.toLowerCase());
    assert.equal(shortcutAppUserModelId(desktopShortcut), 'com.mineradio.next.release-qa');
  } else {
    assert(!fs.existsSync(desktopShortcut), `${label}: unexpected desktop shortcut`);
  }
  const versionInfo = fileVersionInfo(qaExe);
  assert.equal(versionInfo.FileDescription, qaProductName);
  assert.equal(versionInfo.ProductName, qaProductName);
  assert.match(String(versionInfo.FileVersion || ''), new RegExp(`^${version.replace(/\./g, '\\.')}\\b`));
  assert.match(String(versionInfo.ProductVersion || ''), new RegExp(`^${version.replace(/\./g, '\\.')}\\b`));
  const iconCount = Number(powershell(`(Get-Item -LiteralPath '${qaExe.replace(/'/g, "''")}').VersionInfo.FileName | ForEach-Object { Add-Type -AssemblyName System.Drawing; $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($_); if ($null -eq $icon) { 0 } else { $icon.Dispose(); 1 } }`));
  assert.equal(iconCount, 1, `${label}: executable icon resource is missing`);
  record(label, `${registry[0].DisplayName} at ${qaInstallDir}`);
}

function launchInstalledApp() {
  run(qaExe, [], {
    timeout: 90000,
    env: {
      MINERADIO_STARTUP_QA_HIDDEN: '1',
      MINERADIO_STARTUP_QA_EXIT_MS: '1200',
      MINERADIO_DISABLE_AUTO_UPDATE_CHECK: '1',
    },
  });
  assert(fs.existsSync(qaUserData), `default QA userData was not created: ${qaUserData}`);
  record('installed application smoke launch', qaUserData);
}

function writeSentinel() {
  const sentinel = { app: qaProductName, version, createdAt: new Date().toISOString(), token: 'preserve-across-upgrade-and-uninstall' };
  fs.mkdirSync(qaUserData, { recursive: true });
  fs.writeFileSync(sentinelPath, JSON.stringify(sentinel, null, 2));
  return sentinel;
}

function assertFormalInstallUntouched(snapshot) {
  assert.equal(fs.existsSync(formalInstallDir), snapshot.exists, 'formal install directory state changed');
  if (snapshot.exists) {
    assert.equal(fs.statSync(formalInstallDir).mtimeMs, snapshot.mtimeMs, 'formal install directory timestamp changed');
  }
  record('formal Mineradio Next installation untouched', formalInstallDir);
}

function writeReport(status, extra = {}) {
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    status,
    version,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    installer: qaInstaller,
    installDirectory: qaInstallDir,
    userDataDirectory: qaUserData,
    checks,
    ...extra,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

let sentinel;
const formalInstallDir = formalInstallPath();
const formalSnapshot = {
  path: formalInstallDir,
  exists: fs.existsSync(formalInstallDir),
  mtimeMs: fs.existsSync(formalInstallDir) ? fs.statSync(formalInstallDir).mtimeMs : 0,
};

try {
  cleanupQaResidue();
  removeQaPath(qaUserData, process.env.APPDATA, qaDataDirectoryName);
  record('preflight cleanup', 'QA identity only');

  if (!noBuild || !fs.existsSync(qaInstaller)) buildQaInstaller();
  else record('reuse QA installer', path.basename(qaInstaller));

  installQa('fresh install', true);
  launchInstalledApp();
  sentinel = writeSentinel();

  installQa('in-place upgrade', true);
  assert.deepEqual(JSON.parse(fs.readFileSync(sentinelPath, 'utf8')), sentinel);
  record('user data survives in-place upgrade', sentinelName);

  stopQaProcesses();
  run(qaUninstaller, ['/S', '/currentuser', '/MINERADIO-UNINSTALL-SHELL'], { timeout: 180000 });
  waitUntil(() => !fs.existsSync(qaInstallDir), 30000, `QA uninstall did not remove ${qaInstallDir}`);
  assert(!fs.existsSync(qaInstallDir), 'uninstall left the QA installation directory behind');
  assert.equal(registryEntries().length, 0, 'uninstall left the QA registry entry behind');
  assert(!fs.existsSync(desktopShortcut), 'uninstall left the QA desktop shortcut behind');
  assert(!fs.existsSync(startMenuShortcut), 'uninstall left the QA start menu shortcut behind');
  assert.deepEqual(JSON.parse(fs.readFileSync(sentinelPath, 'utf8')), sentinel);
  record('uninstall removes app and preserves user data', sentinelName);

  assertFormalInstallUntouched(formalSnapshot);
  removeQaPath(qaUserData, process.env.APPDATA, qaDataDirectoryName);
  record('QA user data cleanup', qaUserData);
  writeReport('passed');
  process.stdout.write(`[release-qa] PASS report=${reportPath}\n`);
} catch (error) {
  checks.push({ name: 'release regression', ok: false, detail: String(error && error.stack || error) });
  try { stopQaProcesses(); } catch (_) {}
  try { cleanupQaResidue(); } catch (_) {}
  try { removeQaPath(qaUserData, process.env.APPDATA, qaDataDirectoryName); } catch (_) {}
  writeReport('failed', { error: String(error && error.stack || error) });
  process.stderr.write(`[release-qa] FAIL ${error && error.stack || error}\n`);
  process.exitCode = 1;
}
