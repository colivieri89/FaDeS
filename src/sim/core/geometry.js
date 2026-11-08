// Geometry of the 2D section (SI, y up, x towards the street, origin at the street face at ground).
//   wall section: x in [-t, 0]
//   total collapse:   panel = [-t, 0] x [0, H],            pivot (outer toe) = (0, 0)
//   partial collapse: residual wall = [-t, 0] x [0, h0],   panel = [-t, 0] x [h0, H], pivot = (0, h0)
// Block layout of the panel, in panel coordinates (u, w): u in [-t, 0] across the thickness
// (u = 0 street face), w in [0, Hr] above the hinge. Blocks tile the panel exactly (no gaps,
// no overlaps): between diatone courses the clear height is split into equal layers of height
// ~by, each layer into equal columns of width ~bx. Optional seeded size perturbations keep the
// tiling exact (cut positions are jittered, not block sizes independently).
'use strict';

function wallGeometry(P) {
  const h0 = P.mechanism === 'partial' ? P.H - P.Hr : 0;
  return {
    t: P.t, H: P.H, Hr: P.Hr, h0,
    pivot: { x: 0, y: h0 },
    residualWall: h0 > 0 ? { x0: -P.t, x1: 0, y0: 0, y1: h0 } : null,
    // backstop: rigid wall behind the inner face (the building interior), from the ground up
    backstop: P.backstop ? { x0: -P.t - 0.30, x1: -P.t, y0: 0, y1: P.H + 2 } : null,
    slope: Math.atan((P.slopePermille || 0) / 1000),
  };
}

// split [0, L] into n equal parts with seeded jitter of the interior cuts (relative sd of a part)
function jitteredCuts(L, n, sdRel, rng) {
  const cuts = [0];
  for (let i = 1; i < n; i++) {
    const nominal = L * i / n, part = L / n;
    const j = rng && sdRel ? rng.truncNormal(sdRel * part, 2) : 0;
    cuts.push(Math.min(Math.max(nominal + j, cuts[i - 1] + 0.2 * part), L - (n - i) * 0.2 * part));
  }
  cuts.push(L);
  return cuts;
}

function blockLayout(P, rng = null) {
  const t = P.t, Hr = P.Hr, sd = (P.variability && P.variability.sdBlockRel) || 0;
  const dia = P.diatones || { on: false };
  // vertical courses: diatones at w = step, 2 step, ... (bottom of the course), height dia.h
  const courses = [];
  let w = 0;
  const diaStarts = [];
  if (dia.on) for (let z = dia.step; z + dia.h <= Hr + 1e-9; z += dia.step) diaStarts.push(z);
  for (const z of diaStarts.concat([Hr])) {
    const clear = z - w;
    if (clear > 1e-9) {
      const nl = Math.max(1, Math.round(clear / P.by));
      const cuts = jitteredCuts(clear, nl, sd, rng);
      for (let i = 0; i < nl; i++) courses.push({ w0: w + cuts[i], w1: w + cuts[i + 1], type: 'norm' });
    }
    if (z < Hr - 1e-9) { courses.push({ w0: z, w1: z + dia.h, type: 'dia' }); w = z + dia.h; } else w = z;
  }
  const nc = Math.max(1, Math.round(t / P.bx));
  const blocks = [];
  courses.forEach((c, li) => {
    if (c.type === 'dia') { blocks.push({ layer: li, col: 0, type: 'dia', u0: -t, u1: 0, w0: c.w0, w1: c.w1 }); return; }
    const cuts = jitteredCuts(t, nc, sd, rng);
    for (let k = 0; k < nc; k++) blocks.push({ layer: li, col: k, type: 'norm', u0: -t + cuts[k], u1: -t + cuts[k + 1], w0: c.w0, w1: c.w1 });
  });
  for (const b of blocks) { b.w = b.u1 - b.u0; b.h = b.w1 - b.w0; b.uc = (b.u0 + b.u1) / 2; b.wc = (b.w0 + b.w1) / 2; }
  return { courses, blocks, nColumns: nc };
}

// polygon (CCW) of a box of size w x h centred at (x, y), rotated by phi (counter-clockwise)
function boxVertices(x, y, w, h, phi) {
  const c = Math.cos(phi), s = Math.sin(phi), hw = w / 2, hh = h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([a, b]) => [x + a * c - b * s, y + a * s + b * c]);
}

module.exports = { wallGeometry, blockLayout, boxVertices, jitteredCuts };
