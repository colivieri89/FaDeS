// The panel after its first hinge (Sect. 4.3 of the paper). At the hinge (the section and the rotation at which the
// no-tension criterion is first reached, refined by bisection) the panel becomes two rigid blocks: B1, below the hinge,
// rocking on the toe with the contact rules of the model, and B2, above it, on an ideal pin at the hinge corner that
// carries no tension and no more friction than mu N. Newton-Euler equations with the active contacts as Lagrange
// multipliers; RK4, h = 1e-4 s, events by bisection and projection after each step, as in rigid_phase.js. The motion
// stops at the first ground contact, at a new hinge in either block (or in B2 only, critMode 'B2only'), if the joint
// slides or closes, or if the blocks touch again. The model itself is not changed.
'use strict';
const { wallGeometry, blockLayout } = require('../../sim/core/geometry');
const { solveRigidPhase, rot, groundY } = require('../../sim/core/rigid_phase');
const { measures } = require('../../sim/core/measures');
const { resolveParams } = require('../../sim/core/params');
const { perturbedParams } = require('../../sim/core/run');
const C = require('../campaigns');
const SEC = require('./sections');

const G = 9.81, H_STEP = 1e-4, T_MAX = 30;
const FT = { '0': 0, '0.04MPa': 0.04e6, '0.10MPa': 0.10e6 };

// ------------------------------------------------------------------ bodies and kinematics
function makeBody(t, h, rho) { const m = rho * t * h; return { t, h, m, I: m * (t * t + h * h) / 12, V: [[t / 2, -h / 2], [t / 2, h / 2], [-t / 2, h / 2], [-t / 2, -h / 2]] }; }
const pt = (s, a) => { const r = rot(s.phi, a); return { r, p: [s.x + r[0], s.y + r[1]], v: [s.vx - s.omega * r[1], s.vy + s.omega * r[0]] }; };
const copyS = (S) => S.map(s => Object.assign({}, s));

// sys = { bodies, toe: { body, k, mode: STICK|SLIDE|OFF, P, c, slipSign }, pin: { i, ai, j, aj, mode: PIN|OFF, side } | null,
//         geom, mu, ft, crit: bool, panel: { t, Hr, m }, sF }
function rowsOf(sys, S) {
  const nb = sys.bodies.length, rows = [], z = () => new Float64Array(3 * nb);
  const toe = sys.toe;
  if (toe && toe.mode !== 'OFF') {
    const b = toe.body, s = S[b], r = rot(s.phi, sys.bodies[b].V[toe.k]), w2 = s.omega * s.omega;
    const Jx = z(), Jy = z();
    Jx[3 * b] = 1; Jx[3 * b + 2] = -r[1]; Jy[3 * b + 1] = 1; Jy[3 * b + 2] = r[0];
    if (toe.mode === 'STICK') rows.push({ J: Jx, D: Jx, rhs: w2 * r[0], tag: 'toeX' }, { J: Jy, D: Jy, rhs: w2 * r[1], tag: 'toeY' });
    else rows.push({ J: Jy, D: Jy.map((v, i) => v + toe.c * Jx[i]), rhs: w2 * r[1], tag: 'toeN' });
  }
  const pin = sys.pin;
  if (pin && pin.mode === 'PIN') {
    const si = S[pin.i], sj = S[pin.j], ri = rot(si.phi, pin.ai), rj = rot(sj.phi, pin.aj);
    const wi2 = si.omega * si.omega, wj2 = sj.omega * sj.omega, Jx = z(), Jy = z();
    Jx[3 * pin.i] = 1; Jx[3 * pin.i + 2] = -ri[1]; Jx[3 * pin.j] = -1; Jx[3 * pin.j + 2] = rj[1];
    Jy[3 * pin.i + 1] = 1; Jy[3 * pin.i + 2] = ri[0]; Jy[3 * pin.j + 1] = -1; Jy[3 * pin.j + 2] = -rj[0];
    rows.push({ J: Jx, D: Jx, rhs: wi2 * ri[0] - wj2 * rj[0], tag: 'pinX' }, { J: Jy, D: Jy, rhs: wi2 * ri[1] - wj2 * rj[1], tag: 'pinY' });
  }
  return rows;
}

function gaussSolve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

// accelerations and contact forces
function solveAcc(sys, S, g = G) {
  const nb = sys.bodies.length, Minv = new Float64Array(3 * nb), F = new Float64Array(3 * nb);
  sys.bodies.forEach((b, i) => { Minv[3 * i] = Minv[3 * i + 1] = 1 / b.m; Minv[3 * i + 2] = 1 / b.I; F[3 * i + 1] = -b.m * g; });
  const rows = rowsOf(sys, S), n = rows.length;
  let lam = [];
  if (n) {
    const A = rows.map(rr => rows.map(rq => { let s = 0; for (let k = 0; k < 3 * nb; k++) s += rr.J[k] * Minv[k] * rq.D[k]; return s; }));
    const bb = rows.map(rr => { let s = rr.rhs; for (let k = 0; k < 3 * nb; k++) s -= rr.J[k] * Minv[k] * F[k]; return s; });
    lam = gaussSolve(A, bb);
  }
  const a = new Float64Array(3 * nb);
  for (let k = 0; k < 3 * nb; k++) { let s = F[k]; rows.forEach((r, q) => { s += r.D[k] * lam[q]; }); a[k] = Minv[k] * s; }
  const L = Object.fromEntries(rows.map((r, q) => [r.tag, lam[q]]));
  const out = { a, acc: sys.bodies.map((_, i) => ({ ax: a[3 * i], ay: a[3 * i + 1], alpha: a[3 * i + 2] })) };
  if (sys.toe && sys.toe.mode === 'STICK') { out.Ntoe = L.toeY; out.Ttoe = L.toeX; }
  if (sys.toe && sys.toe.mode === 'SLIDE') { out.Ntoe = L.toeN; out.Ttoe = sys.toe.c * L.toeN; }
  if (sys.pin && sys.pin.mode === 'PIN') {
    const F2 = [-L.pinX, -L.pinY], s1 = S[sys.pin.i], ey = rot(s1.phi, [0, 1]), ex = rot(s1.phi, [1, 0]);
    out.Nh = F2[0] * ey[0] + F2[1] * ey[1]; out.Th = F2[0] * ex[0] + F2[1] * ex[1];
  }
  return out;
}

