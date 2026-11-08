// Electron main process: the window, and the bridge between the interface and the computing pool (worker threads).
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { runJobs, defaultWorkers } = require('../runner/pool');
const C = require('../analyses/campaigns');
const TOTAL = require('../analyses/total_collapse');
const STUDY = require('../analyses/study');
const { parseCSV } = require('../analyses/csv');
const { MODEL_VERSION } = require('../sim/version');
const PKG = require('../../package.json');

// numbers in the interface are written with a decimal point whatever the system language
app.commandLine.appendSwitch('lang', 'en-US');

const STUDIES = { total: TOTAL, study: STUDY };
let win = null;
const running = new Map();          // id -> pool emitter

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1120, minHeight: 720, show: false,
    title: 'FaDeS',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d0d0d' : '#f9f9f7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.removeMenu && process.platform !== 'darwin' && win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // links open in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

const resultsDir = () => path.join(app.getPath('userData'), 'results');
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

ipcMain.handle('app:info', () => ({
  version: PKG.version, model: MODEL_VERSION, cores: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
  defaultWorkers: defaultWorkers(), platform: process.platform, arch: process.arch, electron: process.versions.electron,
  node: process.versions.node, cpu: (os.cpus()[0] || {}).model || '', resultsDir: resultsDir(),
  campaigns: C.CAMPAIGNS, seeds: C.SEEDS, thicknesses: C.THICKNESSES, paperParams: C.PAPER_PARAMS, variability: C.VARIABILITY,
  reference: TOTAL.reference().source, wallDefaults: STUDY.WALL_DEFAULTS,
}));

// walls of a study from the text of a CSV file, and the template of that file
ipcMain.handle('walls:fromCSV', (e, text) => STUDY.wallsFromRows(parseCSV(text)));
ipcMain.handle('walls:template', () => fs.readFileSync(path.join(__dirname, '..', '..', 'reference', 'walls_template.csv'), 'utf8'));

ipcMain.handle('paper:summary', (e, study, options) => STUDIES[study].paperSummary(options));

ipcMain.handle('study:estimate', (e, study, options, workers) => {
  const p = STUDIES[study].plan(options);
  const est = STUDIES[study].estimate(p);
  return { nJobs: p.jobs.length, nRuns: p.jobs.filter(j => j.kind === 'run').length, nConfigs: p.configs.length, cpu_s: est.cpu_s,
           wall_s: est.cpu_s / Math.max(1, workers || defaultWorkers()) };
});

// a study runs in the pool; its runs are stored in the user's data folder, so that a stopped study resumes
ipcMain.handle('study:start', (e, study, options, workers) => {
  const S = STUDIES[study];
  const p = S.plan(options);
  const hash = crypto.createHash('sha1').update(JSON.stringify({ study, configs: p.configs, seeds: p.options.seeds, variability: p.options.variability || null, model: MODEL_VERSION })).digest('hex').slice(0, 12);
  const store = path.join(resultsDir(), study, `${hash}.partial.jsonl`);
  const id = `${study}-${Date.now()}`;
  const ev = runJobs(p.jobs, { workers: workers || defaultWorkers(), store, order: p.order });
  running.set(id, ev);
  let lastSent = 0, lastPartial = 0;
  const partial = new Array(p.jobs.length).fill(null);
  ev.on('result', ({ index, result }) => { partial[index] = result; });
  ev.on('progress', (pr) => {
    const now = Date.now();
    if (now - lastSent > 250 || pr.done === pr.total) { lastSent = now; send('study:progress', { id, ...pr }); }
    if (now - lastPartial > 2500) { lastPartial = now; send('study:partial', { id, summary: S.summarize(p, partial) }); }
  });
  ev.on('error', (err) => send('study:error', { id, message: String(err && err.message || err) }));
  ev.done.then((results) => {
    running.delete(id);
    const summary = S.summarize(p, results);
    send('study:done', { id, summary, store, cancelled: results.some(r => r == null) });
  });
  return { id, store, nJobs: p.jobs.length };
});

ipcMain.handle('study:cancel', (e, id) => { const ev = running.get(id); if (ev) { ev.cancel(); running.delete(id); } return true; });

// one wall with its motion (Single wall view); runs in a worker thread so that the window stays responsive. A wall of
// the campaigns is run with exactly the campaign's parameters and compared with the stored run of the paper.
ipcMain.handle('single:start', (e, params) => {
  const id = `single-${Date.now()}`;
  const camp = C.campaignOf(params);
  const P = camp ? C.runJob(camp.cfg, camp.seed).params : params;
  const job = { kind: 'animate', id: 'single', tag: { single: true, seed: P.variability.seed }, params: P };
  const ev = runJobs([job], { workers: 1 });
  running.set(id, ev);
  ev.on('notify', (m) => send('single:notify', { id, ...m }));
  ev.on('error', (err) => send('single:error', { id, message: String(err && err.message || err) }));
  ev.done.then((r) => {
    running.delete(id);
    if (!r[0]) return;
    let match = null;
    if (camp) {
      const q = TOTAL.refRun(camp.cfg.campaign, camp.cfg.H, camp.cfg.t, camp.seed), rec = r[0].record;
      if (q) match = { campaign: camp.cfg.campaign, id: camp.cfg.id, seed: camp.seed, ref: { p95m: q.p95m, Lmax: q.Lmax, nBlocks: q.nBlocks, stop: q.stop },
        identical: q.p95m === rec.p.p95.mass && q.Lmax === rec.Lmax && q.nBlocks === rec.nBlocks };
    }
    send('single:done', { id, result: r[0], match });
  });
  return { id };
});
ipcMain.handle('single:cancel', (e, id) => { const ev = running.get(id); if (ev) { ev.cancel(); running.delete(id); } return true; });

ipcMain.handle('file:save', async (e, { defaultName, content, filters, encoding }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: filters || [] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, encoding === 'base64' ? Buffer.from(content, 'base64') : content);
  return r.filePath;
});
ipcMain.handle('shell:openPath', (e, p) => shell.openPath(p));
ipcMain.handle('shell:openExternal', (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('results:clear', (e, study) => { fs.rmSync(path.join(resultsDir(), study), { recursive: true, force: true }); return true; });

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { for (const ev of running.values()) ev.cancel(); if (process.platform !== 'darwin') app.quit(); });
