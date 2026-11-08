// Rigid overturning phase, solved in the core (engine-independent).
//
// A rigid rectangular panel (thickness t, height Hr, mass m = rho t Hr per unit width) starts at
// rest, rotated towards the street about its outer (street-side) toe by theta0 = atan(t/Hr) + delta
// (centroid just past the toe). Its toe is a unilateral Coulomb contact with the support (the
// foundation for total collapse, the top of the residual wall for partial collapse). Regimes:
//   STICK  rotation about the fixed toe          valid while N >= 0 and |T| <= mu N
//   SLIDE  toe sliding on the support            T = -mu N sign(v_slip), valid while N >= 0
//   FLIGHT no contact (N < 0, or the toe slid off the edge of the residual wall)
// With hinge = 'pinned' the toe is an ideal bilateral hinge (STICK only), as in kinematic analysis.
// The phase ends at the first impact: any other panel vertex reaching the ground (or a sloping road),
// or the panel touching the residual wall. Integration: RK4, h = 1e-4 s, events by bisection.
//
// State: centroid (x, y), angle phi (counter-clockwise; phi < 0 = rotation towards the street),
// velocities (vx, vy, omega). Units SI.
'use strict';

const G0 = 9.81;

function makePanel(P, geom) {
  const t = P.t, Hr = P.Hr, m = P.rho * t * Hr, IG = m * (t * t + Hr * Hr) / 12;
  // vertices relative to the centroid, body frame (unrotated): 0 toe (street-bottom), 1 street-top,
  // 2 inner-top, 3 inner-bottom
  const V = [[t / 2, -Hr / 2], [t / 2, Hr / 2], [-t / 2, Hr / 2], [-t / 2, -Hr / 2]];
  return { t, Hr, m, IG, V, pivot: geom.pivot };
}

const rot = (phi, [a, b]) => [a * Math.cos(phi) - b * Math.sin(phi), a * Math.sin(phi) + b * Math.cos(phi)];

function vertices(pan, s) { return pan.V.map(v => { const r = rot(s.phi, v); return [s.x + r[0], s.y + r[1]]; }); }

function initialState(P, pan, theta0, omega0) {
  const phi = -theta0, r = rot(phi, [-pan.V[0][0], -pan.V[0][1]]);   // G - toe
  const s = { x: pan.pivot.x + r[0], y: pan.pivot.y + r[1], phi, vx: 0, vy: 0, omega: 0 };
  // opts.omega0 (default 0): initial angular velocity towards the street [rad/s], about the toe
  if (omega0) { s.omega = -omega0; s.vx = -s.omega * r[1]; s.vy = s.omega * r[0]; }
  return s;
}

// ground surface: y = 0 for x <= 0, road descending with the slope for x > 0 (positive slope)
const groundY = (geom, x) => (x > 0 ? -x * Math.tan(geom.slope) : 0);

// ----- dynamics of the three regimes; return derivative and contact forces -----
function deriv(pan, s, regime, ctx, g) {
  const m = pan.m;
  if (regime === 'FLIGHT') return { d: [s.vx, s.vy, s.omega, 0, -g, 0], N: 0, T: 0 };
  const rk = rot(s.phi, pan.V[ctx.k]);                  // contact point relative to G
  if (regime === 'STICK') {
    const rx = -rk[0], ry = -rk[1];                       // G - P
    const IP = pan.IG + m * (rx * rx + ry * ry);
    const alpha = -m * g * rx / IP;
    const ax = -alpha * ry - s.omega * s.omega * rx, ay = alpha * rx - s.omega * s.omega * ry;
    // G velocity from the rigid motion about the fixed point P
    const vx = -s.omega * ry, vy = s.omega * rx;
    return { d: [vx, vy, s.omega, ax, ay, alpha], N: m * (ay + g), T: m * ax };
  }
  // SLIDE: contact point P = G + r on a horizontal support; T = c N
  const rx = rk[0], ry = rk[1], c = ctx.c;
  const N = (g + s.omega * s.omega * ry) / (1 / m + rx * (rx - c * ry) / pan.IG);
  const alpha = N * (rx - c * ry) / pan.IG;
  return { d: [s.vx, s.vy, s.omega, c * N / m, N / m - g, alpha], N, T: c * N };
}

