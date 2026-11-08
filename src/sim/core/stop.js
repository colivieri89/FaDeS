// Physical stopping criterion: the debris is at rest when, for at least `hold` seconds of simulated
// time, (i) the total kinetic energy is below keRel times the kinetic energy at break-up and (ii) the
// largest block velocity (centroid speed + |omega| * half-diagonal) is below vMax. The run is capped
// at tCap; hitting the cap is reported, never hidden.
'use strict';

function kinematics(blocks, states, g = 9.81) {
  const byId = new Map(states.map(s => [s.id, s]));
  let KE = 0, PE = 0, vMax = 0, vCentroidMax = 0;
  for (const b of blocks) {
    const s = byId.get(b.id);
    const v2 = s.vx * s.vx + s.vy * s.vy;
    KE += 0.5 * b.mass * v2 + 0.5 * b.inertia * s.omega * s.omega;
    PE += b.mass * g * s.y;
    vMax = Math.max(vMax, Math.sqrt(v2) + Math.abs(s.omega) * 0.5 * Math.hypot(b.w, b.h));
    vCentroidMax = Math.max(vCentroidMax, Math.sqrt(v2));
  }
  return { KE, PE, E: KE + PE, vMax, vCentroidMax };
}

// Energy-budget monitor of the debris phase: with gravity, friction and inelastic contacts the total
// mechanical energy cannot increase, and no block centroid can exceed the speed bound
// sqrt(v0max^2 + 2 g (y0max - yGround)). Violations reveal numerical energy creation (e.g. ejections).
function makeEnergyMonitor(blocks, states0, g = 9.81) {
  const k0 = kinematics(blocks, states0, g);
  const M = blocks.reduce((s, b) => s + b.mass, 0);
  const yTop = Math.max(...states0.map(s => s.y)), v0 = Math.max(...states0.map(s => Math.hypot(s.vx, s.vy)));
  const vBound = Math.sqrt(v0 * v0 + 2 * g * Math.max(0, yTop));
  let maxGain = 0, vPeak = 0;
  return {
    update(kin) { maxGain = Math.max(maxGain, kin.E - k0.E); vPeak = Math.max(vPeak, kin.vCentroidMax); },
    report: () => ({ E0_J_per_m: k0.E, maxEnergyGain_J_per_m: maxGain, maxEnergyGainRel: maxGain / Math.max(1e-9, M * g * Math.max(yTop, 0.1)),
                     vCentroidPeak_m_s: vPeak, vBound_m_s: vBound, vPeakOverBound: vPeak / vBound }),
  };
}

function makeStopper(cfg, KEref) {
  let restSince = null;
  return function update(tNow, kin) {
    const atRest = kin.KE <= cfg.keRel * KEref && kin.vMax <= cfg.vMax;
    if (atRest) { if (restSince === null) restSince = tNow; } else restSince = null;
    if (restSince !== null && tNow - restSince >= cfg.hold - 1e-12) return { stop: true, reason: 'rest', tRestStart: restSince };
    if (tNow >= cfg.tCap - 1e-12) return { stop: true, reason: 'timeCap', tRestStart: restSince };
    return { stop: false };
  };
}

module.exports = { kinematics, makeStopper, makeEnergyMonitor };
