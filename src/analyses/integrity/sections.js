// Internal actions of the falling panel (Sect. 4.1 of the paper). For a section at height s above the toe, the part
// of the panel above it must be accelerated with the rigid motion; the section transmits the force R and the moment M
// that this requires. The accelerations are those of the model's own equations of motion (src/sim/core/rigid_phase.js)
// in the regime in force, at rotations sampled with its `thetaBreak` option, and the sections are at s/H = 0.02 ... 0.98.
'use strict';
const { resolveParams } = require('../../sim/core/params');
const { perturbedParams } = require('../../sim/core/run');
const { rot } = require('../../sim/core/rigid_phase');
const D = require('../defaults');

const G = 9.81;
const SECTIONS = Array.from({ length: 49 }, (_, i) => (i + 1) * 0.02);   // s/H = 0.02 ... 0.98

// friction, density and diatone courses of a wall that gives its own (the default values otherwise)
const materials = (cfg) => {
  const m = Object.fromEntries(['mu', 'muG', 'rho'].filter(k => cfg[k] != null).map(k => [k, cfg[k]]));
  if (cfg.diatoneStep != null) m.diatones = { on: cfg.diatoneStep > 0, step: cfg.diatoneStep > 0 ? cfg.diatoneStep : D.MATERIALS.diatones.step, h: D.MATERIALS.diatones.h };
  return m;
};

// the input of the simulator for a wall in total collapse: seed 0 is the nominal wall (no variability), other seeds
// draw the default variability
function input(cfg, seed) {
  const variability = seed === 0 ? Object.assign({ seed: 1 }, D.NOMINAL) : Object.assign({ seed }, D.VARIABILITY);
  return resolveParams(Object.assign({}, D.MATERIALS, { H: cfg.H, t: cfg.t, mechanism: 'total', bx: cfg.bx, by: cfg.by, variability }, materials(cfg)));
}
const params = (cfg, seed) => perturbedParams(input(cfg, seed)).P;

// internal actions at section s (from the toe, along the panel) for state st with accelerations (ax, ay, alpha)
function actions(pan, st, acc, s) {
  const { t, Hr, m } = pan, phi = st.phi, om = st.omega;
  const mU = m * (Hr - s) / Hr, IU = mU * (t * t + (Hr - s) * (Hr - s)) / 12;
  const rU = rot(phi, [0, s / 2]);                              // G' - G (body: (0, s/2))
  const aU = [acc.ax - acc.alpha * rU[1] - om * om * rU[0], acc.ay + acc.alpha * rU[0] - om * om * rU[1]];
  const R = [mU * aU[0], mU * (aU[1] + G)];                      // force of the lower part on the upper part
  const cg = rot(phi, [0, -(Hr - s) / 2]);                       // C - G'
  const M = IU * acc.alpha - (cg[0] * R[1] - cg[1] * R[0]);       // moment about the section centre C
  const ey = rot(phi, [0, 1]), ex = rot(phi, [1, 0]);
  return { N: R[0] * ey[0] + R[1] * ey[1], V: R[0] * ex[0] + R[1] * ex[1], M };
}

// accelerations of the panel from the model's own equations of motion (rigid_phase.js, deriv), for the regime in force;
// the sign c of the sliding friction is read from the last 'slip' entry of the integration log
function accel(pan, st, regime, log, mu) {
  if (regime === 'FLIGHT' || regime === 'IMPACT') return { ax: 0, ay: -G, alpha: 0, how: 'flight' };
  const V0 = [pan.t / 2, -pan.Hr / 2], rk = rot(st.phi, V0), IG = pan.m * (pan.t * pan.t + pan.Hr * pan.Hr) / 12;
  if (regime === 'STICK') {
    const rx = -rk[0], ry = -rk[1], IP = IG + pan.m * (rx * rx + ry * ry), alpha = -pan.m * G * rx / IP;
    return { ax: -alpha * ry - st.omega * st.omega * rx, ay: alpha * rx - st.omega * st.omega * ry, alpha, how: 'stick' };
  }
  const slips = log.filter(l => l.reason === 'slip');
  if (!slips.length || log[log.length - 1].reason === 'stop') return null;     // undetermined sign: use differences
  const c = mu * Math.sign(slips[slips.length - 1].T_over_N), rx = rk[0], ry = rk[1];
  const N = (G + st.omega * st.omega * ry) / (1 / pan.m + rx * (rx - c * ry) / IG);
  return { ax: c * N / pan.m, ay: N / pan.m - G, alpha: N * (rx - c * ry) / IG, how: 'slide' };
}

// check of actions() (Sect. 4.1): a thin rod (t -> 0) rotating from rest about its base, alpha = 3 g sin(theta) / (2 L),
// omega^2 = 3 g (1 - cos theta) / L; |M(s)| must equal m g sin(theta) s (L - s)^2 / (4 L^2)
function rodUnitTest() {
  const L = 10, t = 1e-6, m = 1000, out = [];
  for (const thDeg of [10, 30, 60]) {
    const th = thDeg * Math.PI / 180, alphaMag = 3 * G * Math.sin(th) / (2 * L), om2 = 3 * G * (1 - Math.cos(th)) / L;
    // model frame: phi = -th (towards +x), pivot at the origin; G at (L/2) (sin th, cos th); omega, alpha negative
    const phi = -th, gx = (L / 2) * Math.sin(th), gy = (L / 2) * Math.cos(th), om = -Math.sqrt(om2), alpha = -alphaMag;
    const ax = -alpha * gy - om2 * gx, ay = alpha * gx - om2 * gy;           // pivot fixed: a_G = alpha x r - omega^2 r
    const pan = { t, Hr: L, m };
    for (const sOverL of [0.25, 1 / 3, 0.5, 0.75]) {
      const sec = sOverL * L, q = actions(pan, { phi, omega: om }, { ax, ay, alpha }, sec);
      const exact = m * G * Math.sin(th) * sec * (L - sec) ** 2 / (4 * L * L);
      out.push({ thDeg, sOverL, M: q.M, exact, relErr: Math.abs(Math.abs(q.M) - exact) / exact });
    }
  }
  return out;
}

module.exports = { input, params, materials, actions, accel, rodUnitTest, SECTIONS };
