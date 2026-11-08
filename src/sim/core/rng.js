// Seeded pseudo-random numbers (mulberry32) for explicit, reproducible variability.
'use strict';

function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const uniform = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => { const u = 1 - uniform(), v = uniform(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  // normal truncated at +-k standard deviations (keeps perturbations physically bounded)
  const truncNormal = (sd, k = 2) => { if (!sd) return 0; for (;;) { const z = normal(); if (Math.abs(z) <= k) return sd * z; } };
  return { uniform, normal, truncNormal };
}

module.exports = { makeRng };
