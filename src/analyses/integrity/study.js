// Sect. 3 (verification of the rigid phase) and Sect. 4 (integrity of the panel during the fall) of the paper, for any
// wall in total collapse: the jobs, their compact records and the summaries, with the rules of the paper's analysis.
// A wall that is one of the worked examples is compared with the paper's results for it.
'use strict';
const { resolveParams } = require('../../sim/core/params');
const { wallGeometry } = require('../../sim/core/geometry');
const { solveRigidPhase } = require('../../sim/core/rigid_phase');
const D = require('../defaults');
const EX = require('../examples');
const SEC = require('./sections');
const FALL = require('./fall_checks');
const TB = require('./two_block');

const STEP_DEG = 0.25;                 // rotation step of the checks of the intact panel
const deg = (phi) => -phi * 180 / Math.PI;
const ftKeys = (fts) => fts.map(FALL.ftKey);

// ------------------------------------------------------------------ Sect. 4: one wall
// the fields kept of a two-block run (those of the paper's result files)
const RUN_KEYS = ['thetaOnset', 'sOverH', 'side', 'end', 'atOnset', 'tAfterHinge', 'thetaEnd', 'newHinge', 'marginP95', 'marginLmax'];
const pickRun = (r) => r && Object.fromEntries(RUN_KEYS.filter(k => r[k] !== undefined).map(k => [k, r[k]]));

function compact(cfg, checks, fc, b2, pl) {
  return { id: cfg.id, H: cfg.H, t: cfg.t,
    theta0: checks.theta0, thetaImpact: checks.thetaImpact, firstViolation: checks.firstViolation,
    elastic: checks.elasticCracking, plastic: checks.rigidPlastic, firstSlide: checks.firstSlide,
    slideBeforeHinge: checks.slideBeforeHinge, slideLeadDeg: checks.slideLeadDeg,
    fc: Object.fromEntries(Object.entries(fc).map(([k, r]) => [k, pickRun(r)])), b2: pickRun(b2),
    pl: Object.fromEntries(Object.entries(pl).map(([k, r]) => [k, pickRun(r)])) };
}

// the checks of the intact panel, then the two-block motion from the first hinge: with no tensile strength (both
// blocks checked, and the upper block only), and with each tensile strength under the elastic and the rigid-plastic form
function integrityRecord(cfg, fts = FALL.DEFAULT_FT) {
  const checks = FALL.analyse(cfg, 0, STEP_DEG, {}, fts);
  if (!checks.ok) return { id: cfg.id, ok: false };
  const fc = {}, pl = {};
  for (const v of ['0'].concat(ftKeys(fts))) fc[v] = TB.analyse(cfg, 0, checks, v, 'firstCrossing', 'both');
  const b2 = TB.analyse(cfg, 0, checks, '0', 'firstCrossing', 'B2only');
  for (const v of ftKeys(fts)) pl[v] = TB.analyse(cfg, 0, checks, v, 'firstCrossing', 'both', 'plastic');
  return Object.assign(compact(cfg, checks, fc, b2, pl), { mu: cfg.mu != null ? cfg.mu : null, rho: cfg.rho != null ? cfg.rho : null });
}

