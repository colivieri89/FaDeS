'use strict';
// Parametric study (Sect. 5 of the paper, for any wall in total or partial collapse): any set of walls (a grid of heights and thicknesses, a CSV file with
// one wall per row, or the worked examples), each run with the chosen seeds; extent at break-up and at rest per wall,
// the increment added by the debris phase (Fig. 7) and, with a street width, the width left free. Shows the paper's
// results for the examples until the study is run.
(function (FD) {
  const { h, fmt } = FD;
  const S = {
    source: 'examples', examples: null,
    grid: { mechanism: 'total', heightsText: '6, 9, 12', thicknessesText: '0.45, 0.60', HrRatio: 1 / 3, bx: 0.15, by: 0.15, diatoneStep: 2,
            mu: null, muG: null, e: null, rho: null },
    csv: { walls: [], name: '' },
    W: '', seedsText: '1-20', variability: 'paper', sd: null,
    workers: null, summary: null, computed: false, running: null, progress: null, error: null, cancelled: false,
  };
  let els = {}, info = null;

  const numList = (text, what) => {
    const v = String(text).split(/[,;\s]+/).filter(Boolean).map(x => +x);
    if (!v.length || v.some(x => !(x > 0))) throw new Error(`${what}: give positive numbers separated by commas`);
    return [...new Set(v)].sort((a, b) => a - b);
  };
  function variability() {
    if (S.variability === 'none') return { sdThetaDeg: 0, sdBlockRel: 0, sdMuRel: 0 };
    if (S.variability === 'custom') return { sdThetaDeg: +S.sd.theta, sdBlockRel: S.sd.block / 100, sdMuRel: S.sd.mu / 100 };
    return info.variability;
  }
  function studyOptions() {
    const o = { seeds: FD.parseSeeds(S.seedsText), variability: variability(), W: S.W !== '' && +S.W > 0 ? +S.W : null };
    if (S.variability === 'none') o.seeds = [o.seeds[0]];
    if (S.source === 'grid') {
      const g = S.grid, pp = info.materials;
      o.grid = { mechanism: g.mechanism, heights: numList(g.heightsText, 'Heights'), thicknesses: numList(g.thicknessesText, 'Thicknesses'),
        bx: +g.bx, by: +g.by, diatoneStep: +g.diatoneStep, mu: +(g.mu ?? pp.mu), muG: +(g.muG ?? pp.muG), e: +(g.e ?? pp.e), rho: +(g.rho ?? pp.rho) };
      if (g.mechanism === 'partial') o.grid.HrRatio = +g.HrRatio;
    } else if (S.source === 'csv') {
      if (!S.csv.walls.length) throw new Error('load a CSV file of walls first');
      o.walls = S.csv.walls;
    } else o.examples = S.examples;
    return o;
  }

  FD.views.study = {
    title: 'Parametric study',
    async render(root, inf, go, opts = {}) {
      info = inf;
      if (S.workers == null) S.workers = info.defaultWorkers;
      if (!S.examples) S.examples = info.examples.map(x => x.id);
      if (opts.example && !S.running) { S.source = 'examples'; S.examples = [opts.example]; S.summary = null; }
      if (!S.sd) S.sd = { theta: info.variability.sdThetaDeg, block: info.variability.sdBlockRel * 100, mu: info.variability.sdMuRel * 100 };
      els = {};
      root.append(
        h('div', { class: 'kicker' }, 'Analysis · many walls'),
        h('h1', {}, 'Parametric study of the debris'),
        h('p', { class: 'lede' }, 'Run any set of walls, each with several seeds: a grid of heights and thicknesses, a CSV file with one wall per row (your own buildings, with their blocks and materials), or the worked examples. Each wall is measured at the instant of break-up and at rest, and summarised by the seed medians and ranges of P95 and Lmax and by the increment that the debris phase adds to P95, as in Section 5 of the paper. Give a street width to see how much of the street stays free.'),
        inputs(),
        els.status = h('div'),
        els.tiles = h('div', { class: 'tiles' }),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('h2', {}, 'Extent of the debris per wall'),
          h('p', { class: 'sub' }, 'Seed medians against the height of the wall. Bars: range of P95 over the seeds. Dashed: a distance of one height.'),
          h('div', { class: 'row chart-head' }, els.legend = h('div'), h('div', { class: 'spacer' }), FD.chartActions(() => els.chart, 'study_extent')),
          els.chartBox = h('div')),
        h('div', { class: 'grid2' },
          chartCard('b', 'P95 / H at rest and at break-up', 'Seed medians against the slenderness t/H (t/Hr for a partial collapse). Filled: at rest. Open ring: at the instant of break-up (a dot inside a ring: the same value). Dotted: P95 = H.'),
          chartCard('c', 'Increment added by the debris phase', 'Increment of P95/H from break-up to rest, the median of the per-seed differences, against 3 % of P95/H.')),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('div', { class: 'row' }, h('div', {}, h('h2', {}, 'Walls'), els.tableSub = h('p', { class: 'sub' })), h('div', { class: 'spacer' }),
            h('button', { class: 'btn ghost', onclick: () => exportCSV() }, FD.icon('download'), 'CSV'),
            h('button', { class: 'btn ghost', onclick: () => exportJSON() }, FD.icon('download'), 'JSON')),
          els.table = h('div')));
      if (!S.summary && S.source === 'examples') await showStored();
      showSource(); refreshEstimate(); renderStatus(); renderResults();
      FD.onTheme(() => { ['chart', 'cb', 'cc'].forEach(k => els[k] && els[k].draw()); }, 'study');
    },
  };

  // the paper's results for the chosen examples
  async function showStored() {
    if (S.running) return;
    S.summary = await window.api.exampleSummary('study', S.examples); S.computed = false;
    renderResults();
  }

  function chartCard(key, title, sub) {
    els['box' + key] = h('div');
    els['legend' + key] = h('div');
    return h('div', { class: 'card' }, h('h2', {}, title), h('p', { class: 'sub' }, sub),
      h('div', { class: 'row chart-head' }, els['legend' + key], h('div', { class: 'spacer' }), FD.chartActions(() => els['c' + key], `study_${key === 'b' ? 'p95_slenderness' : 'increment'}`)), els['box' + key]);
  }

  // ------------------------------------------------------------------ inputs
  const seg = (options, on, onchange) => {
    const box = h('div', { class: 'seg' });
    for (const [v, label] of options) box.append(h('button', { type: 'button', 'data-v': v, class: v === on ? 'on' : '',
      onclick: () => { box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); onchange(v); } }, label));
    return box;
  };
  const field = (label, unit, value, oninput, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label, ' ', h('span', { class: 'unit' }, unit)),
    h('input', Object.assign({ type: 'number', value, oninput: (e) => { oninput(e.target.value); refreshEstimate(); } }, attrs)));
  const textField = (label, unit, value, oninput) => h('label', { class: 'field wide' }, h('span', {}, label, ' ', h('span', { class: 'unit' }, unit)),
    h('input', { class: 'txt', value, oninput: (e) => { oninput(e.target.value); refreshEstimate(); } }));

  function inputs() {
    const g = S.grid, pp = info.materials;
    els.hr = h('div', { style: g.mechanism === 'partial' ? '' : 'display:none' },
      field('Overturning part Hr / H', '', +(+g.HrRatio).toFixed(3), (v) => { g.HrRatio = v; }, { step: 0.05, min: 0.05, max: 0.95 }));
    els.grid = h('div', { class: 'form-grid' },
      h('div', {}, h('div', { class: 'lab' }, 'Mechanism'), seg([['total', 'Total collapse'], ['partial', 'Partial']], g.mechanism, (v) => {
        g.mechanism = v; els.hr.style.display = v === 'partial' ? '' : 'none'; refreshEstimate(); }), els.hr),
      textField('Heights H', 'm, comma separated', g.heightsText, (v) => { g.heightsText = v; }),
      textField('Thicknesses t', 'm, comma separated', g.thicknessesText, (v) => { g.thicknessesText = v; }),
      field('Block width bx', 'm', g.bx, (v) => { g.bx = v; }, { step: 0.05, min: 0.05 }),
      field('Block height by', 'm', g.by, (v) => { g.by = v; }, { step: 0.05, min: 0.05 }),
      field('Diatone courses every', 'm (0 = none)', g.diatoneStep, (v) => { g.diatoneStep = v; }, { step: 0.5, min: 0 }),
      field('Friction μ, block–block', '', g.mu ?? pp.mu, (v) => { g.mu = v; }, { step: 0.01, min: 0 }),
      field('Friction μg, block–street', '', g.muG ?? pp.muG, (v) => { g.muG = v; }, { step: 0.01, min: 0 }),
      field('Restitution e', '', g.e ?? pp.e, (v) => { g.e = v; }, { step: 0.01, min: 0, max: 1 }),
      field('Density ρ', 'kg/m³', g.rho ?? pp.rho, (v) => { g.rho = v; }, { step: 50, min: 100 }));
    const file = h('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none', onchange: (e) => loadCSV(e.target.files[0]) });
    els.csvLab = h('span', { class: 'muted small' }, S.csv.walls.length ? `${S.csv.name}: ${S.csv.walls.length} walls` : 'no file loaded');
    els.csv = h('div', {},
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => file.click() }, FD.icon('folder'), 'Load CSV…'), file, els.csvLab,
        h('div', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: async () => FD.saveText('walls_template.csv', await window.api.wallsTemplate(), 'csv') }, FD.icon('download'), 'Template')),
      h('p', { class: 'muted small' }, 'One wall per row. Required: id, mechanism (T total; P partial with Hr_m; P1 and P2 mean Hr = H/3 and 2H/3), H_m, t_m. Optional, the default values when empty: Hr_m, bx_m, by_m, diatone_step_m (0 = none), mu, muG, e, rho, W_m (street width).'),
      els.csvTable = h('div'));
    const ids = info.examples.map(x => x.id);
    els.camp = h('div', {}, h('div', { class: 'chips' }, info.examples.map(x => h('button', { type: 'button', class: 'chip' + (S.examples.includes(x.id) ? ' on' : ''),
      onclick: (e) => { const i = S.examples.indexOf(x.id); if (i >= 0) { if (S.examples.length > 1) S.examples.splice(i, 1); } else S.examples.push(x.id);
        S.examples.sort((a, b) => ids.indexOf(a) - ids.indexOf(b)); e.currentTarget.classList.toggle('on', S.examples.includes(x.id)); refreshEstimate(); if (!S.computed) showStored(); } }, x.title))),
      h('p', { class: 'muted small' }, 'One wall of each type analysed in the paper. With the seeds 1–20 and the paper’s variability every run is compared with the paper’s run of the same seed.'));
    const sdBox = h('div', { class: 'form-grid', style: S.variability === 'custom' ? '' : 'display:none' },
      field('Start angle, sd', '°', S.sd.theta, (v) => { S.sd.theta = v; }, { step: 0.05, min: 0 }),
      field('Block joints, sd', '% of the block', S.sd.block, (v) => { S.sd.block = v; }, { step: 1, min: 0 }),
      field('Friction, sd', '%', S.sd.mu, (v) => { S.sd.mu = v; }, { step: 1, min: 0 }));
    const wk = h('input', { type: 'range', min: 1, max: info.cores, value: S.workers, oninput: (e) => { S.workers = +e.target.value; wkLab.textContent = S.workers; refreshEstimate(); } });
    const wkLab = h('b', { class: 'num' }, S.workers);
    els.runBtn = h('button', { class: 'btn', onclick: () => (S.running ? stop() : start()) });
    els.estimate = h('span', { class: 'muted small' });
    return h('div', { class: 'card' },
      h('div', { class: 'filters' },
        h('span', { class: 'lab' }, 'Walls'), seg([['examples', 'Worked examples'], ['grid', 'Grid of H and t'], ['csv', 'From a CSV file']], S.source, (v) => { S.source = v; showSource(); refreshEstimate(); }),
        h('span', {}), h('div', {}, els.grid, els.csv, els.camp),
        h('span', { class: 'lab' }, 'Street width W'), h('div', { class: 'row' },
          h('input', { type: 'number', class: 'txt', style: 'width:110px', value: S.W, min: 0, step: 0.5, placeholder: 'none', oninput: (e) => { S.W = e.target.value; refreshEstimate(); } }),
          h('span', { class: 'muted small' }, 'm, optional; measured from the street face of the façade (a W_m column of the CSV file takes precedence)')),
        h('span', { class: 'lab' }, 'Seeds'), h('div', { class: 'row' },
          h('input', { class: 'txt', value: S.seedsText, style: 'width:140px', oninput: (e) => { S.seedsText = e.target.value; refreshEstimate(); } }),
          h('span', { class: 'muted small' }, 'list or ranges, e.g. 1-20 or 1,4,9; each seed draws the start angle, the block joints and the friction')),
        h('span', { class: 'lab' }, 'Variability'), h('div', {},
          seg([['paper', 'Paper'], ['custom', 'Custom'], ['none', 'Nominal (one run)']], S.variability, (v) => { S.variability = v; sdBox.style.display = v === 'custom' ? '' : 'none'; refreshEstimate(); }),
          sdBox),
        h('span', { class: 'lab' }, 'Parallel runs'), h('div', { class: 'row' }, wk, wkLab, h('span', { class: 'muted small' }, `of ${info.cores} cores`))),
      h('div', { class: 'row', style: 'margin-top:18px' }, els.runBtn, h('div', { class: 'spacer' }),
        els.storedBtn = h('button', { class: 'btn ghost', title: 'Show the paper’s results for the chosen examples', onclick: () => showStored() }, 'Paper results'),
        h('button', { class: 'btn ghost', title: 'Open the folder where the runs of this computer are stored', onclick: () => window.api.openPath(info.resultsDir) }, FD.icon('folder'), 'Results folder'),
        h('button', { class: 'btn ghost', title: 'Delete the stored runs of this view (they are recomputed at the next run)',
          onclick: async () => { if (S.running) return; if (!confirm('Delete the runs stored on this computer for the parametric study?')) return; await window.api.clearResults('study'); FD.toast('Stored runs deleted'); } }, 'Clear stored runs')),
      h('div', { style: 'margin-top:8px' }, els.estimate));
  }
  function showSource() {
    els.grid.style.display = S.source === 'grid' ? '' : 'none';
    els.csv.style.display = S.source === 'csv' ? '' : 'none';
    els.camp.style.display = S.source === 'examples' ? '' : 'none';
    els.storedBtn.style.display = S.source === 'examples' ? '' : 'none';
    renderCSVTable();
  }
  async function loadCSV(f) {
    if (!f) return;
    try {
      S.csv.walls = await window.api.wallsFromCSV(await f.text()); S.csv.name = f.name;
      els.csvLab.textContent = `${f.name}: ${S.csv.walls.length} walls`;
      renderCSVTable(); refreshEstimate();
    } catch (e) { FD.toast(`Could not read ${f.name}: ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`); }
  }
  function renderCSVTable() {
    if (!els.csvTable) return;
    if (!S.csv.walls.length) { els.csvTable.replaceChildren(); return; }
    els.csvTable.replaceChildren(FD.table(S.csv.walls.slice(0, 200), [
      { label: 'Wall', get: (w) => w.id }, { label: 'Mechanism', get: (w) => w.mechanism === 'total' ? 'total' : `partial, Hr ${fmt(w.Hr)} m` },
      { label: 'H [m]', n: true, get: (w) => fmt(w.H) }, { label: 't [m]', n: true, get: (w) => fmt(w.t) },
      { label: 'Blocks [m]', n: true, get: (w) => `${fmt(w.bx)} × ${fmt(w.by)}` }, { label: 'Diatones [m]', n: true, get: (w) => w.diatoneStep > 0 ? fmt(w.diatoneStep, 1) : 'none' },
      { label: 'μ / μg', n: true, get: (w) => `${fmt(w.mu)} / ${fmt(w.muG)}` }, { label: 'e', n: true, get: (w) => fmt(w.e) }, { label: 'ρ', n: true, get: (w) => fmt(w.rho, 0) },
      { label: 'W [m]', n: true, get: (w) => w.W != null ? fmt(w.W) : '–' }]));
  }

  async function refreshEstimate() {
    if (!els.runBtn) return;
    els.runBtn.replaceChildren(FD.icon(S.running ? 'stop' : 'play'), S.running ? 'Stop' : 'Run the study');
    els.runBtn.classList.toggle('danger', !!S.running);
    let opts;
    try { opts = studyOptions(); } catch (e) { els.estimate.textContent = e.message; els.runBtn.disabled = !S.running; return; }
    try {
      const est = await window.api.estimate('study', opts, S.workers);
      els.runBtn.disabled = false;
      els.estimate.textContent = `${est.nConfigs} walls × ${opts.seeds.length} seeds = ${est.nRuns.toLocaleString('en-US')} runs · about ${FD.duration(est.wall_s)} with ${S.workers} parallel runs (a rough figure from the run times of the paper on an Apple M4; runs already stored are reused)`;
    } catch (e) { els.estimate.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); els.runBtn.disabled = !S.running; }
  }

  async function start() {
    let opts;
    try { opts = studyOptions(); } catch (e) { FD.toast(e.message); return; }
    S.error = null; S.progress = { done: 0, total: 0 };
    const { id } = await window.api.startStudy('study', opts, S.workers);
    S.running = id;
    const offP = window.api.onStudyProgress((m) => { if (m.id !== id) return; S.progress = m; renderStatus(); });
    const offS = window.api.onStudyPartial((m) => { if (m.id !== id) return; S.summary = m.summary; S.computed = true; renderResults(); });
    const offE = window.api.onStudyError((m) => { if (m.id !== id) return; S.error = m.message; renderStatus(); });
    const offD = window.api.onStudyDone((m) => {
      if (m.id !== id) return;
      offP(); offS(); offE(); offD();
      S.running = null; S.summary = m.summary; S.computed = true; S.cancelled = m.cancelled;
      refreshEstimate(); renderStatus(); renderResults();
      FD.toast(m.cancelled ? 'Study stopped; the runs done so far are stored and will be reused' : 'Study complete');
    });
    refreshEstimate(); renderStatus();
  }
  async function stop() { if (S.running) await window.api.cancel(S.running); }

  function renderStatus() {
    if (!els.status) return;
    const p = S.progress;
    if (!S.running && !p) { els.status.replaceChildren(); return; }
    const pct = p && p.total ? p.done / p.total : 0;
    const parts = [];
    if (p && p.total) parts.push(`${p.done.toLocaleString('en-US')} of ${p.total.toLocaleString('en-US')} jobs`);
    if (p && p.resumed) parts.push(`${p.resumed.toLocaleString('en-US')} reused from stored runs`);
    if (p && p.elapsed_s != null) parts.push(`elapsed ${FD.duration(p.elapsed_s)}`);
    if (S.running && p && p.eta_s != null && p.done < p.total) parts.push(`about ${FD.duration(p.eta_s)} left`);
    if (!S.running) parts.push(S.cancelled ? 'stopped' : 'complete');
    els.status.replaceChildren(h('div', { class: 'card', style: 'margin-top:16px' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, h('b', {}, S.running ? 'Running' : S.cancelled ? 'Stopped' : 'Done'), h('span', { class: 'muted small' }, parts.join(' · '))),
      h('div', { class: 'progress' + (S.running && !p.total ? ' indet' : '') }, h('div', { style: `width:${(pct * 100).toFixed(1)}%` })),
      S.error ? h('p', { class: 'small', style: 'color:var(--critical)' }, S.error.split('\n')[0]) : null));
  }

  // ------------------------------------------------------------------ results
  const pctTxt = (d) => d === 0 ? '0' : d < 0.001 ? '< 0.001' : fmt(d, 3);
  const signedPct = (d) => d === 0 ? '0' : Math.abs(d) < 0.001 ? '< 0.001' : FD.fmtSigned(d, 3);
  const mechTxt = (r) => r.mechanism === 'total' ? 'total' : `partial, Hr ${fmt(r.Hr)} m`;

  function renderResults() {
    if (!els.tiles) return;
    const sm = S.summary;
    if (!sm) {
      els.tiles.replaceChildren();
      els.legend.replaceChildren();
      els.chartBox.replaceChildren(h('div', { class: 'placeholder' }, h('div', {}, h('b', {}, 'Nothing computed yet'), 'Choose the walls and press Run the study.')));
      els.chart = null;
      for (const k of ['b', 'c']) { els['legend' + k].replaceChildren(); els['box' + k].replaceChildren(); els['c' + k] = null; }
      els.tableSub.textContent = '';
      els.table.replaceChildren();
      return;
    }
    const T = sm.totals, rows = sm.rows.filter(r => Number.isFinite(r.p95));
    const withW = rows.filter(r => r.street);
    const tiles = [
      FD.tile('Walls', String(T.nWalls), `${T.nRest.toLocaleString('en-US')} of ${T.nRuns.toLocaleString('en-US')} runs at rest` + (T.nTimeCap ? `, ${T.nTimeCap} at the 60 s cap (left out)` : '')),
      FD.tile('P95 at rest', rows.length ? `${fmt(Math.min(...rows.map(r => r.p95)))}–${fmt(Math.max(...rows.map(r => r.p95)))} m` : '–', `${rows.length ? fmt(Math.min(...rows.map(r => r.p95_H)), 2) : '–'}–${rows.length ? fmt(Math.max(...rows.map(r => r.p95_H)), 2) : '–'} H, range of the seed medians`),
      FD.tile('Lmax at rest', rows.length ? `${fmt(Math.min(...rows.map(r => r.Lmax)))}–${fmt(Math.max(...rows.map(r => r.Lmax)))} m` : '–', 'range of the seed medians'),
    ];
    if (Number.isFinite(T.incRange_H[0])) tiles.push(FD.tile('Increment, break-up to rest', T.incRange_H[0] === T.incRange_H[1] ? `${fmt(T.incRange_H[0], 4)} H` : `${fmt(T.incRange_H[0], 4)}–${fmt(T.incRange_H[1], 4)} H`,
      `above 3 % of P95 in ${T.nAboveTolerance} of ${rows.filter(r => Number.isFinite(r.inc_H)).length} walls`));
    if (withW.length) tiles.push(FD.tile('Street reached', `${T.nStreetReached} of ${withW.length}`, 'walls whose P95 reaches W in most seeds'));
    if (T.nCompared) tiles.push(FD.tile('Agreement with the paper', `${T.nIdentical} / ${T.nCompared}`, `runs identical; largest difference P95 ${pctTxt(T.maxAbsDeltaP95_pct)} %, Lmax ${pctTxt(T.maxAbsDeltaLmax_pct)} %`));
    els.tiles.replaceChildren(...tiles);

    const pts = (k) => rows.map(r => Object.assign({ x: r.H, y: r[k] }, r));
    const Hmax = Math.max(...rows.map(r => r.H), 1);
    const series = [
      { name: 'one height', color: '--ref', line: true, dash: true, width: 1.2, noHover: true, points: [{ x: 0, y: 0 }, { x: 1.06 * Hmax, y: 1.06 * Hmax }] },
      // the open ring is drawn first and larger, so that a filled point with the same value stays visible inside it
      { name: 'P95 at break-up', color: '--series-1', marker: 'circle', filled: false, size: 6.2, points: pts('p95Break') },
      { name: 'P95 at rest', color: '--series-1', marker: 'circle', filled: true, points: pts('p95') },
      { name: 'Lmax at rest', color: '--series-2', marker: 'square', filled: true, size: 3.6, points: pts('Lmax') },
      // seed range of P95, drawn as short vertical segments
      ...rows.filter(r => r.p95Range[1] > r.p95Range[0]).map(r => ({ name: 'range', color: '--series-1', line: true, width: 1.5, noHover: true,
        points: [{ x: r.H, y: r.p95Range[0] }, { x: r.H, y: r.p95Range[1] }] })),
    ];
    const Ws = [...new Set(withW.map(r => r.W))];
    els.legend.replaceChildren(FD.legend([{ name: 'P95 at rest', marker: 'circle', color: '--series-1', filled: true }, { name: 'P95 at break-up', marker: 'circle', color: '--series-1', filled: false },
      { name: 'Lmax at rest', marker: 'square', color: '--series-2', filled: true }, { name: 'one height (distance = H)', marker: 'line', color: '--ref' }]
      .concat(Ws.length ? [{ name: 'street width W', marker: 'line', color: '--ink-2' }] : [])));
    const tip = (r) => ({ title: `${r.id} · ${mechTxt(r)}`, rows: [['H, t', `${fmt(r.H)} m, ${fmt(r.t)} m`], ['blocks', `${fmt(r.bx)} × ${fmt(r.by)} m`],
      ['P95 at rest', `${fmt(r.p95)} m (${fmt(r.p95_H, 3)} H)`], ['P95 at break-up', `${fmt(r.p95Break)} m`], ['Lmax', `${fmt(r.Lmax)} m`], ['seeds at rest', String(r.nSeeds)]]
      .concat(r.street ? [['free width', `${fmt(r.street.freeMedian)} m of ${fmt(r.W)} m`]] : []) });
    const spec = { height: 340, x: { label: 'height of the wall H [m]', min: 0, max: 1.06 * Hmax }, y: { label: 'distance from the façade [m]', min: 0 }, series,
      hlines: Ws.map(w => ({ y: w, color: '--ink-2', dash: true, label: Ws.length === 1 ? `W = ${fmt(w)} m` : null })), tooltip: tip };
    if (els.chart) els.chart.update(spec); else { els.chartBox.replaceChildren(); els.chart = new FD.Chart(els.chartBox, spec); }
    renderSlenderness(rows, tip);

    els.tableSub.textContent = (S.computed ? 'Computed on this computer. ' : 'The paper’s results for the examples (nothing has been run on this computer yet). ') +
      'Seed medians over the runs that reached rest; distances from the street face of the façade.';
    const cols = [
      { label: 'Wall', get: (r) => r.id },
      { label: 'Mechanism', get: mechTxt, csv: (r) => r.mechanism },
      { label: 'H [m]', n: true, get: (r) => fmt(r.H), csv: (r) => r.H },
      { label: 't [m]', n: true, get: (r) => fmt(r.t), csv: (r) => r.t },
      { label: 'Blocks [m]', n: true, get: (r) => `${fmt(r.bx)} × ${fmt(r.by)}`, csv: (r) => `${r.bx}x${r.by}` },
      { label: 'Seeds', n: true, title: 'seeds that reached rest', get: (r) => r.nSeeds, csv: (r) => r.nSeeds },
      { label: 'P95 break-up [m]', n: true, get: (r) => fmt(r.p95Break), csv: (r) => r.p95Break },
      { label: 'P95 rest [m]', n: true, get: (r) => fmt(r.p95), csv: (r) => r.p95 },
      { label: 'P95 range [m]', n: true, get: (r) => `${fmt(r.p95Range[0])}–${fmt(r.p95Range[1])}`, csv: (r) => `${r.p95Range[0]}-${r.p95Range[1]}` },
      { label: 'Lmax [m]', n: true, get: (r) => fmt(r.Lmax), csv: (r) => r.Lmax },
      { label: 'P95 / H', n: true, get: (r) => fmt(r.p95_H, 3), csv: (r) => r.p95_H },
      { label: 'Increment / H', n: true, title: 'P95 at rest minus P95 at break-up, median over the seeds, over H', get: (r) => fmt(r.inc_H, 4), csv: (r) => r.inc_H },
    ];
    if (withW.length) cols.push(
      { label: 'W [m]', n: true, get: (r) => r.W != null ? fmt(r.W) : '–', csv: (r) => r.W ?? '' },
      { label: 'Free width [m]', n: true, title: 'W minus P95, median over the seeds', get: (r) => r.street ? fmt(r.street.freeMedian) : '–', csv: (r) => r.street ? r.street.freeMedian : '' },
      { label: 'Seeds reaching W', n: true, title: 'seeds whose P95 / Lmax reaches W', get: (r) => r.street ? `${r.street.nP95Reach} / ${r.street.nLmaxReach}` : '–', csv: (r) => r.street ? `${r.street.nP95Reach}/${r.street.nLmaxReach}` : '' },
      { label: 'Heap at W [m]', n: true, title: 'height of the debris at the distance W, median', get: (r) => r.street ? fmt(r.street.heapAtW) : '–', csv: (r) => r.street ? r.street.heapAtW : '' });
    if (T.nCompared) cols.push(
      { label: 'Paper P95 [m]', n: true, get: (r) => r.paper ? fmt(r.paper.p95, 3) : '–', csv: (r) => r.paper ? r.paper.p95 : '' },
      { label: 'Δ P95 [%]', n: true, get: (r) => r.paper ? signedPct((r.p95 / r.paper.p95 - 1) * 100) : '–', csv: (r) => r.paper ? (r.p95 / r.paper.p95 - 1) * 100 : '' },
      { label: 'Paper Lmax [m]', n: true, get: (r) => r.paper ? fmt(r.paper.Lmax, 3) : '–', csv: (r) => r.paper ? r.paper.Lmax : '' });
    els.cols = cols;
    els.table.replaceChildren(FD.table(sm.rows, cols));
  }

  // P95/H at rest and at break-up, and the increment, against t/H (Fig. 7 of the paper for its walls)
  const GROUPS = [
    { key: 'total', name: 'Total collapse', color: '--series-1', marker: 'circle' },
    { key: 'partial', name: 'Partial collapse', color: '--series-3', marker: 'triangle' },
  ];
  function renderSlenderness(rows, tip) {
    const groups = GROUPS.filter(g => rows.some(r => r.mechanism === g.key));
    const sb = [], sc = [];
    for (const g of groups) {
      const d = rows.filter(r => r.mechanism === g.key).map(r => Object.assign({ x: r.tOverH }, r));
      sb.push({ name: `${g.name}, at break-up`, color: g.color, marker: g.marker, filled: false, size: 6.2, points: d.filter(r => Number.isFinite(r.p95Break_H)).map(r => Object.assign({}, r, { y: r.p95Break_H })) });
      sb.push({ name: `${g.name}, at rest`, color: g.color, marker: g.marker, filled: true, points: d.map(r => Object.assign({}, r, { y: r.p95_H })) });
      sc.push({ name: g.name, color: g.color, marker: g.marker, filled: true, points: d.filter(r => r.inc_H > 0).map(r => Object.assign({}, r, { y: r.inc_H })) });
    }
    const withInc = rows.filter(r => r.inc_H > 0);
    sc.unshift({ name: '3 % of P95/H', color: '--ref', marker: 'tick', filled: true, size: 3.4, noHover: true, points: withInc.map(r => ({ x: r.tOverH, y: 0.03 * r.p95_H })) });
    const xAxis = { label: 't / H', log: true, fmt: (v) => String(+v.toPrecision(2)) };
    els.legendb.replaceChildren(FD.legend(groups.map(g => ({ name: g.name, marker: g.marker, color: g.color, filled: true })).concat([{ name: 'open: at break-up', marker: 'circle', color: '--ref', filled: false }])));
    els.legendc.replaceChildren(FD.legend(groups.map(g => ({ name: g.name, marker: g.marker, color: g.color, filled: true })).concat([{ name: '3 % of P95/H', marker: 'tick', color: '--ref', filled: true }])));
    const specB = { height: 300, x: xAxis, y: { label: 'P95 / H (seed medians)', min: 0 }, series: sb, hlines: [{ y: 1, color: '--axis', dash: true }], tooltip: tip };
    if (els.cb) els.cb.update(specB); else { els.boxb.replaceChildren(); els.cb = new FD.Chart(els.boxb, specB); }
    if (!withInc.length) {
      els.cc = null;
      els.boxc.replaceChildren(h('div', { class: 'placeholder' }, h('div', {}, h('b', {}, 'No increment to show'), 'The break-up measure is not available for these walls.')));
      return;
    }
    const specC = { height: 300, x: xAxis, y: { label: 'increment of P95 / H', log: true, fmt: (v) => String(+v.toPrecision(2)) }, series: sc, tooltip: tip };
    if (els.cc) els.cc.update(specC); else { els.boxc.replaceChildren(); els.cc = new FD.Chart(els.boxc, specC); }
  }

  function exportCSV() { if (S.summary) FD.saveText(S.computed ? 'parametric_study.csv' : 'parametric_study_paper_examples.csv', FD.toCSV(S.summary.rows, els.cols), 'csv'); }
  function exportJSON() { if (S.summary) FD.saveText(S.computed ? 'parametric_study.json' : 'parametric_study_paper_examples.json', JSON.stringify(S.summary, null, 1), 'json'); }
})(window.FD);
