// A wall of the analyses: its geometry, blocks, materials and street, from a partial description (the parameters not
// given take the default values), from a grid of heights and thicknesses or from a CSV file; and the input of the
// simulator for one wall and one seed.
'use strict';
const D = require('./defaults');

const WALL_DEFAULTS = { mechanism: 'total', Hr: null, bx: 0.15, by: 0.15, diatoneStep: D.MATERIALS.diatones.step,
  diatoneH: D.MATERIALS.diatones.h, mu: D.MATERIALS.mu, muG: D.MATERIALS.muG, e: D.MATERIALS.e, rho: D.MATERIALS.rho, W: null };

function checkWall(w) {
  const bad = (m) => { throw new Error(`wall ${w.id}: ${m}`); };
  if (!(w.H > 0 && w.H <= 60)) bad('the height H must be in (0, 60] m');
  if (!(w.t > 0 && w.t <= 3)) bad('the thickness t must be in (0, 3] m');
  if (!['total', 'partial'].includes(w.mechanism)) bad("the mechanism must be 'total' or 'partial'");
  if (w.mechanism === 'partial' && !(w.Hr > 0 && w.Hr < w.H)) bad('a partial collapse needs 0 < Hr < H');
  if (!(w.bx > 0 && w.by > 0)) bad('the block size must be positive');
  if (!(w.diatoneStep >= 0)) bad('the diatone spacing must be 0 (none) or positive');
  if (!(w.mu >= 0 && w.muG >= 0 && w.e >= 0 && w.e <= 1 && w.rho > 0)) bad('friction >= 0, restitution in [0, 1], density > 0');
  if (w.W != null && !(w.W > 0)) bad('the street width W must be positive');
  return w;
}

// a wall from a partial description; a partial collapse may give Hr directly or as a fraction of H (HrRatio)
function wall(spec, i = 0) {
  const w = Object.assign({}, WALL_DEFAULTS, spec);
  if (w.mechanism === 'partial' && w.Hr == null && spec.HrRatio != null) w.Hr = spec.HrRatio * w.H;
  if (w.mechanism === 'total') w.Hr = null;
  w.id = String(spec.id != null && spec.id !== '' ? spec.id : `wall${i + 1}`);
  delete w.HrRatio;
  return checkWall(w);
}

// every combination of the given heights and thicknesses, the other parameters shared
function grid(spec) {
  const { heights, thicknesses, ...common } = spec;
  if (!heights || !heights.length || !thicknesses || !thicknesses.length) throw new Error('the grid needs at least one height and one thickness');
  const out = [];
  for (const H of heights) for (const t of thicknesses) {
    const hr = common.mechanism === 'partial' ? (common.Hr != null ? common.Hr : common.HrRatio * H) : null;
    out.push(wall(Object.assign({}, common, { id: `H${H}_t${Number(t).toFixed(2)}` + (hr != null ? `_Hr${+hr.toFixed(3)}` : ''), H, t }), out.length));
  }
  return out;
}

// the input of the simulator for one wall and one seed
function wallParams(w, seed, variability = D.VARIABILITY) {
  const P = Object.assign({}, D.MATERIALS, { H: w.H, t: w.t, mechanism: w.mechanism, bx: w.bx, by: w.by, mu: w.mu, muG: w.muG,
    e: w.e, rho: w.rho, engine: 'planck',
    diatones: w.diatoneStep > 0 ? { on: true, step: w.diatoneStep, h: w.diatoneH } : { on: false, step: D.MATERIALS.diatones.step, h: w.diatoneH },
    variability: Object.assign({ seed }, variability) });
  if (w.mechanism === 'partial') P.Hr = w.Hr;
  return P;
}

// walls from a CSV file: one wall per row. Required columns id, H_m, t_m and mechanism (T for a total collapse; P, P1
// or P2 for a partial one, with Hr_m; P1 and P2 without Hr_m mean Hr = H/3 and 2H/3). Optional columns, the default
// values when absent or empty: bx_m, by_m, diatone_step_m (0 = none), mu, muG, e, rho, W_m.
const OPTIONAL = { bx_m: 'bx', by_m: 'by', diatone_step_m: 'diatoneStep', mu: 'mu', muG: 'muG', e: 'e', rho: 'rho', W_m: 'W' };
function wallsFromRows(rows) {
  const miss = ['id', 'mechanism', 'H_m', 't_m'].filter(k => rows.length && !(k in rows[0]));
  if (miss.length) throw new Error(`missing columns: ${miss.join(', ')}`);
  return rows.filter(r => String(r.id).trim() !== '').map((r, i) => {
    const num = (v) => { const x = Number(String(v).replace(',', '.')); if (!Number.isFinite(x)) throw new Error(`wall ${r.id}: '${v}' is not a number`); return x; };
    const m = String(r.mechanism).trim().toUpperCase();
    if (!['T', 'P', 'P1', 'P2'].includes(m)) throw new Error(`wall ${r.id}: mechanism must be T, P, P1 or P2`);
    const s = { id: String(r.id).trim(), mechanism: m === 'T' ? 'total' : 'partial', H: num(r.H_m), t: num(r.t_m) };
    if (m !== 'T') {
      if (r.Hr_m != null && String(r.Hr_m).trim() !== '') s.Hr = num(r.Hr_m);
      else if (m === 'P') throw new Error(`wall ${r.id}: a partial collapse (P) needs Hr_m`);
      else s.Hr = (m === 'P1' ? 1 / 3 : 2 / 3) * s.H;
    }
    for (const [col, key] of Object.entries(OPTIONAL)) if (r[col] != null && String(r[col]).trim() !== '') s[key] = num(r[col]);
    return wall(s, i);
  });
}

module.exports = { WALL_DEFAULTS, checkWall, wall, grid, wallParams, wallsFromRows };
