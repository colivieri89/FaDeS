// With Node.js on Apple Silicon and the runtime's own math functions, the simulator reproduces the stored runs of the
// paper bit for bit (the paper's runs were computed with Node.js 24 on Apple Silicon). Skipped on other platforms:
// there the last bit of sin, cos, atan2 and log differs (see src/sim/detmath.js and test/reproducibility.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const C = require('../src/analyses/campaigns');
const { execute } = require('../src/runner/jobs');
const REF = require(path.join(__dirname, '..', 'reference', 'campaign_runs.json')).runs;
const BRK = require(path.join(__dirname, '..', 'reference', 'breakup_p95.json')).rows;
const reference = process.platform === 'darwin' && process.arch === 'arm64' && !process.versions.electron && /^v24\./.test(process.version);
const skip = !reference && 'needs Node.js 24 on Apple Silicon (the runtime of the paper)';

const SAMPLE = [['C1', 2.5, 0.30, 1], ['C1', 5, 1.20, 7], ['C2', 2.5, 0.60, 3], ['C2', 5, 0.90, 20], ['C3', 6, 0.30, 2], ['C4', 6, 1.20, 11]];
for (const [c, H, t, s] of SAMPLE) {
  test(`run ${C.configId(c, H, t)} seed ${s} equals the stored run bit for bit`, { skip }, async () => {
    const cfg = C.configurations([c]).find(x => x.H === H && x.t === t);
    const r = await execute(C.runJob(cfg, s));
    const ref = REF.find(x => x.campaign === c && x.H === H && x.t === t && x.seed === s);
    for (const [a, b, k] of [[r.nBlocks, ref.nBlocks, 'nBlocks'], [r.p.p95.mass, ref.p95m, 'P95'], [r.p.p50.mass, ref.p50m, 'P50'],
                             [r.Lmax, ref.Lmax, 'Lmax'], [r.rigid.thetaBreak, ref.thetaBreak, 'theta'], [r.rigid.KE, ref.KE, 'KE']]) assert.strictEqual(a, b, k);
  });
}
test('break-up measure equals the stored values bit for bit (C1 and C2, seed 1)', { skip }, async () => {
  for (const cfg of C.configurations(['C1', 'C2'])) {
    const j = C.runJob(cfg, 1); j.kind = 'breakup';
    const r = await execute(j), ref = BRK.find(b => b.id === cfg.id && b.seed === 1);
    assert.strictEqual(r.p95mBreak, ref.p95mBreak, cfg.id); assert.strictEqual(r.LmaxBreak, ref.LmaxBreak, cfg.id);
  }
});