function deriv(sys, S, g) {
  const f = solveAcc(sys, S, g);
  return { d: S.map((s, i) => [s.vx, s.vy, s.omega, f.acc[i].ax, f.acc[i].ay, f.acc[i].alpha]), f };
}
const KEYS = ['x', 'y', 'phi', 'vx', 'vy', 'omega'];
const addS = (S, D, h) => S.map((s, i) => { const o = {}; KEYS.forEach((k, j) => { o[k] = s[k] + h * D[i][j]; }); return o; });
function rk4(sys, S, h, g) {
  const k1 = deriv(sys, S, g).d, k2 = deriv(sys, addS(S, k1, h / 2), g).d, k3 = deriv(sys, addS(S, k2, h / 2), g).d, k4 = deriv(sys, addS(S, k3, h), g).d;
  return S.map((s, i) => { const o = {}; KEYS.forEach((k, j) => { o[k] = s[k] + h / 6 * (k1[i][j] + 2 * k2[i][j] + 2 * k3[i][j] + k4[i][j]); }); return o; });
}

// constraint projection after a step (positions and velocities), toe first, then the pin (moves B2 only)
function project(sys, S) {
  const out = copyS(S), toe = sys.toe;
  if (toe && toe.mode !== 'OFF') {
    const b = toe.body, q = pt(out[b], sys.bodies[b].V[toe.k]);
    if (toe.mode === 'STICK') { out[b].x += toe.P[0] - q.p[0]; out[b].y += toe.P[1] - q.p[1]; }
    else out[b].y += sys.ySupport - q.p[1];
    const v = pt(out[b], sys.bodies[b].V[toe.k]).v;
    if (toe.mode === 'STICK') { out[b].vx -= v[0]; out[b].vy -= v[1]; } else out[b].vy -= v[1];
  }
  const pin = sys.pin;
  if (pin && pin.mode === 'PIN') {
    const qi = pt(out[pin.i], pin.ai), qj = pt(out[pin.j], pin.aj);
    out[pin.j].x += qi.p[0] - qj.p[0]; out[pin.j].y += qi.p[1] - qj.p[1];
    const vi = pt(out[pin.i], pin.ai).v, vj = pt(out[pin.j], pin.aj).v;
    out[pin.j].vx += vi[0] - vj[0]; out[pin.j].vy += vi[1] - vj[1];
  }
  return out;
}

const energy = (sys, S, g = G) => S.reduce((e, s, i) => { const b = sys.bodies[i]; return e + 0.5 * b.m * (s.vx * s.vx + s.vy * s.vy) + 0.5 * b.I * s.omega * s.omega + b.m * g * s.y; }, 0);

// ------------------------------------------------------------------ internal actions and the capacity criterion
// part of body b above the section at s (from its bottom face): mass, inertia, centroid and its acceleration (+ g y)
function piece(b, s, acc, sec) {
  const m = b.m * (b.h - sec) / b.h, I = m * (b.t * b.t + (b.h - sec) * (b.h - sec)) / 12;
  const r = rot(s.phi, [0, sec / 2]), w2 = s.omega * s.omega;
  return { m, I, G: [s.x + r[0], s.y + r[1]], a: [acc.ax - acc.alpha * r[1] - w2 * r[0], acc.ay + acc.alpha * r[0] - w2 * r[1]], alpha: acc.alpha };
}
// force R and moment M (about the section centre C) of the material below on the subsystem above; N along the body axis
function sectionActions(pieces, C, phi) {
  let Rx = 0, Ry = 0, M = 0;
  for (const q of pieces) {
    const fx = q.m * q.a[0], fy = q.m * (q.a[1] + G);
    Rx += fx; Ry += fy; M += q.I * q.alpha + ((q.G[0] - C[0]) * fy - (q.G[1] - C[1]) * fx);
  }
  const ey = rot(phi, [0, 1]), ex = rot(phi, [1, 0]);
  return { N: Rx * ey[0] + Ry * ey[1], V: Rx * ex[0] + Ry * ex[1], M };
}
// form of the tensile criterion of the post hoc variants: 'elastic' (elastic cracking limit) or 'plastic' (rigid-plastic
// section, |M| <= (N + f_t t) t/2); set by analyse()
let FORM = 'elastic';
// options passed to every call of the rigid phase (none by default)
let RIGID = {};
function margin(q, t, ft, W) {                                  // >= 0: the section holds
  if (!ft) return (q.N * t / 2 - Math.abs(q.M)) / (W * t);
  const cap = FORM === 'plastic' ? (q.N + ft * t) * t / 2 : Math.max(q.N * t / 2, q.N * t / 6 + ft * t * t / 6);
  return Math.min((q.N + ft * t) / W, (cap - Math.abs(q.M)) / (W * t));
}
// sections of the panel grid (every 0.02 Hr) strictly inside B1 and B2; returns the worst of each block
function criteria(sys, S, f) {
  const { t, Hr, m } = sys.panel, W = m * G, b1 = sys.bodies[0], b2 = sys.bodies[1], sF = sys.sF;
  let w1 = { g: Infinity }, w2 = { g: Infinity };
  for (const sh of SEC.SECTIONS) {
    const s = sh * Hr;
    if (s > sF + 1e-9) {
      const sec = s - sF, q = piece(b2, S[1], f.acc[1], sec);
      const C = (() => { const r = rot(S[1].phi, [0, -b2.h / 2 + sec]); return [S[1].x + r[0], S[1].y + r[1]]; })();
      const A = sectionActions([q], C, S[1].phi), gg = margin(A, t, sys.ft, W);
      if (gg < w2.g) w2 = { g: gg, s_over_H: sh, s_over_hB2: sec / b2.h, N: A.N, M: A.M };
    } else if (s < sF - 1e-9) {
      const parts = [piece(b1, S[0], f.acc[0], s)];
      if (sys.pin.mode === 'PIN') parts.push({ m: b2.m, I: b2.I, G: [S[1].x, S[1].y], a: [f.acc[1].ax, f.acc[1].ay], alpha: f.acc[1].alpha });
      const C = (() => { const r = rot(S[0].phi, [0, -b1.h / 2 + s]); return [S[0].x + r[0], S[0].y + r[1]]; })();
      const A = sectionActions(parts, C, S[0].phi), gg = margin(A, t, sys.ft, W);
      if (gg < w1.g) w1 = { g: gg, s_over_H: sh, N: A.N, M: A.M };
    }
  }
  return { b1: w1, b2: w2 };
}

