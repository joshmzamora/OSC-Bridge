const { app, BrowserWindow } = require('electron')
const { UDPPort } = require('osc');
const path = require('path');
const fs = require('fs');

const OSC = new UDPPort({
  localAddress: "0.0.0.0",
  localPort: 4242
});
OSC.open();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    fullscreenable: true,
    webPreferences: {
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true,
      preload: `${__dirname}/preload.js`,
    }
  });

  const sketchDir = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'sketch')
    : path.join(__dirname, '../sketch');

  win.loadFile(path.join(sketchDir, 'index.html'));

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'f' && input.control) {
      win.setFullScreen(!win.isFullScreen());
    }
  });

  let reloadTimeout;
  const watcher = fs.watch(sketchDir, { recursive: true }, () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload();
    }, 100);
  });
  win.on('closed', () => watcher.close());

  OSC.on("message", ({address, args}) => {
    if (win.isDestroyed()) return;
    win.webContents.send('OSC', {
      addr: address, vals: args?.length === 1 ? args[0] : args
    });
  });
}

app.whenReady().then(() => {
  createWindow();
})