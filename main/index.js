'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { Server, Client } = require('node-osc');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const https = require('https');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const {
  normalizeOscMessage,
  normalizePhoneMessage,
  phoneMessageToOsc,
} = require('./bridge-utils');

const OSC_INPUT_PORT = Number(process.env.OSC_BRIDGE_INPUT_PORT) || 4242;
const CONTROLLER_PORT = Number(process.env.OSC_BRIDGE_CONTROLLER_PORT) || 4244;
const MAX_WS_MESSAGE_BYTES = 64 * 1024;

let mainWindow;
let oscServer;
let secureServer;
let webSocketServer;
let sketchWatcher;
let sessionToken;
let localIP = '127.0.0.1';
let controllerUrl = '';
let qrCodeDataUrl = '';
let recording = null;
let config;

const phoneClients = new Map();
const oscClients = new Map();

function runtimePath(folder) {
  return app.isPackaged
    ? path.join(process.resourcesPath, folder)
    : path.join(__dirname, '..', folder);
}

function getLocalIPv4() {
  const candidates = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal);

  const privateAddress = candidates.find(({ address }) => (
    address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  ));
  return (privateAddress || candidates[0])?.address || '127.0.0.1';
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function loadConfig() {
  const defaults = {
    oscOutputHost: '127.0.0.1',
    oscOutputPort: 4243,
    forwardPhoneToOsc: true,
  };

  try {
    const saved = JSON.parse(await fsp.readFile(configPath(), 'utf8'));
    return {
      ...defaults,
      ...saved,
      oscOutputHost: typeof saved.oscOutputHost === 'string' && saved.oscOutputHost.trim()
        ? saved.oscOutputHost.trim().slice(0, 253)
        : defaults.oscOutputHost,
      oscOutputPort: validPort(saved.oscOutputPort, defaults.oscOutputPort),
      forwardPhoneToOsc: saved.forwardPhoneToOsc !== false,
    };
  } catch {
    return defaults;
  }
}

async function saveConfig() {
  await fsp.mkdir(path.dirname(configPath()), { recursive: true });
  await fsp.writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function validPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

function statusSnapshot() {
  return {
    version: app.getVersion(),
    localIP,
    oscInputPort: OSC_INPUT_PORT,
    controllerPort: CONTROLLER_PORT,
    controllerUrl,
    qrCodeDataUrl,
    connectedPhones: [...phoneClients.values()].map(({ id, name, connectedAt, lastSeen }) => ({
      id,
      name,
      connectedAt,
      lastSeen,
    })),
    recording: recording ? { active: true, filePath: recording.filePath, startedAt: recording.startedAt } : { active: false },
    config: { ...config },
  };
}

function sendStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge:status', statusSnapshot());
  }
}

function sendBridgeError(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge:error', String(message));
  }
}

function dispatchToSketch(address, args, metadata = {}) {
  const payload = { address, args, metadata, timestamp: Date.now() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('OSC', payload);
  }
  appendRecording(payload);
}

function getOscClient(host, port) {
  const key = `${host}:${port}`;
  if (!oscClients.has(key)) oscClients.set(key, new Client(host, port));
  return oscClients.get(key);
}

async function sendOsc(address, args, host = config.oscOutputHost, port = config.oscOutputPort) {
  if (typeof address !== 'string' || !address.startsWith('/')) {
    throw new Error('OSC addresses must begin with /.');
  }
  const normalizedArgs = Array.isArray(args) ? args : [args];
  await getOscClient(host, validPort(port, config.oscOutputPort)).send(address, ...normalizedArgs);
}

function handleIncomingOsc(raw, source = 'udp') {
  const message = normalizeOscMessage(raw);
  if (!message) return;
  dispatchToSketch(message.address, message.args, { source });
}

function startOscServer() {
  oscServer = new Server(OSC_INPUT_PORT, '0.0.0.0');
  oscServer.on('message', (message) => handleIncomingOsc(message));
  oscServer.on('bundle', (bundle) => {
    const elements = Array.isArray(bundle?.elements) ? bundle.elements : [];
    elements.forEach((element) => handleIncomingOsc(element, 'udp-bundle'));
  });
  oscServer.on('error', (error) => sendBridgeError(`OSC server: ${error.message}`));
}

