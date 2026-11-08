// EXPLORATORY section variants. Not used by default
// (P.leaves.mode = 'single').
//
// (1) 'twoLeaf' (mechanism b)
//
// Section of the overturning portion, from the street face inwards:
//   outer leaf  x in [-t_o, 0]              overturns rigidly about its own toe (analytic phase, thickness
//                                           t_o, no through-stones: the leaves are assumed detached),
//                                           then breaks up at impact like the single-leaf wall
//   rubble core x in [-t_o - t_c, -t_o]     released at the break-up of the outer leaf as loose angular
//                                           grains (irregular hexagons on a square lattice, at rest), so
//                                           it slumps as a granular column with no lateral support
//   inner leaf  x in [-t, -t_o - t_c]       stays standing (static body; it is not debris)
// The residual wall (partial collapse) keeps the full thickness t.
// Simplifications (documented): the core is released when the outer leaf lands, not while it rotates;
// grain density = masonry density; the grains are planck.js polygons (no rolling artefact of circles).
// The lattice leaves the grains apart: the solid fraction is 0.40-0.48 (measured 2026-10-16; an earlier
// comment said "about 30 % voids", which was wrong). The formal definition of the crumbling regime
// (model_extension_design.md §4.1) replaces this release by a deposited column and a gate.
//
// (2) 'crumble' (mechanism d, vertical crumbling / disaggregation in place): there is no rigid
// overturning; the whole overturning portion [-t, 0] x [h0, H] is released at rest as loose grains of
// size `grain` (of the order of the stone size) and slumps as a granular column against the backstop
// (the building interior). This is the limiting case of complete loss of monolithic behaviour.
'use strict';
const { deepMerge } = require('./params');

function leafThicknesses(P) {
  const L = P.leaves;
  const tO = L.outer * P.t, tC = L.core * P.t;
  return { tO, tC, tI: P.t - tO - tC };
}

// parameters of the outer leaf for the rigid phase and its block layout
function outerLeafParams(P) {
  const { tO } = leafThicknesses(P);
  return deepMerge(P, { t: tO, diatones: { on: false } });
}

// static inner leaf (box) above the hinge level h0
function innerLeafBox(P, geom) {
  const { tO, tC } = leafThicknesses(P);
  return { x0: -P.t, x1: -tO - tC, y0: geom.h0, y1: P.H };
}

// polygon area and centroidal polar moment (per unit density) of a CCW polygon
function polyMassProps(V) {
  let A = 0, Ix = 0, Iy = 0, cx = 0, cy = 0;
  for (let i = 0; i < V.length; i++) {
    const [x0, y0] = V[i], [x1, y1] = V[(i + 1) % V.length];
    const c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    Ix += (y0 * y0 + y0 * y1 + y1 * y1) * c; Iy += (x0 * x0 + x0 * x1 + x1 * x1) * c;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  const J0 = (Ix + Iy) / 12;                      // about the local origin
  return { A, cx, cy, J: J0 - A * (cx * cx + cy * cy) };
}

// loose angular grains at rest filling the region [x0, x0 + width] x [y0, y0 + height], ids from id0
function grainsInRegion(P, x0, width, y0, height, d, rng, id0) {
  const nx = Math.max(1, Math.floor(width / d)), ny = Math.max(1, Math.floor(height / d));
  const px = width / nx, py = height / ny, R = 0.48 * Math.min(px, py);
  const grains = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const phi0 = rng.uniform() * Math.PI / 3;
    let V = [];
    for (let k = 0; k < 6; k++) {
      const a = phi0 + k * Math.PI / 3 + (rng.uniform() - 0.5) * 0.3, r = R * (0.80 + 0.20 * rng.uniform());
      V.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const mp = polyMassProps(V);
    V = V.map(([x, y]) => [x - mp.cx, y - mp.cy]);    // centroid at the local origin
    grains.push({ id: id0 + grains.length, layer: j, col: i, type: 'core', shape: 'polygon', vertices: V,
                  w: 2 * R, h: 2 * R,                  // bounding size (used for the speed bound only)
                  x: x0 + (i + 0.5) * px, y: y0 + (j + 0.5) * py, phi: 0, vx: 0, vy: 0, omega: 0,
                  density: P.rho, material: 'masonry', mass: P.rho * mp.A, inertia: P.rho * mp.J });
  }
  return grains;
}

// rubble core of the two-leaf variant
function coreGrains(P, geom, rng, id0) {
  const { tO, tC } = leafThicknesses(P);
  return grainsInRegion(P, -tO - tC, tC, geom.h0, P.Hr, P.leaves.grain, rng, id0);
}

// whole overturning portion as loose grains (crumble variant)
function crumbleGrains(P, geom, rng) {
  return grainsInRegion(P, -P.t, P.t, geom.h0, P.Hr, P.leaves.grain, rng, 0);
}

module.exports = { leafThicknesses, outerLeafParams, innerLeafBox, coreGrains, crumbleGrains, grainsInRegion, polyMassProps };