// panel (a) of Fig. 5: one wall when its lower block reaches its limit, with the rigid panel at the same instant
function integrityTrace(cfg) {
  const checks = FALL.analyse(cfg, 0, STEP_DEG, {}, []);
  if (!checks.ok || !checks.firstViolation) return { id: cfg.id, ok: false, reason: checks.ok ? 'no hinge before the impact' : 'no impact' };
  const { P, geom } = TB.setup(cfg, 0);
  const full = solveRigidPhase(P, geom);
  const on = TB.onsetFirstCrossing(P, geom, full.theta0_deg, checks.firstViolation.theta, STEP_DEG, 0);
  if (!on.ok) return { id: cfg.id, ok: false, reason: 'first hinge not located' };
  const hs = TB.hingedSystem(P, geom, on, on.s, 0);
  hs.sys.critMode = 'both';
  const lo = TB.integrate(hs.sys, hs.S, { sample: 20 });
  const t0 = on.r.tImpact, rs = TB.rigidSystem(P, geom);
  const rigidAt = TB.integrate(rs.sys, rs.S, { tMax: t0 + lo.t });
  const box = (s, b) => b.V.map(v => TB.pt(s, v).p);
  // a line across a block at the fraction f of its length (corners: street-bottom, street-top, inner-top, inner-bottom)
  const across = (b, f) => [[b[0][0] + f * (b[1][0] - b[0][0]), b[0][1] + f * (b[1][1] - b[0][1])], [b[3][0] + f * (b[2][0] - b[3][0]), b[3][1] + f * (b[2][1] - b[3][1])]];
  const blocks = lo.S.map((s, i) => box(s, hs.sys.bodies[i]));
  const sF = on.s * P.Hr, lowerS = lo.cr && lo.cr.b1 ? lo.cr.b1.s_over_H : null;
  return { id: cfg.id, ok: true, H: P.H, t: P.t, theta0: full.theta0_deg, thetaImpact: full.theta_deg, tImpact: full.tImpact,
    onset: { t: t0, theta: on.theta, sOverH: on.s }, end: lo.end, tAfter: lo.t, lowerSOverH: lowerS,
    blocks, blockTheta: lo.S.map(s => deg(s.phi)), rigidPanel: box(rigidAt.S[0], TB.makeBody(P.t, P.Hr, P.rho)), rigidTheta: deg(rigidAt.S[0].phi),
    hingeLine: across(blocks[1], 0), lowerLine: lowerS != null ? across(blocks[0], lowerS * P.Hr / sF) : null };
}