function rk4(pan, s, regime, ctx, h, g) {
  const keys = ['x', 'y', 'phi', 'vx', 'vy', 'omega'];
  const add = (a, d, f) => { const o = {}; keys.forEach((k, i) => { o[k] = a[k] + f * d[i]; }); return o; };
  const k1 = deriv(pan, s, regime, ctx, g).d, k2 = deriv(pan, add(s, k1, h / 2), regime, ctx, g).d;
  const k3 = deriv(pan, add(s, k2, h / 2), regime, ctx, g).d, k4 = deriv(pan, add(s, k3, h), regime, ctx, g).d;
  const o = {}; keys.forEach((k, i) => { o[k] = s[k] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]); });
  return o;
}

function contactPoint(pan, s, k) { const r = rot(s.phi, pan.V[k]); return [s.x + r[0], s.y + r[1]]; }
function contactVel(pan, s, k) { const r = rot(s.phi, pan.V[k]); return [s.vx - s.omega * r[1], s.vy + s.omega * r[0]]; }

// enforce the contact constraint after a step (removes the RK drift of the sliding constraint)
function project(pan, s, regime, ctx, ySupport) {
  if (regime !== 'SLIDE' && regime !== 'STICK') return s;
  const p = contactPoint(pan, s, ctx.k);
  const out = Object.assign({}, s);
  if (regime === 'STICK') { out.x += ctx.P[0] - p[0]; out.y += ctx.P[1] - p[1]; }
  else out.y += ySupport - p[1];
  const v = contactVel(pan, out, ctx.k);
  if (regime === 'STICK') { out.vx -= v[0]; out.vy -= v[1]; } else out.vy -= v[1];
  return out;
}

// signed penetration measures (negative = penetration) for impact detection, excluding vertex `skip`
function clearance(pan, geom, s, skip) {
  const X = vertices(pan, s);
  let minC = Infinity, what = null, vertex = null;
  X.forEach((p, i) => {
    if (i === skip) return;
    const cg = p[1] - groundY(geom, p[0]);
    if (cg < minC) { minC = cg; what = 'ground'; vertex = i; }
    const rw = geom.residualWall;
    if (rw && p[0] > rw.x0 && p[0] < rw.x1) {
      const crw = p[1] - rw.y1;                           // above the residual wall top
      if (crw < minC && p[1] > rw.y1 - 0.5 * (rw.y1 - rw.y0)) { minC = crw; what = 'residualWall'; vertex = i; }
    }
  });
  // residual wall street-top corner entering the panel (panel swinging down in front of the wall)
  const rw = geom.residualWall;
  if (rw && skip !== 0) {
    const q = [rw.x1, rw.y1], loc = rot(-s.phi, [q[0] - s.x, q[1] - s.y]);
    const dIn = Math.min(pan.t / 2 - Math.abs(loc[0]), pan.Hr / 2 - Math.abs(loc[1]));
    if (dIn > 1e-9 && -dIn < minC) { minC = -dIn; what = 'residualWallCorner'; vertex = -1; }
  }
  return { c: minC, what, vertex };
}

function energy(pan, s, g) {
  return 0.5 * pan.m * (s.vx * s.vx + s.vy * s.vy) + 0.5 * pan.IG * s.omega * s.omega + pan.m * g * s.y;
}