// ------------------------------------------------------------------ events
function clearance(sys, S) {
  let c = Infinity, who = null;
  S.forEach((s, i) => sys.bodies[i].V.forEach((v, k) => {
    if (sys.toe && sys.toe.mode !== 'OFF' && sys.toe.body === i && sys.toe.k === k) return;
    const p = pt(s, v).p, d = p[1] - groundY(sys.geom, p[0]);
    if (d < c) { c = d; who = { body: i, vertex: k }; }
  }));
  return { c, who };
}
function jointGap(sys, S) {                                      // open face: B2's far bottom corner above B1's top face
  const pin = sys.pin, s1 = S[pin.i], s2 = S[pin.j], b2 = sys.bodies[pin.j];
  const far = pt(s2, [-pin.side * b2.t / 2, -b2.h / 2]).p, hc = pt(s1, pin.ai).p, ey = rot(s1.phi, [0, 1]);
  return (far[0] - hc[0]) * ey[0] + (far[1] - hc[1]) * ey[1];
}
function penetration(sys, S) {                                   // deepest vertex of one block inside the other
  let d = -Infinity;
  for (const [i, j] of [[0, 1], [1, 0]]) {
    const bj = sys.bodies[j];
    for (const v of sys.bodies[i].V) {
      const p = pt(S[i], v).p, loc = rot(-S[j].phi, [p[0] - S[j].x, p[1] - S[j].y]);
      d = Math.max(d, Math.min(bj.t / 2 - Math.abs(loc[0]), bj.h / 2 - Math.abs(loc[1])));
    }
  }
  return d;
}
function events(sys, S) {
  const f = solveAcc(sys, S), ev = {};
  const cl = clearance(sys, S);
  if (!sys.noGround) ev.impact = cl.c + 1e-7;
  const toe = sys.toe;
  if (toe && toe.mode !== 'OFF') {
    ev.lift = f.Ntoe;
    if (toe.mode === 'STICK') ev.slip = sys.mu * f.Ntoe - Math.abs(f.Ttoe);
    else ev.stop = pt(S[toe.body], sys.bodies[toe.body].V[toe.k]).v[0] * toe.slipSign;
  }
  let cr = null;
  if (sys.pin) {
    if (sys.pin.mode === 'PIN') { ev.hsep = f.Nh; ev.hslip = sys.mu * f.Nh - Math.abs(f.Th); ev.closure = jointGap(sys, S) + 1e-9; }
    else ev.recontact = -penetration(sys, S) + 1e-7;
    if (sys.crit) { cr = criteria(sys, S, f); ev.hingeB2 = cr.b2.g; if (sys.critMode !== 'B2only') ev.hingeB1 = cr.b1.g; }
  }
  return { ev, f, cl, cr };
}
const STOPS = { impact: 'groundContact', hingeB2: 'secondHingeB2', hingeB1: 'hingeB1', hslip: 'jointSliding', closure: 'jointClosure', recontact: 'blockRecontact' };

