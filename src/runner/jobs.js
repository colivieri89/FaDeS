// What one job computes. Shared by the worker threads of the app and by the command line, so that both run the
// same code path as the paper's batches.
'use strict';
const { runSimulation, perturbedParams } = require('../sim/core/run');
const { resolveParams } = require('../sim/core/params');
const { wallGeometry, blockLayout } = require('../sim/core/geometry');
const { solveRigidPhaseWithBreakup } = require('../sim/core/rigid_phase');
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

async function execute(job) {
  if (job.kind === 'run') {
    const r = await runSimulation(job.params, { engineOptions: job.engineOptions || {}, history: false, blockStates: false });
    return runRecord(job, r);
  }
  if (job.kind === 'breakup') return breakupRecord(job);
  throw new Error(`unknown job kind ${job.kind}`);
}

module.exports = { execute, runRecord, breakupRecord };
