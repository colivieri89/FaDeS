'use strict';
// Sect. 5 of the paper, total collapse: P95/H at break-up and at rest, the increment added by the debris phase and
// Lmax/H, seed medians per configuration (Fig. 7). Shows the paper's values from the stored runs until a study is run.
(function (FD) {
  const { h, fmt } = FD;
  const HEIGHTS = [2.5, 5, 7.5, 10, 12.5, 15];
  const S = {
    options: { campaigns: ['C1', 'C2'], heights: HEIGHTS.slice(), thicknesses: [0.30, 0.60, 0.90, 1.20], seedsText: '1-20', cases: [], casesName: '' },
    workers: null, paper: null, summary: null, computed: false, running: null, progress: null, store: null, error: null,
  };
  let els = {};

  function studyOptions() {
    const o = S.options;
    return { campaigns: o.campaigns, heights: o.heights, thicknesses: o.thicknesses, seeds: FD.parseSeeds(o.seedsText), cases: o.cases };
  }

  FD.views.total = {
    title: 'Total collapse',
    async render(root, info) {
      if (S.workers == null) S.workers = info.defaultWorkers;
      els = {};
      root.append(
        h('div', { class: 'kicker' }, 'Paper · Section 5 · Fig. 7'),
        h('h1', {}, 'Total collapse: the extent at break-up and at rest'),
        h('p', { class: 'lede' }, 'For every configuration of campaigns C1 and C2 the 20 seeds are run to rest. P95 by mass is measured on the blocks at the instant of break-up and again at rest; the increment is what the debris phase adds. Values are seed medians, normalised by the height H. Only runs that reached rest enter, as in the paper.'),
        controls(info),
        els.status = h('div'),
        els.tiles = h('div', { class: 'tiles' }),
        h('div', { class: 'grid2' },
          chartCard('a', 'P95 / H at rest and at break-up', 'Filled: at rest. Open: at the instant of break-up. The dotted line is P95 = H.'),
          chartCard('b', 'Increment added by the debris phase', 'Increment of P95/H from break-up to rest, against 3 % of P95/H (the tolerance of the convergence test).')),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('div', { class: 'row' }, h('div', {}, h('h2', {}, 'Configurations'), els.tableSub = h('p', { class: 'sub' })), h('div', { class: 'spacer' }),
            h('button', { class: 'btn ghost', onclick: () => exportCSV() }, FD.icon('download'), 'CSV'),
            h('button', { class: 'btn ghost', onclick: () => exportJSON() }, FD.icon('download'), 'JSON')),
          els.table = h('div')));
      if (!S.paper) S.paper = await window.api.paperSummary('total', {});
      if (!S.summary) { S.summary = S.paper; S.computed = false; }
      refreshEstimate(); renderStatus(); renderResults();
      FD.onTheme(() => { els.ca && els.ca.draw(); els.cb && els.cb.draw(); }, 'total');
    },
  };

  function chipSet(values, selected, label, onchange) {
    return h('div', { class: 'chips' }, values.map(v => h('button', { class: 'chip' + (selected.includes(v) ? ' on' : ''), type: 'button',
      onclick: (e) => {
        const i = selected.indexOf(v);
        if (i >= 0) { if (selected.length > 1) selected.splice(i, 1); } else selected.push(v);
        selected.sort((a, b) => (typeof a === 'number' ? a - b : String(a).localeCompare(String(b))));
        e.currentTarget.classList.toggle('on', selected.includes(v));
        onchange();
      } }, label(v))));
  }

  function controls(info) {
    const o = S.options;
    const changed = () => refreshEstimate();
    const seeds = h('input', { class: 'txt', value: o.seedsText, style: 'width:140px', oninput: (e) => { o.seedsText = e.target.value; changed(); } });
    const wk = h('input', { type: 'range', min: 1, max: info.cores, value: S.workers, oninput: (e) => { S.workers = +e.target.value; wkLab.textContent = S.workers; changed(); } });
    const wkLab = h('b', { class: 'num' }, S.workers);
    const casesInput = h('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none', onchange: (e) => loadCases(e.target.files[0]) });
    els.casesLab = h('span', { class: 'muted small' }, o.cases.length ? `${o.casesName}: ${o.cases.length} walls` : 'none loaded');
    els.runBtn = h('button', { class: 'btn', onclick: () => (S.running ? stop() : start()) });
    els.estimate = h('span', { class: 'muted small' });
    return h('div', { class: 'card' },
      h('div', { class: 'filters' },
        h('span', { class: 'lab' }, 'Campaigns'), chipSet(['C1', 'C2'], o.campaigns, (c) => info.campaigns.find(x => x.id === c).label, changed),
        h('span', { class: 'lab' }, 'Heights H'), chipSet(HEIGHTS, o.heights, (v) => `${v} m`, changed),
        h('span', { class: 'lab' }, 'Thickness t'), chipSet([0.30, 0.60, 0.90, 1.20], o.thicknesses, (v) => `${v.toFixed(2)} m`, changed),
        h('span', { class: 'lab' }, 'Seeds'), h('div', { class: 'row' }, seeds, h('span', { class: 'muted small' }, 'list or ranges, e.g. 1-20 or 1,4,9; the paper uses 1-20')),
        h('span', { class: 'lab' }, 'Documented walls'), h('div', { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => casesInput.click() }, FD.icon('folder'), 'Load CSV…'), casesInput, els.casesLab,
          h('span', { class: 'muted small' }, 'optional; columns id, mechanism, H_m, t_m, Hr_m (template in reference/)')),
        h('span', { class: 'lab' }, 'Parallel runs'), h('div', { class: 'row' }, wk, wkLab, h('span', { class: 'muted small' }, `of ${info.cores} cores`))),
      h('div', { class: 'row', style: 'margin-top:18px' }, els.runBtn, h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost', title: 'Show the values of the paper (stored runs)', onclick: () => { S.summary = S.paper; S.computed = false; renderResults(); } }, 'Paper values'),
        h('button', { class: 'btn ghost', title: 'Open the folder where the runs of this computer are stored', onclick: () => window.api.openPath(info.resultsDir) }, FD.icon('folder'), 'Results folder'),
        h('button', { class: 'btn ghost', title: 'Delete the stored runs of this view (they are recomputed at the next run)',
          onclick: async () => { if (S.running) return; if (!confirm('Delete the runs stored on this computer for Total collapse?')) return; await window.api.clearResults('total'); FD.toast('Stored runs deleted'); } }, 'Clear stored runs')),
      h('div', { style: 'margin-top:8px' }, els.estimate));
  }

  async function refreshEstimate() {
    if (!els.runBtn) return;
    els.runBtn.replaceChildren(FD.icon(S.running ? 'stop' : 'play'), S.running ? 'Stop' : 'Run the study');
    els.runBtn.classList.toggle('danger', !!S.running);
    let seeds;
    try { seeds = FD.parseSeeds(S.options.seedsText); } catch (e) { els.estimate.textContent = e.message; els.runBtn.disabled = !S.running; return; }
    els.runBtn.disabled = false;
    const est = await window.api.estimate('total', studyOptions(), S.workers);
    els.estimate.textContent = `${est.nConfigs} configurations × ${seeds.length} seeds = ${est.nRuns.toLocaleString('en-US')} runs · about ${FD.duration(est.wall_s)} with ${S.workers} parallel runs (from the paper's run times on an Apple M4; less if some runs are already stored)`;
  }

  async function loadCases(file) {
    if (!file) return;
    try {
      const rows = FD.parseCSV(await file.text());
      const need = ['id', 'mechanism', 'H_m', 't_m'];
      const miss = need.filter(k => !(k in (rows[0] || {})));
      if (miss.length) throw new Error(`missing columns: ${miss.join(', ')}`);
      const cases = rows.filter(r => r.id !== '').map(r => ({ id: String(r.id), mechanism: String(r.mechanism).trim(), H_m: +r.H_m, t_m: +r.t_m, Hr_m: r.Hr_m === '' || r.Hr_m == null ? null : +r.Hr_m }));
      const bad = cases.find(c => !(c.H_m > 0 && c.t_m > 0) || !['T', 'P1', 'P2'].includes(c.mechanism));
      if (bad) throw new Error(`wall ${bad.id}: H_m and t_m must be positive, mechanism T, P1 or P2`);
      S.options.cases = cases; S.options.casesName = file.name;
      const nT = cases.filter(c => c.mechanism === 'T').length;
      els.casesLab.textContent = `${file.name}: ${cases.length} walls, ${nT} total collapses (the only ones used here)`;
      refreshEstimate();
    } catch (e) { FD.toast(`Could not read ${file.name}: ${e.message}`); }
  }

  async function start() {
    let opts;
    try { opts = studyOptions(); } catch (e) { FD.toast(e.message); return; }
    S.error = null; S.progress = { done: 0, total: 0 };
    const { id, store } = await window.api.startStudy('total', opts, S.workers);
    S.running = id; S.store = store;
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
    const bar = h('div', { class: 'progress' + (S.running && !p.total ? ' indet' : '') }, h('div', { style: `width:${(pct * 100).toFixed(1)}%` }));
    const parts = [];
    if (p && p.total) parts.push(`${p.done.toLocaleString('en-US')} of ${p.total.toLocaleString('en-US')} jobs`);
    if (p && p.resumed) parts.push(`${p.resumed.toLocaleString('en-US')} reused from stored runs`);
    if (p && p.elapsed_s != null) parts.push(`elapsed ${FD.duration(p.elapsed_s)}`);
    if (S.running && p && p.eta_s != null && p.done < p.total) parts.push(`about ${FD.duration(p.eta_s)} left`);
    if (!S.running) parts.push(S.cancelled ? 'stopped' : 'complete');
    els.status.replaceChildren(h('div', { class: 'card', style: 'margin-top:16px' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, h('b', {}, S.running ? 'Running' : S.cancelled ? 'Stopped' : 'Done'), h('span', { class: 'muted small' }, parts.join(' · '))),
      bar, S.error ? h('p', { class: 'small', style: 'color:var(--critical)' }, S.error.split('\n')[0]) : null));
  }

  function chartCard(key, title, sub) {
    const c = h('div');
    els['box' + key] = c;
    els['legend' + key] = h('div');
    return h('div', { class: 'card' }, h('h2', {}, `(${key}) ${title}`), h('p', { class: 'sub' }, sub),
      h('div', { class: 'row chart-head' }, els['legend' + key], h('div', { class: 'spacer' }), FD.chartActions(() => els['c' + key], `fig7${key}`)), c);
  }

  const GROUPS = [
    { key: 'C1', name: 'C1, blocks 0.15 × 0.15 m', color: '--series-1', marker: 'circle' },
    { key: 'C2', name: 'C2, blocks 0.40 × 0.20 m', color: '--series-2', marker: 'square' },
    { key: 'case', name: 'Documented walls', color: '--series-3', marker: 'triangle' },
  ];

  const pctTxt = (d) => d === 0 ? '0' : d < 0.001 ? '< 0.001' : fmt(d, 3);
  const signedPct = (d) => d === 0 ? '0' : Math.abs(d) < 0.001 ? '< 0.001' : FD.fmtSigned(d, 3);

  function renderResults() {
    if (!els.tiles) return;
    const sm = S.summary, T = sm.totals, rows = sm.rows.filter(r => Number.isFinite(r.p95Rest_H));
    const groups = GROUPS.filter(g => rows.some(r => r.campaign === g.key));
    const tip = (r) => ({ title: r.case ? `Documented wall ${r.case}` : `${r.campaign} · H ${r.H} m · t ${r.t.toFixed(2)} m`, rows: [
      ['t / H', fmt(r.tOverH, 3)], ['P95/H at rest', fmt(r.p95Rest_H, 3)], ['P95/H at break-up', fmt(r.p95Break_H, 3)],
      ['increment', fmt(r.inc_H, 4) + ' H'], ['Lmax/H', fmt(r.Lmax_H, 3)], ['seeds at rest', String(r.nSeeds)]].concat(r.ref ? [['paper P95/H', fmt(r.ref.p95Rest_H, 3)]] : []) });
    const seriesA = [], seriesB = [];
    for (const g of groups) {
      const d = rows.filter(r => r.campaign === g.key).map(r => Object.assign({ x: r.tOverH }, r));
      seriesA.push({ name: `${g.name}, at rest`, color: g.color, marker: g.marker, filled: true, points: d.map(r => Object.assign({}, r, { y: r.p95Rest_H })) });
      seriesA.push({ name: `${g.name}, at break-up`, color: g.color, marker: g.marker, filled: false, size: 3.4, points: d.map(r => Object.assign({}, r, { y: r.p95Break_H })) });
      seriesB.push({ name: g.name, color: g.color, marker: g.marker, filled: true, points: d.map(r => Object.assign({}, r, { y: r.inc_H })) });
    }
    seriesB.unshift({ name: '3 % of P95/H', color: '--ref', marker: 'tick', filled: true, size: 3.4, noHover: true, points: rows.map(r => ({ x: r.tOverH, y: 0.03 * r.p95Rest_H })) });
    const xAxis = { label: 't / H', log: true, fmt: (v) => String(+v.toPrecision(2)) };
    const legA = groups.map(g => ({ name: g.name, marker: g.marker, color: g.color, filled: true })).concat([{ name: 'open: at break-up', marker: 'circle', color: '--ref', filled: false }]);
    els.legenda.replaceChildren(FD.legend(legA));
    els.legendb.replaceChildren(FD.legend(groups.map(g => ({ name: g.name, marker: g.marker, color: g.color, filled: true })).concat([{ name: '3 % of P95/H', marker: 'tick', color: '--ref', filled: true }])));
    const specA = { height: 320, x: xAxis, y: { label: 'P95 / H (seed medians)' }, series: seriesA, hlines: [{ y: 1, color: '--axis', dash: true }], tooltip: (p) => tip(p) };
    const specB = { height: 320, x: xAxis, y: { label: 'increment of P95 / H', log: true, fmt: (v) => String(+v.toPrecision(2)) }, series: seriesB, tooltip: (p) => tip(p) };
    if (els.ca) els.ca.update(specA); else els.ca = new FD.Chart(els.boxa, specA);
    if (els.cb) els.cb.update(specB); else els.cb = new FD.Chart(els.boxb, specB);

    const tiles = [
      FD.tile('Configurations', String(T.nConfigs), `${T.nRest.toLocaleString('en-US')} of ${T.nRuns.toLocaleString('en-US')} runs at rest` + (T.nTimeCap ? `, ${T.nTimeCap} at the 60 s cap` : '')),
      FD.tile('Increment, break-up to rest', `${fmt(T.incRange_H[0], 4)}–${fmt(T.incRange_H[1], 4)} H`, `above 3 % of P95 in ${T.nAboveTolerance} configurations`),
      FD.tile('P95 / H at rest', `${fmt(T.p95RestRange_H[0], 3)}–${fmt(T.p95RestRange_H[1], 3)}`, 'range of the seed medians'),
      FD.tile('Lmax / H at rest', `${fmt(T.LmaxRange_H[0], 3)}–${fmt(T.LmaxRange_H[1], 3)}`, 'range of the seed medians'),
    ];
    if (S.computed && T.nCompared) tiles.push(FD.tile('Agreement with the paper', `${T.nIdentical} / ${T.nCompared}`,
      `runs identical; largest difference P95 ${pctTxt(T.maxAbsDeltaP95_pct)} %, Lmax ${pctTxt(T.maxAbsDeltaLmax_pct)} %`));
    els.tiles.replaceChildren(...tiles);

    els.tableSub.textContent = S.computed ? 'Computed on this computer; the paper columns are the stored runs of the same seeds.' : 'Values of the paper, from its stored runs (nothing has been run on this computer yet).';
    const cols = [
      { label: 'Configuration', get: (r) => r.case ? `wall ${r.case}` : r.id, csv: (r) => r.case ? `case${r.case}` : r.id },
      { label: 'H [m]', n: true, get: (r) => fmt(r.H, 2), csv: (r) => r.H },
      { label: 't [m]', n: true, get: (r) => fmt(r.t, 2), csv: (r) => r.t },
      { label: 't/H', n: true, get: (r) => fmt(r.tOverH, 3), csv: (r) => r.tOverH },
      { label: 'Seeds', n: true, title: 'seeds that reached rest', get: (r) => r.nSeeds, csv: (r) => r.nSeeds },
      { label: 'P95/H break-up', n: true, get: (r) => fmt(r.p95Break_H, 4), csv: (r) => r.p95Break_H },
      { label: 'P95/H rest', n: true, get: (r) => fmt(r.p95Rest_H, 4), csv: (r) => r.p95Rest_H },
      { label: 'Increment/H', n: true, get: (r) => fmt(r.inc_H, 4), csv: (r) => r.inc_H },
      { label: 'Lmax/H', n: true, get: (r) => fmt(r.Lmax_H, 3), csv: (r) => r.Lmax_H },
    ];
    if (S.computed) cols.push(
      { label: 'Paper P95/H rest', n: true, get: (r) => r.ref ? fmt(r.ref.p95Rest_H, 4) : '–', csv: (r) => r.ref ? r.ref.p95Rest_H : '' },
      { label: 'Δ P95 [%]', n: true, get: (r) => r.ref ? signedPct((r.p95Rest_H / r.ref.p95Rest_H - 1) * 100) : '–', csv: (r) => r.ref ? (r.p95Rest_H / r.ref.p95Rest_H - 1) * 100 : '' },
      { label: 'Paper Lmax/H', n: true, get: (r) => r.ref ? fmt(r.ref.Lmax_H, 3) : '–', csv: (r) => r.ref ? r.ref.Lmax_H : '' });
    els.cols = cols;
    els.table.replaceChildren(FD.table(sm.rows, cols));
  }

  function exportCSV() { FD.saveText(S.computed ? 'total_collapse.csv' : 'total_collapse_paper.csv', FD.toCSV(S.summary.rows, els.cols), 'csv'); }
  function exportJSON() { FD.saveText(S.computed ? 'total_collapse.json' : 'total_collapse_paper.json', JSON.stringify(S.summary, null, 1), 'json'); }
})(window.FD);
