'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');
const { oscPatternToRegex } = require('./bridge-utils');

const routeListeners = new Set();
const localIP = Object.values(os.networkInterfaces())
  .flat()
  .find((item) => item && item.family === 'IPv4' && !item.internal)?.address || '127.0.0.1';

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

// Backward-compatible globals used by existing OSC Bridge sketches.
contextBridge.exposeInMainWorld('localIP', localIP);
contextBridge.exposeInMainWorld('openSketchDir', () => ipcRenderer.invoke('bridge:open-sketch'));

window.addEventListener('beforeunload', () => {
  for (const listener of routeListeners) window.removeEventListener('OSC', listener);
  routeListeners.clear();
});
