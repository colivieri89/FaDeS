// A study of any set of walls, in total or partial collapse (Sect. 5 of the paper). Every wall is run with each seed and
// measured on the blocks at the instant of break-up and at rest. The results are summarised per wall by seed medians
// and ranges, the increment added by the debris phase, and, when the width W of the street is given, by the width left
// free and the number of seeds whose debris reaches the opposite side. Rules of the paper's analysis: only runs that
// reached rest enter (runs that hit the 60 s cap are excluded), the increment is the median of the per-seed
// differences, medians as Python's statistics.median. A wall that is one of the worked examples, run with the default
// variability, is compared run by run with the paper's results for it.
'use strict';
const D = require('./defaults');
const W = require('./walls');
const EX = require('./examples');
const { median, range } = require('./stats');

const { WALL_DEFAULTS, wall, grid, wallParams, wallsFromRows } = W;
const NOMINAL = D.NOMINAL;

// the input of a study: walls given one by one (walls), a grid of heights and thicknesses with shared parameters
// (grid), some of the worked examples (examples: ['total-small-blocks', ...]), or any mix; W is the street width of
// every wall that does not give its own
const DEFAULT_OPTIONS = { walls: [], grid: null, examples: [], W: null, seeds: D.SEEDS, variability: D.VARIABILITY };
function exampleWalls(ids) {
  return ids.map(id => { const x = EX.get(id); if (!x) throw new Error(`no example called ${id}`); return EX.wallOf(x); });
}
function wallsOf(o) {
  let specs = [];
  if (o.grid) specs = specs.concat(grid(o.grid));
  if (o.examples && o.examples.length) specs = specs.concat(exampleWalls(o.examples));
  if (o.walls && o.walls.length) specs = specs.concat(o.walls);
  return specs.map((s, i) => wall(Object.assign({}, s, s.W == null && o.W != null ? { W: o.W } : {}), i));
}

function plan(options = {}) {
  const o = Object.assign({}, DEFAULT_OPTIONS, options);
  const configs = wallsOf(o);
  if (!configs.length) throw new Error('the study has no walls');
  if (!o.seeds.length) throw new Error('the study has no seeds');
  const ids = new Set();
  for (const w of configs) { if (ids.has(w.id)) throw new Error(`two walls are called ${w.id}`); ids.add(w.id); }
  const jobs = [];
  for (const w of configs) for (const seed of o.seeds) {
    const P = wallParams(w, seed, o.variability), ex = EX.ofParams(P);
    const run = { kind: 'run', id: w.id, tag: { wall: w.id, seed, engine: 'planck' }, params: ex ? ex.params : P };
    if (ex) run.example = ex.id;
    jobs.push(run, Object.assign({}, run, { kind: 'breakup' }));
  }
  const order = jobs.map((_, i) => i).sort((a, b) => (jobs[b].kind === 'run') - (jobs[a].kind === 'run') || D.jobSize(jobs[b]) - D.jobSize(jobs[a]));
  return { options: o, configs, jobs, order };
}

// computing time [s of one core]: the paper's run time where the run is one of an example, otherwise a fit of the
// paper's run times on an Apple M4 against the number of blocks
const blocksOf = (P) => (P.Hr || P.H) * P.t / (P.bx * P.by);
function estimate(p) {
  let cpu = 0;
  for (const j of p.jobs) {
    if (j.kind !== 'run') { cpu += 0.02; continue; }
    const q = j.example ? EX.run(j.example, j.tag.seed) : null;
    cpu += q ? q.runtime_s : 4e-4 * Math.pow(blocksOf(j.params), 1.95) + 0.5;
  }
  return { cpu_s: cpu };
}

// height of the debris heap at the distance x from the façade, from the profile of a run (5 cm bins)
function heightAt(profile, x) {
  if (!profile || !profile.height) return NaN;
  const k = Math.floor((x - profile.x0) / profile.bin);
  return k >= 0 && k < profile.height.length ? profile.height[k] : 0;
}

