// Sect. 5 of the paper, total collapse: P95 by mass at the instant of break-up and at rest, the increment added by the
// debris phase, and Lmax, as seed medians per configuration (Fig. R1 and the numbers of Sect. 5). Same rules as the
// paper's analysis: only runs that reached rest enter (runs that hit the 60 s cap are excluded), the increment is the
// median of the per-seed differences, medians as Python's statistics.median.
'use strict';
const path = require('path');
const C = require('./campaigns');
const { median, range } = require('./stats');

let REF = null, BRK = null;
function reference() {
  if (!REF) {
    REF = require(path.join(__dirname, '..', '..', 'reference', 'campaign_runs.json'));
    BRK = require(path.join(__dirname, '..', '..', 'reference', 'breakup_p95.json'));
  }
  return { runs: REF.runs, source: REF.source, breakup: BRK.rows };
}
const refKey = (campaign, H, t, seed) => `${campaign}|${H}|${Number(t).toFixed(2)}|${seed}`;
let refIndex = null;
function refRun(campaign, H, t, seed) {
  if (!refIndex) { refIndex = new Map(); for (const r of reference().runs) refIndex.set(refKey(r.campaign, r.H, r.t, r.seed), r); }
  return refIndex.get(refKey(campaign, H, t, seed)) || null;
}
let brkIndex = null;
function refBreak(id, seed) {
  if (!brkIndex) { brkIndex = new Map(); for (const r of reference().breakup) brkIndex.set(`${r.id}|${r.seed}`, r); }
  return brkIndex.get(`${id}|${seed}`) || null;
}

const DEFAULT_OPTIONS = { campaigns: ['C1', 'C2'], heights: [2.5, 5, 7.5, 10, 12.5, 15], thicknesses: [0.30, 0.60, 0.90, 1.20], seeds: C.SEEDS, cases: [] };

// the configurations and jobs of a study; every configuration gets a debris run and a break-up measure per seed
function plan(options = {}) {
  const o = Object.assign({}, DEFAULT_OPTIONS, options);
  const configs = C.configurations(o.campaigns.filter(c => c === 'C1' || c === 'C2'))
    .filter(c => o.heights.includes(c.H) && o.thicknesses.some(t => Math.abs(t - c.t) < 1e-9))
    .concat(C.caseConfigurations(o.cases || [], 'T'));
  const jobs = [];
  for (const cfg of configs) for (const s of o.seeds) {
    jobs.push(C.runJob(cfg, s));
    jobs.push(Object.assign(C.runJob(cfg, s), { kind: 'breakup' }));
  }
  const order = jobs.map((_, i) => i).sort((a, b) => (jobs[b].kind === 'run') - (jobs[a].kind === 'run') || C.jobSize(jobs[b]) - C.jobSize(jobs[a]));
  return { options: o, configs, jobs, order };
}

// expected computing time [s of one core] from the stored run times of the paper (they were measured with 9 runs in
// parallel on an Apple M4, so the sum divided by the number of workers approximates the wall time on a similar machine)
function estimate(p) {
  let cpu = 0;
  for (const j of p.jobs) {
    if (j.kind !== 'run') { cpu += 0.02; continue; }
    const r = j.tag.campaign ? refRun(j.tag.campaign, j.tag.H, j.tag.t, j.tag.seed) : null;
    cpu += r ? r.runtime_s : 0.5 * j.params.H * j.params.H * j.params.t;   // documented cases: a rough scale
  }
  return { cpu_s: cpu };
}

const pct = (a, b) => (a / b - 1) * 100;

