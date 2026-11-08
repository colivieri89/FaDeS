// Default values of the analyses (those of the paper, Sect. 2.5): materials and contacts, run-to-run variability and
// seeds. A wall takes them for every parameter it does not give.
'use strict';

// seeds 1-20: each seed draws the start perturbation, the friction coefficients and the block cuts
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
// materials and contacts: friction block-block and block-street, density [kg/m3], restitution, diatone courses [m]
const MATERIALS = { mu: 0.75, muG: 0.75, rho: 1900, e: 0.02, diatones: { on: true, step: 2.0, h: 0.20 } };
// run-to-run variability: start angle sd 0.2 deg, block size sd 10 %, friction sd 5 %
const VARIABILITY = { sdThetaDeg: 0.2, sdBlockRel: 0.10, sdMuRel: 0.05 };
// no variability: one deterministic run per wall
const NOMINAL = { sdThetaDeg: 0, sdBlockRel: 0, sdMuRel: 0 };

// cost proxy used to start the largest runs first (better load balance)
const jobSize = (j) => (j.params.Hr || j.params.H) * j.params.t / ((j.params.bx || 0.15) * (j.params.by || 0.15));

module.exports = { SEEDS, MATERIALS, VARIABILITY, NOMINAL, jobSize };
