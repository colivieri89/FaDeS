// Sects. 3 and 4 of the paper for any wall: the checks of the rigid phase against the closed form, the integrity of the
// falling panel against the paper's results for the examples, and the summary of those results. Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('../src/sim/detmath').install();
const IS = require('../src/analyses/integrity/study');
const SEC = require('../src/analyses/integrity/sections');
const S = require('../src/analyses/study');
const EX = require('../src/analyses/examples');
const { parseCSV } = require('../src/analyses/csv');

test('rigid phase: the slip angle of the program is that of the closed form, for the examples and for other walls', () => {
  const ref = IS.exampleRigid();
  assert.deepStrictEqual(ref.walls.map(w => w.example), ['total-small-blocks', 'total-large-blocks']);
  for (const w of ref.walls) assert.ok(Math.abs(w.diff) < 1e-9 && w.drift < 1e-12 && w.landing < 1e-12 && w.slides && w.slideResidual < 1e-8, `H ${w.H} t ${w.t}`);
  assert.ok(ref.twoBlock.V1_pass && ref.twoBlock.V2_pass && ref.twoBlock.V3_pass);
  assert.strictEqual(ref.twoBlock.V1_n, 2);
  assert.ok(ref.rod.maxRelErr < 1e-9);
  // the program on an example: the paper's slip angle
  const e = IS.rigidCheck({ H: 5, t: 1.2 });
  assert.strictEqual(e.example, 'total-large-blocks');
  assert.ok(Math.abs(e.slipCode - ref.walls[1].slipCode) < 1e-9);
  // a wall that is not an example, with another friction
  const w = IS.rigidCheck({ H: 8, t: 0.5, mu: 0.6 });
  assert.strictEqual(w.example, null);
  assert.ok(w.slipCode > 50 && w.slipCode < 60, `slip ${w.slipCode}`);
  assert.ok(Math.abs(w.slipCode - w.slipClosedForm) < 1e-9);
  assert.ok(w.drift < 1e-12 && w.landing < 1e-12 && w.slideResidual < 1e-8);
  // the closed form: at the slip angle the friction demand equals mu
  const beta = Math.atan(0.5 / 8) * 180 / Math.PI, q = IS.toeClosedForm((w.slipClosedForm - beta) * Math.PI / 180, 0.5 * Math.PI / 180);
  assert.ok(Math.abs(Math.abs(q.T) / q.N - 0.6) < 1e-9);
  // lower friction, earlier slip
  assert.ok(IS.slipClosedForm(0.5, 8, 0.5) < IS.slipClosedForm(0.5, 8, 0.6));
});

test('integrity: an example is computed as in the paper\'s results for it', () => {
  const cfg = IS.wallsOf({ examples: ['total-large-blocks'] })[0];
  const r = IS.integrityRecord(cfg, []);                      // no tensile strength (the stored strengths are compared below)
  const ref = EX.get('total-large-blocks').integrity;
  assert.strictEqual(r.fc['0'].end, ref.fc['0'].end);
  assert.strictEqual(r.b2.end, ref.b2.end);
  assert.ok(Math.abs(r.fc['0'].thetaOnset - ref.fc['0'].thetaOnset) < 1e-9);
  assert.ok(Math.abs(r.firstViolation.theta - ref.firstViolation.theta) < 1e-9);
  assert.strictEqual(r.slideBeforeHinge, ref.slideBeforeHinge);
  const p = IS.plan({ examples: ['total-large-blocks'], fts: [] });
  const s = IS.summarize(p, [r]);
  assert.strictEqual(s.rows[0].example, 'total-large-blocks');
  assert.strictEqual(s.totals.nCompared, 1);
  assert.ok(s.totals.maxRelDiff < 1e-9, `largest difference ${s.totals.maxRelDiff}`);
  // the same wall given by its geometry is recognised as the example; another density is not
  assert.strictEqual(IS.exampleOf({ id: 'w', H: 5, t: 1.2, bx: 0.4, by: 0.2 }).id, 'total-large-blocks');
  assert.strictEqual(IS.exampleOf({ id: 'w', H: 5, t: 1.2, bx: 0.4, by: 0.2, rho: 1800 }), null);
});

test('integrity: the summary of the paper\'s results for the examples', () => {
  const s = IS.exampleSummary(), T = s.totals;
  assert.strictEqual(T.n, 2);
  assert.strictEqual(T.nHinge, 2);
  assert.deepStrictEqual([+T.thetaRange[0].toFixed(1), +T.thetaRange[1].toFixed(1)], [30.4, 52.1]);
  assert.deepStrictEqual(T.sRange, [0.62, 0.8]);
  assert.strictEqual(T.nLower, 2);
  assert.strictEqual(T.nUpper, 1);
  assert.strictEqual(T.nUpperSlide, 1);
  assert.deepStrictEqual(T.survPlastic, { '0.04MPa': 0, '0.10MPa': 1 });
  assert.deepStrictEqual(T.groundElastic, { '0.04MPa': 0, '0.10MPa': 1 });
  assert.strictEqual(T.nSlideFirst, 1);
  assert.strictEqual(T.nCompared, 0);
  assert.ok(s.rows.every(r => r.wall && r.wall.id === r.id && r.example === r.id));
  assert.ok(IS.toCSV(s).split('\n')[0].includes('elastic_0.04MPa_deg'));
});

test('integrity: walls from a grid or a CSV file, total collapse only', () => {
  const g = IS.plan({ grid: { heights: [6, 9], thicknesses: [0.45], mu: 0.6, rho: 1700, diatoneStep: 0 }, fts: [0.2, 0.05, 0.05] });
  assert.deepStrictEqual(g.configs.map(c => c.id), ['H6_t0.45', 'H9_t0.45']);
  assert.deepStrictEqual(g.options.fts, [0.05, 0.2]);
  assert.strictEqual(g.jobs[0].params.cfg.mu, 0.6);
  assert.deepStrictEqual(SEC.materials(g.configs[0]), { mu: 0.6, rho: 1700, diatones: { on: false, step: 2, h: 0.2 } });
  assert.deepStrictEqual(SEC.materials({ id: 'w', H: 5, t: 0.3 }), {});   // nothing given: the default values
  const csv = S.wallsFromRows(parseCSV('id,mechanism,H_m,t_m,Hr_m,mu\nA,T,9,0.6,,0.7\nB,P,12,0.45,4,\n'));
  const c = IS.plan({ walls: csv });
  assert.deepStrictEqual(c.configs.map(x => [x.id, x.mu]), [['A', 0.7]]);       // the partial collapse is left out
  assert.throws(() => IS.plan({ walls: [{ id: 'x', H: 2, t: 3 }] }), /t < H/);
  assert.throws(() => IS.plan({ examples: [], walls: [] }), /no total-collapse wall/);
  assert.deepStrictEqual(IS.plan({}).configs.map(x => x.id), ['total-small-blocks', 'total-large-blocks']);   // default: the examples
  assert.deepStrictEqual(IS.plan({ examples: ['partial-upper-third', 'total-large-blocks'] }).configs.map(x => x.id), ['total-large-blocks']);
  assert.ok(IS.estimate(g, 4).wall_s > 0);
});
