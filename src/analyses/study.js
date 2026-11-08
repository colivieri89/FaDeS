// A study of any set of walls. Every wall is run with each seed and measured on the blocks at the instant of break-up
// and at rest. The results are summarised per wall by seed medians and ranges, and, when the width W of the street is
// given, by the width left free and the number of seeds whose debris reaches the opposite side.
// The walls can be anything the simulator accepts. The configurations of the paper's campaigns are one example. A
// wall that coincides with one of them is run with exactly the campaign's parameters and compared with the paper's
// stored run.
'use strict';
const C = require('./campaigns');
const TOTAL = require('./total_collapse');
const { median, range } = require('./stats');

// the parameters of a wall that are not given take these values (those of the paper's campaigns)
const WALL_DEFAULTS = { mechanism: 'total', Hr: null, bx: 0.15, by: 0.15, diatoneStep: C.PAPER_PARAMS.diatones.step,
  diatoneH: C.PAPER_PARAMS.diatones.h, mu: C.PAPER_PARAMS.mu, muG: C.PAPER_PARAMS.muG, e: C.PAPER_PARAMS.e,
  rho: C.PAPER_PARAMS.rho, W: null };
const NOMINAL = { sdThetaDeg: 0, sdBlockRel: 0, sdMuRel: 0 };

function checkWall(w) {
  const bad = (m) => { throw new Error(`wall ${w.id}: ${m}`); };
  if (!(w.H > 0 && w.H <= 60)) bad('the height H must be in (0, 60] m');
  if (!(w.t > 0 && w.t <= 3)) bad('the thickness t must be in (0, 3] m');
  if (!['total', 'partial'].includes(w.mechanism)) bad("the mechanism must be 'total' or 'partial'");
  if (w.mechanism === 'partial' && !(w.Hr > 0 && w.Hr < w.H)) bad('a partial collapse needs 0 < Hr < H');
  if (!(w.bx > 0 && w.by > 0)) bad('the block size must be positive');
  if (!(w.diatoneStep >= 0)) bad('the diatone spacing must be 0 (none) or positive');
  if (!(w.mu >= 0 && w.muG >= 0 && w.e >= 0 && w.e <= 1 && w.rho > 0)) bad('friction >= 0, restitution in [0, 1], density > 0');
  if (w.W != null && !(w.W > 0)) bad('the street width W must be positive');
  return w;
}

// a wall from a partial description: the missing parameters are those of the campaigns; a partial collapse may give
// Hr directly or as a fraction of H (HrRatio)
function wall(spec, i = 0) {
  const w = Object.assign({}, WALL_DEFAULTS, spec);
  if (w.mechanism === 'partial' && w.Hr == null && spec.HrRatio != null) w.Hr = spec.HrRatio * w.H;
  if (w.mechanism === 'total') w.Hr = null;
  w.id = String(spec.id != null && spec.id !== '' ? spec.id : `wall${i + 1}`);
  delete w.HrRatio;
  return checkWall(w);
}

// every combination of the given heights and thicknesses, the other parameters shared
function grid(spec) {
  const { heights, thicknesses, ...common } = spec;
  if (!heights || !heights.length || !thicknesses || !thicknesses.length) throw new Error('the grid needs at least one height and one thickness');
  const out = [];
  for (const H of heights) for (const t of thicknesses) {
    const hr = common.mechanism === 'partial' ? (common.Hr != null ? common.Hr : common.HrRatio * H) : null;
    out.push(wall(Object.assign({}, common, { id: `H${H}_t${Number(t).toFixed(2)}` + (hr != null ? `_Hr${+hr.toFixed(3)}` : ''), H, t }), out.length));
  }
  return out;
}

// the input of the simulator for one wall and one seed
function wallParams(w, seed, variability) {
  const P = Object.assign({}, C.PAPER_PARAMS, { H: w.H, t: w.t, mechanism: w.mechanism, bx: w.bx, by: w.by, mu: w.mu, muG: w.muG,
    e: w.e, rho: w.rho, engine: 'planck',
    diatones: w.diatoneStep > 0 ? { on: true, step: w.diatoneStep, h: w.diatoneH } : { on: false, step: C.PAPER_PARAMS.diatones.step, h: w.diatoneH },
    variability: Object.assign({ seed }, variability) });
  if (w.mechanism === 'partial') P.Hr = w.Hr;
  return P;
}