function summarize(p, results) {
  const rows = [];
  let nRuns = 0, nRest = 0, nCap = 0, nIdentical = 0, nCompared = 0, maxDp95 = 0, maxDL = 0;
  for (const cfg of p.configs) {
    const runs = [], brk = new Map();
    p.jobs.forEach((j, i) => {
      if (j.id !== cfg.id || !results[i]) return;
      if (j.kind === 'run') runs.push(results[i]); else brk.set(j.tag.seed, results[i]);
    });
    nRuns += runs.length;
    const rest = runs.filter(r => r.stop === 'rest');
    nRest += rest.length; nCap += runs.filter(r => r.stop === 'timeCap').length;
    const paired = rest.filter(r => brk.has(r.tag.seed));
    const H = cfg.H;
    const row = { id: cfg.id, campaign: cfg.campaign, case: cfg.case || null, H, t: cfg.t, tOverH: cfg.t / H, nSeeds: rest.length,
      p95Rest_H: median(rest.map(r => r.p.p95.mass)) / H, p95Break_H: median(paired.map(r => brk.get(r.tag.seed).p95mBreak)) / H,
      inc_H: median(paired.map(r => r.p.p95.mass - brk.get(r.tag.seed).p95mBreak)) / H,
      Lmax_H: median(rest.map(r => r.Lmax)) / H, p95RestRange_H: range(rest.map(r => r.p.p95.mass / H)), LmaxRange_H: range(rest.map(r => r.Lmax / H)),
      cpu_s: runs.reduce((s, r) => s + r.runtime_s, 0), ref: null };
    if (cfg.campaign !== 'case') {
      const refs = [], refPairs = [];
      for (const r of rest) {
        const q = refRun(cfg.campaign, H, cfg.t, r.tag.seed);
        if (!q) continue;
        nCompared++;
        if (q.p95m === r.p.p95.mass && q.Lmax === r.Lmax && q.nBlocks === r.nBlocks) nIdentical++;
        maxDp95 = Math.max(maxDp95, Math.abs(pct(r.p.p95.mass, q.p95m)));
        maxDL = Math.max(maxDL, Math.abs(pct(r.Lmax, q.Lmax)));
      }
      for (const s of p.options.seeds) {
        const q = refRun(cfg.campaign, H, cfg.t, s);
        if (q && q.stop === 'rest') { refs.push(q); const b = refBreak(cfg.id, s); if (b) refPairs.push([q, b]); }
      }
      if (refs.length) row.ref = { nSeeds: refs.length, p95Rest_H: median(refs.map(q => q.p95m)) / H, Lmax_H: median(refs.map(q => q.Lmax)) / H,
        p95Break_H: median(refPairs.map(([, b]) => b.p95mBreak)) / H, inc_H: median(refPairs.map(([q, b]) => q.p95m - b.p95mBreak)) / H };
    }
    rows.push(row);
  }
  const inc = rows.map(r => r.inc_H).filter(Number.isFinite);
  return { rows, totals: { nConfigs: rows.length, nRuns, nRest, nTimeCap: nCap, nCompared, nIdentical, maxAbsDeltaP95_pct: maxDp95, maxAbsDeltaLmax_pct: maxDL,
    incRange_H: inc.length ? [Math.min(...inc), Math.max(...inc)] : [NaN, NaN],
    nAboveTolerance: rows.filter(r => r.inc_H > 0.03 * r.p95Rest_H).length,
    p95RestRange_H: range(rows.map(r => r.p95Rest_H)), LmaxRange_H: range(rows.map(r => r.Lmax_H)) } };
}

// the paper's figures from the stored runs alone (what the app shows before anything is run)
function paperSummary(options = {}) {
  const p = plan(Object.assign({}, options, { cases: [] }));
  const results = p.jobs.map(j => {
    const q = refRun(j.tag.campaign, j.tag.H, j.tag.t, j.tag.seed);
    if (!q) return null;
    if (j.kind === 'breakup') { const b = refBreak(j.id, j.tag.seed); return b ? Object.assign({ tag: j.tag }, b) : null; }
    return { tag: j.tag, stop: q.stop, nBlocks: q.nBlocks, p: { p95: { mass: q.p95m } }, Lmax: q.Lmax, runtime_s: q.runtime_s };
  });
  const s = summarize(p, results);
  s.rows.forEach(r => { r.ref = null; });
  Object.assign(s.totals, { nCompared: 0, nIdentical: 0, maxAbsDeltaP95_pct: 0, maxAbsDeltaLmax_pct: 0 });   // nothing to compare with
  return s;
}

module.exports = { plan, estimate, summarize, paperSummary, reference, refRun, DEFAULT_OPTIONS };
