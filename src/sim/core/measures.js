// Output measures from the final block states (engine-independent).
// Distances are measured horizontally from the street face of the facade (x = 0).
//   Lmax_far       max over blocks of the farthest vertex
//   Lmax_centroid  max over blocks of the centroid
//   percentiles of the far-edge distance, by block count and by mass (= area for uniform density):
//   the p-percentile is the smallest distance d such that a fraction >= p of the count (mass) lies at
//   far-edge distance <= d.
//   xMeanMass      mass-weighted mean of the block centroids (debris centroid distance)
//   profile: debris height envelope on 5 cm bins (max top of the blocks covering the bin)
'use strict';
const { boxVertices } = require('./geometry');

// world vertices of a block (box, or polygon of the exploratory two-leaf core)
function blockVertices(b, s) {
  if (b.shape !== 'polygon') return boxVertices(s.x, s.y, b.w, b.h, s.phi);
  const c = Math.cos(s.phi), sn = Math.sin(s.phi);
  return b.vertices.map(([a, d]) => [s.x + a * c - d * sn, s.y + a * sn + d * c]);
}

function weightedPercentile(pairs, p) {      // pairs sorted by v ascending
  const tot = pairs.reduce((s, q) => s + q.w, 0);
  let acc = 0;
  for (const q of pairs) { acc += q.w; if (acc >= p * tot - 1e-12) return q.v; }
  return pairs[pairs.length - 1].v;
}

function measures(blocks, finalStates, { ps = [0.5, 0.8, 0.9, 0.95, 0.99], bin = 0.05 } = {}) {
  const byId = new Map(finalStates.map(s => [s.id, s]));
  const rows = blocks.map(b => {
    const s = byId.get(b.id);
    const V = blockVertices(b, s);
    const xs = V.map(v => v[0]), ys = V.map(v => v[1]);
    return { id: b.id, mass: b.mass, x: s.x, y: s.y, phi: s.phi, xFar: Math.max(...xs), xNear: Math.min(...xs), yTop: Math.max(...ys), yBot: Math.min(...ys), w: b.w, h: b.h, type: b.type, layer: b.layer, col: b.col };
  });
  const far = rows.map(r => ({ v: r.xFar, w: 1, m: r.mass })).sort((a, b) => a.v - b.v);
  const out = { nBlocks: rows.length, totalMass: rows.reduce((s, r) => s + r.mass, 0),
                Lmax_far: far[far.length - 1].v, Lmax_centroid: Math.max(...rows.map(r => r.x)), percentiles: {} };
  out.xMeanMass = rows.reduce((s, r) => s + r.mass * r.x, 0) / out.totalMass;
  for (const p of ps) {
    out.percentiles[`p${Math.round(p * 100)}`] = {
      count: weightedPercentile(far, p),
      mass: weightedPercentile(far.map(q => ({ v: q.v, w: q.m })), p),
    };
  }
  out.massFractionInsideFootprint = rows.filter(r => r.x < 0).reduce((s, r) => s + r.mass, 0) / out.totalMass;
  // diagnostic sentinel: blocks whose lowest point is more than 1 cm below the street level (penetration)
  out.nBelowGround = rows.filter(r => r.yBot < -0.01).length;
  // height profile
  const xmin = Math.floor(Math.min(...rows.map(r => r.xNear)) / bin) * bin, xmax = Math.ceil(out.Lmax_far / bin) * bin;
  const nb = Math.max(1, Math.round((xmax - xmin) / bin));
  const prof = new Array(nb).fill(0);
  for (const r of rows) {
    const i0 = Math.max(0, Math.floor((r.xNear - xmin) / bin)), i1 = Math.min(nb - 1, Math.floor((r.xFar - xmin) / bin));
    for (let i = i0; i <= i1; i++) prof[i] = Math.max(prof[i], r.yTop);
  }
  out.profile = { x0: xmin, bin, height: prof.map(v => +v.toFixed(4)) };
  return { summary: out, rows };
}

module.exports = { measures, weightedPercentile };