// ------------------------------------------------------------------ Sect. 3: checks of the rigid phase
// toe forces of a rectangle pivoting from rest about its corner (Eqs. 15-16 of the paper), per unit weight;
// phi = angle of the line toe-G from the vertical, phi0 = its initial value delta
function toeClosedForm(phi, phi0) {
  return { T: 0.75 * Math.sin(phi) * Math.cos(phi) - 1.5 * (Math.cos(phi0) - Math.cos(phi)) * Math.sin(phi),
           N: 1 - 0.75 * Math.sin(phi) ** 2 - 1.5 * (Math.cos(phi0) - Math.cos(phi)) * Math.cos(phi) };
}
// slip angle of the closed form [deg]: the first root of |T| = mu N, bracketed on 4000 points up to 89 deg and refined
// by bisection; theta = phi + atan(t/Hr)
function slipClosedForm(t, Hr, mu, deltaDeg = 0.5) {
  const phi0 = deltaDeg * Math.PI / 180, f = (p) => { const q = toeClosedForm(p, phi0); return Math.abs(q.T) - mu * q.N; };
  const a0 = phi0 + 1e-4, a1 = 89 * Math.PI / 180, n = 3999;
  let pa = a0, fa = f(pa);
  for (let k = 1; k <= n; k++) {
    const pb = a0 + (a1 - a0) * k / n, fb = f(pb);
    if (fa < 0 && fb >= 0) {
      let lo = pa, hi = pb;
      for (let i = 0; i < 200 && hi - lo > 1e-17; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
      return (lo + hi) / 2 * 180 / Math.PI + Math.atan(t / Hr) * 180 / Math.PI;
    }
    pa = pb; fa = fb;
  }
  return null;
}

// friction demand |T|/N at the toe of the closed form against the rotation theta [deg], from the start to a few degrees
// past the slip angle (or the landing): the wall slips where the curve meets mu
function demandCurve(t, Hr, thetaSlip, deltaDeg = 0.5, n = 160) {
  const beta = Math.atan(t / Hr) * 180 / Math.PI, phi0 = deltaDeg * Math.PI / 180, th0 = beta + deltaDeg, out = [];
  const thEnd = Math.min(89 + beta, thetaSlip + 8);
  for (let k = 0; k <= n; k++) {
    const th = th0 + (thEnd - th0) * k / n, q = toeClosedForm((th - beta) * Math.PI / 180, phi0);
    if (q.N > 0) out.push([th, Math.abs(q.T) / q.N]);
  }
  return out;
}

// the examples in total collapse, and the walls of their rigid-phase checks (the default friction)
const totalExamples = () => EX.all().filter(x => x.wall.mechanism === 'total');
const checkWalls = () => totalExamples().map(x => ({ H: x.wall.H, t: x.wall.t, mu: D.MATERIALS.mu }));
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
// the example whose rigid-phase check is that of the wall w (same H, t and friction), if any
const rigidExampleOf = (w) => totalExamples().find(x => near(w.H, x.wall.H) && near(w.t, x.wall.t) && near(w.mu, D.MATERIALS.mu) && near(w.muG, D.MATERIALS.muG)) || null;

// one wall: slip angle of the code and of the closed form, energy drift in the conservative regimes, landing state with
// the step halved, energy balance of the slide regime, and the friction demand |T|/N of the closed form along the fall
function rigidCheck(w) {
  const mu = w.mu != null ? w.mu : D.MATERIALS.mu, muG = w.muG != null ? w.muG : mu;
  const P = resolveParams({ H: w.H, t: w.t, mechanism: 'total', mu, muG, variability: Object.assign({ seed: 1 }, D.NOMINAL) });
  const geom = wallGeometry(P);
  const a = solveRigidPhase(P, geom), b = solveRigidPhase(P, geom, { h: 5e-5 }), e = solveRigidPhase(P, geom, { slideEnergy: true });
  const slip = a.log.find(l => l.reason === 'slip');
  const cf = slipClosedForm(P.t, P.Hr, mu, P.theta0.deltaDeg);
  const landing = Math.max(...['omega', 'vx', 'vy'].map(k => Math.abs(b.state[k] - a.state[k]) / Math.max(Math.abs(a.state[k]), 1e-9)));
  const demand = demandCurve(P.t, P.Hr, slip ? slip.theta_deg : a.theta_deg, P.theta0.deltaDeg);
  const ex = rigidExampleOf({ H: w.H, t: w.t, mu, muG });
  return { H: w.H, t: w.t, mu, muG, tOverH: w.t / w.H, example: ex ? ex.id : null, theta0: a.theta0_deg, thetaImpact: a.theta_deg,
    slipCode: slip ? slip.theta_deg : null, slipClosedForm: cf, diff: slip && cf != null ? slip.theta_deg - cf : null,
    drift: a.energy.maxConservativeDrift, landing, slides: e.log.some(l => l.regime === 'SLIDE' || l.reason === 'slip'),
    slideResidual: e.energy.slideResidualMax, regimes: a.log.map(l => l.reason).join(' '), demand };
}

// the checks of the given walls (the examples in total collapse by default), the tests of the two-block code (V1 for
// each of the walls) and the test of the internal actions
function rigidChecks(options = {}) {
  const ws = options.walls && options.walls.length ? options.walls : checkWalls();
  const walls = ws.map(rigidCheck);
  const ver = TB.verify(walls.map((w, i) => ({ id: `wall${i + 1}`, H: w.H, t: w.t, bx: 0.15, by: 0.15, mu: w.mu, muG: w.muG }))), rod = SEC.rodUnitTest();
  return { walls,
    twoBlock: { V1: ver.summary.V1_maxRel, V1_pass: ver.summary.V1_pass, V1_n: ver.V1.length, V2: ver.V2, V2_pass: ver.summary.V2_pass,
                V3: ver.summary.V3_maxRelByT, V3_pass: ver.summary.V3_pass },
    rod: { maxRelErr: Math.max(...rod.map(r => r.relErr)), n: rod.length } };
}

// ------------------------------------------------------------------ the study of Sect. 4
// walls: some of the worked examples (those in total collapse), a grid of heights and thicknesses, or walls given one
// by one (total collapse only, as in the paper: the partial-collapse panels pivot on the residual wall and were not
// analysed); each wall may give its own friction mu and density rho; fts: tensile strengths [MPa] of the post hoc check
const DEFAULT_OPTIONS = { examples: null, grid: null, walls: [], fts: FALL.DEFAULT_FT };
function wallsOf(o) {
  const out = [];
  const add = (w, i) => {
    if (w.mechanism && w.mechanism !== 'total') return;
    const cfg = { id: String(w.id != null ? w.id : `wall${i + 1}`), H: +w.H, t: +w.t, bx: w.bx != null ? +w.bx : 0.15, by: w.by != null ? +w.by : 0.15 };
    if (w.mu != null) cfg.mu = +w.mu;
    if (w.muG != null) cfg.muG = +w.muG;
    if (w.rho != null) cfg.rho = +w.rho;
    if (w.diatoneStep != null) cfg.diatoneStep = +w.diatoneStep;
    if (!(cfg.H > 0 && cfg.t > 0 && cfg.t < cfg.H)) throw new Error(`wall ${cfg.id}: H and t must be positive, t < H`);
    out.push(cfg);
  };
  for (const id of o.examples || []) {
    const x = EX.get(id);
    if (!x) throw new Error(`no example called ${id}`);
    add(x.wall, out.length);
  }
  if (o.grid) for (const H of o.grid.heights) for (const t of o.grid.thicknesses) add(Object.assign({}, o.grid, { id: `H${H}_t${Number(t).toFixed(2)}`, H, t }), out.length);
  (o.walls || []).forEach(add);
  const ids = new Set();
  for (const c of out) { if (ids.has(c.id)) throw new Error(`two walls are called ${c.id}`); ids.add(c.id); }
  return out;
}
function plan(options = {}) {
  const o = Object.assign({}, DEFAULT_OPTIONS, options);
  if (o.examples == null) o.examples = o.grid || (o.walls && o.walls.length) ? [] : totalExamples().map(x => x.id);
  const fts = [...new Set((o.fts || []).map(Number))].filter(x => x > 0).sort((a, b) => a - b);
  o.fts = fts;
  const configs = wallsOf(o);
  if (!configs.length) throw new Error('no total-collapse wall to check');
  // the inputs of a job are in params, so that a stored result is reused only for the same wall and strengths
  const jobs = configs.map(cfg => ({ kind: 'integrity', id: cfg.id, tag: { integrity: cfg.id }, params: { cfg, fts } }));
  // the slender walls first: they rotate longest before landing
  const order = jobs.map((_, i) => i).sort((a, b) => configs[a].t / configs[a].H - configs[b].t / configs[b].H);
  return { options: o, configs, jobs, order };
}
// one core of an Apple M4: about 13 s for a stocky wall to 40 s for the most slender, with two tensile strengths
const jobCost = (j) => (10 + 0.8 * j.params.cfg.H / j.params.cfg.t) * (1 + 2 * j.params.fts.length) / 5;
const estimate = (p, workers = 1) => {
  const c = p.jobs.map(jobCost), cpu = c.reduce((a, b) => a + b, 0);
  return { cpu_s: cpu, wall_s: Math.max(cpu / workers, ...c) };
};

const range = (a) => { const v = a.filter(Number.isFinite); return v.length ? [Math.min(...v), Math.max(...v)] : [NaN, NaN]; };

// the example whose nominal wall is the wall cfg (same input of the simulator), if any
const exampleOf = (cfg) => totalExamples().find(x => EX.sameInput(SEC.input(cfg, 0), SEC.input(x.wall, 0))) || null;

// a wall against the paper's result for its example: identical, or the largest relative difference of its
// numbers over the tensile strengths both contain; the value of the criterion at a located hinge (g, zero to rounding,
// of order 1e-16) counts for "identical" but not for the difference
function agreement(r, q) {
  let maxRel = 0, same = true;
  const walk = (a, b, key) => {
    if (typeof a === 'number' && typeof b === 'number') {
      if (a !== b) { same = false; if (key !== 'g') maxRel = Math.max(maxRel, Math.abs(a - b) / Math.max(Math.abs(b), 1e-12)); }
      return;
    }
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (a !== b) { same = false; maxRel = Infinity; } return; }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], k);
  };
  const keys = Object.keys(q.fc).filter(k => k in r.fc), sub = (o) => o && Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
  const view = (x) => ({ theta0: x.theta0, thetaImpact: x.thetaImpact, firstViolation: x.firstViolation, firstSlide: x.firstSlide, slideLeadDeg: x.slideLeadDeg,
    elastic: sub(x.elastic), plastic: sub(x.plastic), fc: sub(x.fc), pl: sub(x.pl), b2: x.b2 });
  walk(view(r), view(q));
  return { identical: same, maxRel };
}