// ------------------------------------------------------------------ integration
function integrate(sys, S0, { h = H_STEP, tMax = T_MAX, g = G, sample = 0 } = {}) {
  let S = project(sys, S0), tNow = 0;
  const log = [{ t: 0, reason: 'start', toe: sys.toe && sys.toe.mode, pin: sys.pin && sys.pin.mode }];
  let Eseg = energy(sys, S, g), maxDrift = 0;
  const Escale = sys.panel.m * g * sys.panel.Hr / 2;
  const trace = [];
  let cur = events(sys, S);
  // contact modes consistent at the start (the hinge changes the toe and joint forces discontinuously)
  for (let k = 0; k < 4; k++) {
    const e = cur.ev, toe = sys.toe, f = cur.f;
    let sw = null;
    if (toe && toe.mode !== 'OFF' && e.lift < 0) { toe.mode = 'OFF'; sw = 'lift'; }
    else if (toe && toe.mode === 'STICK' && e.slip < 0) { toe.mode = 'SLIDE'; toe.c = sys.mu * Math.sign(f.Ttoe); toe.slipSign = -Math.sign(f.Ttoe); sw = 'slip'; }
    else if (sys.pin && sys.pin.mode === 'PIN' && e.hsep < 0) { sys.pin.mode = 'OFF'; sw = 'hsep'; }
    if (!sw) break;
    log.push({ t: 0, reason: sw + '@start', toe: toe && toe.mode, pin: sys.pin && sys.pin.mode });
    S = project(sys, S); cur = events(sys, S);
  }
  const atOnset = Object.keys(STOPS).filter(k => k !== 'impact' && cur.ev[k] != null && cur.ev[k] < 0);
  if (atOnset.length) return { end: STOPS[atOnset[0]], atOnset: true, t: 0, S, log, cr: cur.cr, f: cur.f, maxDrift };
  for (let iter = 0; tNow < tMax; iter++) {
    let S1 = project(sys, rk4(sys, S, h, g)), nxt = events(sys, S1);
    const fired = Object.keys(nxt.ev).filter(k => cur.ev[k] >= 0 && nxt.ev[k] < 0);
    if (!fired.length) {
      S = S1; tNow += h; cur = nxt;
      if (sys.critMode === 'B2only' && !sys.firstB1 && cur.cr && cur.cr.b1.g < 0) sys.firstB1 = { t: tNow, theta: S.map(s => -s.phi * 180 / Math.PI), s_over_H: cur.cr.b1.s_over_H };
      const sliding = sys.toe && sys.toe.mode === 'SLIDE';
      if (!sliding) maxDrift = Math.max(maxDrift, Math.abs(energy(sys, S, g) - Eseg) / Escale);
      if (sample && iter % sample === 0) trace.push({ t: +tNow.toFixed(4), th: S.map(s => +(-s.phi * 180 / Math.PI).toFixed(3)) });
      continue;
    }
    let lo = 0, hi = h, which = fired[0];
    for (let b = 0; b < 40; b++) {
      const mid = (lo + hi) / 2, em = events(sys, project(sys, rk4(sys, S, mid, g))).ev;
      const f2 = Object.keys(em).filter(k => cur.ev[k] >= 0 && em[k] < 0);
      if (f2.length) { hi = mid; which = f2[0]; } else lo = mid;
    }
    S = project(sys, rk4(sys, S, hi, g)); tNow += hi;
    const now = events(sys, S);
    const theta = S.map(s => -s.phi * 180 / Math.PI);
    if (STOPS[which]) {
      log.push({ t: tNow, reason: which, theta });
      return { end: STOPS[which], t: tNow, S, log, cr: now.cr, f: now.f, cl: now.cl, maxDrift, trace };
    }
    const toe = sys.toe, f = now.f;
    if (which === 'lift') toe.mode = 'OFF';
    else if (which === 'slip') { toe.mode = 'SLIDE'; toe.c = sys.mu * Math.sign(f.Ttoe); toe.slipSign = -Math.sign(f.Ttoe); }
    else if (which === 'stop') {
      const save = Object.assign({}, toe); toe.mode = 'STICK'; toe.P = pt(S[toe.body], sys.bodies[toe.body].V[toe.k]).p;
      const sp = solveAcc(sys, S);
      if (!(Math.abs(sp.Ttoe) <= sys.mu * sp.Ntoe)) { Object.assign(toe, save); toe.c = sys.mu * Math.sign(sp.Ttoe); toe.slipSign = -Math.sign(sp.Ttoe); }
    } else if (which === 'hsep') sys.pin.mode = 'OFF';
    log.push({ t: tNow, reason: which, theta, toe: toe && toe.mode, pin: sys.pin && sys.pin.mode, N_over_W: f.Ntoe != null ? f.Ntoe / (sys.panel.m * g) : null, T_over_N: f.Ntoe ? f.Ttoe / f.Ntoe : null });
    Eseg = energy(sys, S, g);
    cur = events(sys, S);
  }
  return { end: 'tMax', t: tNow, S, log, maxDrift, trace };
}

// ------------------------------------------------------------------ set-up from the model's parameters
function setup(cfg, seed) {
  const variability = seed === 0 ? { seed: 1, sdThetaDeg: 0, sdMuRel: 0, sdBlockRel: 0 } : Object.assign({ seed }, C.VARIABILITY);
  const P0 = resolveParams(C.runParams(C.geometryParams('T', cfg.H, cfg.t), { bx: cfg.bx, by: cfg.by }, seed || 1, Object.assign({ variability }, SEC.materials(cfg))));
  const { P, rng } = perturbedParams(P0);
  return { P, rng, geom: wallGeometry(P) };
}
// the model's rigid panel as a one-body system (limit case of a hinge at the toe: V1)
function rigidSystem(P, geom) {
  const b = makeBody(P.t, P.Hr, P.rho), th0 = Math.atan(P.t / P.Hr) + P.theta0.deltaDeg * Math.PI / 180;
  const phi = -th0, r = rot(phi, [-b.V[0][0], -b.V[0][1]]);
  const S = [{ x: geom.pivot.x + r[0], y: geom.pivot.y + r[1], phi, vx: 0, vy: 0, omega: 0 }];
  const sys = { bodies: [b], toe: { body: 0, k: 0, mode: 'STICK', P: [geom.pivot.x, geom.pivot.y] }, pin: null, geom, mu: P.mu, ySupport: geom.pivot.y, panel: { t: P.t, Hr: P.Hr, m: b.m } };
  return { sys, S, theta0_deg: th0 * 180 / Math.PI };
}

