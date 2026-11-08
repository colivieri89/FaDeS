// With Node.js on Apple Silicon and the runtime's own math functions, the simulator reproduces the paper's runs of the
// worked examples bit for bit (the paper's runs were computed with Node.js 24 on Apple Silicon). Skipped on other
// platforms: there the last bit of sin, cos, atan2 and log differs (see src/sim/detmath.js and
// test/reproducibility.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const EX = require('../src/analyses/examples');
const { execute } = require('../src/runner/jobs');
const reference = process.platform === 'darwin' && process.arch === 'arm64' && !process.versions.electron && /^v24\./.test(process.version);
const skip = !reference && 'needs Node.js 24 on Apple Silicon (the runtime of the paper)';

const SAMPLE = [['total-small-blocks', 19], ['total-large-blocks', 3], ['total-large-blocks', 20], ['partial-upper-two-thirds', 7], ['partial-upper-third', 11]];
for (const [id, s] of SAMPLE) {
  test(`example ${id}, seed ${s}: the run equals the paper's bit for bit`, { skip }, async () => {
    const r = await execute({ kind: 'run', id, tag: { wall: id, seed: s }, params: EX.params(EX.get(id), s) });
    const ref = EX.run(id, s);
    for (const [a, b, k] of [[r.nBlocks, ref.nBlocks, 'nBlocks'], [r.p.p95.mass, ref.p95m, 'P95'], [r.p.p50.mass, ref.p50m, 'P50'],
                             [r.Lmax, ref.Lmax, 'Lmax'], [r.rigid.thetaBreak, ref.thetaBreak, 'theta'], [r.rigid.KE, ref.KE, 'KE']]) assert.strictEqual(a, b, k);
  });
}
test('the break-up measure of the examples in total collapse equals the paper\'s bit for bit (seeds 1-20)', { skip }, async () => {
  for (const x of EX.all().filter(e => e.wall.mechanism === 'total')) for (const ref of x.runs) {
    const r = await execute({ kind: 'breakup', id: x.id, tag: { wall: x.id, seed: ref.seed }, params: EX.params(x, ref.seed) });
    assert.strictEqual(r.p95mBreak, ref.p95mBreak, `${x.id} seed ${ref.seed}`); assert.strictEqual(r.LmaxBreak, ref.LmaxBreak, `${x.id} seed ${ref.seed}`);
  }
});