// the input of a study: walls given one by one (walls), a grid of heights and thicknesses with shared parameters
// (grid), the configurations of some of the paper's campaigns (campaigns: ['C1', ...]), or any mix; W is the street
// width of every wall that does not give its own
const DEFAULT_OPTIONS = { walls: [], grid: null, campaigns: [], W: null, seeds: C.SEEDS, variability: C.VARIABILITY };
function wallsOf(o) {
  let specs = [];
  if (o.grid) specs = specs.concat(grid(o.grid));
  if (o.campaigns && o.campaigns.length) specs = specs.concat(campaignWalls(o.campaigns));
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
    const P = wallParams(w, seed, o.variability);
    const camp = C.campaignOf(P);
    const run = camp ? Object.assign(C.runJob(camp.cfg, camp.seed), { id: w.id })
      : { kind: 'run', id: w.id, tag: { wall: w.id, seed, engine: 'planck' }, params: P };
    run.tag = Object.assign({}, run.tag, { seed });
    jobs.push(run, Object.assign({}, run, { kind: 'breakup' }));
  }
  const order = jobs.map((_, i) => i).sort((a, b) => (jobs[b].kind === 'run') - (jobs[a].kind === 'run') || C.jobSize(jobs[b]) - C.jobSize(jobs[a]));
  return { options: o, configs, jobs, order };
}

// computing time [s of one core]: the stored time of the paper's run where there is one, otherwise a fit of the
// paper's run times on an Apple M4 against the number of blocks
const blocksOf = (P) => (P.Hr || P.H) * P.t / (P.bx * P.by);
function estimate(p) {
  let cpu = 0;
  for (const j of p.jobs) {
    if (j.kind !== 'run') { cpu += 0.02; continue; }
    const q = j.tag.campaign ? TOTAL.refRun(j.tag.campaign, j.tag.H, j.tag.t, j.tag.seed) : null;
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
    if (w.W != null && rest.length) {
      const free = P95.map(x => Math.max(0, w.W - x));
      row.street = { W: w.W, freeMedian: median(free), freeMin: Math.min(...free),
        nP95Reach: P95.filter(x => x >= w.W).length, nLmaxReach: L.filter(x => x >= w.W).length,
        heapAtW: median(rest.map(r => heightAt(r.profile, w.W))) };
    }
    // the paper's stored runs, where the wall is one of its campaign configurations
    const pj = p.jobs.find(j => j.id === w.id && j.kind === 'run');
    if (pj && pj.tag.campaign) {
      const refs = [];
      for (const r of rest) {
        const q = TOTAL.refRun(r.tag.campaign, r.tag.H, r.tag.t, r.tag.seed);
        if (!q) continue;
        nCompared++;
        if (q.p95m === r.p.p95.mass && q.Lmax === r.Lmax && q.nBlocks === r.nBlocks) nIdentical++;
        maxDp95 = Math.max(maxDp95, Math.abs(pct(r.p.p95.mass, q.p95m)));
        maxDL = Math.max(maxDL, Math.abs(pct(r.Lmax, q.Lmax)));
      }
      for (const s of p.options.seeds) { const q = TOTAL.refRun(pj.tag.campaign, pj.tag.H, pj.tag.t, s); if (q && q.stop === 'rest') refs.push(q); }
      if (refs.length) row.paper = { configuration: `${pj.tag.campaign}_H${pj.tag.H}_t${Number(pj.tag.t).toFixed(2)}`, nSeeds: refs.length,
        p95: median(refs.map(q => q.p95m)), Lmax: median(refs.map(q => q.Lmax)) };
    }
    rows.push(row);
  }
  return { rows, totals: { nWalls: rows.length, nRuns, nRest, nTimeCap: nCap, nCompared, nIdentical,
    maxAbsDeltaP95_pct: maxDp95, maxAbsDeltaLmax_pct: maxDL,
    nStreet: rows.filter(r => r.street).length, nStreetReached: rows.filter(r => r.street && r.street.nP95Reach > r.nSeeds / 2).length } };
}