// criterion at section s of the intact panel, from the model's rigid state at rotation a (deg) and its exact accelerations
// toe contact of a body whose toe vertex 0 is at the panel toe, in the regime of the model's rigid state r;
// in SLIDE the friction opposes the slip velocity (c = -mu sign(v_slip), as rigid_phase.js: c = mu sign(T), slip = -sign(T))
function toeFromRigid(P, r, body, s) {
  const mode = r.regimeAtEnd === 'SLIDE' ? 'SLIDE' : r.regimeAtEnd === 'FLIGHT' ? 'OFF' : 'STICK', q = pt(s, body.V[0]);
  const toe = { body: 0, k: 0, mode, P: q.p };
  if (mode === 'SLIDE') {
    let dir = Math.sign(q.v[0]);
    if (!dir) { const sl = r.log.filter(l => l.reason === 'slip').pop(); dir = -Math.sign(sl.T_over_N); }
    toe.c = -P.mu * dir; toe.slipSign = dir;
  }
  return toe;
}
function intactMargin(P, geom, aDeg, sOverH, ft) {
  const r = solveRigidPhase(P, geom, Object.assign({}, RIGID, { thetaBreak: aDeg * Math.PI / 180 }));
  const pan = { t: P.t, Hr: P.Hr, m: P.rho * P.t * P.Hr };
  let acc = SEC.accel(pan, r.state, r.regimeAtEnd, r.log, P.mu);
  if (!acc) {                                                     // sign of the sliding friction not in the log: from the state
    const b = makeBody(P.t, P.Hr, P.rho), st = [r.state];
    acc = solveAcc({ bodies: [b], toe: toeFromRigid(P, r, b, r.state), pin: null }, st).acc[0];
  }
  const q = SEC.actions(pan, r.state, acc, sOverH * P.Hr);
  return { g: margin(q, P.t, ft, pan.m * G), q, r };
}
// the hinge at a given section, the angle refined by bisection within the sampling interval
function onset(P, geom, theta0, thetaF, step, sOverH, ft) {
  let lo = Math.max(theta0, thetaF - step), hi = thetaF;
  const glo = intactMargin(P, geom, lo, sOverH, ft).g, ghi = intactMargin(P, geom, hi, sOverH, ft).g;
  if (!(ghi < 0)) return { ok: false, reason: 'sampled angle not violated at s_f', glo, ghi };
  if (glo < 0) lo = theta0;                                      // (not expected: the earlier sample held)
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (intactMargin(P, geom, mid, sOverH, ft).g < 0) hi = mid; else lo = mid; }
  const at = intactMargin(P, geom, hi, sOverH, ft);
  return { ok: true, theta: hi, q: at.q, r: at.r, gloInitial: glo };
}

// the hinge where the criterion is first reached: the angle and the section refined together, by bisection on the
// smallest margin over all sections; the hinge at the section where it is reached (taking the lowest section violated
// at the first violated sample instead would place the hinge lower and later)
function intactMargins(P, geom, aDeg, ft) {
  const r = solveRigidPhase(P, geom, Object.assign({}, RIGID, { thetaBreak: aDeg * Math.PI / 180 }));
  const pan = { t: P.t, Hr: P.Hr, m: P.rho * P.t * P.Hr };
  let acc = SEC.accel(pan, r.state, r.regimeAtEnd, r.log, P.mu);
  if (!acc) { const b = makeBody(P.t, P.Hr, P.rho); acc = solveAcc({ bodies: [b], toe: toeFromRigid(P, r, b, r.state), pin: null }, [r.state]).acc[0]; }
  const qs = SEC.SECTIONS.map(sh => SEC.actions(pan, r.state, acc, sh * P.Hr)), gs = qs.map(q => margin(q, P.t, ft, pan.m * G));
  const i = gs.indexOf(Math.min(...gs));
  return { g: gs[i], s: SEC.SECTIONS[i], q: qs[i], r, gs };
}
function onsetFirstCrossing(P, geom, theta0, thetaF, step, ft) {
  let lo = Math.max(theta0, thetaF - step), hi = thetaF;
  const glo = intactMargins(P, geom, lo, ft).g, ghi = intactMargins(P, geom, hi, ft).g;
  if (!(ghi < 0)) return { ok: false, reason: 'sampled angle not violated', glo, ghi };
  if (glo < 0) lo = theta0;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (intactMargins(P, geom, mid, ft).g < 0) hi = mid; else lo = mid; }
  const at = intactMargins(P, geom, hi, ft);
  const i = SEC.SECTIONS.indexOf(at.s);
  return { ok: true, theta: hi, s: at.s, q: at.q, r: at.r, neighbours: [i - 1, i + 1].filter(j => j >= 0 && j < SEC.SECTIONS.length).map(j => ({ s_over_H: SEC.SECTIONS[j], g: at.gs[j] })) };
}