async function ensureCertificate() {
  const certificateDir = path.join(app.getPath('userData'), 'certificate');
  const keyPath = path.join(certificateDir, 'key.pem');
  const certPath = path.join(certificateDir, 'cert.pem');
  const metadataPath = path.join(certificateDir, 'metadata.json');

  try {
    const metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
    const [key, cert] = await Promise.all([
      fsp.readFile(keyPath, 'utf8'),
      fsp.readFile(certPath, 'utf8'),
    ]);
    if (metadata.localIP === localIP && Date.now() < Number(metadata.expiresAt) - 7 * 24 * 60 * 60 * 1000) {
      return { key, cert };
    }
  } catch {
    // Generate a new certificate below.
  }

  await fsp.mkdir(certificateDir, { recursive: true });
  const expiresAt = Date.now() + 825 * 24 * 60 * 60 * 1000;
  const generated = await selfsigned.generate(
    [{ name: 'commonName', value: 'OSC Bridge' }],
    {
      algorithm: 'sha256',
      keySize: 2048,
      notBeforeDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      notAfterDate: new Date(expiresAt),
      extensions: [
        { name: 'basicConstraints', cA: true },
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' },
            { type: 7, ip: localIP },
          ],
        },
      ],
    },
  );

  await Promise.all([
    fsp.writeFile(keyPath, generated.private, { mode: 0o600 }),
    fsp.writeFile(certPath, generated.cert, 'utf8'),
    fsp.writeFile(metadataPath, JSON.stringify({ localIP, expiresAt }, null, 2), 'utf8'),
  ]);
  return { key: generated.private, cert: generated.cert };
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
  }[extension] || 'application/octet-stream';
}

async function serveController(request, response) {
  const requestUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, phones: phoneClients.size, oscInputPort: OSC_INPUT_PORT }));
    return;
  }

  const controllerDir = runtimePath('controller');
  const routeMap = {
    '/': 'index.html',
    '/controller': 'index.html',
    '/controller/': 'index.html',
  };
  const relativePath = routeMap[requestUrl.pathname] || requestUrl.pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(controllerDir, relativePath);
  if (!resolvedPath.startsWith(`${path.resolve(controllerDir)}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const contents = await fsp.readFile(resolvedPath);
    response.writeHead(200, {
      'content-type': contentType(resolvedPath),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    response.end(contents);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

function registerPhone(socket, request) {
  const requestUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  if (requestUrl.searchParams.get('token') !== sessionToken) {
    socket.close(1008, 'Invalid pairing token');
    return;
  }

  const id = crypto.randomBytes(4).toString('hex');
  const now = Date.now();
  const phone = { id, name: `Phone ${phoneClients.size + 1}`, connectedAt: now, lastSeen: now, socket };
  phoneClients.set(id, phone);
  socket.send(JSON.stringify({ type: 'hello', deviceId: id, serverTime: now, oscInputPort: OSC_INPUT_PORT }));
  dispatchToSketch(`/phone/${id}/status`, ['connected', phone.name], { source: 'phone', deviceId: id });
  sendStatus();

  socket.on('message', async (data) => {
    if (data.length > MAX_WS_MESSAGE_BYTES) {
      socket.close(1009, 'Message too large');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data.toString('utf8'));
    } catch {
      return;
    }

    phone.lastSeen = Date.now();
    if (payload.type === 'identify' && typeof payload.name === 'string') {
      phone.name = payload.name.trim().slice(0, 40) || phone.name;
      sendStatus();
      return;
    }

    const normalized = normalizePhoneMessage(payload);
    if (!normalized) return;
    const oscMessages = phoneMessageToOsc(normalized, id);
    for (const message of oscMessages) {
      dispatchToSketch(message.address, message.args, {
        source: 'phone',
        deviceId: id,
        phoneTimestamp: normalized.timestamp,
      });
      if (config.forwardPhoneToOsc) {
        sendOsc(message.address, message.args).catch((error) => sendBridgeError(`OSC output: ${error.message}`));
      }
    }
  });

  socket.on('close', () => {
    phoneClients.delete(id);
    dispatchToSketch(`/phone/${id}/status`, ['disconnected', phone.name], { source: 'phone', deviceId: id });
    sendStatus();
  });

  socket.on('error', (error) => sendBridgeError(`Phone connection: ${error.message}`));
}

async function startControllerServer() {
  const credentials = await ensureCertificate();
  sessionToken = crypto.randomBytes(18).toString('base64url');
  controllerUrl = `https://${localIP}:${CONTROLLER_PORT}/?token=${encodeURIComponent(sessionToken)}`;
  qrCodeDataUrl = await QRCode.toDataURL(controllerUrl, { errorCorrectionLevel: 'M', margin: 1, width: 360 });

  secureServer = https.createServer(credentials, (request, response) => {
    serveController(request, response).catch((error) => {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Controller server error');
      sendBridgeError(error.message);
    });
  });
  webSocketServer = new WebSocketServer({ server: secureServer, path: '/ws', maxPayload: MAX_WS_MESSAGE_BYTES });
  webSocketServer.on('connection', registerPhone);
  webSocketServer.on('error', (error) => sendBridgeError(`Controller server: ${error.message}`));

  await new Promise((resolve, reject) => {
    secureServer.once('error', reject);
    secureServer.listen(CONTROLLER_PORT, '0.0.0.0', () => {
      secureServer.off('error', reject);
      resolve();
    });
  });
}

async function startRecording() {
  if (recording) return statusSnapshot().recording;
  const directory = path.join(app.getPath('documents'), 'OSC Bridge Recordings');
  await fsp.mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(directory, `osc-bridge-${timestamp}.jsonl`);
  const stream = fs.createWriteStream(filePath, { flags: 'wx', encoding: 'utf8' });
  recording = { stream, filePath, startedAt: Date.now() };
  stream.write(`${JSON.stringify({ type: 'recording-start', timestamp: recording.startedAt, version: app.getVersion() })}\n`);
  sendStatus();
  return statusSnapshot().recording;
}

function appendRecording(payload) {
  if (!recording) return;
  recording.stream.write(`${JSON.stringify(payload)}\n`);
}

async function stopRecording() {
  if (!recording) return { active: false };
  const current = recording;
  recording = null;
  current.stream.write(`${JSON.stringify({ type: 'recording-stop', timestamp: Date.now() })}\n`);
  await new Promise((resolve) => current.stream.end(resolve));
  sendStatus();
  return { active: false, filePath: current.filePath };
}

function watchSketch(sketchDir) {
  let reloadTimer;
  try {
    sketchWatcher = fs.watch(sketchDir, { recursive: true }, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
      }, 150);
    });
  } catch (error) {
    sendBridgeError(`Live reload unavailable: ${error.message}`);
  }
}

