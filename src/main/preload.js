// The only bridge between the interface (renderer, no Node.js access) and the main process.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const on = (ch) => (cb) => { const h = (e, p) => cb(p); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };
contextBridge.exposeInMainWorld('api', {
  info: () => ipcRenderer.invoke('app:info'),
  paperSummary: (study, options) => ipcRenderer.invoke('paper:summary', study, options),
  estimate: (study, options, workers) => ipcRenderer.invoke('study:estimate', study, options, workers),
  startStudy: (study, options, workers) => ipcRenderer.invoke('study:start', study, options, workers),
  cancel: (id) => ipcRenderer.invoke('study:cancel', id),
  startSingle: (params) => ipcRenderer.invoke('single:start', params),
  cancelSingle: (id) => ipcRenderer.invoke('single:cancel', id),
  save: (opts) => ipcRenderer.invoke('file:save', opts),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  openExternal: (u) => ipcRenderer.invoke('shell:openExternal', u),
  clearResults: (study) => ipcRenderer.invoke('results:clear', study),
  wallsFromCSV: (text) => ipcRenderer.invoke('walls:fromCSV', text),
  wallsTemplate: () => ipcRenderer.invoke('walls:template'),
  paperRigid: () => ipcRenderer.invoke('paper:rigid'),
  integrityJob: (kind, params) => ipcRenderer.invoke('integrity:job', kind, params),
  onStudyProgress: on('study:progress'), onStudyPartial: on('study:partial'), onStudyDone: on('study:done'), onStudyError: on('study:error'),
  onSingleNotify: on('single:notify'), onSingleDone: on('single:done'), onSingleError: on('single:error'),
});