const pct = (a, b) => (a / b - 1) * 100;
function summarize(p, results) {
  const rows = [];
  let nRuns = 0, nRest = 0, nCap = 0, nCompared = 0, nIdentical = 0, maxDp95 = 0, maxDL = 0;
  for (const w of p.configs) {
    const runs = [], brk = new Map();
    p.jobs.forEach((j, i) => {
      if (j.id !== w.id || !results[i]) return;
      if (j.kind === 'run') runs.push(results[i]); else brk.set(j.tag.seed, results[i]);
    });
    nRuns += runs.length;
    const rest = runs.filter(r => r.stop === 'rest');
    nRest += rest.length; nCap += runs.filter(r => r.stop === 'timeCap').length;
    const paired = rest.filter(r => brk.has(r.tag.seed));
    const H = w.H, P95 = rest.map(r => r.p.p95.mass), L = rest.map(r => r.Lmax);
    const row = { id: w.id, mechanism: w.mechanism, H, Hr: w.Hr, t: w.t, tOverH: w.t / (w.Hr || H), bx: w.bx, by: w.by,
      diatoneStep: w.diatoneStep, mu: w.mu, muG: w.muG, e: w.e, rho: w.rho, W: w.W,
      nRuns: runs.length, nSeeds: rest.length, nCap: runs.filter(r => r.stop === 'timeCap').length,
      p95: median(P95), p95Range: range(P95), p50: median(rest.map(r => r.p.p50.mass)), p80: median(rest.map(r => r.p.p80.mass)),
      p90: median(rest.map(r => r.p.p90.mass)), p99: median(rest.map(r => r.p.p99.mass)),
      Lmax: median(L), LmaxRange: range(L),
      p95Break: median(paired.map(r => brk.get(r.tag.seed).p95mBreak)),
      inc: median(paired.map(r => r.p.p95.mass - brk.get(r.tag.seed).p95mBreak)),
      cpu_s: runs.reduce((s, r) => s + r.runtime_s, 0), paper: null, street: null };
    for (const k of ['p95', 'Lmax', 'p95Break', 'inc']) row[`${k}_H`] = row[k] / H;
    row.p95Range_H = row.p95Range.map(x => x / H);
    if (w.W != null && rest.length) {
      const free = P95.map(x => Math.max(0, w.W - x));
      row.street = { W: w.W, freeMedian: median(free), freeMin: Math.min(...free),
        nP95Reach: P95.filter(x => x >= w.W).length, nLmaxReach: L.filter(x => x >= w.W).length,
        heapAtW: median(rest.map(r => heightAt(r.profile, w.W))) };
    }
    // the paper's runs, where the wall is a worked example run with the default variability
    const pj = p.jobs.find(j => j.id === w.id && j.kind === 'run');
    if (pj && pj.example && !p.stored) {
      for (const r of rest) {
        const q = EX.run(pj.example, r.tag.seed);
        if (!q) continue;
        nCompared++;
        if (q.p95m === r.p.p95.mass && q.Lmax === r.Lmax && q.nBlocks === r.nBlocks) nIdentical++;
        maxDp95 = Math.max(maxDp95, Math.abs(pct(r.p.p95.mass, q.p95m)));
        maxDL = Math.max(maxDL, Math.abs(pct(r.Lmax, q.Lmax)));
      }
      const refs = p.options.seeds.map(s => EX.run(pj.example, s)).filter(q => q && q.stop === 'rest');
      const pairs = refs.filter(q => q.p95mBreak != null);
      if (refs.length) row.paper = { example: pj.example, nSeeds: refs.length, p95: median(refs.map(q => q.p95m)), Lmax: median(refs.map(q => q.Lmax)),
        p95Break: pairs.length ? median(pairs.map(q => q.p95mBreak)) : NaN, inc: pairs.length ? median(pairs.map(q => q.p95m - q.p95mBreak)) : NaN };
    }
    if (pj && pj.example) row.example = pj.example;
    rows.push(row);
  }
  const inc = rows.map(r => r.inc_H).filter(Number.isFinite);
  return { rows, totals: { nWalls: rows.length, nRuns, nRest, nTimeCap: nCap, nCompared, nIdentical,
    maxAbsDeltaP95_pct: maxDp95, maxAbsDeltaLmax_pct: maxDL,
    incRange_H: inc.length ? [Math.min(...inc), Math.max(...inc)] : [NaN, NaN],
    nAboveTolerance: rows.filter(r => r.inc_H > 0.03 * r.p95_H).length,
    nStreet: rows.filter(r => r.street).length, nStreetReached: rows.filter(r => r.street && r.street.nP95Reach > r.nSeeds / 2).length } };
}

// CSV of the summary, one row per wall
const CSV_COLS = ['id', 'mechanism', 'H', 'Hr', 't', 'bx', 'by', 'diatoneStep', 'mu', 'muG', 'e', 'rho', 'nSeeds', 'nCap',
  'p95Break', 'p95', 'p95_min', 'p95_max', 'inc', 'p50', 'p80', 'p90', 'p99', 'Lmax', 'Lmax_min', 'Lmax_max',
  'W', 'free_median', 'free_min', 'seeds_P95_reach_W', 'seeds_Lmax_reach_W', 'heap_height_at_W', 'example', 'paper_p95', 'paper_Lmax'];
function toCSV(s) {
  const v = (x) => x == null || (typeof x === 'number' && !Number.isFinite(x)) ? '' : x;
  return CSV_COLS.join(',') + '\n' + s.rows.map(r => [r.id, r.mechanism, r.H, r.Hr, r.t, r.bx, r.by, r.diatoneStep, r.mu, r.muG, r.e, r.rho,
    r.nSeeds, r.nCap, r.p95Break, r.p95, r.p95Range[0], r.p95Range[1], r.inc, r.p50, r.p80, r.p90, r.p99, r.Lmax, r.LmaxRange[0], r.LmaxRange[1],
    r.W, r.street && r.street.freeMedian, r.street && r.street.freeMin, r.street && r.street.nP95Reach, r.street && r.street.nLmaxReach,
    r.street && r.street.heapAtW, r.example, r.paper && r.paper.p95, r.paper && r.paper.Lmax].map(v).join(',')).join('\n') + '\n';
}

// the paper's results for some of the examples, as a summary of a study (what the program shows before anything is
// run): their stored runs and break-up measures in place of the computed ones
function exampleSummary(ids = EX.all().map(x => x.id)) {
  const p = plan({ examples: ids });
  p.stored = true;
  const results = p.jobs.map(j => {
    const q = EX.run(j.example, j.tag.seed);
    if (!q) return null;
    if (j.kind === 'breakup') return q.p95mBreak != null ? { tag: j.tag, p95mBreak: q.p95mBreak, LmaxBreak: q.LmaxBreak } : null;
    return { tag: j.tag, stop: q.stop, nBlocks: q.nBlocks, Lmax: q.Lmax, runtime_s: q.runtime_s,
      p: { p50: { mass: q.p50m }, p80: { mass: NaN }, p90: { mass: q.p90m }, p95: { mass: q.p95m }, p99: { mass: q.p99m } } };
  });
  return summarize(p, results);
}

module.exports = { WALL_DEFAULTS, NOMINAL, DEFAULT_OPTIONS, wall, grid, wallsOf, wallParams, plan, estimate, summarize, wallsFromRows, toCSV,
                   exampleSummary, heightAt, CSV_COLS };
