// The app computes the same bits on every platform and runtime: four complete runs with the deterministic math
// functions, compared exactly with the values computed when this test was written (Node.js and Electron on macOS).
// The GitHub workflow runs this test on Windows, macOS and Linux.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../src/sim/detmath').install();
const C = require('../src/analyses/campaigns');
const { execute } = require('../src/runner/jobs');

const GOLDEN = [["C1_H5_t0.30", 1, 62, 5.029629490527355, 5.168048213665053, 0.6], ["C1_H7.5_t0.60", 3, 187, 7.491652060433258, 8.178287097443725, 1.45],
                ["C2_H5_t1.20", 2, 71, 5.688070660647914, 6.883702186217943, 2.65], ["C3_H6_t0.60", 4, 101, 4.825026492564673, 7.173111437697201, 3.1]];
for (const [id, seed, nBlocks, p95, Lmax, tStop] of GOLDEN) {
  test(`${id} seed ${seed} gives the reference bits`, async () => {
    const cfg = C.configurations(['C1', 'C2', 'C3', 'C4']).find(x => x.id === id);
    const r = await execute(C.runJob(cfg, seed));
    assert.deepStrictEqual([r.nBlocks, r.p.p95.mass, r.Lmax, r.tStop], [nBlocks, p95, Lmax, tStop]);
  });
}
