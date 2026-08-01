'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { Server, Client } = require('node-osc');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
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
const SETUP_PORT = Number(process.env.OSC_BRIDGE_SETUP_PORT) || 4245;
const MAX_WS_MESSAGE_BYTES = 64 * 1024;
const DAY = 24 * 60 * 60 * 1000;

let mainWindow;
let oscServer;
let secureServer;
let setupServer;
let webSocketServer;
let sketchWatcher;
let sessionToken;
let localIP = '127.0.0.1';
let pairingUrl = '';
let secureControllerUrl = '';
let qrCodeDataUrl = '';
let certificateProfile = '';
let rootCertificate = '';
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
    setupPort: SETUP_PORT,
    controllerUrl: pairingUrl,
    secureControllerUrl,
    qrCodeDataUrl,
    connectedPhones: [...phoneClients.values()].map(({ id, name, connectedAt, lastSeen }) => ({
      id,
      name,
      connectedAt,
      lastSeen,
    })),
    recording: recording
      ? { active: true, filePath: recording.filePath, startedAt: recording.startedAt }
      : { active: false },
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

async function readCertificateSet(paths, metadataPath, validator) {
  try {
    const metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
    const values = await Promise.all(paths.map((filePath) => fsp.readFile(filePath, 'utf8')));
    if (validator(metadata)) return { metadata, values };
  } catch {
    // Generate the missing or expired certificate below.
  }
  return null;
}

