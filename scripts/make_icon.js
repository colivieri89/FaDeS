// Renders build/icon.svg to build/icon.png (1024 x 1024); electron-builder derives the macOS and Windows icons from it.
// Usage: npx electron scripts/make_icon.js
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const SVG = path.join(__dirname, '..', 'build', 'icon.svg');
const PNG = path.join(__dirname, '..', 'build', 'icon.png');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true,
    webPreferences: { offscreen: true } });
  win.webContents.setZoomFactor(1);
  const html = `<html><body style="margin:0;background:transparent">${fs.readFileSync(SVG, 'utf8')}</body></html>`;
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise(r => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const out = img.getSize().width === 1024 ? img : img.resize({ width: 1024, height: 1024, quality: 'best' });
  fs.writeFileSync(PNG, out.toPNG());
  console.log('wrote', PNG, out.getSize());
  app.quit();
});