function summarize(p, results) {
  // each row carries the wall it was computed for (job order = order of the configurations)
  const ex = p.configs.map(exampleOf);
  const R = results.map((r, i) => r && r.firstViolation !== undefined ? Object.assign({}, r, { wall: p.configs[i], example: ex[i] ? ex[i].id : null }) : null).filter(Boolean);
  const cmp = p.stored ? [] : results.map((r, i) => r && r.firstViolation !== undefined && ex[i] ? agreement(r, ex[i].integrity) : null).filter(Boolean);
  const keys = ftKeys(p.options.fts);
  const run0 = (r) => r.fc && r.fc['0'];
  const hinged = R.filter(r => r.firstViolation && run0(r) && run0(r).thetaOnset != null);
  const low = hinged.filter(r => run0(r).end === 'hingeB1');
  const up = R.filter(r => r.b2 && r.b2.end === 'secondHingeB2');
  const sl = R.filter(r => r.slideBeforeHinge);
  // the two-block runs that reach the ground unbroken further (two blocks) or with no hinge, at each tensile strength
  const ground = (form) => Object.fromEntries(keys.map(k => [k, R.map(r => r[form] && r[form][k]).filter(x => x && ['groundContact', 'noHinge'].includes(x.end))]));
  const gE = ground('fc'), gP = ground('pl');
  const marginMax = (sets) => { const v = Object.values(sets).flat().map(x => Math.max(Math.abs(x.marginP95 || 0), Math.abs(x.marginLmax || 0))); return v.length ? 100 * Math.max(...v) : NaN; };
  const twoOnset = (sets) => range(Object.values(sets).flat().filter(x => x.end === 'groundContact').map(x => x.thetaOnset));
  return {
    rows: R, fts: p.options.fts, keys,
    totals: {
      n: R.length, nHinge: R.filter(r => r.firstViolation).length,
      thetaRange: range(hinged.map(r => run0(r).thetaOnset)), sRange: range(hinged.map(r => run0(r).sOverH)),
      allInnerFace: hinged.every(r => run0(r).side === 'inner-face corner'),
      nLower: low.length, nLowerSlide: hinged.filter(r => run0(r).end === 'jointSliding').length,
      lowerMsRange: range(low.map(r => 1000 * run0(r).tAfterHinge)), validDegMax: low.length ? Math.max(...low.map(r => run0(r).thetaEnd[0] - run0(r).thetaOnset)) : NaN,
      nUpper: up.length, nUpperSlide: R.filter(r => r.b2 && r.b2.end === 'jointSliding').length,
      upperSRange: range(up.map(r => r.b2.newHinge && r.b2.newHinge.s_over_H)), upperTRange: range(up.map(r => r.b2.tAfterHinge)),
      survElastic: Object.fromEntries(keys.map(k => [k, R.filter(r => r.elastic && r.elastic[k] === null).length])),
      survPlastic: Object.fromEntries(keys.map(k => [k, R.filter(r => r.plastic && r.plastic[k] === null).length])),
      groundElastic: Object.fromEntries(keys.map(k => [k, gE[k].length])), groundPlastic: Object.fromEntries(keys.map(k => [k, gP[k].length])),
      marginMaxElastic: marginMax(gE), marginMaxPlastic: marginMax(gP), twoBlockOnsetElastic: twoOnset(gE), twoBlockOnsetPlastic: twoOnset(gP),
      nSlideFirst: sl.length, slideLeadRange: range(sl.map(r => r.slideLeadDeg)),
      nNoImpact: results.filter(r => r && r.ok === false).length,
      nCompared: cmp.length, nIdentical: cmp.filter(c => c.identical).length, maxRelDiff: cmp.length ? Math.max(...cmp.map(c => c.maxRel)) : NaN,
    },
  };
}

