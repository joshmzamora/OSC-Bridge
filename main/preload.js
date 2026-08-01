'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('node:fs');
const os = require('os');
const path = require('node:path');
const zlib = require('node:zlib');
const { oscPatternToRegex } = require('./bridge-utils');

const routeListeners = new Set();
const allowedTableTennisAssets = new Set([
  'sketch/ping-pong.html',
  'sketch/ping-pong.css',
  'sketch/ping-pong-core.js',
  'sketch/ping-pong.js',
]);
let tableTennisArchive;

const localIP = Object.values(os.networkInterfaces())
  .flat()
  .find((item) => item && item.family === 'IPv4' && !item.internal)?.address || '127.0.0.1';

function tableTennisBundleDirectory() {
  const packaged = path.join(process.resourcesPath || '', 'table-tennis-bundle');
  if (process.resourcesPath && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', '.table-tennis-upload');
}

function loadTableTennisArchive() {
  if (tableTennisArchive) return tableTennisArchive;
  const directory = tableTennisBundleDirectory();
  const encoded = fs.readdirSync(directory)
    .filter((name) => /^part-\d{2}$/.test(name))
    .sort()
    .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
    .join('');
  tableTennisArchive = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
  return tableTennisArchive;
}

function readTarEntry(archive, requestedPath) {
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '');
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const dataStart = offset + 512;
    if (fullName === requestedPath) return archive.subarray(dataStart, dataStart + size).toString('utf8');
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Missing table-tennis asset: ${requestedPath}`);
}

function readTableTennisAsset(assetPath) {
  if (!allowedTableTennisAssets.has(assetPath)) throw new Error('Table-tennis asset is not allowed.');
  return readTarEntry(loadTableTennisArchive(), assetPath);
}

function addRoute(pattern, callback, once = false) {
  if (typeof callback !== 'function') throw new TypeError('OSC.route requires a callback.');
  const regex = oscPatternToRegex(pattern);
  const listener = ({ detail }) => {
    if (!regex.test(detail.address)) return;
    if (once) removeRoute();
    callback(detail.args, detail.address, detail.metadata || {});
  };
  const removeRoute = () => {
    routeListeners.delete(listener);
    window.removeEventListener('OSC', listener);
  };
  routeListeners.add(listener);
  window.addEventListener('OSC', listener);
  return removeRoute;
}

ipcRenderer.on('OSC', (_, payload) => {
  window.dispatchEvent(new CustomEvent('OSC', { detail: payload }));
});

contextBridge.exposeInMainWorld('OSC', {
  route: (pattern, callback) => addRoute(pattern, callback),
  once: (pattern, callback) => addRoute(pattern, callback, true),
  send: (address, args, host, port) => ipcRenderer.invoke('bridge:send-osc', address, args, host, port),
});

contextBridge.exposeInMainWorld('Bridge', {
  getStatus: () => ipcRenderer.invoke('bridge:get-status'),
  startRecording: () => ipcRenderer.invoke('bridge:start-recording'),
  stopRecording: () => ipcRenderer.invoke('bridge:stop-recording'),
  openSketchFolder: () => ipcRenderer.invoke('bridge:open-sketch'),
  openRecordingsFolder: () => ipcRenderer.invoke('bridge:open-recordings'),
  updateConfig: (update) => ipcRenderer.invoke('bridge:update-config', update),
  readTableTennisAsset,
  onStatus(callback) {
    const listener = (_, status) => callback(status);
    ipcRenderer.on('bridge:status', listener);
    return () => ipcRenderer.removeListener('bridge:status', listener);
  },
  onError(callback) {
    const listener = (_, message) => callback(message);
    ipcRenderer.on('bridge:error', listener);
    return () => ipcRenderer.removeListener('bridge:error', listener);
  },
});

contextBridge.exposeInMainWorld('localIP', localIP);
contextBridge.exposeInMainWorld('openSketchDir', () => ipcRenderer.invoke('bridge:open-sketch'));

window.addEventListener('DOMContentLoaded', () => {
  const gameButton = document.getElementById('playPingPong');
  if (gameButton) {
    gameButton.textContent = 'Play Table Tennis';
    gameButton.setAttribute('aria-label', 'Play Palm Cove Table Tennis');
  }
});

window.addEventListener('beforeunload', () => {
  for (const listener of routeListeners) window.removeEventListener('OSC', listener);
  routeListeners.clear();
});
