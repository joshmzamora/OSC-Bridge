const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('OSC', {
  route: (pattern, callback) => {
    window.addEventListener("OSC", ({ detail }) => {
      const { addr, vals } = detail;
      if (addr.match(`${pattern}$`)) callback(addr, vals);
    });
  }
});

ipcRenderer.on("OSC", (_, { addr, vals }) => {
  window.dispatchEvent(new CustomEvent("OSC", { detail: { addr, vals } }));
});
