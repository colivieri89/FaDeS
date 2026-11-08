// Orchestration of one run (engine-agnostic):
//   parameters -> seeded perturbations -> geometry -> rigid overturning phase (analytic) ->
//   break-up at impact (rigid velocity field) -> debris phase in the engine with a fixed step ->
//   physical stopping criterion -> per-block final states -> output measures
'use strict';
const { resolveParams, deepMerge } = require('./params');
const { makeRng } = require('./rng');
const { wallGeometry, blockLayout } = require('./geometry');
const { solveRigidPhaseWithBreakup } = require('./rigid_phase');
const { breakup } = require('./breakup');
const { outerLeafParams, innerLeafBox, coreGrains, crumbleGrains } = require('./leaves');
const { depositedColumn } = require('./column');
const { buildScene } = require('./scene');
const { kinematics, makeStopper, makeEnergyMonitor } = require('./stop');
const { measures } = require('./measures');
const { createEngine } = require('../engines');

function perturbedParams(P0) {
  // fixed draw order: theta0, mu, muG, then block cuts (inside blockLayout)
  const rng = makeRng(P0.variability.seed);
  const V = P0.variability;
  const P = deepMerge(P0, {});
  P.theta0 = Object.assign({}, P0.theta0, { deltaDeg: Math.max(0.05, P0.theta0.deltaDeg + rng.truncNormal(V.sdThetaDeg || 0)) });
  P.mu = P0.mu * (1 + rng.truncNormal(V.sdMuRel || 0));
  P.muG = P0.muG * (1 + rng.truncNormal(V.sdMuRel || 0));
  return { P, rng };
}

async function runSimulation(userParams = {}, opts = {}) {
  const wall0 = Date.now();
  const P0 = resolveParams(userParams);
  const { P, rng } = perturbedParams(P0);
  const geom = wallGeometry(P);
  // two-leaf variant (exploratory): the outer leaf overturns, the inner leaf stays, the core is released
  const twoLeaf = P.leaves && P.leaves.mode === 'twoLeaf';
  const crumble = P.leaves && P.leaves.mode === 'crumble';
  if (crumble) return runCrumble(P, P0, geom, rng, opts, wall0);
  const Pp = twoLeaf ? outerLeafParams(P) : P;                 // parameters of the overturning panel
  if (twoLeaf) geom.innerLeaf = innerLeafBox(P, geom);
  const rigid = solveRigidPhaseWithBreakup(Pp, geom);
  if (!rigid.ok) throw new Error('rigid phase did not reach an impact: ' + rigid.reason);
  // unbroken panel (breakup.mode 'none'): one block, the whole panel, with the rigid state at impact
  const layout = P.breakup.mode === 'none'
    ? { blocks: [{ layer: 0, col: 0, type: 'panel', u0: -Pp.t, u1: 0, w0: 0, w1: Pp.Hr, w: Pp.t, h: Pp.Hr, uc: -Pp.t / 2, wc: Pp.Hr / 2 }] }
    : blockLayout(Pp, rng);
  const blocks = breakup(layout, rigid.state, Pp);
  if (twoLeaf) blocks.push(...coreGrains(P, geom, rng, blocks.length));
  const deb = await debrisPhase(P, geom, blocks, kinematics(blocks, blocks).KE, opts, { rigid });
  const { t, steps, res, monitor, meas, info, history } = deb, KEref = deb.KEref;
  return {
    version: require('../version').MODEL_VERSION, engine: info, params: P, nominalParams: P0,
    rigidPhase: { end: rigid.end, breakup: rigid.breakup, theta0_deg: rigid.theta0_deg, thetaLim_deg: rigid.thetaLim_deg,
                  deltaTheta0_deg: rigid.theta0_deg - rigid.thetaLim_deg, thetaAtBreakup_deg: rigid.theta_deg, impactWith: rigid.impactWith,
                  // impact (break-up) state: these are results; the fall time is not (it depends on the start perturbation)
                  omega_rad_s: rigid.state.omega, vG_m_s: [rigid.state.vx, rigid.state.vy],
                  KE_J_per_m: rigid.energy.KEimpact, KEtranslational_J_per_m: rigid.energy.KEtranslational, KErotational_J_per_m: rigid.energy.KErotational,
                  PEreleased_J_per_m: rigid.energy.PEreleased, panelMass_kg_per_m: rigid.panel.m,
                  leaves: twoLeaf ? Object.assign({}, P.leaves, { tOuter: Pp.t }) : { mode: 'single' },
                  fallTime_s_not_a_result: rigid.tImpact, toe: rigid.toe, energyDrift: rigid.energy.maxConservativeDrift, log: rigid.log },
    debris: { nBlocks: blocks.length, KEref, steps, tStop: t, stopReason: res.reason, timeCapHit: res.reason === 'timeCap', tRestStart: res.tRestStart,
              energyBudget: monitor.report() },
    measures: meas.summary, blocks: opts.blockStates === false ? undefined : meas.rows,
    history: opts.history === false ? undefined : history,
    runtime_s: (Date.now() - wall0) / 1000,
  };
}

