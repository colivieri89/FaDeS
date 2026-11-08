// The study of any set of walls: walls read from a CSV file, grids, the walls that are worked examples, and the summary
// with a street width. Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
require('../src/sim/detmath').install();
const D = require('../src/analyses/defaults');
const EX = require('../src/analyses/examples');
const S = require('../src/analyses/study');
const { parseCSV } = require('../src/analyses/csv');
const { execute } = require('../src/runner/jobs');

const csv = (text) => S.wallsFromRows(parseCSV(text));

const file = (name) => fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf8');

test('walls are read from a CSV file, empty cells taking the default values', () => {
  const w = csv(file('walls_template.csv'));
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

test('a grid gives every combination; a wall that is an example is compared with the paper\'s runs of it', () => {
  const p = S.plan({ grid: { heights: [10, 12], thicknesses: [0.30, 0.60] }, seeds: [1, 2] });
  assert.deepStrictEqual(p.configs.map(c => c.id), ['H10_t0.30', 'H10_t0.60', 'H12_t0.30', 'H12_t0.60']);
  assert.strictEqual(p.jobs.length, 4 * 2 * 2);
  const runs = p.jobs.filter(j => j.kind === 'run');
  // only H 10 m, t 0.60 m is a worked example; its runs have the input of the paper's runs
  assert.deepStrictEqual(runs.filter(j => j.example).map(j => `${j.id}/${j.example}/${j.tag.seed}`), ['H10_t0.60/total-small-blocks/1', 'H10_t0.60/total-small-blocks/2']);
  assert.ok(EX.sameInput(runs[2].params, EX.params(EX.get('total-small-blocks'), 1)));
  // the same wall with other materials, with another variability or with a seed out of 1-20, is not the example
  assert.ok(!S.plan({ grid: { heights: [10], thicknesses: [0.6], mu: 0.6 }, seeds: [1] }).jobs[0].example);
  assert.ok(!S.plan({ grid: { heights: [10], thicknesses: [0.6] }, seeds: [1], variability: S.NOMINAL }).jobs[0].example);
  assert.ok(!S.plan({ grid: { heights: [10], thicknesses: [0.6] }, seeds: [21] }).jobs[0].example);
  // a partial collapse with Hr = H/3
  assert.strictEqual(S.plan({ grid: { mechanism: 'partial', HrRatio: 1 / 3, heights: [12], thicknesses: [0.3] }, seeds: [1] }).jobs[0].example, 'partial-upper-third');
  assert.throws(() => S.plan({ walls: [{ id: 'a', H: 5, t: 0.3 }, { id: 'a', H: 6, t: 0.3 }] }), /two walls/);
  assert.throws(() => S.plan({ examples: ['nope'] }), /no example called nope/);
  assert.throws(() => S.plan({}), /no walls/);
});

test('the examples: one of each type, their CSV file, and the paper\'s results as a summary', () => {
  const xs = EX.list();
  assert.deepStrictEqual(xs.map(x => [x.wall.mechanism, x.wall.bx, x.wall.Hr && +(x.wall.Hr / x.wall.H).toFixed(4)]),
    [['total', 0.15, null], ['total', 0.4, null], ['partial', 0.15, 0.6667], ['partial', 0.15, 0.3333]]);
  assert.ok(EX.all().every(x => x.runs.length === 20 && x.runs.every((r, i) => r.seed === D.SEEDS[i])));
  // the CSV file of the examples gives the same walls
  const w = csv(file('walls.csv'));
  assert.deepStrictEqual(w.map(x => x.id), xs.map(x => x.id));
  w.forEach((x, i) => assert.ok(EX.sameInput(S.wallParams(x, 5), EX.params(EX.get(xs[i].id), 5)), x.id));
  // the summary of the paper's results: medians over the 20 seeds, the increment where the break-up is stored
  const s = S.exampleSummary(), r = s.rows[0], runs = EX.get(r.id).runs;
  const med = (a) => { const v = a.slice().sort((p, q) => p - q); return (v[9] + v[10]) / 2; };
  assert.strictEqual(r.p95, med(runs.map(q => q.p95m)));
  assert.strictEqual(r.inc, med(runs.map(q => q.p95m - q.p95mBreak)));
  assert.ok(Number.isFinite(s.rows[1].inc) && !Number.isFinite(s.rows[2].inc));
  assert.strictEqual(s.totals.nCompared, 0);
  assert.strictEqual(s.totals.nRest, 80);
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
  const P = S.wallParams(w, 4, D.VARIABILITY);
  const r = await execute({ kind: 'run', id: 'x', tag: { wall: 'x', seed: 4 }, params: P });
  assert.strictEqual(r.stop, 'rest');
  assert.ok(r.p.p95.mass > 0.5 * w.H && r.p.p95.mass < 2 * w.H, `P95 ${r.p.p95.mass}`);
  assert.ok(r.Lmax >= r.p.p95.mass);
  const b = await execute({ kind: 'breakup', id: 'x', tag: { wall: 'x', seed: 4 }, params: P });
  assert.strictEqual(b.nBlocks, r.nBlocks);
});
