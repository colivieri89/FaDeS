// planck.js (JavaScript port of Box2D 2.4) behind the engine interface of the simulator. In-process, SI units.
//
// Box2D-specific choices (documented, tested in tests/bench):
//   - polygon skin: Box2D surrounds polygons with a radius of 2*linearSlop; linearSlop is reduced
//     from 5 mm to 0.5 mm (skin 1 mm), and box cores are shrunk by the skin so that the effective
//     contact boundary equals the nominal box (rounded corners of radius 1 mm)
//   - friction and restitution are set per contact from the scene's contact rules (Box2D's own
//     mixing rules, sqrt(muA muB) and max(eA, eB), are overridden)
//   - restitution velocity threshold (inelastic below it): configurable, default 0.1 m/s
//   - sleeping disabled (the core decides when the debris is at rest)
'use strict';
const planck = require('planck');

const VERSION = '1.5.0';

function createPlanckEngine(opts = {}) {
  // production settings of the paper (level 0): 60/30 iterations with dt = 1/480 s
  const settings = Object.assign({ linearSlop: 0.0005, velocityIterations: 60, positionIterations: 30, velocityThreshold: 0.1,
                                   maxTranslation: 2.0 }, opts);
  let world = null, dt = null, rules = null, airDrag = 0;
  const dyn = new Map();
  const ruleFor = (a, b) => rules[[a, b].sort().join('|')];

  return {
    info: () => ({ name: 'planck', version: VERSION, settings }),
    async init(scene) {
      planck.Settings.linearSlop = settings.linearSlop;
      planck.Settings.velocityThreshold = settings.velocityThreshold;
      planck.Settings.maxTranslation = settings.maxTranslation;
      const skin = 2 * settings.linearSlop;
      world = new planck.World({ gravity: planck.Vec2(scene.gravity[0], scene.gravity[1]), allowSleep: false });
      dt = scene.dt; rules = scene.contactRules; airDrag = scene.airDrag || 0;
      world.on('pre-solve', (contact) => {
        const r = ruleFor(contact.getFixtureA().getUserData(), contact.getFixtureB().getUserData());
        if (r) { contact.setFriction(r.mu); contact.setRestitution(r.e); }
      });
      const shapeOf = (sh) => {
        if (sh.type === 'box') return planck.Box(Math.max(sh.w / 2 - skin, 1e-4), Math.max(sh.h / 2 - skin, 1e-4));
        if (sh.type === 'polygon') {               // exploratory core grains: vertices shrunk radially by the skin
          return planck.Polygon(sh.vertices.map(([x, y]) => { const r = Math.hypot(x, y), k = Math.max(r - skin, 0.5 * r) / r; return planck.Vec2(x * k, y * k); }));
        }
        return planck.Edge(planck.Vec2(sh.x0, sh.y0), planck.Vec2(sh.x1, sh.y1));
      };
      for (const s of scene.statics) {
        const b = world.createBody({ type: 'static', position: planck.Vec2(s.x || 0, s.y || 0), angle: s.phi || 0 });
        b.createFixture(shapeOf(s.shape), { friction: 0, restitution: 0, userData: s.material });
      }
      for (const d of scene.bodies) {
        const b = world.createBody({ type: 'dynamic', position: planck.Vec2(d.x, d.y), angle: d.phi || 0,
                                     linearDamping: airDrag, angularDamping: airDrag, bullet: false });
        b.createFixture(shapeOf(d.shape), { density: d.density, friction: 0, restitution: 0, userData: d.material });
        // exact rigid-box mass properties (the shrunk core would otherwise reduce mass and inertia)
        if (d.shape.type === 'polygon') b.setMassData({ mass: d.shape.mass, center: planck.Vec2(0, 0), I: d.shape.inertia });
        else {
          const m = d.density * d.shape.w * d.shape.h;
          b.setMassData({ mass: m, center: planck.Vec2(0, 0), I: m * (d.shape.w * d.shape.w + d.shape.h * d.shape.h) / 12 });
        }
        b.setLinearVelocity(planck.Vec2(d.vx || 0, d.vy || 0));
        b.setAngularVelocity(d.omega || 0);
        dyn.set(d.id, b);
      }
    },
    async advance(n) { for (let i = 0; i < n; i++) world.step(dt, settings.velocityIterations, settings.positionIterations); },
    async state() {
      const out = [];
      for (const [id, b] of dyn) {
        const p = b.getPosition(), v = b.getLinearVelocity();
        out.push({ id, x: p.x, y: p.y, phi: b.getAngle(), vx: v.x, vy: v.y, omega: b.getAngularVelocity() });
      }
      return out;
    },
    async dispose() { world = null; dyn.clear(); },
  };
}

module.exports = { createPlanckEngine };
