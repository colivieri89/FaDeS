#!/usr/bin/env node
// Command line: the same studies as the app, without the interface.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runJobs, defaultWorkers } = require('../runner/pool');
const C = require('../analyses/campaigns');
const TOTAL = require('../analyses/total_collapse');
const STUDY = require('../analyses/study');
const { parseCSV } = require('../analyses/csv');
const { parseSeeds } = require('../analyses/stats');
const { readCases } = require('../analyses/csv');
const { MODEL_VERSION } = require('../sim/version');

const HELP = `FaDeS (Façade Debris Simulator), command line

  node src/cli/cli.js run [wall] [--seed 1]     one wall
  node src/cli/cli.js study [walls] [options]   many walls, each with many seeds
      walls: --walls walls.csv                  one wall per row (template: reference/walls_template.csv)
         or  --H 6,9,12 --t 0.45,0.60 [wall]    every combination of the heights and thicknesses
         or  --campaigns C1,C3                  the configurations of the paper's campaigns (C1-C4)
      --seeds 1-20           seeds (list or ranges)
      --W 6                  street width [m]: width left free, seeds whose debris reaches W, heap height at W
  node src/cli/cli.js paper                     the values of Sect. 5 of the paper, from its stored runs
  node src/cli/cli.js total [options]           the total-collapse study of the paper (Sect. 5, Fig. 7)
      --campaigns C1,C2      --heights 2.5,5,...   --thicknesses 0.30,0.60,...
      --seeds 1-20           --cases walls.csv     (documented walls, columns id, mechanism, H_m, t_m)

  wall (the values of the paper's campaigns when not given)
      --H 10 --t 0.60        height and thickness [m]
      --mechanism total|partial  --Hr 4 or --Hr-ratio 0.333   overturning part of a partial collapse
      --bx 0.15 --by 0.15    block size [m]           --diatones 2   spacing of the diatone courses [m], 0 = none
      --mu 0.75 --muG 0.75   friction, block-block and block-street
      --e 0.02 --rho 1900    restitution, density [kg/m3]
  variability (default: that of the paper's campaigns)
      --nominal              no run-to-run variability (one deterministic run)
      --sd-theta 0.2 --sd-block 10 --sd-mu 5   sd of the start angle [deg], of the block joints [% of the block]
                             and of the friction [%]

  common options
      --workers N            parallel runs (default ${defaultWorkers()})
      --out DIR              where runs and summaries are written (default results)
      --native-math          use the Math functions of Node.js instead of the program's own; on Apple Silicon
                             with Node.js 24 this reproduces the stored runs of the paper bit for bit
`;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[k] = argv[++i]; else o[k] = true;
  }
  return o;
}
const list = (s, f = Number) => String(s).split(',').map(x => f(x.trim()));
const f = (v, d = 4) => Number.isFinite(v) ? v.toFixed(d) : '-';

function progressLine(p) {
  const eta = p.eta_s != null && p.done < p.total ? `, about ${Math.ceil(p.eta_s / 60)} min left` : '';
  process.stderr.write(`\r${p.done}/${p.total} jobs (${p.resumed} reused)${eta}      `);
}

