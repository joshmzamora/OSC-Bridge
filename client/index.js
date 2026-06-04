const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { UDPPort } = require('osc');
const path = require('path');
const fs = require('fs');

const sketchDir = app.isPackaged
  ? path.join(path.dirname(app.getPath('exe')), 'sketch')
  : path.join(__dirname, '../sketch');

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

  win.loadFile(path.join(sketchDir, 'index.html'));

  win.webContents.send("sketchDir", sketchDir);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'f' && input.control) {
      win.setFullScreen(!win.isFullScreen());
    }
    if (input.type === 'keyDown' && input.key === 'e' && input.control) {
      shell.openPath(sketchDir);
    }
    if (input.type === 'keyDown' && input.key === 'Escape') {
      win.setFullScreen(false);
    }
  });

  //file watcher - refresh renderer when sketch file is edited
  let reloadTimeout;
  const watcher = fs.watch(sketchDir, { recursive: true }, () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload();
    }, 100);
  });
  win.on('closed', () => watcher.close());

  //forward OSC messages to renderer
  OSC.on("message", ({address, args}) => {
    if (win.isDestroyed()) return;
    win.webContents.send('OSC', {
      addr: address, vals: args?.length === 1 ? args[0] : args
    });
  });

  ipcMain.on('openSketchDir', () => shell.openPath(sketchDir));

  //forward messages from renderer to OSC
  ipcMain.on('OSC', (_, address, vals, IP="127.0.0.1", port=4243) => {
    const args = Array.isArray(vals) ? vals : [vals];
    OSC.send({ address, args }, IP, port);
  });
}

app.whenReady().then(() => {
  createWindow();
});