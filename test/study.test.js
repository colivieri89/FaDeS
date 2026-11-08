// The study of any set of walls: walls read from a CSV file, grids, the walls that coincide with a campaign
// configuration, and the summary with a street width. Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
require('../src/sim/detmath').install();
const C = require('../src/analyses/campaigns');
const S = require('../src/analyses/study');
const { parseCSV } = require('../src/analyses/csv');
const { execute } = require('../src/runner/jobs');

const csv = (text) => S.wallsFromRows(parseCSV(text));

test('walls are read from a CSV file, empty cells taking the values of the campaigns', () => {
  const w = csv(fs.readFileSync(path.join(__dirname, '..', 'reference', 'walls_template.csv'), 'utf8'));
  assert.strictEqual(w.length, 2);
  assert.deepStrictEqual([w[0].mechanism, w[0].H, w[0].t, w[0].bx, w[0].mu, w[0].diatoneStep, w[0].W], ['total', 9, 0.6, 0.15, 0.75, 2, 6]);
  assert.deepStrictEqual([w[1].mechanism, w[1].Hr, w[1].bx, w[1].by, w[1].diatoneStep, w[1].mu, w[1].rho], ['partial', 4, 0.25, 0.12, 0, 0.6, 1800]);
  const p = csv('id;mechanism;H_m;t_m\n1;P1;9;0,45\n2;P2;9;0.45\n');
  assert.deepStrictEqual(p.map(x => +x.Hr.toFixed(9)), [3, 6]);
  assert.strictEqual(p[0].t, 0.45);
  assert.throws(() => csv('id,mechanism,H_m,t_m\nA,X,9,0.6\n'), /mechanism/);
  assert.throws(() => csv('id,mechanism,H_m,t_m\nA,P,9,0.6\n'), /Hr_m/);
  assert.throws(() => csv('id,mechanism,H_m\nA,T,9\n'), /missing columns: t_m/);
  assert.throws(() => csv('id,mechanism,H_m,t_m,Hr_m\nA,P,9,0.6,12\n'), /0 < Hr < H/);
});

test('a grid gives every combination; walls of the campaigns are run with the campaign parameters', () => {
  const p = S.plan({ grid: { heights: [5, 6], thicknesses: [0.30, 0.45] }, seeds: [1, 2] });
  assert.deepStrictEqual(p.configs.map(c => c.id), ['H5_t0.30', 'H5_t0.45', 'H6_t0.30', 'H6_t0.45']);
  assert.strictEqual(p.jobs.length, 4 * 2 * 2);
  const runs = p.jobs.filter(j => j.kind === 'run');
  // only H 5 m, t 0.30 m is a configuration of C1; its jobs are those of the campaign
  assert.deepStrictEqual(runs.filter(j => j.tag.campaign).map(j => `${j.id}/${j.tag.seed}`), ['H5_t0.30/1', 'H5_t0.30/2']);
  const cfg = C.configurations(['C1']).find(c => c.H === 5 && c.t === 0.3);
  assert.deepStrictEqual(runs[0].params, C.runJob(cfg, 1).params);
  // the same wall with other materials, or with another variability, is not the campaign's
  assert.ok(!S.plan({ grid: { heights: [5], thicknesses: [0.3], mu: 0.6 }, seeds: [1] }).jobs[0].tag.campaign);
  assert.ok(!S.plan({ grid: { heights: [5], thicknesses: [0.3] }, seeds: [1], variability: S.NOMINAL }).jobs[0].tag.campaign);
  // a partial collapse with Hr = H/3 at a height of C4
  assert.strictEqual(S.plan({ grid: { mechanism: 'partial', HrRatio: 1 / 3, heights: [12], thicknesses: [0.3] }, seeds: [1] }).jobs[0].tag.campaign, 'C4');
  assert.throws(() => S.plan({ walls: [{ id: 'a', H: 5, t: 0.3 }, { id: 'a', H: 6, t: 0.3 }] }), /two walls/);
  assert.throws(() => S.plan({}), /no walls/);
});

test('the summary reports the street left free, the seeds that reach it and the heap at W', () => {
  const p = S.plan({ walls: [{ id: 'w', H: 4, t: 0.4, W: 4 }], seeds: [1, 2, 3] });
  const rec = (seed, p95, L, stop = 'rest') => ({ tag: { seed }, stop, runtime_s: 1, Lmax: L, nBlocks: 10,
    p: { p50: { mass: 1 }, p80: { mass: 2 }, p90: { mass: 3 }, p95: { mass: p95 }, p99: { mass: L } },
    profile: { x0: 0, bin: 0.05, height: Array.from({ length: 100 }, (_, k) => (k < 80 ? 0.5 : 0.1)) } });
  const results = p.jobs.map(j => j.kind === 'breakup' ? { tag: j.tag, p95mBreak: 3.5 }
    : rec(j.tag.seed, ...({ 1: [3.6, 4.2], 2: [4.1, 4.4], 3: [3.0, 3.2, 'timeCap'] })[j.tag.seed]));
  const r = S.summarize(p, results).rows[0];
  assert.strictEqual(r.nSeeds, 2);
  assert.strictEqual(r.nCap, 1);
  assert.ok(Math.abs(r.p95 - 3.85) < 1e-12);
  assert.ok(Math.abs(r.inc - 0.35) < 1e-12);
  assert.ok(Math.abs(r.street.freeMedian - 0.2) < 1e-12);       // median of 0.4 and 0
  assert.strictEqual(r.street.freeMin, 0);
  assert.strictEqual(r.street.nP95Reach, 1);
  assert.strictEqual(r.street.nLmaxReach, 2);
  assert.strictEqual(r.street.heapAtW, 0.1);                    // bin 80 (x = 4.00-4.05 m)
  assert.ok(S.toCSV({ rows: [r] }).split('\n')[1].startsWith('w,total,4,,0.4,'));
});

test('a wall of any size is simulated to rest', async () => {
  const w = S.wall({ id: 'x', H: 3.2, t: 0.35, bx: 0.22, by: 0.11, diatoneStep: 0, mu: 0.6, muG: 0.55, e: 0.05, rho: 1700 });
  const P = S.wallParams(w, 4, C.VARIABILITY);
  const r = await execute({ kind: 'run', id: 'x', tag: { wall: 'x', seed: 4 }, params: P });
  assert.strictEqual(r.stop, 'rest');
  assert.ok(r.p.p95.mass > 0.5 * w.H && r.p.p95.mass < 2 * w.H, `P95 ${r.p.p95.mass}`);
  assert.ok(r.Lmax >= r.p.p95.mass);
  const b = await execute({ kind: 'breakup', id: 'x', tag: { wall: 'x', seed: 4 }, params: P });
  assert.strictEqual(b.nBlocks, r.nBlocks);
});