function createWindow() {
  const sketchDir = runtimePath('sketch');
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    fullscreen: true,
    fullscreenable: true,
    backgroundColor: '#0a0d12',
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(sketchDir, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-finish-load', sendStatus);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const command = input.control || input.meta;
    if (input.type !== 'keyDown') return;
    if (command && input.key.toLowerCase() === 'f') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (command && input.key.toLowerCase() === 'e') {
      event.preventDefault();
      shell.openPath(sketchDir);
    } else if (command && input.shift && input.key.toLowerCase() === 'r') {
      event.preventDefault();
      (recording ? stopRecording() : startRecording()).catch((error) => sendBridgeError(error.message));
    } else if (input.key === 'Escape') {
      mainWindow.setFullScreen(false);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    sketchWatcher?.close();
    sketchWatcher = null;
  });
  watchSketch(sketchDir);
}

function registerIpc() {
  ipcMain.handle('bridge:get-status', () => statusSnapshot());
  ipcMain.handle('bridge:start-recording', () => startRecording());
  ipcMain.handle('bridge:stop-recording', () => stopRecording());
  ipcMain.handle('bridge:open-sketch', () => shell.openPath(runtimePath('sketch')));
  ipcMain.handle('bridge:open-recordings', async () => {
    const directory = path.join(app.getPath('documents'), 'OSC Bridge Recordings');
    await fsp.mkdir(directory, { recursive: true });
    return shell.openPath(directory);
  });
  ipcMain.handle('bridge:send-osc', async (_, address, args, host, port) => {
    await sendOsc(address, args, host || config.oscOutputHost, validPort(port, config.oscOutputPort));
    return true;
  });
  ipcMain.handle('bridge:update-config', async (_, update) => {
    if (!update || typeof update !== 'object') return statusSnapshot();
    config = {
      ...config,
      oscOutputHost: typeof update.oscOutputHost === 'string' && update.oscOutputHost.trim()
        ? update.oscOutputHost.trim().slice(0, 253)
        : config.oscOutputHost,
      oscOutputPort: validPort(update.oscOutputPort, config.oscOutputPort),
      forwardPhoneToOsc: update.forwardPhoneToOsc !== false,
    };
    await saveConfig();
    sendStatus();
    return statusSnapshot();
  });
}

async function shutdown() {
  await stopRecording().catch(() => {});
  sketchWatcher?.close();
  for (const phone of phoneClients.values()) phone.socket.close(1001, 'Bridge shutting down');
  phoneClients.clear();
  webSocketServer?.close();
  if (secureServer) await new Promise((resolve) => secureServer.close(resolve));
  if (oscServer) await oscServer.close().catch(() => {});
  await Promise.all([...oscClients.values()].map((client) => client.close().catch(() => {})));
  oscClients.clear();
}

app.whenReady().then(async () => {
  localIP = getLocalIPv4();
  config = await loadConfig();
  registerIpc();
  createWindow();
  try {
    startOscServer();
    await startControllerServer();
    sendStatus();
  } catch (error) {
    sendBridgeError(error.message);
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (app.isQuitting) return;
  event.preventDefault();
  app.isQuitting = true;
  shutdown().finally(() => app.quit());
});
