const { ipcRenderer, contextBridge, ipcMain } = require('electron');

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

ipcRenderer.on("OSC", (_, { address, args }) => {
  console.log(_, address, args);
  window.dispatchEvent(new CustomEvent("OSC", { detail: { address, args } }));
});