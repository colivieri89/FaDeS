// The checks of the intact panel during the fall (Sect. 4.2 and 4.5 of the paper): at every sampled rotation and at
// every section, three criteria and a sliding check.
//   no tension (primary):        N >= 0 and |M| <= N t/2
//   elastic cracking limit:      N >= -f_t t and |M| <= max(N t/2, N t/6 + f_t t^2/6)
//   rigid-plastic section:       N >= -f_t t and |M| <= (N + f_t t) t/2
//   bed-joint sliding:           |V| > mu N (reported only)
// with the tensile strengths f_t of the post hoc sensitivity case of the paper (0.04 and 0.10 MPa) or any others.
'use strict';
const { wallGeometry } = require('../../sim/core/geometry');
const { solveRigidPhase } = require('../../sim/core/rigid_phase');
const SEC = require('./sections');

// tensile strengths [MPa] -> keys of the result ('0.04MPa') and values [Pa]
const DEFAULT_FT = [0.04, 0.10];
const ftKey = (x) => `${Number(x).toFixed(2)}MPa`;
const ftPa = (x) => Math.round(x * 1e9) / 1e3;

function analyse(cfg, seed, stepDeg, rigidOpts = {}, ftMPa = DEFAULT_FT) {
  const FT = ftMPa.map(ftPa), FT_KEYS = ftMPa.map(ftKey), MU_SLIDE = cfg.mu != null ? cfg.mu : 0.75;
  const P = SEC.params(cfg, seed), geom = wallGeometry(P);
  const full = solveRigidPhase(P, geom, rigidOpts);
  if (!full.ok) return { id: cfg.id, seed, ok: false };
  const pan = { t: P.t, Hr: P.Hr, m: P.rho * P.t * P.Hr };
  const th0 = full.theta0_deg, thI = full.theta_deg;
  const angles = [];
  for (let a = th0 + stepDeg; a < thI - 1e-9; a += stepDeg) angles.push(a);
  const st0 = rigidOpts.omega0 ? solveRigidPhase(P, geom, Object.assign({}, rigidOpts, { thetaBreak: th0 * Math.PI / 180 + 1e-12 })).state
                                : { phi: -th0 * Math.PI / 180, omega: 0, vx: 0, vy: 0 };
  const S = [{ t: 0, st: st0, regime: 'STICK', log: [] }];
  for (const a of angles) { const r = solveRigidPhase(P, geom, Object.assign({}, rigidOpts, { thetaBreak: a * Math.PI / 180 })); S.push({ t: r.tImpact, st: r.state, regime: r.regimeAtEnd, log: r.log }); }
  S.push({ t: full.tImpact, st: full.state, regime: full.regimeAtEnd, log: full.log.slice(0, -1) });
  const accOf = (k) => {
    const an = SEC.accel(pan, S[k].st, S[k].regime, S[k].log, P.mu);
    if (an) return an;
    const a = S[Math.max(0, k - 1)], b = S[Math.min(S.length - 1, k + 1)], dt = b.t - a.t;
    return dt > 0 ? { ax: (b.st.vx - a.st.vx) / dt, ay: (b.st.vy - a.st.vy) / dt, alpha: (b.st.omega - a.st.omega) / dt } : null;
  };
  let first = null, firstSlide = null;
  const firstEl = FT.map(() => null), firstPl = FT.map(() => null);
  for (let k = 0; k < S.length; k++) {
    const acc = accOf(k);
    if (!acc) continue;
    const th = -S[k].st.phi * 180 / Math.PI;
    for (const sh of SEC.SECTIONS) {
      const q = SEC.actions(pan, S[k].st, acc, sh * P.Hr);
      const tens = q.N < 0, ecc = q.N > 0 ? Math.abs(q.M) / (q.N * P.t / 2) : Infinity;
      if (!first && (tens || ecc > 1)) first = { theta: th, s: sh, mode: tens ? 'tension' : 'eccentricity', t: S[k].t, regime: S[k].regime };
      FT.forEach((ft, i) => {
        const capEl = Math.max(q.N * P.t / 2, q.N * P.t / 6 + ft * P.t * P.t / 6);
        if (!firstEl[i] && (q.N < -ft * P.t || Math.abs(q.M) > capEl)) firstEl[i] = { theta: th, s: sh, mode: q.N < -ft * P.t ? 'tension' : 'moment' };
        const capPl = (q.N + ft * P.t) * P.t / 2;
        if (!firstPl[i] && (q.N < -ft * P.t || Math.abs(q.M) > capPl)) firstPl[i] = { theta: th, s: sh, mode: q.N < -ft * P.t ? 'tension' : 'moment' };
      });
      if (!firstSlide && q.N > 0 && Math.abs(q.V) > MU_SLIDE * q.N) firstSlide = { theta: th, s: sh };
    }
  }
  const pick = (arr) => Object.fromEntries(FT_KEYS.map((k, i) => [k, arr[i]]));
  return { id: cfg.id, H: cfg.H, t: cfg.t, seed, ok: true, omega0: rigidOpts.omega0 || 0, theta0: th0, thetaImpact: thI,
           firstViolation: first, elasticCracking: pick(firstEl), rigidPlastic: pick(firstPl), firstSlide,
           slideBeforeHinge: !!(firstSlide && first && firstSlide.theta < first.theta),
           slideLeadDeg: firstSlide && first ? first.theta - firstSlide.theta : null };
}

module.exports = { analyse, ftKey, ftPa, DEFAULT_FT };
