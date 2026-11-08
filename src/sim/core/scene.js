// Build the engine-agnostic scene (statics + blocks) from the geometry and the broken-up blocks.
'use strict';

function buildScene(P, geom, blocks, { dt } = {}) {
  const statics = [];
  // ground: inside the building / under the wall (x <= 0) horizontal; the road (x > 0) descending with
  // the slope (positive slope = downhill away from the facade); 200 m long on the street side
  const L = 200, s = geom.slope;
  statics.push({ id: 'floor', shape: { type: 'segment', x0: -50, y0: 0, x1: 0, y1: 0 }, x: 0, y: 0, phi: 0, material: 'ground' });
  statics.push({ id: 'road', shape: { type: 'segment', x0: 0, y0: 0, x1: L * Math.cos(s), y1: -L * Math.sin(s) }, x: 0, y: 0, phi: 0, material: 'ground' });
  if (geom.residualWall) {
    const r = geom.residualWall;
    statics.push({ id: 'residualWall', shape: { type: 'box', w: r.x1 - r.x0, h: r.y1 - r.y0 }, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, phi: 0, material: 'masonry' });
  }
  if (geom.innerLeaf) {                       // two-leaf variant: the inner leaf stays standing
    const b = geom.innerLeaf;
    statics.push({ id: 'innerLeaf', shape: { type: 'box', w: b.x1 - b.x0, h: b.y1 - b.y0 }, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, phi: 0, material: 'masonry' });
  }
  if (geom.backstop) {
    const b = geom.backstop;
    statics.push({ id: 'backstop', shape: { type: 'box', w: b.x1 - b.x0, h: b.y1 - b.y0 }, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, phi: 0, material: 'masonry' });
  }
  return {
    gravity: [0, -9.81], dt: dt || P.dt, airDrag: P.airDrag || 0,
    contactRules: { 'masonry|masonry': { mu: P.mu, e: P.e }, 'ground|masonry': { mu: P.muG, e: P.e } },
    statics,
    bodies: blocks.map(b => ({ id: b.id, shape: b.shape === 'polygon' ? { type: 'polygon', vertices: b.vertices, mass: b.mass, inertia: b.inertia } : { type: 'box', w: b.w, h: b.h },
                               x: b.x, y: b.y, phi: b.phi, vx: b.vx, vy: b.vy, omega: b.omega, density: b.density, material: b.material })),
  };
}

module.exports = { buildScene };
