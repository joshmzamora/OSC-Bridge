const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('OSC', {
  route: (pattern, callback) => {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$'
    );
    window.addEventListener("OSC", ({ detail }) => {
      const { addr, vals } = detail;
      if (regex.test(addr)) callback(vals, addr);
    });
  }
});

ipcRenderer.on("OSC", (_, { addr, vals }) => {
  window.dispatchEvent(new CustomEvent("OSC", { detail: { addr, vals } }));
});