function printSummary(s) {
  const rows = s.rows.map(r => [r.case ? `case${r.case}` : r.id, f(r.tOverH, 3), r.nSeeds, f(r.p95Break_H), f(r.p95Rest_H), f(r.inc_H), f(r.Lmax_H, 3),
    r.ref ? f(r.ref.p95Rest_H) : '']);
  const head = ['configuration', 't/H', 'seeds', 'P95/H brk', 'P95/H rest', 'incr/H', 'Lmax/H', 'paper P95/H'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = (r) => r.map((c, i) => i ? String(c).padStart(w[i]) : String(c).padEnd(w[i])).join('  ');
  console.log(line(head)); for (const r of rows) console.log(line(r));
  const T = s.totals;
  console.log(`\n${T.nConfigs} configuration${T.nConfigs === 1 ? '' : 's'}, ${T.nRest}/${T.nRuns} runs at rest; increment ${f(T.incRange_H[0])}-${f(T.incRange_H[1])} H, above 3 % of P95 in ${T.nAboveTolerance}`);
  if (T.nCompared) console.log(`compared with the paper: ${T.nIdentical}/${T.nCompared} runs identical; largest difference P95 ${T.maxAbsDeltaP95_pct.toPrecision(2)} %, Lmax ${T.maxAbsDeltaLmax_pct.toPrecision(2)} %`);
}

function toCSV(s) {
  const cols = ['id', 'campaign', 'case', 'H', 't', 'tOverH', 'nSeeds', 'p95Break_H', 'p95Rest_H', 'inc_H', 'Lmax_H'];
  return cols.concat(['paper_p95Rest_H', 'paper_Lmax_H']).join(',') + '\n' +
    s.rows.map(r => cols.map(c => r[c] == null ? '' : r[c]).concat([r.ref ? r.ref.p95Rest_H : '', r.ref ? r.ref.Lmax_H : '']).join(',')).join('\n') + '\n';
}

async function total(o) {
  const options = {};
  if (o.campaigns) options.campaigns = list(o.campaigns, String);
  if (o.heights) options.heights = list(o.heights);
  if (o.thicknesses) options.thicknesses = list(o.thicknesses);
  if (o.seeds) options.seeds = parseSeeds(o.seeds);
  if (o.cases) options.cases = readCases(fs.readFileSync(o.cases, 'utf8'));
  const p = TOTAL.plan(options);
  const out = path.resolve(o.out || 'results');
  const native = !!o['native-math'];
  const hash = crypto.createHash('sha1').update(JSON.stringify({ configs: p.configs.map(c => c.id), seeds: p.options.seeds, model: MODEL_VERSION, native })).digest('hex').slice(0, 12);
  const store = path.join(out, `total_${hash}.partial.jsonl`);
  const workers = +(o.workers || defaultWorkers());
  console.error(`${p.configs.length} configuration${p.configs.length === 1 ? '' : 's'}, ${p.options.seeds.length} seeds, ${workers} parallel runs${native ? ', native Math' : ''}; runs stored in ${store}`);
  const ev = runJobs(p.jobs, { workers, store, order: p.order, nativeMath: native });
  ev.on('progress', progressLine);
  ev.on('error', (e) => console.error('\n' + (e.stack || e)));
  process.on('SIGINT', () => { console.error('\nstopping; the finished runs are stored and will be reused'); ev.cancel(); });
  const results = await ev.done;
  process.stderr.write('\n');
  const s = TOTAL.summarize(p, results);
  printSummary(s);
  fs.writeFileSync(path.join(out, `total_${hash}.summary.json`), JSON.stringify(s, null, 1));
  fs.writeFileSync(path.join(out, `total_${hash}.summary.csv`), toCSV(s));
  console.error(`summary written to ${path.join(out, `total_${hash}.summary.{json,csv}`)}`);
}

// the wall described by the options (the values of the campaigns for what is not given)
function wallSpec(o) {
  const num = (k) => { if (o[k] == null) return undefined; const x = Number(o[k]); if (!Number.isFinite(x)) throw new Error(`--${k}: not a number`); return x; };
  const s = { mechanism: o.mechanism || 'total' };
  for (const [opt, key] of [['bx', 'bx'], ['by', 'by'], ['diatones', 'diatoneStep'], ['mu', 'mu'], ['muG', 'muG'], ['e', 'e'], ['rho', 'rho'], ['Hr', 'Hr'], ['Hr-ratio', 'HrRatio'], ['W', 'W']]) {
    const v = num(opt); if (v !== undefined) s[key] = v;
  }
  return s;
}
function variabilityOf(o) {
  if (o.nominal) return STUDY.NOMINAL;
  const v = Object.assign({}, C.VARIABILITY);
  if (o['sd-theta'] != null) v.sdThetaDeg = +o['sd-theta'];
  if (o['sd-block'] != null) v.sdBlockRel = +o['sd-block'] / 100;
  if (o['sd-mu'] != null) v.sdMuRel = +o['sd-mu'] / 100;
  return v;
}

async function single(o) {
  const spec = Object.assign(wallSpec(o), { id: 'wall', H: o.H != null ? +o.H : 10, t: o.t != null ? +o.t : 0.6 });
  if (spec.mechanism === 'partial' && spec.Hr == null && spec.HrRatio == null) spec.HrRatio = 2 / 3;
  const w = STUDY.wall(spec);
  const seed = o.seed != null ? +o.seed : 1;
  const P = STUDY.wallParams(w, seed, variabilityOf(o));
  const camp = C.campaignOf(P);
  const job = camp ? C.runJob(camp.cfg, camp.seed) : { kind: 'run', id: 'single', tag: { single: true }, params: P };
  const [r] = await runJobs([job], { workers: 1, nativeMath: !!o['native-math'] }).done;
  console.log(`P95 by mass ${r.p.p95.mass} m (${f(r.p.p95.mass / P.H, 4)} H), Lmax ${r.Lmax} m (${f(r.Lmax / P.H, 4)} H)`);
  console.log(`${r.nBlocks} blocks, ${r.stop === 'rest' ? `at rest after ${f(r.tStop, 2)} s` : 'stopped at the 60 s cap'}; rotation at impact ${f(r.rigid.thetaBreak, 2)} deg; run time ${f(r.runtime_s, 1)} s`);
  if (w.W != null) console.log(`street width ${w.W} m: ${r.p.p95.mass >= w.W ? 'P95 reaches it' : `${f(w.W - r.p.p95.mass, 3)} m free beyond P95`}${r.Lmax >= w.W ? ', the farthest block reaches it' : ''}; heap ${f(STUDY.heightAt(r.profile, w.W), 3)} m high at W`);
  if (camp) {
    const q = TOTAL.refRun(camp.cfg.campaign, camp.cfg.H, camp.cfg.t, camp.seed);
    if (q) console.log(`paper's run ${camp.cfg.id} seed ${camp.seed}: P95 ${q.p95m} m, Lmax ${q.Lmax} m -> ${q.p95m === r.p.p95.mass && q.Lmax === r.Lmax && q.nBlocks === r.nBlocks ? 'identical' : 'not identical'}`);
  }
}

function printStudy(s) {
  const street = s.rows.some(r => r.street), paper = s.totals.nCompared > 0;
  const head = ['wall', 'H', 't', 'seeds', 'P95 brk', 'P95 rest', 'P95 range', 'Lmax'].concat(street ? ['W', 'free', 'reach W'] : [], paper ? ['paper P95'] : []);
  const rows = s.rows.map(r => [r.id, f(r.H, 2), f(r.t, 2), r.nSeeds, f(r.p95Break, 3), f(r.p95, 3), `${f(r.p95Range[0], 3)}-${f(r.p95Range[1], 3)}`, f(r.Lmax, 3)]
    .concat(street ? [r.W != null ? f(r.W, 2) : '', r.street ? f(r.street.freeMedian, 3) : '', r.street ? `${r.street.nP95Reach}/${r.nSeeds}` : ''] : [], paper ? [r.paper ? f(r.paper.p95, 3) : ''] : []));
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = (r) => r.map((c, i) => i ? String(c).padStart(w[i]) : String(c).padEnd(w[i])).join('  ');
  console.log('distances in m from the street face of the façade; seed medians over the runs at rest');
  console.log(line(head)); for (const r of rows) console.log(line(r));
  const T = s.totals;
  console.log(`\n${T.nWalls} wall${T.nWalls === 1 ? '' : 's'}, ${T.nRest}/${T.nRuns} runs at rest` + (T.nTimeCap ? `, ${T.nTimeCap} at the 60 s cap (left out)` : ''));
  if (T.nStreet) console.log(`street reached by P95 in most seeds: ${T.nStreetReached} of ${T.nStreet} walls`);
  if (T.nCompared) console.log(`compared with the paper: ${T.nIdentical}/${T.nCompared} runs identical; largest difference P95 ${T.maxAbsDeltaP95_pct.toPrecision(2)} %, Lmax ${T.maxAbsDeltaLmax_pct.toPrecision(2)} %`);
}

async function study(o) {
  const options = { seeds: o.seeds ? parseSeeds(o.seeds) : C.SEEDS, variability: variabilityOf(o), W: o.W != null ? +o.W : null };
  if (o.nominal) options.seeds = [options.seeds[0]];
  const spec = wallSpec(o); delete spec.W;
  if (o.walls) options.walls = STUDY.wallsFromRows(parseCSV(fs.readFileSync(o.walls, 'utf8')));
  if (o.H != null || o.t != null) {
    if (o.H == null || o.t == null) throw new Error('a grid needs both --H and --t');
    if (spec.mechanism === 'partial' && spec.Hr == null && spec.HrRatio == null) throw new Error('a partial collapse needs --Hr or --Hr-ratio');
    options.grid = Object.assign(spec, { heights: list(o.H), thicknesses: list(o.t) });
  }
  if (o.campaigns) options.campaigns = list(o.campaigns, String);
  const p = STUDY.plan(options);
  const out = path.resolve(o.out || 'results');
  const native = !!o['native-math'];
  const hash = crypto.createHash('sha1').update(JSON.stringify({ configs: p.configs, seeds: p.options.seeds, variability: p.options.variability, model: MODEL_VERSION, native })).digest('hex').slice(0, 12);
  const store = path.join(out, `study_${hash}.partial.jsonl`);
  const workers = +(o.workers || defaultWorkers());
  const est = STUDY.estimate(p).cpu_s / workers;
  console.error(`${p.configs.length} wall${p.configs.length === 1 ? '' : 's'} × ${p.options.seeds.length} seed${p.options.seeds.length === 1 ? '' : 's'}, ${workers} parallel runs${native ? ', native Math' : ''}, roughly ${est < 120 ? `${Math.ceil(est)} s` : `${Math.ceil(est / 60)} min`}; runs stored in ${store}`);
  const ev = runJobs(p.jobs, { workers, store, order: p.order, nativeMath: native });
  ev.on('progress', progressLine);
  ev.on('error', (e) => console.error('\n' + (e.stack || e)));
  process.on('SIGINT', () => { console.error('\nstopping; the finished runs are stored and will be reused'); ev.cancel(); });
  const results = await ev.done;
  process.stderr.write('\n');
  const s = STUDY.summarize(p, results);
  printStudy(s);
  fs.writeFileSync(path.join(out, `study_${hash}.summary.json`), JSON.stringify(s, null, 1));
  fs.writeFileSync(path.join(out, `study_${hash}.summary.csv`), STUDY.toCSV(s));
  console.error(`summary written to ${path.join(out, `study_${hash}.summary.{json,csv}`)}`);
}

function paper() { printSummary(TOTAL.paperSummary({})); }

async function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];
  if (!cmd || o.help || cmd === 'help') { console.log(HELP); return; }
  if (cmd === 'paper') return paper();
  if (cmd === 'total') return total(o);
  if (cmd === 'run') return single(o);
  if (cmd === 'study') return study(o);
  console.error(`unknown command ${cmd}\n`); console.log(HELP); process.exitCode = 2;
}
main().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
