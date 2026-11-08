// The app's simulator (with the deterministic math functions it uses on every platform) reproduces the paper's runs of
// the worked examples: the break-up measure to 1e-12, one run of each example within 1 % on P95 and 3 % on Lmax (most
// runs are identical to the last digit). Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../src/sim/detmath').install();
const EX = require('../src/analyses/examples');
const { execute } = require('../src/runner/jobs');
const rel = (a, b) => Math.abs(a / b - 1);

const SAMPLE = [['total-small-blocks', 19], ['total-large-blocks', 3], ['partial-upper-two-thirds', 7], ['partial-upper-third', 11]];
for (const [id, s] of SAMPLE) {
  test(`example ${id}, seed ${s}: the run reproduces the paper's`, async () => {
    const r = await execute({ kind: 'run', id, tag: { wall: id, seed: s }, params: EX.params(EX.get(id), s) });
    const ref = EX.run(id, s);
    assert.strictEqual(r.nBlocks, ref.nBlocks);
    assert.ok(rel(r.rigid.KE, ref.KE) < 1e-12, 'kinetic energy at impact');
    assert.ok(rel(r.p.p95.mass, ref.p95m) < 0.01, `P95 ${r.p.p95.mass} vs ${ref.p95m}`);
    assert.ok(rel(r.Lmax, ref.Lmax) < 0.03, `Lmax ${r.Lmax} vs ${ref.Lmax}`);
  });
}
test('the break-up measure of the examples in total collapse reproduces the paper\'s (seeds 1-20)', async () => {
  for (const x of EX.all().filter(e => e.wall.mechanism === 'total')) for (const ref of x.runs) {
    const r = await execute({ kind: 'breakup', id: x.id, tag: { wall: x.id, seed: ref.seed }, params: EX.params(x, ref.seed) });
    assert.ok(rel(r.p95mBreak, ref.p95mBreak) < 1e-12, `${x.id} seed ${ref.seed}`); assert.ok(rel(r.LmaxBreak, ref.LmaxBreak) < 1e-12, `${x.id} seed ${ref.seed}`);
  }
});