function solveRigidPhase(P, geom, opts = {}) {
  const g = opts.g || G0, h = opts.h || 1e-4, tMax = opts.tMax || 30;
  const pan = makePanel(P, geom);
  const thetaLim = Math.atan(P.t / P.Hr);
  const theta0 = opts.theta0 != null ? opts.theta0 : thetaLim + (P.theta0.deltaDeg * Math.PI / 180);
  const muHinge = P.mu;
  const pinned = P.hinge === 'pinned';
  let s = initialState(P, pan, theta0, opts.omega0);
  let regime = 'STICK';
  const ctx = { k: 0, P: contactPoint(pan, s, 0), c: 0 };
  const ySupport = geom.pivot.y;
  const log = [{ t: 0, regime, reason: 'start', theta_deg: theta0 * 180 / Math.PI }];
  const E0 = energy(pan, s, g);
  let Eseg = E0;                                            // energy at the start of the current regime
  let tNow = 0, maxDrift = 0, minNoverW = Infinity, maxTNratio = 0;
  // opts.slideEnergy (default off): energy balance of the SLIDE regime, with the friction work by the
  // trapezoidal rule over each step; the residual |(E - E_seg) - W_f| / (m g H_r / 2) is reported, nothing else changes
  const slideE = !!opts.slideEnergy, Escale = Math.abs(pan.m * g * pan.Hr / 2);
  let Wf = 0, slideRes = 0;
  const fPow = (st) => deriv(pan, st, 'SLIDE', ctx, g).T * contactVel(pan, st, ctx.k)[0];

  // event function value for the current regime (sign change => event)
  const events = (st) => {
    const ev = {};
    const cl = clearance(pan, geom, st, regime === 'FLIGHT' ? null : ctx.k);
    ev.impact = cl.c + 1e-7;                                // 0.1 micron tolerance (lift-off instant)
    if (opts.thetaBreak != null) ev.breakupAngle = opts.thetaBreak - (-st.phi);   // < 0 => rotation reached thetaBreak
    if (regime !== 'FLIGHT' && !pinned) {
      const f = deriv(pan, st, regime, ctx, g);
      ev.lift = f.N;                                        // < 0 => lift-off
      if (regime === 'STICK') ev.slip = muHinge * f.N - Math.abs(f.T);   // < 0 => slip
      if (regime === 'SLIDE') {
        ev.stop = contactVel(pan, st, ctx.k)[0] * ctx.slipSign;          // < 0 => slip velocity reverses
        const px = contactPoint(pan, st, ctx.k)[0];
        if (geom.residualWall) ev.edge = Math.min(px - geom.residualWall.x0, geom.residualWall.x1 - px);  // < 0 => off the wall
      }
    }
    return { ev, cl };
  };

  let cur = events(s);
  for (let iter = 0; tNow < tMax; iter++) {
    let s1 = project(pan, rk4(pan, s, regime, ctx, h, g), regime, ctx, ySupport);
    let nxt = events(s1);
    const fired = Object.keys(nxt.ev).filter(k => cur.ev[k] >= 0 && nxt.ev[k] < 0);
    if (!fired.length) {
      if (slideE && regime === 'SLIDE') { Wf += h * (fPow(s) + fPow(s1)) / 2; slideRes = Math.max(slideRes, Math.abs(energy(pan, s1, g) - Eseg - Wf) / Escale); }
      s = s1; tNow += h; cur = nxt;
      if (regime !== 'SLIDE') maxDrift = Math.max(maxDrift, Math.abs(energy(pan, s, g) - Eseg) / Math.abs(pan.m * g * pan.Hr / 2));
      if (regime !== 'FLIGHT') { const f = deriv(pan, s, regime, ctx, g); minNoverW = Math.min(minNoverW, f.N / (pan.m * g)); if (f.N > 0) maxTNratio = Math.max(maxTNratio, Math.abs(f.T) / f.N); }
      continue;
    }
    // bisection for the earliest event in (0, h]
    let lo = 0, hi = h, which = fired[0];
    for (let b = 0; b < 40; b++) {
      const mid = (lo + hi) / 2, sm = project(pan, rk4(pan, s, regime, ctx, mid, g), regime, ctx, ySupport), em = events(sm).ev;
      const f2 = Object.keys(em).filter(k => cur.ev[k] >= 0 && em[k] < 0);
      if (f2.length) { hi = mid; which = f2[0]; } else lo = mid;
    }
    if (slideE && regime === 'SLIDE') {
      const se = project(pan, rk4(pan, s, regime, ctx, hi, g), regime, ctx, ySupport);
      Wf += hi * (fPow(s) + fPow(se)) / 2; slideRes = Math.max(slideRes, Math.abs(energy(pan, se, g) - Eseg - Wf) / Escale);
    }
    s = project(pan, rk4(pan, s, regime, ctx, hi, g), regime, ctx, ySupport); tNow += hi;
    const f = regime !== 'FLIGHT' ? deriv(pan, s, regime, ctx, g) : { N: 0, T: 0 };
    if (which === 'impact' || which === 'breakupAngle') {
      const cl = clearance(pan, geom, s, regime === 'FLIGHT' ? null : ctx.k);
      const isImpact = which === 'impact';
      log.push({ t: tNow, regime: isImpact ? 'IMPACT' : 'BREAKUP', reason: isImpact ? cl.what : 'breakupAngle', vertex: cl.vertex, theta_deg: -s.phi * 180 / Math.PI });
      const KE = energy(pan, s, g) - pan.m * g * s.y;
      return { ok: true, end: isImpact ? 'impact' : 'breakupAngle', tImpact: tNow, state: s, theta_deg: -s.phi * 180 / Math.PI,
               impactWith: isImpact ? cl.what : null, impactVertex: isImpact ? cl.vertex : null, regimeAtEnd: regime,
               log, panel: { t: pan.t, Hr: pan.Hr, m: pan.m, IG: pan.IG }, thetaLim_deg: thetaLim * 180 / Math.PI, theta0_deg: theta0 * 180 / Math.PI,
               energy: { E0, Eimpact: energy(pan, s, g), KEimpact: KE, KEtranslational: 0.5 * pan.m * (s.vx * s.vx + s.vy * s.vy),
                         KErotational: 0.5 * pan.IG * s.omega * s.omega, PEreleased: E0 - pan.m * g * s.y, maxConservativeDrift: maxDrift,
                         ...(slideE ? { slideResidualMax: slideRes } : {}) },
               toe: { minNoverWeight: minNoverW, maxTNratio, mu: muHinge, pinned } };
    }
    if (which === 'lift' || which === 'edge') { regime = 'FLIGHT'; }
    else if (which === 'slip') {
      regime = 'SLIDE'; ctx.c = muHinge * Math.sign(f.T); ctx.slipSign = -Math.sign(f.T);
    } else if (which === 'stop') {
      const sp = deriv(pan, s, 'STICK', ctx, g);
      if (Math.abs(sp.T) <= muHinge * sp.N) { regime = 'STICK'; ctx.P = contactPoint(pan, s, ctx.k); }
      else { ctx.c = muHinge * Math.sign(sp.T); ctx.slipSign = -Math.sign(sp.T); }
    }
    log.push({ t: tNow, regime, reason: which, theta_deg: -s.phi * 180 / Math.PI, N_over_W: f.N / (pan.m * g), T_over_N: f.N ? f.T / f.N : null });
    Eseg = energy(pan, s, g); Wf = 0;
    cur = events(s);
  }
  return { ok: false, reason: 'tMax reached', log };
}