// walls from a CSV file: one wall per row. Required columns id, H_m, t_m and mechanism (T for a total collapse; P, P1
// or P2 for a partial one, with Hr_m; P1 and P2 without Hr_m mean Hr = H/3 and 2H/3). Optional columns, the values of
// the campaigns when absent or empty: bx_m, by_m, diatone_step_m (0 = none), mu, muG, e, rho, W_m.
const OPTIONAL = { bx_m: 'bx', by_m: 'by', diatone_step_m: 'diatoneStep', mu: 'mu', muG: 'muG', e: 'e', rho: 'rho', W_m: 'W' };
function wallsFromRows(rows) {
  const miss = ['id', 'mechanism', 'H_m', 't_m'].filter(k => rows.length && !(k in rows[0]));
  if (miss.length) throw new Error(`missing columns: ${miss.join(', ')}`);
  return rows.filter(r => String(r.id).trim() !== '').map((r, i) => {
    const num = (v) => { const x = Number(String(v).replace(',', '.')); if (!Number.isFinite(x)) throw new Error(`wall ${r.id}: '${v}' is not a number`); return x; };
    const m = String(r.mechanism).trim().toUpperCase();
    if (!['T', 'P', 'P1', 'P2'].includes(m)) throw new Error(`wall ${r.id}: mechanism must be T, P, P1 or P2`);
    const s = { id: String(r.id).trim(), mechanism: m === 'T' ? 'total' : 'partial', H: num(r.H_m), t: num(r.t_m) };
    if (m !== 'T') {
      if (r.Hr_m != null && String(r.Hr_m).trim() !== '') s.Hr = num(r.Hr_m);
      else if (m === 'P') throw new Error(`wall ${r.id}: a partial collapse (P) needs Hr_m`);
      else s.Hr = (m === 'P1' ? 1 / 3 : 2 / 3) * s.H;
    }
    for (const [col, key] of Object.entries(OPTIONAL)) if (r[col] != null && String(r[col]).trim() !== '') s[key] = num(r[col]);
    return wall(s, i);
  });
}

// CSV of the summary, one row per wall
const CSV_COLS = ['id', 'mechanism', 'H', 'Hr', 't', 'bx', 'by', 'diatoneStep', 'mu', 'muG', 'e', 'rho', 'nSeeds', 'nCap',
  'p95Break', 'p95', 'p95_min', 'p95_max', 'inc', 'p50', 'p80', 'p90', 'p99', 'Lmax', 'Lmax_min', 'Lmax_max',
  'W', 'free_median', 'free_min', 'seeds_P95_reach_W', 'seeds_Lmax_reach_W', 'heap_height_at_W', 'paper_configuration', 'paper_p95', 'paper_Lmax'];
function toCSV(s) {
  const v = (x) => x == null || (typeof x === 'number' && !Number.isFinite(x)) ? '' : x;
  return CSV_COLS.join(',') + '\n' + s.rows.map(r => [r.id, r.mechanism, r.H, r.Hr, r.t, r.bx, r.by, r.diatoneStep, r.mu, r.muG, r.e, r.rho,
    r.nSeeds, r.nCap, r.p95Break, r.p95, r.p95Range[0], r.p95Range[1], r.inc, r.p50, r.p80, r.p90, r.p99, r.Lmax, r.LmaxRange[0], r.LmaxRange[1],
    r.W, r.street && r.street.freeMedian, r.street && r.street.freeMin, r.street && r.street.nP95Reach, r.street && r.street.nLmaxReach,
    r.street && r.street.heapAtW, r.paper && r.paper.configuration, r.paper && r.paper.p95, r.paper && r.paper.Lmax].map(v).join(',')).join('\n') + '\n';
}

// a study made of the paper's campaign configurations (C1-C4), as an example of input
function campaignWalls(ids = ['C1', 'C2']) {
  return C.configurations(ids).map(c => wall({ id: c.id, mechanism: c.mech === 'T' ? 'total' : 'partial', H: c.H, t: c.t, bx: c.bx, by: c.by,
    Hr: c.mech === 'T' ? null : (c.mech === 'P2' ? 2 / 3 : 1 / 3) * c.H }));
}

module.exports = { WALL_DEFAULTS, NOMINAL, DEFAULT_OPTIONS, wall, grid, wallsOf, wallParams, plan, estimate, summarize, wallsFromRows, toCSV,
                   campaignWalls, heightAt, CSV_COLS };
