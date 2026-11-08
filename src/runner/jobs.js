// What one job computes. Shared by the worker threads of the app and by the command line, so that both run the
// same code path as the paper's batches.
'use strict';
const { runSimulation, perturbedParams } = require('../sim/core/run');
const { resolveParams } = require('../sim/core/params');
const { wallGeometry, blockLayout } = require('../sim/core/geometry');
const { solveRigidPhase, solveRigidPhaseWithBreakup, makePanel, vertices } = require('../sim/core/rigid_phase');
const { breakup } = require('../sim/core/breakup');
const { measures } = require('../sim/core/measures');

// compact record of one debris run (the fields of the stored runs of the paper)
function runRecord(job, r) {
  const out = { tag: job.tag, engine: r.engine.name, nBlocks: r.debris.nBlocks, stop: r.debris.stopReason, tStop: r.debris.tStop,
    energyBudget: r.debris.energyBudget, rigid: { thetaBreak: r.rigidPhase.thetaAtBreakup_deg, omega: r.rigidPhase.omega_rad_s,
      KE: r.rigidPhase.KE_J_per_m, PE: r.rigidPhase.PEreleased_J_per_m, impactWith: r.rigidPhase.impactWith, end: r.rigidPhase.end,
      delta: r.rigidPhase.deltaTheta0_deg, toe: r.rigidPhase.toe },
    mu: r.params.mu, muG: r.params.muG,
    Lmax: r.measures.Lmax_far, Lmax_centroid: r.measures.Lmax_centroid, xMeanMass: r.measures.xMeanMass, p: r.measures.percentiles,
    profile: r.measures.profile, massInside: r.measures.massFractionInsideFootprint, runtime_s: r.runtime_s,
    dt: r.params.dt, engineSettings: r.engine.settings, nBelowGround: r.measures.nBelowGround };
  if (r.debris.column) out.column = r.debris.column;
  return out;
}

// the debris at the instant of break-up, before the engine starts (Sect. 5.2): the same random draws and blocks as the
// production run, measured with the same definitions; no engine run
function breakupRecord(job) {
  const P0 = resolveParams(job.params);
  const { P, rng } = perturbedParams(P0);
  const geom = wallGeometry(P);
  const rigid = solveRigidPhaseWithBreakup(P, geom);
  const blocks = breakup(blockLayout(P, rng), rigid.state, P);
  const m = measures(blocks, blocks).summary;
  return { tag: job.tag, id: job.id, nBlocks: blocks.length, thetaBreak: rigid.theta_deg, p95mBreak: m.percentiles.p95.mass,
           p50mBreak: m.percentiles.p50.mass, LmaxBreak: m.Lmax_far };
}

// one run with its motion, for the animation of the Single wall view: the rigid fall sampled at fixed rotations (the
// same integration stopped at each angle, with its time), then the block poses at every stop check of the debris phase.
// The measures are those of the production run (runSimulation, same seed, same code path).
async function animateRecord(job, notify = () => {}) {
  const P0 = resolveParams(job.params);
  const { P } = perturbedParams(P0);
  const geom = wallGeometry(P);
  const full = solveRigidPhaseWithBreakup(P, geom);
  if (!full.ok) throw new Error('the rigid phase did not reach an impact: ' + full.reason);
  const pan = makePanel(P, geom);
  const th0 = full.theta0_deg, thB = full.theta_deg, NR = 40;
  const rigid = [{ t: 0, poly: vertices(pan, solveRigidPhase(P, geom, { thetaBreak: (th0 + 1e-6) * Math.PI / 180 }).state) }];
  for (let i = 1; i < NR; i++) {
    const a = th0 + (thB - th0) * i / NR;   // uniform in angle
    const r = solveRigidPhase(P, geom, { thetaBreak: a * Math.PI / 180 });
    if (r.ok && r.end === 'breakupAngle') rigid.push({ t: r.tImpact, poly: vertices(pan, r.state) });
  }
  rigid.push({ t: full.tImpact, poly: vertices(pan, full.state) });
  const geomOut = { t: P.t, H: P.H, Hr: P.Hr, h0: geom.h0, residualWall: geom.residualWall, backstop: geom.backstop, slope: geom.slope };
  notify({ partial: { rigid, tImpact: full.tImpact, geom: geomOut } });
  let meta = null;
  const frames = [];
  const r = await runSimulation(job.params, { history: false, blockStates: true, onStart: ({ blocks }) => {
    meta = { ids: blocks.map(b => b.id), w: blocks.map(b => b.w), h: blocks.map(b => b.h), diatone: blocks.map(b => b.type === 'dia' ? 1 : 0) };
    const xyz = new Float32Array(3 * blocks.length);
    blocks.forEach((b, k) => { xyz[3 * k] = b.x; xyz[3 * k + 1] = b.y; xyz[3 * k + 2] = b.phi; });
    frames.push({ t: 0, xyz });
  }, onCheck: ({ t, states, blocks }) => {
    if (!meta) meta = { ids: blocks.map(b => b.id), w: blocks.map(b => b.w), h: blocks.map(b => b.h), diatone: blocks.map(b => b.type === 'dia' ? 1 : 0) };
    const idx = new Map(states.map((s, i) => [s.id, i]));
    const xyz = new Float32Array(3 * meta.ids.length);
    meta.ids.forEach((id, k) => { const s = states[idx.get(id)]; xyz[3 * k] = s.x; xyz[3 * k + 1] = s.y; xyz[3 * k + 2] = s.phi; });
    frames.push({ t, xyz });
    if (frames.length % 4 === 0) notify({ progress: { phase: 'debris', t } });
  } });
  // keep at most 360 debris frames (the last one always)
  const step = Math.max(1, Math.ceil(frames.length / 360));
  const kept = frames.filter((f, i) => i % step === 0 || i === frames.length - 1);
  // break-up state (time 0 of the debris phase) and the final state
  const rec = runRecord(job, r);
  const far = r.blocks.map(b => ({ x: b.xFar, m: b.mass })).sort((a, b) => a.x - b.x);
  const M = far.reduce((s, q) => s + q.m, 0);
  let acc = 0;
  const cdf = far.map(q => { acc += q.m; return [q.x, acc / M]; });
  return { record: rec, tImpact: full.tImpact, rigid, debris: { meta, frames: kept.map(f => ({ t: f.t, xyz: Array.from(f.xyz) })) },
           geom: geomOut,
           cdf, finalBlocks: r.blocks.map(b => [b.x, b.y, b.phi, b.w, b.h, b.type === 'dia' ? 1 : 0]), params: { mu: P.mu, muG: P.muG, theta0: th0 } };
}

async function execute(job, notify) {
  if (job.kind === 'run') {
    const r = await runSimulation(job.params, { engineOptions: job.engineOptions || {}, history: false, blockStates: false });
    return runRecord(job, r);
  }
  if (job.kind === 'breakup') return breakupRecord(job);
  if (job.kind === 'animate') return animateRecord(job, notify);
  throw new Error(`unknown job kind ${job.kind}`);
}

module.exports = { execute, runRecord, breakupRecord };