// two-block system at the hinge onset (rigid state r.state at the onset angle)
function hingedSystem(P, geom, on, sOverH, ft, sideOverride = null, crit = true) {
  const t = P.t, Hr = P.Hr, sF = sOverH * Hr, h1 = sF, h2 = Hr - sF;
  const b1 = makeBody(t, h1, P.rho), b2 = makeBody(t, h2, P.rho), st = on.r.state;
  const side = sideOverride || Math.sign(on.q.M) || 1;            // e = M/N: + street face, - inner face
  const place = (yc) => { const r = rot(st.phi, [0, yc]); return { x: st.x + r[0], y: st.y + r[1], phi: st.phi, vx: st.vx - st.omega * r[1], vy: st.vy + st.omega * r[0], omega: st.omega }; };
  const S = [place(-Hr / 2 + h1 / 2), place(-Hr / 2 + h1 + h2 / 2)];
  const toe = toeFromRigid(P, on.r, b1, S[0]);
  const sys = { bodies: [b1, b2], toe, pin: { i: 0, ai: [side * t / 2, h1 / 2], j: 1, aj: [side * t / 2, -h2 / 2], mode: 'PIN', side },
                geom, mu: P.mu, ySupport: geom.pivot.y, panel: { t, Hr, m: P.rho * t * Hr }, sF, ft, crit };
  return { sys, S, side };
}

// ------------------------------------------------------------------ measures at the first ground contact
function splitLayout(P, rng, sF) {
  const L = blockLayout(P, rng), out = [];
  for (const b of L.blocks) {
    const parts = b.w0 < sF - 1e-9 && b.w1 > sF + 1e-9 ? [[b.w0, sF], [sF, b.w1]] : [[b.w0, b.w1]];
    for (const [w0, w1] of parts) out.push(Object.assign({}, b, { w0, w1, h: w1 - w0, wc: (w0 + w1) / 2 }));
  }
  return out.map((b, i) => Object.assign(b, { id: i, mass: P.rho * b.w * b.h }));
}
// bodies: [{ state, w0 (panel coordinate of its bottom), h }]
function measureAt(blocks, P, bodies) {
  const states = blocks.map(b => {
    const B = bodies.find(B => b.wc >= B.w0 - 1e-9 && b.wc <= B.w0 + B.h + 1e-9), s = B.state;
    const r = rot(s.phi, [b.uc + P.t / 2, b.wc - B.w0 - B.h / 2]);
    return { id: b.id, x: s.x + r[0], y: s.y + r[1], phi: s.phi };
  });
  const m = measures(blocks, states).summary;
  // continuous mass distribution along x (uniform density; 16 points across t, ~2,000 along the panel)
  const xs = [];
  for (const B of bodies) {
    const nw = Math.max(4, Math.round(2000 * B.h / P.Hr)), s = B.state;
    for (let i = 0; i < 16; i++) for (let k = 0; k < nw; k++) {
      const r = rot(s.phi, [-P.t / 2 + (i + 0.5) * P.t / 16, -B.h / 2 + (k + 0.5) * B.h / nw]);
      xs.push({ x: s.x + r[0], w: B.h / nw });
    }
  }
  xs.sort((a, b) => a.x - b.x);
  const tot = xs.reduce((s, q) => s + q.w, 0), dec = {};
  let acc = 0, di = 1;
  for (const q of xs) { acc += q.w; while (di <= 10 && acc >= (di === 10 ? 0.95 : di / 10) * tot - 1e-12) { dec[di === 10 ? 'p95' : `p${di * 10}`] = q.x; di++; } }
  const bin = 0.05, x0 = Math.floor(xs[0].x / bin) * bin, nb = Math.ceil((xs[xs.length - 1].x - x0) / bin) + 1, hist = new Array(nb).fill(0);
  for (const q of xs) hist[Math.min(nb - 1, Math.floor((q.x - x0) / bin))] += q.w / tot;
  return { p95m: m.percentiles.p95.mass, p50m: m.percentiles.p50.mass, Lmax: m.Lmax_far, xMeanMass: m.xMeanMass,
           continuous: { deciles: dec, xmax: xs[xs.length - 1].x, hist: { x0, bin, frac: hist.map(v => +v.toFixed(5)) } } };
}
function dynamicsAt(bodiesB, S, g = G) {
  let KE = 0, px = 0, PE = 0, m = 0;
  S.forEach((s, i) => { const b = bodiesB[i]; KE += 0.5 * b.m * (s.vx * s.vx + s.vy * s.vy) + 0.5 * b.I * s.omega * s.omega; px += b.m * s.vx; PE += b.m * g * (s.y - b.t / 2); m += b.m; });
  return { KE, px, PEaboveFlat: PE, m };
}

