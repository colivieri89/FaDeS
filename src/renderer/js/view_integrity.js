'use strict';
// Sect. 4 of the paper, integrity of the panel during the fall (Figs. 5 and 6), for any wall in total collapse: the
// internal actions of the falling panel, the first hinge with no tensile strength, the two-block motion from it, and
// the check at given tensile strengths. Shows the paper's results for the worked examples in total collapse until the
// analysis is run.
(function (FD) {
  const { h, fmt } = FD;
  const S = {
    source: 'examples', examples: null,
    grid: { heightsText: '6, 9, 12', thicknessesText: '0.45, 0.60', bx: 0.15, by: 0.15, diatoneStep: 2, mu: null, muG: null, rho: null },
    csv: { walls: [], name: '', nPartial: 0 }, ftText: '0.04, 0.10',
    workers: null, paper: null, summary: null, computed: false, running: null, progress: null, error: null, cancelled: false,
    traceId: null, traces: new Map(), tracing: null, traceError: null,
  };
  let els = {}, info = null;

  const numList = (text, what, allowEmpty = false) => {
    const v = String(text).split(/[,;\s]+/).filter(Boolean).map(x => +x);
    if ((!v.length && !allowEmpty) || v.some(x => !(x > 0))) throw new Error(`${what}: give positive numbers separated by commas`);
    return [...new Set(v)].sort((a, b) => a - b);
  };
  function studyOptions() {
    const o = { fts: numList(S.ftText, 'Tensile strengths', true), examples: [], walls: [] };
    if (S.source === 'grid') {
      const g = S.grid, pp = info.materials;
      o.grid = { heights: numList(g.heightsText, 'Heights'), thicknesses: numList(g.thicknessesText, 'Thicknesses'), bx: +g.bx, by: +g.by,
        diatoneStep: +g.diatoneStep, mu: +(g.mu ?? pp.mu), muG: +(g.muG ?? pp.muG), rho: +(g.rho ?? pp.rho) };
    } else if (S.source === 'csv') {
      if (!S.csv.walls.length) throw new Error('load a CSV file of walls first');
      o.walls = S.csv.walls;
    } else o.examples = S.examples;
    return o;
  }

  FD.views.integrity = {
    title: 'Integrity during the fall',
    async render(root, inf, go, opts = {}) {
      info = inf;
      if (S.workers == null) S.workers = info.defaultWorkers;
      const totals = info.examples.filter(x => x.wall.mechanism === 'total').map(x => x.id);
      if (!S.examples) S.examples = totals.slice();
      if (opts.example && totals.includes(opts.example) && !S.running) { S.source = 'examples'; S.examples = [opts.example]; S.traceId = opts.example; }
      els = {};
      root.append(
        h('div', { class: 'kicker' }, 'Analysis · integrity in the fall · Section 4 of the paper'),
        h('h1', {}, 'Integrity of the panel during the fall'),
        h('p', { class: 'lede' }, 'The model keeps the façade rigid until its first impact. Here that assumption is checked. While the panel turns, every section across it must carry the force and the moment that keep the part above it in the rigid motion. With no tensile strength a section opens as soon as the resultant leaves it; the panel then turns in two blocks, and the lower block is followed until it reaches its own limit. With a tensile strength the elastic and the rigid-plastic forms of the check are both applied. The analysis works for any wall in total collapse, with its own blocks, friction and density; the defaults are the worked examples in total collapse, whose results in the paper are shown until the analysis is run.'),
        inputs(),
        els.status = h('div'),
        els.tiles = h('div', { class: 'tiles' }),
        h('div', { class: 'grid2' },
          h('div', { class: 'card' },
            h('h2', {}, '(a) One wall when its lower block reaches its limit'),
            h('p', { class: 'sub' }, 'Lower and upper block filled, the rigid panel at the same instant dashed; red lines at the first hinge (solid) and at the limit of the lower block (dashed). No tensile strength.'),
            h('div', { class: 'row chart-head' }, els.traceSel = h('select', { class: 'txt', style: 'width:auto;min-width:200px', onchange: (e) => drawTrace(e.target.value) }),
              els.traceNote = h('span', { class: 'muted small' }), h('div', { class: 'spacer' }), FD.chartActions(() => els.ca, 'fig5a')),
            els.legenda = h('div'), els.boxa = h('div')),
          h('div', {},
            chartCard('b', 'Height of the first hinge and of the limit of the lower block', 'Walls of equal t/H coincide. Squares: the joint slides at the first hinge.'),
            chartCard('c', 'Time from the first hinge to the limit of the lower block', 'For the walls in which the lower block reaches its limit.'))),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('h2', {}, 'Events of the fall (Fig. 6)'),
          h('p', { class: 'sub' }, 'One row per wall, ordered by t/H, with no tensile strength: rotation of the rigid panel from its release to its ground contact, the first hinge, and the valid two-block motion up to the limit of the lower block.'),
          h('div', { class: 'row chart-head' }, els.legend6 = h('div'), h('div', { class: 'spacer' }), FD.chartActions(() => els.c6, 'fig6')),
          els.box6 = h('div')),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('h2', {}, 'With a tensile strength'),
          h('p', { class: 'sub' }, 'Walls that land intact, and walls that reach the ground in at most two blocks; for those, the largest difference of P95 and Lmax at break-up from those of the rigid panel.'),
          els.ftTable = h('div')),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('div', { class: 'row' }, h('div', {}, h('h2', {}, 'Walls'), els.tableSub = h('p', { class: 'sub' })), h('div', { class: 'spacer' }),
            h('button', { class: 'btn ghost', onclick: () => exportCSV() }, FD.icon('download'), 'CSV'),
            h('button', { class: 'btn ghost', onclick: () => exportJSON() }, FD.icon('download'), 'JSON')),
          els.table = h('div')));
      if (!S.paper) S.paper = await window.api.exampleSummary('integrity');
      if (!S.summary) { S.summary = S.paper; S.computed = false; }
      showSource(); refreshEstimate(); renderStatus(); renderResults();
      FD.onTheme(() => { ['ca', 'cb', 'cc', 'c6'].forEach(k => els[k] && els[k].draw()); }, 'integrity');
    },
  };

  function chartCard(key, title, sub) {
    els['box' + key] = h('div');
    els['legend' + key] = h('div');
    return h('div', { class: 'card', style: key === 'c' ? 'margin-top:16px' : '' }, h('h2', {}, `(${key}) ${title}`), h('p', { class: 'sub' }, sub),
      h('div', { class: 'row chart-head' }, els['legend' + key], h('div', { class: 'spacer' }), FD.chartActions(() => els['c' + key], `fig5${key}`)), els['box' + key]);
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
    els.grid = h('div', { class: 'form-grid' },
      textField('Heights H', 'm, comma separated', g.heightsText, (v) => { g.heightsText = v; }),
      textField('Thicknesses t', 'm, comma separated', g.thicknessesText, (v) => { g.thicknessesText = v; }),
      field('Block width bx', 'm', g.bx, (v) => { g.bx = v; }, { step: 0.05, min: 0.05 }),
      field('Block height by', 'm', g.by, (v) => { g.by = v; }, { step: 0.05, min: 0.05 }),
      field('Diatone courses every', 'm (0 = none)', g.diatoneStep, (v) => { g.diatoneStep = v; }, { step: 0.5, min: 0 }),
      field('Friction μ, block–block', '', g.mu ?? pp.mu, (v) => { g.mu = v; }, { step: 0.01, min: 0 }),
      field('Friction μg, block–street', '', g.muG ?? pp.muG, (v) => { g.muG = v; }, { step: 0.01, min: 0 }),
      field('Density ρ', 'kg/m³', g.rho ?? pp.rho, (v) => { g.rho = v; }, { step: 50, min: 100 }));
    const file = h('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none', onchange: (e) => loadCSV(e.target.files[0]) });
    els.csvLab = h('span', { class: 'muted small' }, S.csv.walls.length ? csvLabel() : 'no file loaded');
    els.csv = h('div', {},
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => file.click() }, FD.icon('folder'), 'Load CSV…'), file, els.csvLab,
        h('div', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: async () => FD.saveText('walls_template.csv', await window.api.wallsTemplate(), 'csv') }, FD.icon('download'), 'Template')),
      h('p', { class: 'muted small' }, 'The file of the parametric study. Only the walls in total collapse (mechanism T) are analysed: a partial collapse pivots on the wall below it, which this analysis does not model. Used columns: id, H_m, t_m, bx_m, by_m, diatone_step_m, mu, muG, rho.'));
    const exs = info.examples.filter(x => x.wall.mechanism === 'total'), ids = exs.map(x => x.id);
    els.camp = h('div', {}, h('div', { class: 'chips' }, exs.map(x => h('button', { type: 'button', class: 'chip' + (S.examples.includes(x.id) ? ' on' : ''),
      onclick: (e) => { const i = S.examples.indexOf(x.id); if (i >= 0) { if (S.examples.length > 1) S.examples.splice(i, 1); } else S.examples.push(x.id);
        S.examples.sort((a, b) => ids.indexOf(a) - ids.indexOf(b)); e.currentTarget.classList.toggle('on', S.examples.includes(x.id)); refreshEstimate(); } }, x.title))),
      h('p', { class: 'muted small' }, 'The worked examples in total collapse, compared with the paper’s results for them.'));
    const wk = h('input', { type: 'range', min: 1, max: info.cores, value: S.workers, oninput: (e) => { S.workers = +e.target.value; wkLab.textContent = S.workers; refreshEstimate(); } });
    const wkLab = h('b', { class: 'num' }, S.workers);
    els.runBtn = h('button', { class: 'btn', onclick: () => (S.running ? stop() : start()) });
    els.estimate = h('span', { class: 'muted small' });
    return h('div', { class: 'card' },
      h('div', { class: 'filters' },
        h('span', { class: 'lab' }, 'Walls'), seg([['examples', 'Worked examples'], ['grid', 'Grid of H and t'], ['csv', 'From a CSV file']], S.source, (v) => { S.source = v; showSource(); refreshEstimate(); }),
        h('span', {}), h('div', {}, els.camp, els.grid, els.csv),
        h('span', { class: 'lab' }, 'Tensile strength'), h('div', { class: 'row' },
          h('input', { class: 'txt', value: S.ftText, style: 'width:160px', oninput: (e) => { S.ftText = e.target.value; refreshEstimate(); } }),
          h('span', { class: 'muted small' }, 'MPa, comma separated; the analysis with no tensile strength is always made. The paper and its examples use 0.04 and 0.10')),
        h('span', { class: 'lab' }, 'Parallel runs'), h('div', { class: 'row' }, wk, wkLab, h('span', { class: 'muted small' }, `of ${info.cores} cores`))),
      h('div', { class: 'row', style: 'margin-top:18px' }, els.runBtn, h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost', title: 'Show the paper’s results for the examples', onclick: () => { S.summary = S.paper; S.computed = false; renderResults(); } }, 'Paper results'),
        h('button', { class: 'btn ghost', title: 'Open the folder where the results of this computer are stored', onclick: () => window.api.openPath(info.resultsDir) }, FD.icon('folder'), 'Results folder'),
        h('button', { class: 'btn ghost', title: 'Delete the stored results of this view (they are recomputed at the next run)',
          onclick: async () => { if (S.running) return; if (!confirm('Delete the results stored on this computer for the integrity analysis?')) return; await window.api.clearResults('integrity'); FD.toast('Stored results deleted'); } }, 'Clear stored results')),
      h('div', { style: 'margin-top:8px' }, els.estimate));
  }
  function showSource() {
    els.grid.style.display = S.source === 'grid' ? '' : 'none';
    els.csv.style.display = S.source === 'csv' ? '' : 'none';
    els.camp.style.display = S.source === 'examples' ? '' : 'none';
  }
  const csvLabel = () => `${S.csv.name}: ${S.csv.walls.length} wall${S.csv.walls.length === 1 ? '' : 's'} in total collapse` + (S.csv.nPartial ? `, ${S.csv.nPartial} partial collapse${S.csv.nPartial === 1 ? '' : 's'} left out` : '');
  async function loadCSV(f) {
    if (!f) return;
    try {
      const all = await window.api.wallsFromCSV(await f.text());
      S.csv = { walls: all.filter(w => w.mechanism === 'total'), name: f.name, nPartial: all.filter(w => w.mechanism !== 'total').length };
      if (!S.csv.walls.length) throw new Error('no wall in total collapse');
      els.csvLab.textContent = csvLabel();
      refreshEstimate();
    } catch (e) { FD.toast(`Could not read ${f.name}: ${String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`); }
  }

  async function refreshEstimate() {
    if (!els.runBtn) return;
    els.runBtn.replaceChildren(FD.icon(S.running ? 'stop' : 'play'), S.running ? 'Stop' : 'Run the analysis');
    els.runBtn.classList.toggle('danger', !!S.running);
    let o;
    try { o = studyOptions(); } catch (e) { els.estimate.textContent = e.message; els.runBtn.disabled = !S.running; return; }
    try {
      const est = await window.api.estimate('integrity', o, S.workers);
      els.runBtn.disabled = false;
      els.estimate.textContent = `${est.nConfigs} wall${est.nConfigs === 1 ? '' : 's'}, ${o.fts.length ? `tensile strengths ${o.fts.join(', ')} MPa` : 'no tensile strength only'} · about ${FD.duration(est.wall_s)} with ${S.workers} parallel runs (on an Apple M4; less if some walls are already stored)`;
    } catch (e) { els.estimate.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); els.runBtn.disabled = !S.running; }
  }

  async function start() {
    let opts;
    try { opts = studyOptions(); } catch (e) { FD.toast(e.message); return; }
    S.error = null; S.progress = { done: 0, total: 0 };
    const { id } = await window.api.startStudy('integrity', opts, S.workers);
    S.running = id;
    const offP = window.api.onStudyProgress((m) => { if (m.id !== id) return; S.progress = m; renderStatus(); });
    const offS = window.api.onStudyPartial((m) => { if (m.id !== id) return; S.summary = m.summary; S.computed = true; renderResults(); });
    const offE = window.api.onStudyError((m) => { if (m.id !== id) return; S.error = m.message; renderStatus(); });
    const offD = window.api.onStudyDone((m) => {
      if (m.id !== id) return;
      offP(); offS(); offE(); offD();
      S.running = null; S.summary = m.summary; S.computed = true; S.cancelled = m.cancelled;
      refreshEstimate(); renderStatus(); renderResults();
      FD.toast(m.cancelled ? 'Analysis stopped; the walls done so far are stored and will be reused' : 'Analysis complete');
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
    if (p && p.total) parts.push(`${p.done} of ${p.total} walls`);
    if (p && p.resumed) parts.push(`${p.resumed} reused from stored results`);
    if (p && p.elapsed_s != null) parts.push(`elapsed ${FD.duration(p.elapsed_s)}`);
    if (S.running && p && p.eta_s != null && p.done < p.total) parts.push(`about ${FD.duration(p.eta_s)} left`);
    if (!S.running) parts.push(S.cancelled ? 'stopped' : 'complete');
    els.status.replaceChildren(h('div', { class: 'card', style: 'margin-top:16px' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, h('b', {}, S.running ? 'Running' : S.cancelled ? 'Stopped' : 'Done'), h('span', { class: 'muted small' }, parts.join(' · '))),
      h('div', { class: 'progress' + (S.running && !(p && p.total) ? ' indet' : '') }, h('div', { style: `width:${(pct * 100).toFixed(1)}%` })),
      S.error ? h('p', { class: 'small', style: 'color:var(--critical)' }, S.error.split('\n')[0]) : null));
  }

  // ------------------------------------------------------------------ results
  const rng = (a, d = 2, unit = '') => !a || !Number.isFinite(a[0]) ? '–' : (fmt(a[0], d) === fmt(a[1], d) ? fmt(a[0], d) : `${fmt(a[0], d)}–${fmt(a[1], d)}`) + unit;
  const ftName = (k) => `${k.replace('MPa', '')} MPa`;
  const run0 = (r) => (r.fc && r.fc['0']) || {};
  const exTitle = (id) => { const x = info.examples.find(e => e.id === id); return x ? x.title : id; };
  const wallName = (r) => `${r.example ? exTitle(r.example) : r.id} · H ${r.H} m · t ${fmt(r.t, 2)} m`;

  function renderResults() {
    if (!els.tiles) return;
    const sm = S.summary, T = sm.totals, R = sm.rows, keys = sm.keys;
    const tiles = [
      FD.tile('Walls', String(T.n), `${T.nHinge} hinge before landing with no tensile strength` + (T.nNoImpact ? `; ${T.nNoImpact} without an impact (left out)` : '')),
      FD.tile('First hinge', rng(T.thetaRange, 1, '°'), `s/H ${rng(T.sRange)}; ${T.allInnerFace ? 'always at the inner face' : 'inner or street face'}`),
      FD.tile('Lower block at its limit', `${T.nLower} of ${T.nHinge}`, T.nLower ? `${rng(T.lowerMsRange.map(x => x), 1)} ms after the first hinge` + (T.nLowerSlide ? `; the joint slides first in ${T.nLowerSlide}` : '') : (T.nLowerSlide ? `the joint slides first in ${T.nLowerSlide}` : '')),
      FD.tile('Upper block alone, second hinge', `${T.nUpper} of ${T.nHinge}`, (T.nUpper ? `s/H ${rng(T.upperSRange)}, ${rng(T.upperTRange)} s after the first` : '') + (T.nUpperSlide ? `${T.nUpper ? '; ' : ''}the joint slides in ${T.nUpperSlide}` : '')),
      FD.tile('A bed joint slides first', String(T.nSlideFirst), T.nSlideFirst ? `${rng(T.slideLeadRange)}° before the first hinge` : 'in no wall'),
    ];
    for (const k of keys) tiles.push(FD.tile(`f_t = ${ftName(k)}, intact at landing`, `${T.survElastic[k]} / ${T.survPlastic[k]}`, 'elastic / rigid-plastic form'));
    if (S.computed && T.nCompared) tiles.push(FD.tile('Agreement with the paper', `${T.nIdentical} / ${T.nCompared}`,
      T.nIdentical === T.nCompared ? 'examples identical to the paper’s results' : `walls identical; the others differ by at most ${T.maxRelDiff < 1e-6 ? T.maxRelDiff.toExponential(0) : fmt(100 * T.maxRelDiff, 3) + ' %'} (rounding)`));
    els.tiles.replaceChildren(...tiles);
    renderTraceSelect(R);
    renderFig5bc(R);
    renderFig6(R);
    renderTensile(sm);
    renderTable(sm);
  }

  // (a): one wall, computed on request in a worker (about 10-20 s)
  function renderTraceSelect(R) {
    const ok = R.filter(r => r.firstViolation && run0(r).end === 'hingeB1');
    const prev = S.traceId && ok.some(r => r.id === S.traceId) ? S.traceId : (ok[0] || {}).id;
    els.traceSel.replaceChildren(...ok.map(r => h('option', { value: r.id, selected: r.id === prev ? true : null }, `${r.example ? exTitle(r.example) : r.id}  (t/H ${fmt(r.t / r.H, 3)})`)));
    els.traceSel.disabled = !ok.length;
    if (!ok.length) { els.traceNote.textContent = 'no wall whose lower block reaches its limit'; return; }
    if (prev !== S.traceId || !els.ca) drawTrace(prev);
  }
  const traceWall = (id) => S.summary.rows.find(x => x.id === id).wall;
  async function drawTrace(id) {
    if (!id) return;
    S.traceId = id;
    const wall = traceWall(id), key = JSON.stringify(wall);
    if (!S.traces.has(key)) {
      els.traceNote.textContent = 'computing… (about 15 s)';
      const tok = S.tracing = key;
      try { S.traces.set(key, await window.api.integrityJob('integrityTrace', wall)); }
      catch (e) { if (S.tracing === tok) els.traceNote.textContent = String(e.message || e).split('\n')[0]; return; }
      if (S.tracing !== tok || S.traceId !== id) return;
    }
    const c = S.traces.get(key);
    if (!c.ok) { els.traceNote.textContent = c.reason; return; }
    els.traceNote.textContent = `first hinge at ${fmt(c.onset.theta, 1)}°, s/H ${fmt(c.onset.sOverH, 2)}; limit ${fmt(1000 * c.tAfter, 1)} ms later, at s/H ${fmt(c.lowerSOverH, 2)}`;
    const ln = (q, dash, width) => ({ x1: q[0][0], y1: q[0][1], x2: q[1][0], y2: q[1][1], color: '--critical', width, dash });
    const spec = { height: 470, equal: true, x: { label: 'x [m]', min: -1 }, y: { label: 'y [m]', min: -0.4, max: c.H * 1.08 },
      polys: [{ points: c.rigidPanel, stroke: '--ref', width: 1.2, dash: true },
        { points: c.blocks[0], fill: '--series-1', opacity: 0.22, stroke: '--series-1', width: 1.4 },
        { points: c.blocks[1], fill: '--series-2', opacity: 0.22, stroke: '--series-2', width: 1.4 }],
      segs: [{ x1: -1, y1: 0, x2: c.H * 0.75, y2: 0, color: '--ink', width: 1.2 }, ln(c.hingeLine, false, 2.2)].concat(c.lowerLine ? [ln(c.lowerLine, true, 2)] : []),
      series: [] };
    els.legenda.replaceChildren(FD.legend([{ name: 'lower block', marker: 'line', color: '--series-1' }, { name: 'upper block', marker: 'line', color: '--series-2' },
      { name: 'rigid panel', marker: 'dash', color: '--ref' }, { name: 'first hinge', marker: 'line', color: '--critical' }, { name: 'limit of the lower block', marker: 'dash', color: '--critical' }]));
    if (els.ca) els.ca.update(spec); else els.ca = new FD.Chart(els.boxa, spec);
  }

  function tipOf(r) {
    const q = run0(r), low = q.end === 'hingeB1';
    return { title: wallName(r), rows: [['t / H', fmt(r.t / r.H, 3)], ['first hinge', q.thetaOnset != null ? `${fmt(q.thetaOnset, 1)}°, s/H ${fmt(q.sOverH, 2)}` : '–'],
      ['lower block', low ? `limit at s/H ${fmt(q.newHinge.s_over_H, 2)}, ${fmt(1000 * q.tAfterHinge, 1)} ms` : q.end === 'jointSliding' ? 'the joint slides' : (q.end || '–')],
      ['upper block alone', r.b2 ? (r.b2.end === 'secondHingeB2' ? `second hinge at s/H ${fmt(r.b2.newHinge.s_over_H, 2)}, ${fmt(r.b2.tAfterHinge, 2)} s` : r.b2.end === 'jointSliding' ? 'the joint slides' : r.b2.end) : '–'],
      ['landing of the rigid panel', `${fmt(r.thetaImpact, 1)}°`]] };
  }
  function renderFig5bc(R) {
    const H = R.filter(r => r.firstViolation && run0(r).thetaOnset != null), low = H.filter(r => run0(r).end === 'hingeB1'), js = H.filter(r => run0(r).end === 'jointSliding');
    const P = (rows, y) => rows.map(r => Object.assign({ x: r.t / r.H, y: y(r) }, { r }));
    const xAxis = { label: 't / H', log: true, fmt: (v) => String(+v.toPrecision(2)) };
    const tip = (p) => tipOf(p.r);
    const specB = { height: 260, x: xAxis, y: { label: 's / H', min: 0, max: 1.05 }, tooltip: tip, series: [
      { name: 'joint slides first', color: '--series-3', marker: 'square', filled: false, size: 6, points: P(js, r => run0(r).sOverH) },
      { name: 'first hinge', color: '--series-1', marker: 'circle', filled: true, points: P(H, r => run0(r).sOverH) },
      { name: 'lower block at its limit', color: '--series-2', marker: 'triangle', filled: false, size: 4.6, points: P(low, r => run0(r).newHinge.s_over_H) }] };
    els.legendb.replaceChildren(FD.legend([{ name: 'first hinge', marker: 'circle', color: '--series-1', filled: true }, { name: 'lower block at its limit', marker: 'triangle', color: '--series-2', filled: false },
      { name: 'joint slides first', marker: 'square', color: '--series-3', filled: false }]));
    const specC = { height: 220, x: xAxis, y: { label: 'time [ms]', log: true, fmt: (v) => String(+v.toPrecision(2)) }, tooltip: tip, series: [
      { name: 'lower block at its limit', color: '--series-2', marker: 'triangle', filled: false, size: 4.6, points: P(low, r => 1000 * run0(r).tAfterHinge) }] };
    els.legendc.replaceChildren(FD.legend([{ name: 'lower block at its limit', marker: 'triangle', color: '--series-2', filled: false }]));
    if (els.cb) els.cb.update(specB); else els.cb = new FD.Chart(els.boxb, specB);
    if (els.cc) els.cc.update(specC); else els.cc = new FD.Chart(els.boxc, specC);
  }

  function renderFig6(R) {
    const rows = R.filter(r => r.firstViolation && run0(r).thetaOnset != null).slice().sort((a, b) => a.H / a.t - b.H / b.t || String(a.id).localeCompare(String(b.id)));
    const segs = [], hinge = [], slide = [];
    rows.forEach((r, k) => {
      const q = run0(r);
      segs.push({ x1: r.theta0, y1: k, x2: r.thetaImpact, y2: k, color: '--ref', width: 1 });
      segs.push({ x1: r.thetaImpact, y1: k - 0.38, x2: r.thetaImpact, y2: k + 0.38, color: '--ink', width: 1.2 });
      if (q.end === 'hingeB1') {
        segs.push({ x1: q.thetaOnset, y1: k, x2: q.thetaEnd[0], y2: k, color: '--series-1', width: 5, cap: 'butt' });
        segs.push({ x1: q.thetaEnd[0], y1: k - 0.42, x2: q.thetaEnd[0], y2: k + 0.42, color: '--series-2', width: 2 });
      } else if (q.end === 'jointSliding') slide.push({ x: q.thetaOnset, y: k, r });
      hinge.push({ x: q.thetaOnset, y: k, r });
    });
    // y labels: t/H of the groups of equal slenderness, thinned so that they do not overlap
    const groups = new Map();
    rows.forEach((r, k) => { const g = +(r.t / r.H).toFixed(4); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); });
    const ticks = [], labels = new Map(), minGap = Math.max(1, rows.length / 14);
    let last = -Infinity;
    for (const [g, ks] of groups) { const c = (ks[0] + ks[ks.length - 1]) / 2; if (c - last >= minGap) { ticks.push(c); labels.set(c, fmt(g, 2)); last = c; } }
    const n = Math.max(rows.length, 1);
    const spec = { height: Math.max(260, Math.min(720, 60 + 9 * n)), x: { label: 'rotation of the panel θ [°]', min: 0, max: 93 },
      y: { label: 'walls, by t / H', min: -1, max: n, ticks, fmt: (v) => labels.get(v) || '' }, segs, tooltip: (p) => tipOf(p.r),
      series: [{ name: 'joint slides', color: '--series-3', marker: 'square', filled: true, size: 3.6, points: slide },
               { name: 'first hinge', color: '--ink', marker: 'circle', filled: true, size: 2.6, points: hinge }] };
    els.legend6.replaceChildren(FD.legend([{ name: 'rigid panel', marker: 'line', color: '--ref' }, { name: 'first hinge', marker: 'circle', color: '--ink', filled: true },
      { name: 'valid two-block motion', marker: 'line', color: '--series-1' }, { name: 'lower block at its limit', marker: 'line', color: '--series-2' },
      { name: 'joint slides', marker: 'square', color: '--series-3', filled: true }, { name: 'ground contact', marker: 'line', color: '--ink' }]));
    if (els.c6) els.c6.update(spec); else els.c6 = new FD.Chart(els.box6, spec);
  }

  function renderTensile(sm) {
    const T = sm.totals;
    if (!sm.keys.length) { els.ftTable.replaceChildren(h('p', { class: 'muted small' }, 'No tensile strength given.')); return; }
    const pct = (v) => Number.isFinite(v) ? `${fmt(v, 2)} %` : '–';
    const rows = sm.keys.map(k => ({ k, se: T.survElastic[k], sp: T.survPlastic[k], ge: T.groundElastic[k], gp: T.groundPlastic[k] }));
    els.ftTable.replaceChildren(FD.table(rows, [
      { label: 'Tensile strength f_t', get: (r) => ftName(r.k) },
      { label: 'Intact at landing, elastic', n: true, get: (r) => `${r.se} of ${T.n}` },
      { label: 'Intact at landing, rigid-plastic', n: true, get: (r) => `${r.sp} of ${T.n}` },
      { label: 'At most two blocks, elastic', n: true, get: (r) => `${r.ge} of ${T.n}` },
      { label: 'At most two blocks, rigid-plastic', n: true, get: (r) => `${r.gp} of ${T.n}` },
    ]), h('p', { class: 'muted small', style: 'margin-top:8px' },
      `For the walls that reach the ground in at most two blocks, P95 and Lmax at break-up differ from those of the rigid panel by at most ${pct(T.marginMaxElastic)} (elastic) and ${pct(T.marginMaxPlastic)} (rigid-plastic)`
      + (Number.isFinite(T.twoBlockOnsetElastic[0]) || Number.isFinite(T.twoBlockOnsetPlastic[0]) ? `; those that hinge do so at ${rng(T.twoBlockOnsetElastic, 0, '°')} (elastic) and ${rng(T.twoBlockOnsetPlastic, 0, '°')} (rigid-plastic), late in the fall.` : '.')));
  }

  function renderTable(sm) {
    els.tableSub.textContent = S.computed ? 'Computed on this computer.' : 'The paper’s results for the examples (nothing has been run on this computer yet).';
    const th = (x) => x ? `${fmt(x.theta, 1)}°` : 'intact';
    const cols = [
      { label: 'Wall', get: (r) => r.id, csv: (r) => r.id },
      { label: 'H [m]', n: true, get: (r) => fmt(r.H, 2), csv: (r) => r.H },
      { label: 't [m]', n: true, get: (r) => fmt(r.t, 2), csv: (r) => r.t },
      { label: 't/H', n: true, get: (r) => fmt(r.t / r.H, 3), csv: (r) => r.t / r.H },
      { label: 'Landing [°]', n: true, title: 'rotation of the rigid panel at its ground contact', get: (r) => fmt(r.thetaImpact, 1), csv: (r) => r.thetaImpact },
      { label: 'First hinge [°]', n: true, get: (r) => fmt(run0(r).thetaOnset, 1), csv: (r) => run0(r).thetaOnset ?? '' },
      { label: 's/H', n: true, get: (r) => fmt(run0(r).sOverH, 2), csv: (r) => run0(r).sOverH ?? '' },
      { label: 'Lower limit s/H', n: true, get: (r) => run0(r).end === 'hingeB1' ? fmt(run0(r).newHinge.s_over_H, 2) : run0(r).end === 'jointSliding' ? 'joint slides' : '–',
        csv: (r) => run0(r).end === 'hingeB1' ? run0(r).newHinge.s_over_H : run0(r).end || '' },
      { label: 'after [ms]', n: true, get: (r) => run0(r).end === 'hingeB1' ? fmt(1000 * run0(r).tAfterHinge, 1) : '–', csv: (r) => run0(r).end === 'hingeB1' ? 1000 * run0(r).tAfterHinge : '' },
      { label: 'Upper block alone', get: (r) => !r.b2 ? '–' : r.b2.end === 'secondHingeB2' ? `s/H ${fmt(r.b2.newHinge.s_over_H, 2)}, ${fmt(r.b2.tAfterHinge, 2)} s` : r.b2.end === 'jointSliding' ? 'joint slides' : r.b2.end,
        csv: (r) => !r.b2 ? '' : r.b2.end === 'secondHingeB2' ? r.b2.newHinge.s_over_H : r.b2.end },
      { label: 'Joint slides first', n: true, get: (r) => r.slideBeforeHinge ? `${fmt(r.slideLeadDeg, 2)}° before` : '–', csv: (r) => r.slideBeforeHinge ? r.slideLeadDeg : '' },
    ];
    for (const k of sm.keys) cols.push(
      { label: `${ftName(k)}, elastic`, n: true, title: 'rotation at which a section first fails, or intact at landing', get: (r) => th(r.elastic && r.elastic[k]), csv: (r) => r.elastic && r.elastic[k] ? r.elastic[k].theta : 'intact' },
      { label: `${ftName(k)}, rigid-plastic`, n: true, get: (r) => th(r.plastic && r.plastic[k]), csv: (r) => r.plastic && r.plastic[k] ? r.plastic[k].theta : 'intact' });
    els.cols = cols;
    els.table.replaceChildren(FD.table(sm.rows, cols));
  }

  function exportCSV() { FD.saveText(S.computed ? 'integrity.csv' : 'integrity_paper_examples.csv', FD.toCSV(S.summary.rows, els.cols), 'csv'); }
  function exportJSON() { FD.saveText(S.computed ? 'integrity.json' : 'integrity_paper_examples.json', JSON.stringify(S.summary, null, 1), 'json'); }
})(window.FD);
