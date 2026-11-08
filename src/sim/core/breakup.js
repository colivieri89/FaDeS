// Break-up at impact: the rigid panel is replaced by its blocks, each placed at its position in the
// rotated panel and given the rigid-body velocity field v_i = v_G + omega x r_i (r_i from the panel
// centroid to the block centroid), omega_i = omega.
// Optional uniform joint gap g = P.breakup.gap [m] (default 0 = blocks touching):
// each block is shrunk by g in width and height about its own centroid, and its density is scaled so that
// mass, centroid and velocity are unchanged (gap g between neighbours, g/2 inside the panel boundary).
'use strict';
const { rot } = require('./rigid_phase');

function breakup(layout, panelState, P, materialTag = 'masonry') {
  const t = P.t, Hr = P.Hr, s = panelState;
  const g = (P.breakup && P.breakup.gap) || 0;
  return layout.blocks.map((b, i) => {
    const local = [b.uc + t / 2, b.wc - Hr / 2];                  // block centre relative to the panel centroid
    const r = rot(s.phi, local);
    const mass = P.rho * b.w * b.h;
    const w = g ? b.w - g : b.w, h = g ? b.h - g : b.h;
    return {
      id: i, layer: b.layer, col: b.col, type: b.type, w, h,
      x: s.x + r[0], y: s.y + r[1], phi: s.phi,
      vx: s.vx - s.omega * r[1], vy: s.vy + s.omega * r[0], omega: s.omega,
      density: g ? mass / (w * h) : P.rho, material: materialTag,
      mass, inertia: mass * (w * w + h * h) / 12,
    };
  });
}

module.exports = { breakup };
