const { ipcRenderer, contextBridge, ipcMain } = require('electron');
const os = require('os');

const localIP = Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address ?? '127.0.0.1';

contextBridge.exposeInMainWorld('OSC', {
  route: (pattern, callback) => {
    const regex = new RegExp(
      pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$'
    );
    window.addEventListener("OSC", ({ detail }) => {
      const { args, address } = detail;
      if (regex.test(address)) callback(args, address);
    });
  },
  send: (addr, vals, IP, port) => {
    ipcRenderer.send('OSC', addr, vals, IP, port);
  },
});
contextBridge.exposeInMainWorld('openSketchDir', () => ipcRenderer.send('openSketchDir'));
contextBridge.exposeInMainWorld('localIP', localIP);

ipcRenderer.on("OSC", (_, { address, args }) => {
  window.dispatchEvent(new CustomEvent("OSC", { detail: { address, args } }));
});

window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'i') alert(localIP);
});
