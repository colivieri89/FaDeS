// The app computes the same bits on every platform and runtime: four complete runs with the deterministic math
// functions, compared exactly with the values computed when this test was written (Node.js and Electron on macOS).
// The GitHub workflow runs this test on Windows, macOS and Linux.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../src/sim/detmath').install();
const W = require('../src/analyses/walls');
const { execute } = require('../src/runner/jobs');

const GOLDEN = [[{ H: 5, t: 0.30 }, 1, 62, 5.029629490527355, 5.168048213665053, 0.6], [{ H: 7.5, t: 0.60 }, 3, 187, 7.491652060433258, 8.178287097443725, 1.45],
                [{ H: 5, t: 1.20, bx: 0.40, by: 0.20 }, 2, 71, 5.688070660647914, 6.883702186217943, 2.65],
                [{ mechanism: 'partial', H: 6, Hr: 4, t: 0.60 }, 4, 101, 4.825026492564673, 7.173111437697201, 3.1]];
for (const [spec, seed, nBlocks, p95, Lmax, tStop] of GOLDEN) {
  const w = W.wall(spec);
  test(`H ${w.H} m${w.Hr ? `, Hr ${w.Hr} m` : ''}, t ${w.t} m, blocks ${w.bx} x ${w.by} m, seed ${seed} gives the reference bits`, async () => {
    const r = await execute({ kind: 'run', id: w.id, tag: { wall: w.id, seed }, params: W.wallParams(w, seed) });
    assert.deepStrictEqual([r.nBlocks, r.p.p95.mass, r.Lmax, r.tStop], [nBlocks, p95, Lmax, tStop]);
  });
}
