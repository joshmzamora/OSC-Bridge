const { ipcRenderer, contextBridge, ipcMain } = require('electron');

contextBridge.exposeInMainWorld('OSC', {
  route: (pattern, callback) => {
    const regex = new RegExp(
      pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$'
    );
    window.addEventListener("OSC", ({ detail }) => {
      const { addr, vals } = detail;
      if (regex.test(addr)) callback(vals, addr);
    });
  },
  send: (addr, vals, IP, port) => {
    ipcRenderer.send('OSC', addr, vals, IP, port);
  },
});
contextBridge.exposeInMainWorld('openSketchDir', () => ipcRenderer.send('openSketchDir'));

ipcRenderer.on("OSC", (_, { addr, vals }) => {
  window.dispatchEvent(new CustomEvent("OSC", { detail: { addr, vals } }));
});