// Rigid phase with the break-up timing of the model (P.breakup):
//   mode 'impact'        (default) break-up at the first impact of the rigid panel
//   mode 'angleFraction' break-up when the rotation reaches max(theta0, fraction * theta_impact), where
//                        theta_impact is the rotation at impact of the uninterrupted rigid panel
// The break-up timing is the main assumption of the model (docs/MODEL.md).
function solveRigidPhaseWithBreakup(P, geom, opts = {}) {
  const bu = P.breakup || { mode: 'impact' };
  const full = solveRigidPhase(P, geom, opts);
  if (!full.ok || bu.mode === 'impact' || bu.mode === 'none' || bu.fraction >= 1) return Object.assign(full, { breakup: { mode: bu.mode === 'none' ? 'none' : 'impact', thetaBreak_deg: full.theta_deg, thetaImpactRigid_deg: full.theta_deg, tImpactRigid: full.tImpact } });
  if (bu.mode !== 'angleFraction') throw new Error('unknown breakup mode ' + bu.mode);
  const thetaBreak = Math.max(full.theta0_deg, bu.fraction * full.theta_deg) * Math.PI / 180;
  const r = solveRigidPhase(P, geom, Object.assign({}, opts, { thetaBreak }));
  return Object.assign(r, { breakup: { mode: 'angleFraction', fraction: bu.fraction, thetaBreak_deg: thetaBreak * 180 / Math.PI,
                                       thetaImpactRigid_deg: full.theta_deg, tImpactRigid: full.tImpact, KEimpactRigid: full.energy.KEimpact } });
}

module.exports = { solveRigidPhase, solveRigidPhaseWithBreakup, makePanel, vertices, rot, groundY, G0 };
