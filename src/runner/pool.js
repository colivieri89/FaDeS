// Parallel, resumable execution of jobs on worker threads.
// Every finished job is appended to <dir>/<name>.partial.jsonl as {key, result} at once, so that a run that is stopped
// (by the user, a crash or a power cut) resumes where it stopped: jobs whose key already has a result are not run again.
//   key = sha1 of JSON.stringify({ kind, tag, params, engineOptions }) of the job
'use strict';
const { Worker } = require('worker_threads');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const WORKER = path.join(__dirname, 'worker.js');
const jobKey = (j) => crypto.createHash('sha1').update(JSON.stringify({ kind: j.kind, tag: j.tag, params: j.params, engineOptions: j.engineOptions || null })).digest('hex');
const defaultWorkers = () => Math.max(1, (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - 1);

function readStore(file) {
  const done = new Map();
  if (!file || !fs.existsSync(file)) return done;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const rec = JSON.parse(line); if (rec.key && rec.result) done.set(rec.key, rec.result); } catch (e) { /* torn last line */ }
  }
  return done;
}

// returns an EventEmitter with .cancel() and .done (a Promise of the results in job order, null for jobs not run)
// events: 'progress' {done, total, resumed, elapsed_s, eta_s}, 'result' {index, result}, 'notify' {index, ...} (messages of a
// running job: partial results, progress), 'error' (Error)
function runJobs(jobs, { workers = defaultWorkers(), store = null, order = null, nativeMath = false } = {}) {
  const ev = new EventEmitter();
  const keys = jobs.map(jobKey);
  const results = new Array(jobs.length).fill(null);
  const prior = readStore(store);
  let resumed = 0;
  keys.forEach((k, i) => { if (prior.has(k)) { results[i] = prior.get(k); resumed++; } });
  const todo = (order || jobs.map((_, i) => i)).filter(i => !results[i]);
  let fd = null;
  if (store) {
    fs.mkdirSync(path.dirname(store), { recursive: true });
    fd = fs.openSync(store, 'a');
    const size = fs.fstatSync(fd).size;
    if (size > 0) {                                   // terminate a torn last line before appending
      const buf = Buffer.alloc(1), rfd = fs.openSync(store, 'r'); fs.readSync(rfd, buf, 0, 1, size - 1); fs.closeSync(rfd);
      if (buf[0] !== 0x0a) fs.writeSync(fd, '\n');
    }
  }
  const t0 = Date.now();
  let next = 0, finished = 0, cancelled = false, failed = false, busyTime = 0;
  const pool = [];
  const total = jobs.length;
  const progress = () => {
    const doneNow = finished, elapsed = (Date.now() - t0) / 1000;
    const remaining = todo.length - doneNow;
    const rate = doneNow > 0 ? elapsed / doneNow : null;
    ev.emit('progress', { done: resumed + doneNow, total, resumed, elapsed_s: elapsed, eta_s: rate != null ? rate * remaining : null, cpu_s: busyTime });
  };
  ev.done = new Promise((resolve) => {
    const close = () => { pool.forEach(w => w.terminate()); if (fd != null) { fs.closeSync(fd); fd = null; } resolve(results); };
    ev.cancel = () => { cancelled = true; close(); ev.emit('cancelled'); };
    if (!todo.length) { setImmediate(() => { progress(); close(); }); return; }
    const n = Math.min(workers, todo.length);
    for (let w = 0; w < n; w++) {
      const worker = new Worker(WORKER, { workerData: { nativeMath } });
      pool.push(worker);
      worker.on('error', (e) => { if (!cancelled && !failed) { failed = true; ev.emit('error', e); close(); } });
      const feed = () => {
        if (cancelled || failed) return;
        if (next >= todo.length) return;
        const i = todo[next++], tStart = Date.now();
        const onMsg = (msg) => {
          if (msg.notify) { ev.emit('notify', { index: i, ...msg.notify }); return; }
          worker.off('message', onMsg);
          if (cancelled || failed) return;
          if (!msg.ok) { failed = true; ev.emit('error', new Error(JSON.stringify(jobs[i].tag) + ': ' + msg.error)); close(); return; }
          busyTime += (Date.now() - tStart) / 1000;
          results[i] = msg.result; finished++;
          if (fd != null) fs.writeSync(fd, JSON.stringify({ key: keys[i], result: msg.result }) + '\n');
          ev.emit('result', { index: i, result: msg.result });
          progress();
          if (finished === todo.length) close(); else feed();
        };
        worker.on('message', onMsg);
        worker.postMessage(jobs[i]);
      };
      feed();
    }
    setImmediate(progress);
  });
  return ev;
}

module.exports = { runJobs, jobKey, defaultWorkers };