// ------------------------------------------------------------------ one configuration
function analyse(cfg, seed, checks, variant, hingeMode = 'firstCrossing', critMode = 'both', form = 'elastic') {
  FORM = form;
  const ft = variant in FT ? FT[variant] : Math.round(parseFloat(variant) * 1e9) / 1e3, { P, rng, geom } = setup(cfg, seed);
  const full = solveRigidPhase(P, geom, RIGID);
  const hingeSampled = variant === '0' ? checks.firstViolation : (FORM === 'plastic' ? checks.rigidPlastic[variant] : (checks.postHocFtCracked || checks.elasticCracking)[variant]);
  const base = { id: cfg.id, H: cfg.H, t: cfg.t, seed, variant, thetaImpactRigid: full.theta_deg };
  const blocksRigid = (sF) => splitLayout(P, rng, sF);
  const rigidBodies = [{ state: full.state, w0: 0, h: P.Hr }];
  if (!hingeSampled) {                                                  // survives under this variant: hinged = rigid
    const mr = measureAt(blocksRigid(P.Hr), P, rigidBodies);
    return Object.assign(base, { hinge: null, end: 'noHinge', rigid: mr, hinged: mr, marginP95: 0, marginLmax: 0 });
  }
  const step = seed === 0 ? 0.25 : 1.0;
  let sOverH = hingeSampled.s, fc = null;
  if (hingeMode === 'firstCrossing') {
    fc = onsetFirstCrossing(P, geom, full.theta0_deg, hingeSampled.theta, step, ft);
    if (fc.ok) sOverH = fc.s;
  }
  const out = Object.assign(base, { hingeMode, critMode, sSampled: hingeSampled.s, thetaSampled: hingeSampled.theta, sensitivity: {}, neighboursAtOnset: fc && fc.neighbours });
  const run = (sh) => {
    const on = fc ? (fc.ok ? fc : { ok: false, reason: fc.reason }) : onset(P, geom, full.theta0_deg, hingeSampled.theta, step, sOverH, ft);
    if (!on.ok) return { end: 'onsetNotFound', onset: on };
    // sensitivity: the same angle, the neighbouring section, its own hinge corner
    const side = sh === sOverH ? null : (Math.sign(intactMargin(P, geom, on.theta, sh, ft).q.M) || 1);
    const hs = hingedSystem(P, geom, on, sh, ft, side);
    hs.sys.critMode = critMode;
    const res = integrate(hs.sys, hs.S, { sample: seed === 0 && sh === sOverH ? 500 : 0 });
    const r = { thetaOnset: on.theta, sOverH: sh, side: hs.side > 0 ? 'street-face corner' : 'inner-face corner', end: res.end, atOnset: !!res.atOnset,
                tAfterHinge: res.t, thetaEnd: res.S.map(s => -s.phi * 180 / Math.PI), log: res.log.map(l => ({ t: l.t, reason: l.reason, theta: l.theta, toe: l.toe, pin: l.pin })), maxDrift: res.maxDrift };
    if (res.end === 'secondHingeB2' || res.end === 'hingeB1') r.newHinge = res.end === 'secondHingeB2' ? res.cr.b2 : res.cr.b1;
    if (critMode === 'B2only') r.firstB1Violation = hs.sys.firstB1 || null;
    if (res.end === 'groundContact') {
      const B = hs.sys.bodies;
      const bodies = [{ state: res.S[0], w0: 0, h: B[0].h }, { state: res.S[1], w0: sh * P.Hr, h: B[1].h }];
      const blocks = blocksRigid(sh * P.Hr);
      r.hinged = measureAt(blocks, P, bodies);
      r.rigid = measureAt(blocks, P, rigidBodies);
      r.firstContact = res.cl.who;
      r.dynHinged = dynamicsAt(B, res.S);
      r.dynRigid = dynamicsAt([makeBody(P.t, P.Hr, P.rho)], [full.state]);
      r.marginP95 = r.rigid.p95m / r.hinged.p95m - 1;
      r.marginLmax = r.rigid.Lmax / r.hinged.Lmax - 1;
      r.marginP95_overH = (r.rigid.p95m - r.hinged.p95m) / P.H;
    }
    if (res.trace) r.trace = res.trace;
    return r;
  };
  Object.assign(out, run(sOverH));
  if (seed === 0 && variant === '0' && critMode === 'both') for (const d of [-0.02, 0.02]) {
    const sh = +(sOverH + d).toFixed(2);
    if (sh > 0.01 && sh < 0.99) { const r = run(sh); delete r.trace; delete r.log; out.sensitivity[sh.toFixed(2)] = r; }
  }
  return out;
}