// debris phase in the engine, from the break-up state to rest (shared by all section variants)
async function debrisPhase(P, geom, blocks, KEref, opts, hookInfo) {
  const scene = buildScene(P, geom, blocks);
  const engine = createEngine(P.engine, opts.engineOptions || {});
  await engine.init(scene);
  if (opts.onStart) await opts.onStart(Object.assign({ P, geom, blocks, scene }, hookInfo));
  const stopper = makeStopper(P.stop, KEref);
  const monitor = makeEnergyMonitor(blocks, blocks);
  const nCheck = Math.max(1, Math.round(P.stop.checkEvery / P.dt));
  const history = [];
  let t = 0, states = null, res = null, steps = 0;
  for (;;) {
    await engine.advance(nCheck); steps += nCheck; t = steps * P.dt;
    states = await engine.state();
    const kin = kinematics(blocks, states);
    monitor.update(kin);
    if (opts.history !== false) {
      let xf = -Infinity;
      for (const s of states) xf = Math.max(xf, s.x);
      history.push({ t: +t.toFixed(4), KE: kin.KE, vMax: kin.vMax, xCentroidMax: xf });
    }
    res = stopper(t, kin);
    if (opts.onCheck) { await opts.onCheck({ t, states, kin, blocks, geom }); }   // GUI hook (may yield to the browser)
    if (res.stop) break;
  }
  const meas = measures(blocks, states);
  const info = engine.info();
  await engine.dispose();
  return { t, steps, res, monitor, meas, info, history, KEref };
}

// Crumble variant: no rigid phase; the overturning portion is released at rest as grains, either on the exploratory
// loose lattice (leaves.release 'lattice') or as the deposited column of the formal definition ('deposited', core/column.js).
// The stopping reference energy is the potential energy scale M g Hr / 2 (the kinetic energy at release is 0).
async function runCrumble(P, P0, geom, rng, opts, wall0) {
  let blocks, column = null;
  if (P.leaves.release === 'deposited') { const c = await depositedColumn(P, geom, rng); blocks = c.grains; column = c.info; }
  else blocks = crumbleGrains(P, geom, rng);
  const M = blocks.reduce((s, b) => s + b.mass, 0);
  const deb = await debrisPhase(P, geom, blocks, M * 9.81 * P.Hr / 2, opts, { rigid: null });
  return {
    version: require('../version').MODEL_VERSION, engine: deb.info, params: P, nominalParams: P0,
    rigidPhase: { end: 'crumble', leaves: Object.assign({}, P.leaves), thetaAtBreakup_deg: null, omega_rad_s: 0, KE_J_per_m: 0,
                  PEreleased_J_per_m: null, impactWith: null, deltaTheta0_deg: null, toe: null },
    debris: { nBlocks: blocks.length, KEref: deb.KEref, KErefDefinition: 'M g Hr / 2', steps: deb.steps, tStop: deb.t, stopReason: deb.res.reason,
              timeCapHit: deb.res.reason === 'timeCap', tRestStart: deb.res.tRestStart, energyBudget: deb.monitor.report(), column },
    measures: deb.meas.summary, blocks: opts.blockStates === false ? undefined : deb.meas.rows,
    history: opts.history === false ? undefined : deb.history, runtime_s: (Date.now() - wall0) / 1000,
  };
}

module.exports = { runSimulation, perturbedParams };