// the paper's results for the examples in total collapse, as a summary (what the program shows before anything is run)
function exampleSummary() {
  const p = plan({ examples: totalExamples().map(x => x.id), fts: FALL.DEFAULT_FT });
  p.stored = true;
  return summarize(p, p.configs.map(c => Object.assign({}, exampleOf(c).integrity, { id: c.id })));
}
// the paper's checks of the rigid phase of the examples in total collapse, with the friction demand of the closed form
// of each wall; V1 over the examples, V2 and V3 as stored, the thin-rod test computed
function exampleRigid() {
  const xs = totalExamples(), V1 = xs.map(x => x.rigid.V1), T = EX.twoBlockTests(), rod = SEC.rodUnitTest();
  const worst = (k) => Math.max(...V1.map(v => typeof v[k] === 'number' ? v[k] : Infinity));
  return {
    walls: xs.map(x => Object.assign({ H: x.wall.H, t: x.wall.t, mu: D.MATERIALS.mu, muG: D.MATERIALS.muG, tOverH: x.wall.t / x.wall.H, example: x.id,
      demand: demandCurve(x.wall.t, x.wall.H, x.rigid.slipCode) }, x.rigid, { V1: undefined })),
    twoBlock: { V1: Object.fromEntries(['dT', 'dTheta', 'dState', 'dPos', 'switches'].map(k => [k, worst(k)])),
      V1_pass: ['dT', 'dTheta', 'dState', 'switches'].every(k => worst(k) <= 1e-6) && V1.every(v => v.end === 'groundContact' && v.regimes.split(' ').length === v.regimesRef.split(' ').length),
      V1_n: V1.length, V2: T.V2, V2_pass: T.V2_pass, V3: T.V3, V3_pass: T.V3_pass },
    rod: { maxRelErr: Math.max(...rod.map(r => r.relErr)), n: rod.length } };
}

