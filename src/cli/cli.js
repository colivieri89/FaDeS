#!/usr/bin/env node
// Command line: the same studies as the app, without the interface.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runJobs, defaultWorkers } = require('../runner/pool');
const C = require('../analyses/campaigns');
const TOTAL = require('../analyses/total_collapse');
const { parseSeeds } = require('../analyses/stats');
const { readCases } = require('../analyses/csv');
const { MODEL_VERSION } = require('../sim/version');

const HELP = `Facade Debris Simulator, command line

  node src/cli/cli.js paper                     the values of Sect. 5 from the stored runs of the paper
  node src/cli/cli.js total [options]           run the total-collapse study (Sect. 5, Fig. 7)
      --campaigns C1,C2      --heights 2.5,5,...   --thicknesses 0.30,0.60,...
      --seeds 1-20           --cases walls.csv     (columns id, mechanism, H_m, t_m, Hr_m)
  node src/cli/cli.js run [options]             one wall
      --H 10 --t 0.60 [--mechanism total|partial --Hr 6] [--bx 0.15 --by 0.15] [--seed 1]
      [--mu 0.75 --muG 0.75 --e 0.02 --rho 1900] [--nominal]   (--nominal: no run-to-run variability)

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

async function single(o) {
  const num = (k, d) => (o[k] != null ? +o[k] : d);
  const P = Object.assign({}, C.PAPER_PARAMS, { H: num('H', 10), t: num('t', 0.6), mechanism: o.mechanism || 'total', bx: num('bx', 0.15), by: num('by', 0.15),
    mu: num('mu', C.PAPER_PARAMS.mu), muG: num('muG', C.PAPER_PARAMS.muG), e: num('e', C.PAPER_PARAMS.e), rho: num('rho', C.PAPER_PARAMS.rho), engine: 'planck' });
  if (P.mechanism === 'partial') P.Hr = num('Hr', 2 / 3 * P.H);
  P.variability = o.nominal ? { seed: 1, sdThetaDeg: 0, sdBlockRel: 0, sdMuRel: 0 } : Object.assign({ seed: num('seed', 1) }, C.VARIABILITY);
  const camp = C.campaignOf(P);
  const job = camp ? C.runJob(camp.cfg, camp.seed) : { kind: 'run', id: 'single', tag: { single: true }, params: P };
  const [r] = await runJobs([job], { workers: 1, nativeMath: !!o['native-math'] }).done;
  console.log(`P95 by mass ${r.p.p95.mass} m (${f(r.p.p95.mass / P.H, 4)} H), Lmax ${r.Lmax} m (${f(r.Lmax / P.H, 4)} H)`);
  console.log(`${r.nBlocks} blocks, ${r.stop === 'rest' ? `at rest after ${f(r.tStop, 2)} s` : 'stopped at the 60 s cap'}; rotation at impact ${f(r.rigid.thetaBreak, 2)} deg; run time ${f(r.runtime_s, 1)} s`);
  if (camp) {
    const q = TOTAL.refRun(camp.cfg.campaign, camp.cfg.H, camp.cfg.t, camp.seed);
    if (q) console.log(`paper's run ${camp.cfg.id} seed ${camp.seed}: P95 ${q.p95m} m, Lmax ${q.Lmax} m -> ${q.p95m === r.p.p95.mass && q.Lmax === r.Lmax && q.nBlocks === r.nBlocks ? 'identical' : 'not identical'}`);
  }
}

function paper() { printSummary(TOTAL.paperSummary({})); }

async function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];
  if (!cmd || o.help || cmd === 'help') { console.log(HELP); return; }
  if (cmd === 'paper') return paper();
  if (cmd === 'total') return total(o);
  if (cmd === 'run') return single(o);
  console.error(`unknown command ${cmd}\n`); console.log(HELP); process.exitCode = 2;
}
main().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
