'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

let window;
const failures = [];

process.on('unhandledRejection', (error) => {
  failures.push(error instanceof Error ? error : new Error(String(error)));
});

app.whenReady().then(async () => {
  window = new BrowserWindow({
    width: 1280,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) failures.push(new Error(`Renderer console error: ${message}`));
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    failures.push(new Error(`Renderer exited: ${details.reason}`));
  });

  await window.loadFile(path.join(__dirname, '..', 'sketch', 'ping-pong.html'));
  await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 5000;
    const check = () => {
      if (window.__TABLE_TENNIS_READY__) return resolve(true);
      if (performance.now() > deadline) return reject(new Error('Table tennis did not become ready'));
      requestAnimationFrame(check);
    };
    check();
  })`);

  const bootstrap = await window.webContents.executeJavaScript(`({
    title: document.title,
    gameShell: Boolean(document.getElementById('gameShell')),
    loader: Boolean(document.querySelector('[data-table-tennis-loader]')),
    loadingText: document.body.innerText.includes('Preparing the resort court'),
    htmlCount: document.querySelectorAll('html').length,
    bodyCount: document.querySelectorAll('body').length,
  })`);
  assert.equal(bootstrap.gameShell, true);
  assert.equal(bootstrap.loader, false);
  assert.equal(bootstrap.loadingText, false);
  assert.equal(bootstrap.htmlCount, 1);
  assert.equal(bootstrap.bodyCount, 1);
  assert.match(bootstrap.title, /^Palm Cove Table Tennis/);
  assert.doesNotMatch(bootstrap.title, /^Loading /);

  const result = await window.webContents.executeJavaScript('window.__TABLE_TENNIS_TEST__.runSmoke()');
  assert.equal(result.ready, true);
  assert.equal(result.hit, true);
  assert.equal(result.finiteBall, true);
  assert.ok(result.canvas.width >= 960);
  assert.ok(result.canvas.height >= 540);
  assert.match(result.title, /Palm Cove Table Tennis/);
  assert.deepEqual(failures, []);

  await window.close();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
