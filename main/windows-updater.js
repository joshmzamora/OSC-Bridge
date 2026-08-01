'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const { BrowserWindow, dialog } = require('electron');
const { isNewerVersion, normalizeRelease } = require('./update-utils');

const RELEASE_API = 'https://api.github.com/repos/joshmzamora/OSC-Bridge/releases/latest';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const START_DELAY_MS = 10 * 1000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 6;

function requestJson(url, userAgent, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': userAgent,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 20_000,
    }, (response) => {
      const location = response.headers.location;
      if (location && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error('Too many update redirects.'));
          return;
        }
        requestJson(new URL(location, url).toString(), userAgent, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Update service returned HTTP ${response.statusCode}.`));
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_JSON_BYTES) {
          request.destroy(new Error('Update response was unexpectedly large.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          reject(new Error(`Could not read update response: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Update check timed out.')));
    request.on('error', reject);
  });
}

function downloadInstaller(url, destination, expectedSize, userAgent, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { 'User-Agent': userAgent },
      timeout: 45_000,
    }, (response) => {
      const location = response.headers.location;
      if (location && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error('Too many installer redirects.'));
          return;
        }
        downloadInstaller(
          new URL(location, url).toString(),
          destination,
          expectedSize,
          userAgent,
          redirects + 1,
        ).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Installer download returned HTTP ${response.statusCode}.`));
        return;
      }

      const hash = crypto.createHash('sha256');
      const output = fs.createWriteStream(destination, { flags: 'wx' });
      let bytes = 0;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        response.destroy();
        output.destroy();
        fsp.rm(destination, { force: true }).finally(() => reject(error));
      };

      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > expectedSize + 1024) {
          fail(new Error('Installer download exceeded its advertised size.'));
          return;
        }
        hash.update(chunk);
      });
      response.on('error', fail);
      output.on('error', fail);
      output.on('finish', () => {
        if (settled) return;
        settled = true;
        if (bytes !== expectedSize) {
          fsp.rm(destination, { force: true }).finally(() => {
            reject(new Error(`Installer size mismatch: expected ${expectedSize}, received ${bytes}.`));
          });
          return;
        }
        resolve({ bytes, sha256: hash.digest('hex') });
      });
      response.pipe(output);
    });
    request.on('timeout', () => request.destroy(new Error('Installer download timed out.')));
    request.on('error', (error) => {
      fsp.rm(destination, { force: true }).finally(() => reject(error));
    });
  });
}

async function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function powershellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function createWindowsUpdateManager(app) {
  let interval;
  let startTimer;
  let inFlight;
  let promptedVersion = null;
  let installScheduled = false;

  const updateDirectory = () => path.join(app.getPath('userData'), 'updates');
  const manifestPath = () => path.join(updateDirectory(), 'pending-update.json');
  const userAgent = () => `OSC-Bridge/${app.getVersion()} Windows-Updater`;

  async function readPendingUpdate() {
    try {
      const pending = JSON.parse(await fsp.readFile(manifestPath(), 'utf8'));
      if (!pending || !isNewerVersion(pending.version, app.getVersion())) return null;
      const installerPath = path.join(updateDirectory(), path.basename(pending.assetName || ''));
      const stat = await fsp.stat(installerPath);
      if (!stat.isFile() || stat.size !== pending.size) return null;
      if (pending.sha256 && await fileSha256(installerPath) !== pending.sha256) return null;
      return { ...pending, installerPath };
    } catch {
      return null;
    }
  }

  async function cleanupOldUpdates(keepInstaller = null) {
    await fsp.mkdir(updateDirectory(), { recursive: true });
    const entries = await fsp.readdir(updateDirectory(), { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const filePath = path.join(updateDirectory(), entry.name);
      if (keepInstaller && path.resolve(filePath) === path.resolve(keepInstaller)) return;
      if (/\.(exe|partial|ps1)$/i.test(entry.name) || entry.name === 'pending-update.json') {
        await fsp.rm(filePath, { force: true });
      }
    }));
  }

  async function writePendingUpdate(release, installerPath) {
    const pending = {
      version: release.version,
      assetName: path.basename(installerPath),
      size: release.size,
      sha256: release.sha256,
      releaseUrl: release.releaseUrl,
      downloadedAt: new Date().toISOString(),
    };
    await fsp.writeFile(manifestPath(), `${JSON.stringify(pending, null, 2)}\n`, 'utf8');
    return { ...pending, installerPath };
  }

  async function scheduleInstall(pending) {
    if (installScheduled) return;
    installScheduled = true;
    const scriptPath = path.join(updateDirectory(), `install-${pending.version}.ps1`);
    const appExecutable = process.execPath;
    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      `$processId = ${process.pid}`,
      `$installer = ${powershellLiteral(pending.installerPath)}`,
      `$application = ${powershellLiteral(appExecutable)}`,
      `$manifest = ${powershellLiteral(manifestPath())}`,
      'try { Wait-Process -Id $processId -Timeout 90 } catch {}',
      "$result = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait",
      'if ($result.ExitCode -in @(0, 1641, 3010)) {',
      '  Remove-Item -LiteralPath $manifest -Force',
      '  Remove-Item -LiteralPath $installer -Force',
      '  Start-Sleep -Seconds 1',
      '  Start-Process -FilePath $application',
      '}',
      'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force',
      '',
    ].join('\r\n');
    await fsp.writeFile(scriptPath, script, 'utf8');
    const helper = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    helper.unref();
    app.quit();
  }

  async function promptToInstall(pending) {
    if (promptedVersion === pending.version || installScheduled) return;
    promptedVersion = pending.version;
    const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options = {
      type: 'info',
      title: 'OSC Bridge update ready',
      message: `OSC Bridge ${pending.version} is ready to install.`,
      detail: 'Restart now to replace the current version. Your settings, recordings, and iPhone certificate files will be preserved.',
      buttons: ['Restart and install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const result = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (result.response === 0) await scheduleInstall(pending);
  }

  async function checkAndDownload() {
    if (inFlight || installScheduled) return inFlight;
    inFlight = (async () => {
      await fsp.mkdir(updateDirectory(), { recursive: true });
      const pending = await readPendingUpdate();
      if (pending) {
        await promptToInstall(pending);
        return { status: 'ready', version: pending.version };
      }
      await cleanupOldUpdates();
      const payload = await requestJson(RELEASE_API, userAgent());
      const release = normalizeRelease(payload, app.getVersion());
      if (!release) return { status: 'current' };

      const installerPath = path.join(updateDirectory(), release.assetName);
      const partialPath = `${installerPath}.partial`;
      await fsp.rm(partialPath, { force: true });
      const downloaded = await downloadInstaller(
        release.downloadUrl,
        partialPath,
        release.size,
        userAgent(),
      );
      if (release.sha256 && downloaded.sha256 !== release.sha256) {
        await fsp.rm(partialPath, { force: true });
        throw new Error('Downloaded installer checksum did not match GitHub.');
      }
      await fsp.rename(partialPath, installerPath);
      const ready = await writePendingUpdate(release, installerPath);
      await cleanupOldUpdates(installerPath);
      await fsp.writeFile(manifestPath(), `${JSON.stringify({
        version: ready.version,
        assetName: ready.assetName,
        size: ready.size,
        sha256: ready.sha256,
        releaseUrl: ready.releaseUrl,
        downloadedAt: ready.downloadedAt,
      }, null, 2)}\n`, 'utf8');
      await promptToInstall(ready);
      return { status: 'ready', version: ready.version };
    })().catch((error) => {
      console.warn(`Automatic update check failed: ${error.message}`);
      return { status: 'error', message: error.message };
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function start() {
    if (!app.isPackaged || process.platform !== 'win32' || process.env.OSC_BRIDGE_DISABLE_UPDATES === '1') {
      return;
    }
    const currentPending = await readPendingUpdate();
    if (!currentPending) await cleanupOldUpdates();
    startTimer = setTimeout(checkAndDownload, START_DELAY_MS);
    interval = setInterval(checkAndDownload, CHECK_INTERVAL_MS);
    startTimer.unref?.();
    interval.unref?.();
  }

  function stop() {
    clearTimeout(startTimer);
    clearInterval(interval);
  }

  return { checkAndDownload, start, stop };
}

module.exports = {
  createWindowsUpdateManager,
  downloadInstaller,
  requestJson,
};
