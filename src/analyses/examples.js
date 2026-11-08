// The worked examples: one wall of each type analysed in the paper (total collapse with small and with large blocks,
// partial collapse of the top two thirds and of the top third), with the paper's results for that wall, in
// examples/paper_results.json. A run made with the input of an example (its wall, a seed from 1 to 20 and the default
// variability) is compared with the paper's run of the same seed.
'use strict';
const path = require('path');
const { resolveParams } = require('../sim/core/params');
const W = require('./walls');
const D = require('./defaults');

let DATA = null;
const data = () => DATA || (DATA = require(path.join(__dirname, '..', '..', 'examples', 'paper_results.json')));
const all = () => data().examples;
const get = (id) => all().find(x => x.id === id) || null;
const wallOf = (x) => W.wall(x.wall);

// the examples without their results, for the interface
const list = () => all().map(x => ({ id: x.id, title: x.title, wall: wallOf(x), analyses: x.analyses, nRuns: x.runs.length }));
const source = () => data().source;
const twoBlockTests = () => data().twoBlockTests;

// the stored run of an example for one seed
function run(id, seed) { const x = get(id); return x ? x.runs.find(r => r.seed === seed) || null : null; }

// two inputs of the simulator are the same if they resolve to the same parameters (numbers to 1e-9)
function sameInput(a, b) {
  const eq = (x, y) => {
    if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
    if (x && y && typeof x === 'object' && typeof y === 'object') return [...new Set([...Object.keys(x), ...Object.keys(y)])].every(k => eq(x[k], y[k]));
    return x === y;
  };
  return eq(resolveParams(a), resolveParams(b));
}

// the input of the paper's run of an example for one seed
const params = (x, seed) => W.wallParams(wallOf(x), seed, D.VARIABILITY);

// the example whose run of the given seed has the input P, if any, with the exact input of the paper's run
function ofParams(P) {
  const seed = P.variability && P.variability.seed;
  if (!D.SEEDS.includes(seed)) return null;
  for (const x of all()) { const Q = params(x, seed); if (sameInput(P, Q)) return { id: x.id, title: x.title, seed, params: Q }; }
  return null;
}

module.exports = { all, get, list, source, twoBlockTests, run, wallOf, params, sameInput, ofParams };
