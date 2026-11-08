// Sects. 3 and 4 of the paper for any wall: the checks of the rigid phase against the closed form, the integrity of the
// falling panel against the paper's stored results, and the summary of the paper's walls. Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../src/sim/detmath').install();
const IS = require('../src/analyses/integrity/study');
const SEC = require('../src/analyses/integrity/sections');
const S = require('../src/analyses/study');
const { parseCSV } = require('../src/analyses/csv');

test('rigid phase: the slip angle of the program is that of the closed form, for the paper\'s walls and for others', () => {
  const ref = IS.paperRigid();
  assert.strictEqual(ref.walls.length, 5);
  for (const w of ref.walls) assert.ok(Math.abs(w.diff) < 1e-9 && w.drift < 1e-12 && w.landing < 1e-12, `H ${w.H} t ${w.t}`);
  assert.ok(ref.twoBlock.V1_pass && ref.twoBlock.V2_pass && ref.twoBlock.V3_pass);
  assert.ok(ref.rod.maxRelErr < 1e-9);
  // a wall that is not the paper's, with another friction
  const w = IS.rigidCheck({ H: 8, t: 0.5, mu: 0.6 });
  assert.ok(w.slipCode > 50 && w.slipCode < 60, `slip ${w.slipCode}`);
  assert.ok(Math.abs(w.slipCode - w.slipClosedForm) < 1e-9);
  assert.ok(w.drift < 1e-12 && w.landing < 1e-12 && w.slideResidual < 1e-8);
  // the closed form: at the slip angle the friction demand equals mu
  const beta = Math.atan(0.5 / 8) * 180 / Math.PI, q = IS.toeClosedForm((w.slipClosedForm - beta) * Math.PI / 180, 0.5 * Math.PI / 180);
  assert.ok(Math.abs(Math.abs(q.T) / q.N - 0.6) < 1e-9);
  // lower friction, earlier slip
  assert.ok(IS.slipClosedForm(0.5, 8, 0.5) < IS.slipClosedForm(0.5, 8, 0.6));
});

test('integrity: a wall of the paper is computed as in its stored results', () => {
  const cfg = SEC.configs(['C1']).find(c => c.id === 'C1_H2.5_t0.60');
  const r = IS.integrityRecord(cfg, []);                      // no tensile strength (the stored strengths are compared below)
  const ref = IS.reference().integrity.rows.find(q => q.id === cfg.id);
  assert.strictEqual(r.fc['0'].end, ref.fc['0'].end);
  assert.strictEqual(r.b2.end, ref.b2.end);
  assert.ok(Math.abs(r.fc['0'].thetaOnset - ref.fc['0'].thetaOnset) < 1e-9);
  assert.ok(Math.abs(r.firstViolation.theta - ref.firstViolation.theta) < 1e-9);
  assert.strictEqual(r.slideBeforeHinge, ref.slideBeforeHinge);
  const p = IS.plan({ campaigns: [], walls: [cfg], fts: [] });
  const t = IS.summarize(p, [Object.assign({ campaign: 'C1' }, r)]).totals;
  assert.strictEqual(t.nCompared, 1);
  assert.ok(t.maxRelDiff < 1e-9, `largest difference ${t.maxRelDiff}`);
});

test('integrity: the summary of the stored results gives the paper\'s numbers for C1-C2', () => {
  const s = IS.paperSummary(), T = s.totals;
  assert.strictEqual(T.n, 48);
  assert.strictEqual(T.nHinge, 48);
  assert.deepStrictEqual([+T.thetaRange[0].toFixed(1), +T.thetaRange[1].toFixed(1)], [13.6, 63.8]);
  assert.deepStrictEqual(T.sRange, [0.6, 0.98]);
  assert.strictEqual(T.nLowerSlide, 4);
  assert.strictEqual(T.nUpperSlide, 12);
  assert.deepStrictEqual(T.survElastic, { '0.04MPa': 2, '0.10MPa': 6 });
  assert.deepStrictEqual(T.survPlastic, { '0.04MPa': 6, '0.10MPa': 14 });
  assert.deepStrictEqual(T.groundElastic, { '0.04MPa': 4, '0.10MPa': 10 });
  assert.deepStrictEqual(T.groundPlastic, { '0.04MPa': 8, '0.10MPa': 20 });
  assert.strictEqual(T.marginMaxElastic.toFixed(2), '0.14');
  assert.strictEqual(T.marginMaxPlastic.toFixed(1), '1.7');
  assert.strictEqual(T.nSlideFirst, 12);
  assert.ok(s.rows.every(r => r.wall && r.wall.id === r.id));
  assert.ok(IS.toCSV(s).split('\n')[0].includes('elastic_0.04MPa_deg'));
});

test('integrity: walls from a grid or a CSV file, total collapse only', () => {
  const g = IS.plan({ campaigns: [], grid: { heights: [6, 9], thicknesses: [0.45], mu: 0.6, rho: 1700, diatoneStep: 0 }, fts: [0.2, 0.05, 0.05] });
  assert.deepStrictEqual(g.configs.map(c => c.id), ['H6_t0.45', 'H9_t0.45']);
  assert.deepStrictEqual(g.options.fts, [0.05, 0.2]);
  assert.strictEqual(g.jobs[0].params.cfg.mu, 0.6);
  assert.deepStrictEqual(SEC.materials(g.configs[0]), { mu: 0.6, rho: 1700, diatones: { on: false, step: 2, h: 0.2 } });
  assert.deepStrictEqual(SEC.materials({ id: 'C1_H5_t0.30', H: 5, t: 0.3 }), {});   // the paper's walls: the campaigns' values
  const csv = S.wallsFromRows(parseCSV('id,mechanism,H_m,t_m,Hr_m,mu\nA,T,9,0.6,,0.7\nB,P,12,0.45,4,\n'));
  const c = IS.plan({ campaigns: [], walls: csv });
  assert.deepStrictEqual(c.configs.map(x => [x.id, x.mu]), [['A', 0.7]]);       // the partial collapse is left out
  assert.throws(() => IS.plan({ campaigns: [], walls: [{ id: 'x', H: 2, t: 3 }] }), /t < H/);
  assert.throws(() => IS.plan({ campaigns: [], walls: [] }), /no total-collapse wall/);
  assert.ok(IS.estimate(g, 4).wall_s > 0);
});
