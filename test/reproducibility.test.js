// The app's simulator (with the deterministic math functions it uses on every platform) reproduces the stored runs of
// the paper: the break-up measure to 1e-12, every run of the sample within 1 % on P95 and 3 % on Lmax (most runs are
// identical to the last digit). Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('../src/sim/detmath').install();
const C = require('../src/analyses/campaigns');
const { execute } = require('../src/runner/jobs');
const REF = require(path.join(__dirname, '..', 'reference', 'campaign_runs.json')).runs;
const BRK = require(path.join(__dirname, '..', 'reference', 'breakup_p95.json')).rows;
const rel = (a, b) => Math.abs(a / b - 1);

const SAMPLE = [['C1', 2.5, 0.30, 1], ['C1', 5, 1.20, 7], ['C2', 2.5, 0.60, 3], ['C2', 5, 0.90, 20], ['C3', 6, 0.30, 2], ['C4', 6, 1.20, 11]];
for (const [c, H, t, s] of SAMPLE) {
  test(`run ${C.configId(c, H, t)} seed ${s} reproduces the stored run`, async () => {
    const cfg = C.configurations([c]).find(x => x.H === H && x.t === t);
    const r = await execute(C.runJob(cfg, s));
    const ref = REF.find(x => x.campaign === c && x.H === H && x.t === t && x.seed === s);
    assert.strictEqual(r.nBlocks, ref.nBlocks);
    assert.ok(rel(r.rigid.KE, ref.KE) < 1e-12, 'kinetic energy at impact');
    assert.ok(rel(r.p.p95.mass, ref.p95m) < 0.01, `P95 ${r.p.p95.mass} vs ${ref.p95m}`);
    assert.ok(rel(r.Lmax, ref.Lmax) < 0.03, `Lmax ${r.Lmax} vs ${ref.Lmax}`);
  });
}
test('break-up measure reproduces the stored values (all C1 and C2 configurations, seeds 1-3)', async () => {
  for (const cfg of C.configurations(['C1', 'C2'])) for (const s of [1, 2, 3]) {
    const j = C.runJob(cfg, s); j.kind = 'breakup';
    const r = await execute(j), ref = BRK.find(b => b.id === cfg.id && b.seed === s);
    assert.ok(rel(r.p95mBreak, ref.p95mBreak) < 1e-12, cfg.id); assert.ok(rel(r.LmaxBreak, ref.LmaxBreak) < 1e-12, cfg.id);
  }
});
