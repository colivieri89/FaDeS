// Worker thread: runs one job at a time and posts the result back.
// The deterministic math functions (src/sim/detmath.js) are installed before the simulator is loaded, so that every
// platform computes the same bits; workerData.nativeMath = true keeps the runtime's own functions instead.
'use strict';
const { parentPort, workerData } = require('worker_threads');
if (!(workerData && workerData.nativeMath)) require('../sim/detmath').install();
const { execute } = require('./jobs');
parentPort.on('message', async (job) => {
  try { parentPort.postMessage({ ok: true, result: await execute(job, (m) => parentPort.postMessage({ notify: m })) }); }
  catch (e) { parentPort.postMessage({ ok: false, error: String(e && e.stack || e) }); }
});
