// Input parameters of the simulator (SI units throughout) and their validation.
//
// Frame: x horizontal towards the street, y vertical upwards; origin at the street face of the
// facade at ground level. The wall occupies x in [-t, 0]. Slope: positive = road descending away
// from the facade (the road surface rotates about the toe, x = 0).
'use strict';

const DEFAULTS = Object.freeze({
  // geometry [m]
  H: 10, Hr: 10, mechanism: 'total',            // 'total' (Hr = H) or 'partial' (residual wall H - Hr)
  t: 0.45, bx: 0.15, by: 0.15,
  diatones: { on: true, step: 2.0, h: 0.20 },   // full-thickness courses every `step` m
  // materials
  rho: 1900,                                     // kg/m^3 (mass per unit facade width = rho * area)
  mu: 0.75,                                      // block-block Coulomb friction (also residual wall, hinge)
  muG: 0.75,                                     // block-ground Coulomb friction
  e: 0.02,                                       // restitution applied to every contact
  // road
  slopePermille: 0, backstop: true,              // backstop: rigid wall behind the facade inner face
  // initial condition
  theta0: { mode: 'critical', deltaDeg: 0.5 },   // theta0 = atan(t/Hr) + delta, at rest
  hinge: 'frictional',                           // 'frictional' (unilateral Coulomb contact at the toe) | 'pinned'
  rigidPhase: 'analytic',                        // 'analytic' (core) | 'engine' (cross-check)
  // break-up timing: the main assumption of the model (see docs/MODEL.md)
  breakup: { mode: 'impact', fraction: 1.0, gap: 0 }, // 'impact' (default) | 'angleFraction' (theta_b = fraction * theta_impact)
                                                     // | 'none' (unbroken panel: the panel lands and rests as one body);
                                                     // gap [m]: uniform joint gap at break-up (0 = touching)
  // wall section: 'single' (default) | 'twoLeaf' | 'crumble' (both exploratory, planck.js only; core/leaves.js):
  // outer leaf and rubble-core thickness as fractions of t (twoLeaf), grain size [m] (core or crumbled wall);
  // crumble release: 'lattice' (exploratory loose lattice) | 'deposited' (formal definition, core/column.js; both engines);
  // gap [m]: uniform grain gap of the deposited column (0 = touching)
  leaves: { mode: 'single', outer: 0.5, core: 0.25, grain: 0.06, release: 'lattice', gap: 0 },
  // variability (explicit, seeded; all zero = deterministic nominal run)
  variability: { seed: 1, sdThetaDeg: 0, sdBlockRel: 0, sdMuRel: 0 },
  // numerics
  engine: 'planck', dt: null,                    // null -> engine default (ENGINE_DT)
  stop: { checkEvery: 0.05, keRel: 1e-5, vMax: 0.005, hold: 0.5, tCap: 60 },
  airDrag: 0,
});

// fixed time step of each engine (convergence: Appendix A of the paper)
const ENGINE_DT = { planck: 1 / 480, chrono: 2e-3 };

function deepMerge(a, b) {
  const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object') ? deepMerge(a[k], v) : v;
  }
  return out;
}

function resolveParams(user = {}) {
  const P = deepMerge(DEFAULTS, user);
  if (P.mechanism === 'total') P.Hr = P.H;
  if (P.dt == null) P.dt = ENGINE_DT[P.engine];
  const err = [];
  if (!(P.t > 0 && P.t <= 3)) err.push('t must be in (0, 3] m');
  if (!(P.Hr > 0 && P.Hr <= P.H)) err.push('Hr must be in (0, H]');
  if (P.mechanism === 'partial' && !(P.Hr < P.H)) err.push('partial collapse requires Hr < H');
  if (!(P.bx > 0 && P.by > 0)) err.push('block size must be positive');
  if (!(P.mu >= 0 && P.muG >= 0)) err.push('friction must be >= 0');
  if (!(P.e >= 0 && P.e <= 1)) err.push('restitution must be in [0, 1]');
  if (!['impact', 'angleFraction', 'none'].includes(P.breakup.mode)) err.push("breakup.mode must be 'impact', 'angleFraction' or 'none'");
  if (P.breakup.mode === 'angleFraction' && !(P.breakup.fraction > 0 && P.breakup.fraction <= 1)) err.push('breakup.fraction must be in (0, 1]');
  if (!(P.breakup.gap >= 0 && P.breakup.gap <= 0.25 * Math.min(P.bx, P.by))) err.push('breakup.gap must be in [0, min(bx, by)/4] m');
  if (!['single', 'twoLeaf', 'crumble'].includes(P.leaves.mode)) err.push("leaves.mode must be 'single', 'twoLeaf' or 'crumble'");
  if (P.leaves.mode === 'crumble') {
    if (!(P.leaves.grain > 0 && P.leaves.grain <= P.t)) err.push('leaves.grain must be in (0, t]');
    if (!['lattice', 'deposited'].includes(P.leaves.release)) err.push("leaves.release must be 'lattice' or 'deposited'");
    if (P.leaves.release === 'lattice' && P.engine !== 'planck') err.push('the lattice release of crumble is exploratory and implemented for planck.js only');
    if (!(P.leaves.gap >= 0 && P.leaves.gap <= 0.1 * P.leaves.grain)) err.push('leaves.gap must be in [0, grain/10] m');
  }
  if (P.leaves.mode === 'twoLeaf') {
    const L = P.leaves;
    if (!(L.outer > 0 && L.core > 0 && L.outer + L.core < 1)) err.push('leaves: outer, core > 0 and outer + core < 1');
    if (!(L.grain > 0 && L.grain <= L.core * P.t)) err.push('leaves.grain must be in (0, core * t]');
    if (P.engine !== 'planck') err.push('leaves.mode twoLeaf is exploratory and implemented for planck.js only');
  }
  // safety bound only; the step actually used must be justified by a convergence study
  if (!(P.dt > 0 && P.dt <= 1 / 30 + 1e-12)) err.push('dt must be in (0, 1/30] s');
  if (err.length) throw new Error('invalid parameters: ' + err.join('; '));
  return P;
}

module.exports = { DEFAULTS, resolveParams, deepMerge, ENGINE_DT };
