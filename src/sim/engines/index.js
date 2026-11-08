// Engine registry. The desktop app ships planck.js 1.5.0, the primary engine of the paper. The second engine of
// the paper (PyChrono 9.0.1) needs a separate Python environment and is not bundled; its stored results are
// shown as reference data.
'use strict';
function createEngine(name = 'planck', opts = {}) {
  if (name === 'planck') return require('./planck_engine').createPlanckEngine(opts);
  throw new Error(`engine "${name}" is not available in this build (only planck)`);
}
module.exports = { createEngine, ENGINES: ['planck'] };
