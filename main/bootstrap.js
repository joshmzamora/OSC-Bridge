'use strict';

const { app } = require('electron');
const { createWindowsUpdateManager } = require('./windows-updater');

const updateManager = createWindowsUpdateManager(app);

require('./index');

app.whenReady().then(() => updateManager.start()).catch((error) => {
  console.warn(`Could not start automatic updates: ${error.message}`);
});
app.on('will-quit', () => updateManager.stop());