const KINDS = ['integrity', 'integrityTrace', 'rigidChecks'];
async function execute(job) {
  if (job.kind === 'integrity') return integrityRecord(job.params.cfg, job.params.fts);
  if (job.kind === 'integrityTrace') return integrityTrace(job.params.cfg);
  if (job.kind === 'rigidChecks') return rigidChecks(job.params || {});
  throw new Error(`unknown job kind ${job.kind}`);
}

// one row per wall
const CSV_HEAD = ['id', 'H_m', 't_m', 't_over_H', 'theta0_deg', 'thetaImpact_deg', 'firstHinge_deg', 'firstHinge_s_over_H', 'lowerLimit_s_over_H',
  'lowerLimit_ms', 'upperEnd', 'upperSecondHinge_s_over_H', 'upperSecondHinge_s', 'slideBeforeHinge', 'slideLead_deg'];
function toCSV(s) {
  const head = CSV_HEAD.concat(...s.keys.map(k => [`elastic_${k}_deg`, `plastic_${k}_deg`, `twoBlock_${k}_elastic`, `twoBlock_${k}_plastic`]));
  const v = (x, d = 4) => (x == null || !Number.isFinite(x) ? '' : +x.toFixed(d));
  const rows = s.rows.map(r => {
    const f = r.fc && r.fc['0'] || {}, low = f.end === 'hingeB1', b2 = r.b2 || {};
    return [r.id, r.H, r.t, v(r.t / r.H), v(r.theta0), v(r.thetaImpact), v(f.thetaOnset), v(f.sOverH), low && f.newHinge ? f.newHinge.s_over_H : '',
      low ? v(1000 * f.tAfterHinge, 3) : '', b2.end || '', b2.end === 'secondHingeB2' && b2.newHinge ? b2.newHinge.s_over_H : '',
      b2.end === 'secondHingeB2' ? v(b2.tAfterHinge) : '', r.slideBeforeHinge ? 1 : 0, r.slideBeforeHinge ? v(r.slideLeadDeg, 2) : '']
      .concat(...s.keys.map(k => [r.elastic && r.elastic[k] ? v(r.elastic[k].theta) : 'none', r.plastic && r.plastic[k] ? v(r.plastic[k].theta) : 'none',
        r.fc && r.fc[k] ? r.fc[k].end : '', r.pl && r.pl[k] ? r.pl[k].end : '']));
  });
  return [head].concat(rows).map(r => r.join(',')).join('\n') + '\n';
}

module.exports = { execute, KINDS, toCSV, plan, estimate, summarize, exampleSummary, exampleRigid, exampleOf, totalExampleIds: () => totalExamples().map(x => x.id), compact, integrityRecord, integrityTrace,
                   rigidCheck, rigidChecks, slipClosedForm, toeClosedForm, demandCurve, wallsOf, checkWalls, DEFAULT_OPTIONS, RUN_KEYS };