// ------------------------------------------------------------------ verification of the two-block code (Sect. 3)
function verify() {
  const rep = { V1: [], V2: null, V3: [] };
  // V1: one body, the toe contact rules: must reproduce solveRigidPhase
  for (const cfg of SEC.configs()) {
    const { P, geom } = setup(cfg, 0), ref = solveRigidPhase(P, geom), rs = rigidSystem(P, geom);
    const res = integrate(rs.sys, rs.S);
    const s = res.S[0], vs = Math.hypot(ref.state.vx, ref.state.vy) + Math.abs(ref.state.omega) * P.Hr;
    const sw = res.log.filter(l => l.reason !== 'start').map(l => l.theta[0]), swRef = ref.log.filter(l => l.reason !== 'start').map(l => l.theta_deg);
    rep.V1.push({ id: cfg.id, end: res.end, dT: Math.abs(res.t - ref.tImpact) / ref.tImpact, dTheta: Math.abs(-s.phi * 180 / Math.PI - ref.theta_deg) / ref.theta_deg,
                  dState: Math.max(Math.abs(s.vx - ref.state.vx), Math.abs(s.vy - ref.state.vy), Math.abs(s.omega - ref.state.omega) * P.Hr) / vs,
                  dPos: Math.max(Math.abs(s.x - ref.state.x), Math.abs(s.y - ref.state.y)) / P.Hr,
                  switches: sw.length === swRef.length ? Math.max(0, ...sw.map((a, i) => Math.abs(a - swRef[i]) / swRef[i])) : 'different number',
                  regimes: res.log.map(l => l.reason).join(' '), regimesRef: ref.log.map(l => l.reason).join(' ') });
  }
  // V2: two pinned blocks in free flight, 2 s: energy, horizontal momentum, angular momentum about the centre of mass
  {
    const t = 0.6, b1 = makeBody(t, 4, 1800), b2 = makeBody(t, 3, 1800);
    const S = [{ x: 0, y: 10, phi: -0.3, vx: 1.5, vy: 2, omega: -1.2 }];
    const hc = pt(S[0], [t / 2, 2]);
    const phi2 = -0.1, r2 = rot(phi2, [-t / 2, 1.5]);               // B2 centroid from the pin point (B2 body (t/2, -h/2))
    const S2 = { x: hc.p[0] + r2[0], y: hc.p[1] + r2[1], phi: phi2, omega: 0.8 };
    S2.vx = hc.v[0] - S2.omega * r2[1]; S2.vy = hc.v[1] + S2.omega * r2[0];
    S.push(S2);
    const sys = { bodies: [b1, b2], toe: null, pin: { i: 0, ai: [t / 2, 2], j: 1, aj: [t / 2, -1.5], mode: 'PIN', side: 1 }, geom: { slope: 0 }, mu: 0.75, noGround: true, panel: { t, Hr: 7, m: b1.m + b2.m }, crit: false };
    const inv = (S) => {
      const M = b1.m + b2.m, xc = (b1.m * S[0].x + b2.m * S[1].x) / M, yc = (b1.m * S[0].y + b2.m * S[1].y) / M;
      const vxc = (b1.m * S[0].vx + b2.m * S[1].vx) / M, vyc = (b1.m * S[0].vy + b2.m * S[1].vy) / M;
      let L = 0; [b1, b2].forEach((b, i) => { const s = S[i]; L += b.I * s.omega + b.m * ((s.x - xc) * (s.vy - vyc) - (s.y - yc) * (s.vx - vxc)); });
      return { E: energy(sys, S), px: M * vxc, L };
    };
    const i0 = inv(project(sys, S));
    let St = project(sys, S), maxE = 0, maxP = 0, maxL = 0;
    for (let k = 0; k < 20000; k++) {
      St = project(sys, rk4(sys, St, H_STEP, G));
      const q = inv(St);
      maxE = Math.max(maxE, Math.abs(q.E - i0.E) / Math.abs(i0.E)); maxP = Math.max(maxP, Math.abs(q.px - i0.px) / Math.abs(i0.px)); maxL = Math.max(maxL, Math.abs(q.L - i0.L) / Math.abs(i0.L));
    }
    rep.V2 = { duration_s: 2, relE: maxE, relPx: maxP, relL: maxL };
  }
  // V3: two thin rods, base pin, hinge at s, aligned at theta with angular velocity omega: Lagrange equations by hand
  // (the corner pivots sit t/2 off the rod axis: the difference is O(t/L), amplified where theta2'' is small; it is
  //  reported for t = 1e-4 ... 1e-9 m and the verdict is read at the thinnest rod)
  for (const t of [1e-4, 1e-6, 1e-8, 1e-9]) for (const thDeg of [10, 30, 60]) for (const sL of [0.3, 0.5, 0.7]) for (const om of [0, 1]) {
    const L = 10, rho = 1000, a = sL * L, bL = L - a, b1 = makeBody(t, a, rho), b2 = makeBody(t, bL, rho);
    const m1 = b1.m, m2 = b2.m, th = thDeg * Math.PI / 180;
    const A11 = (m1 / 3 + m2) * a * a, A12 = m2 * a * bL / 2, A22 = m2 * bL * bL / 3;
    const r1 = (m1 / 2 + m2) * G * a * Math.sin(th), r2 = m2 * G * (bL / 2) * Math.sin(th), det = A11 * A22 - A12 * A12;
    const th1dd = (r1 * A22 - A12 * r2) / det, th2dd = (A11 * r2 - A12 * r1) / det;
    const phi = -th, w = -om;
    const G1 = rot(phi, [0, a / 2]), S = [{ x: G1[0], y: G1[1], phi, vx: -w * G1[1], vy: w * G1[0], omega: w }];
    const top = rot(phi, [0, a]), G2r = rot(phi, [0, bL / 2]);
    S.push({ x: top[0] + G2r[0], y: top[1] + G2r[1], phi, vx: -w * (top[1] + G2r[1]), vy: w * (top[0] + G2r[0]), omega: w });
    const sys = { bodies: [b1, b2], toe: { body: 0, k: 0, mode: 'STICK', P: pt(S[0], b1.V[0]).p }, pin: { i: 0, ai: [t / 2, a / 2], j: 1, aj: [t / 2, -bL / 2], mode: 'PIN', side: 1 }, geom: { slope: 0 }, mu: 0.75 };
    const f = solveAcc(sys, S);
    rep.V3.push({ t, thDeg, sL, om, alpha1: -f.acc[0].alpha, closed1: th1dd, alpha2: -f.acc[1].alpha, closed2: th2dd,
                  rel: Math.max(Math.abs(-f.acc[0].alpha - th1dd) / Math.abs(th1dd), Math.abs(-f.acc[1].alpha - th2dd) / Math.abs(th2dd)) });
  }
  const worst = (k) => Math.max(...rep.V1.map(r => typeof r[k] === 'number' ? r[k] : Infinity));
  rep.summary = { V1_maxRel: { dT: worst('dT'), dTheta: worst('dTheta'), dState: worst('dState'), dPos: worst('dPos'), switches: worst('switches') },
                  V1_pass: ['dT', 'dTheta', 'dState', 'switches'].every(k => worst(k) <= 1e-6) && rep.V1.every(r => r.end === 'groundContact' && r.regimes.split(' ').length === r.regimesRef.split(' ').length),
                  V2_pass: Math.max(rep.V2.relE, rep.V2.relPx, rep.V2.relL) <= 1e-6, V3_maxRelByT: Object.fromEntries([1e-4, 1e-6, 1e-8, 1e-9].map(t => [t, Math.max(...rep.V3.filter(r => r.t === t).map(r => r.rel))])),
                  V3_pass: rep.V3.filter(r => r.t === 1e-9).every(r => r.rel <= 1e-6) };
  return rep;
}

module.exports = { makeBody, solveAcc, integrate, rigidSystem, hingedSystem, onset, onsetFirstCrossing, intactMargins, analyse, verify, measureAt, splitLayout, setup, pt };