async function ensureCertificates() {
  const certificateDir = path.join(app.getPath('userData'), 'certificate');
  const rootKeyPath = path.join(certificateDir, 'root-ca-key.pem');
  const rootCertPath = path.join(certificateDir, 'root-ca-cert.pem');
  const rootMetadataPath = path.join(certificateDir, 'root-ca-metadata.json');
  const serverKeyPath = path.join(certificateDir, 'server-key.pem');
  const serverCertPath = path.join(certificateDir, 'server-cert.pem');
  const serverMetadataPath = path.join(certificateDir, 'server-metadata.json');
  await fsp.mkdir(certificateDir, { recursive: true });

  let root = await readCertificateSet(
    [rootKeyPath, rootCertPath],
    rootMetadataPath,
    (metadata) => Date.now() < Number(metadata.expiresAt) - 30 * DAY
      && typeof metadata.profileUUID === 'string'
      && typeof metadata.certificateUUID === 'string',
  );

  if (!root) {
    const expiresAt = Date.now() + 10 * 365 * DAY;
    const generated = await selfsigned.generate(
      [{ name: 'commonName', value: 'OSC Bridge Local Root' }],
      {
        algorithm: 'sha256',
        keySize: 2048,
        notBeforeDate: new Date(Date.now() - DAY),
        notAfterDate: new Date(expiresAt),
        extensions: [
          { name: 'basicConstraints', cA: true, critical: true },
          {
            name: 'keyUsage',
            digitalSignature: true,
            keyCertSign: true,
            cRLSign: true,
            critical: true,
          },
        ],
      },
    );
    const metadata = {
      expiresAt,
      profileUUID: crypto.randomUUID().toUpperCase(),
      certificateUUID: crypto.randomUUID().toUpperCase(),
    };
    await Promise.all([
      fsp.writeFile(rootKeyPath, generated.private, { mode: 0o600 }),
      fsp.writeFile(rootCertPath, generated.cert, 'utf8'),
      fsp.writeFile(rootMetadataPath, JSON.stringify(metadata, null, 2), 'utf8'),
    ]);
    root = { metadata, values: [generated.private, generated.cert] };
  }

  const [rootKey, rootCert] = root.values;
  let server = await readCertificateSet(
    [serverKeyPath, serverCertPath],
    serverMetadataPath,
    (metadata) => metadata.localIP === localIP && Date.now() < Number(metadata.expiresAt) - 7 * DAY,
  );

  if (!server) {
    const expiresAt = Date.now() + 365 * DAY;
    const generated = await selfsigned.generate(
      [{ name: 'commonName', value: localIP }],
      {
        algorithm: 'sha256',
        keySize: 2048,
        notBeforeDate: new Date(Date.now() - DAY),
        notAfterDate: new Date(expiresAt),
        ca: { key: rootKey, cert: rootCert },
        extensions: [
          { name: 'basicConstraints', cA: false, critical: true },
          {
            name: 'keyUsage',
            digitalSignature: true,
            keyEncipherment: true,
            critical: true,
          },
          { name: 'extKeyUsage', serverAuth: true },
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
    const metadata = { localIP, expiresAt };
    await Promise.all([
      fsp.writeFile(serverKeyPath, generated.private, { mode: 0o600 }),
      fsp.writeFile(serverCertPath, generated.cert, 'utf8'),
      fsp.writeFile(serverMetadataPath, JSON.stringify(metadata, null, 2), 'utf8'),
    ]);
    server = { metadata, values: [generated.private, generated.cert] };
  }

  const [serverKey, serverCert] = server.values;
  return {
    key: serverKey,
    cert: `${serverCert.trim()}\n${rootCert.trim()}\n`,
    rootCert,
    profileUUID: root.metadata.profileUUID,
    certificateUUID: root.metadata.certificateUUID,
  };
}

function buildAppleCertificateProfile(certificatePem, profileUUID, certificateUUID) {
  const identifierSuffix = certificateUUID.toLowerCase();
  const certificateBase64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>osc-bridge-local-root.cer</string>
      <key>PayloadContent</key>
      <data>${certificateBase64}</data>
      <key>PayloadDescription</key>
      <string>Trusts the OSC Bridge controller hosted by this computer.</string>
      <key>PayloadDisplayName</key>
      <string>OSC Bridge Local Root</string>
      <key>PayloadIdentifier</key>
      <string>com.joshmzamora.oscbridge.root.${identifierSuffix}</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>${certificateUUID}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Installs the local root certificate required for secure iPhone motion access.</string>
  <key>PayloadDisplayName</key>
  <string>OSC Bridge Certificate</string>
  <key>PayloadIdentifier</key>
  <string>com.joshmzamora.oscbridge.profile.${identifierSuffix}</string>
  <key>PayloadOrganization</key>
  <string>OSC Bridge</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileUUID}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
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

function validSessionUrl(request, protocol) {
  const requestUrl = new URL(request.url, `${protocol}://${request.headers.host || 'localhost'}`);
  return { requestUrl, valid: requestUrl.searchParams.get('token') === sessionToken };
}

function setupPage() {
  const profileUrl = `http://${localIP}:${SETUP_PORT}/osc-bridge.mobileconfig?token=${encodeURIComponent(sessionToken)}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0a0d12">
  <title>Set up OSC Bridge</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0a0d12; color: #f5f7fa; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom)); display: grid; place-items: center; background: radial-gradient(circle at 80% 0%, rgba(56,189,248,.14), transparent 35%), #0a0d12; }
    main { width: min(540px, 100%); }
    .eyebrow { margin: 0 0 5px; color: #7dd3fc; font-size: .75rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(2rem, 9vw, 3rem); letter-spacing: -.05em; }
    .lead { margin: 12px 0 22px; color: #a8b3c2; line-height: 1.5; }
    .card { padding: 18px; border: 1px solid #2b3542; border-radius: 20px; background: #111720; }
    ol { margin: 0; padding-left: 22px; display: grid; gap: 15px; line-height: 1.45; }
    strong { color: #fff; }
    .buttons { display: grid; gap: 11px; margin-top: 20px; }
    a { min-height: 50px; padding: 0 18px; display: grid; place-items: center; border: 1px solid #3a4657; border-radius: 14px; color: #f5f7fa; font-weight: 800; text-decoration: none; background: #18212d; }
    a.primary { border-color: #38bdf8; background: #38bdf8; color: #061019; }
    .note { margin: 14px 2px 0; color: #8390a0; font-size: .82rem; line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">OSC Bridge</p>
    <h1>Set up this iPhone</h1>
    <p class="lead">The certificate is installed once. After that, this computer can use Safari's motion sensors securely whenever OSC Bridge is running.</p>
    <section class="card">
      <ol>
        <li>Tap <strong>Download certificate</strong>, then allow the profile download.</li>
        <li>Open <strong>Settings → General → VPN &amp; Device Management</strong>, select OSC Bridge, and tap Install.</li>
        <li>Open <strong>Settings → General → About → Certificate Trust Settings</strong> and enable full trust for OSC Bridge Local Root.</li>
        <li>Return here and tap <strong>Open motion controller</strong>.</li>
      </ol>
      <div class="buttons">
        <a href="${profileUrl}">Download certificate</a>
        <a class="primary" href="${secureControllerUrl}">Open motion controller</a>
      </div>
    </section>
    <p class="note">Only install this certificate from your own OSC Bridge computer. You can remove it later in Settings → General → VPN &amp; Device Management.</p>
  </main>
</body>
</html>`;
}

async function serveSetup(request, response) {
  const { requestUrl, valid } = validSessionUrl(request, 'http');
  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (!valid) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('This pairing link is expired. Scan the current QR code on the computer.');
    return;
  }
  if (requestUrl.pathname === '/osc-bridge.mobileconfig') {
    response.writeHead(200, {
      'content-type': 'application/x-apple-aspen-config',
      'content-disposition': 'attachment; filename="osc-bridge.mobileconfig"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(certificateProfile);
    return;
  }
  if (requestUrl.pathname === '/osc-bridge-root.cer') {
    response.writeHead(200, {
      'content-type': 'application/x-x509-ca-cert',
      'content-disposition': 'attachment; filename="osc-bridge-local-root.cer"',
      'cache-control': 'no-store',
    });
    response.end(rootCertificate);
    return;
  }
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(setupPage());
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
      'permissions-policy': 'accelerometer=(self), gyroscope=(self)',
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

  socket.on('message', (data) => {
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

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function startControllerServers() {
  const credentials = await ensureCertificates();
  rootCertificate = credentials.rootCert;
  certificateProfile = buildAppleCertificateProfile(
    credentials.rootCert,
    credentials.profileUUID,
    credentials.certificateUUID,
  );
  sessionToken = crypto.randomBytes(18).toString('base64url');
  secureControllerUrl = `https://${localIP}:${CONTROLLER_PORT}/?token=${encodeURIComponent(sessionToken)}`;
  pairingUrl = `http://${localIP}:${SETUP_PORT}/?token=${encodeURIComponent(sessionToken)}`;
  qrCodeDataUrl = await QRCode.toDataURL(pairingUrl, { errorCorrectionLevel: 'M', margin: 1, width: 360 });

  setupServer = http.createServer((request, response) => {
    serveSetup(request, response).catch((error) => {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Setup server error');
      sendBridgeError(error.message);
    });
  });

  secureServer = https.createServer({ key: credentials.key, cert: credentials.cert }, (request, response) => {
    serveController(request, response).catch((error) => {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Controller server error');
      sendBridgeError(error.message);
    });
  });
  webSocketServer = new WebSocketServer({ server: secureServer, path: '/ws', maxPayload: MAX_WS_MESSAGE_BYTES });
  webSocketServer.on('connection', registerPhone);
  webSocketServer.on('error', (error) => sendBridgeError(`Controller server: ${error.message}`));

  await Promise.all([
    listen(setupServer, SETUP_PORT),
    listen(secureServer, CONTROLLER_PORT),
  ]);
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

function closeNodeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

async function shutdown() {
  await stopRecording().catch(() => {});
  sketchWatcher?.close();
  for (const phone of phoneClients.values()) phone.socket.close(1001, 'Bridge shutting down');
  phoneClients.clear();
  webSocketServer?.close();
  await Promise.all([
    closeNodeServer(setupServer),
    closeNodeServer(secureServer),
  ]);
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
    await startControllerServers();
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
