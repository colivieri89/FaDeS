// Parametric campaigns of the paper (Sect. 5 and 6): the configurations, the seeds and the parameters of every run.
// C1 and C2 are the total-collapse campaigns (Hr = H); C3 and C4 are partial collapses with Hr = 2/3 H and 1/3 H.
'use strict';

// seeds 1-20 of the paper: each seed draws the start perturbation, the friction coefficients and the block cuts
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
// material and contact parameters of every campaign run (Sect. 2.5)
const PAPER_PARAMS = { mu: 0.75, muG: 0.75, rho: 1900, e: 0.02, diatones: { on: true, step: 2.0, h: 0.20 } };
// run-to-run variability (Sect. 2.5): start angle sd 0.2 deg, block size sd 10 %, friction sd 5 %
const VARIABILITY = { sdThetaDeg: 0.2, sdBlockRel: 0.10, sdMuRel: 0.05 };
const THICKNESSES = [0.30, 0.60, 0.90, 1.20];
const CAMPAIGNS = [
  { id: 'C1', mech: 'T', bx: 0.15, by: 0.15, H: [2.5, 5, 7.5, 10, 12.5, 15], label: 'C1, blocks 0.15 × 0.15 m' },
  { id: 'C2', mech: 'T', bx: 0.40, by: 0.20, H: [2.5, 5, 7.5, 10, 12.5, 15], label: 'C2, blocks 0.40 × 0.20 m' },
  { id: 'C3', mech: 'P2', bx: 0.15, by: 0.15, H: [6, 7, 8, 9, 10, 12], label: 'C3, partial, Hr = 2/3 H' },
  { id: 'C4', mech: 'P1', bx: 0.15, by: 0.15, H: [6, 7, 8, 9, 10, 12], label: 'C4, partial, Hr = 1/3 H' },
];

function geometryParams(mech, H, t, Hr = null) {
  if (mech === 'T') return { H, t, mechanism: 'total' };
  const hr = Hr != null ? Hr : (mech === 'P2' ? 2 / 3 * H : 1 / 3 * H);
  return { H, Hr: hr, t, mechanism: 'partial' };
}
const runParams = (geo, blocks, seed, extra = {}) => Object.assign({}, PAPER_PARAMS, geo, blocks,
  { variability: Object.assign({ seed }, VARIABILITY) }, extra);

const configId = (campaign, H, t) => `${campaign}_H${H}_t${Number(t).toFixed(2)}`;

// every configuration of the given campaigns, in the order of the paper's tables
function configurations(ids = ['C1', 'C2']) {
  const out = [];
  for (const c of CAMPAIGNS.filter(c => ids.includes(c.id))) for (const t of THICKNESSES) for (const H of c.H)
    out.push({ id: configId(c.id, H, t), campaign: c.id, mech: c.mech, H, t, bx: c.bx, by: c.by });
  return out;
}

// documented collapses loaded by the user (CSV, see reference/documented_cases_template.csv)
function caseConfigurations(cases, mech = 'T') {
  return cases.filter(c => c.mechanism === mech).map(c => ({ id: `case${c.id}`, campaign: 'case', case: c.id, mech: c.mechanism,
    H: c.H_m, t: c.t_m, Hr: c.mechanism === 'T' ? null : c.Hr_m, bx: 0.15, by: 0.15 }));
}

// one simulation job per configuration and seed; tag identifies the run, params are passed to runSimulation
function runJob(cfg, seed, extra = {}) {
  const tag = cfg.campaign === 'case'
    ? { case: cfg.case, mech: cfg.mech, H: cfg.H, t: cfg.t, Hr: cfg.Hr, seed, engine: 'planck' }
    : { campaign: cfg.campaign, mech: cfg.mech, t: cfg.t, H: cfg.H, seed, engine: 'planck' };
  return { kind: 'run', id: cfg.id, tag,
           params: runParams(geometryParams(cfg.mech, cfg.H, cfg.t, cfg.Hr), { bx: cfg.bx, by: cfg.by }, seed, Object.assign({ engine: 'planck' }, extra)) };
}

// the campaign run that a set of parameters describes, if any: returns the configuration and the seed, so that a single
// run can be made with exactly the campaign's parameters and compared with the stored run of the paper
function campaignOf(P) {
  const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  const v = P.variability || {}, d = P.diatones || {};
  if (!SEEDS.includes(v.seed) || !Object.keys(VARIABILITY).every(k => near(v[k], VARIABILITY[k]))) return null;
  if (!['mu', 'muG', 'rho', 'e'].every(k => near(P[k], PAPER_PARAMS[k]))) return null;
  if (!d.on || !near(d.step, PAPER_PARAMS.diatones.step) || !near(d.h, PAPER_PARAMS.diatones.h)) return null;
  const t = THICKNESSES.find(x => near(P.t, x));
  if (t == null) return null;
  for (const c of CAMPAIGNS) {
    const H = c.H.find(x => near(P.H, x));
    if (H == null || !near(P.bx, c.bx) || !near(P.by, c.by)) continue;
    const total = c.mech === 'T';
    if (total !== (P.mechanism === 'total')) continue;
    if (!total && !near(P.Hr, (c.mech === 'P2' ? 2 / 3 : 1 / 3) * H)) continue;
    return { cfg: { id: configId(c.id, H, t), campaign: c.id, mech: c.mech, H, t, bx: c.bx, by: c.by }, seed: v.seed };
  }
  return null;
}

// cost proxy used to start the largest runs first (better load balance), as in the paper's batches
const jobSize = (j) => (j.params.Hr || j.params.H) * j.params.t / ((j.params.bx || 0.15) * (j.params.by || 0.15));

module.exports = { SEEDS, PAPER_PARAMS, VARIABILITY, THICKNESSES, CAMPAIGNS, geometryParams, runParams, configId, configurations,
                   caseConfigurations, runJob, campaignOf, jobSize };
