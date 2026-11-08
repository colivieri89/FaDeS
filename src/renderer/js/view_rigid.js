'use strict';
// Sect. 3 of the paper, verification of the rigid phase, for the paper's five walls or any others: the slip angle of
// the code against the closed form of a rectangle pivoting about its toe, the energy drift in the conservative regimes,
// the landing state with the step halved and the energy balance of the slide regime; then the tests of the two-block
// code (V1-V3) and of the internal actions (thin rod). Shows the paper's stored values until the checks are run.
(function (FD) {
  const { h, fmt } = FD;
  const S = { heightsText: '15, 10, 5, 2.5, 12.6', thicknessesText: '0.30, 0.60, 1.20, 1.20, 0.75', mu: 0.75,
              paper: null, result: null, computed: false, running: false, error: null };
  let els = {};
  const COLORS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5'];
  const MARKERS = ['circle', 'square', 'triangle', 'circle', 'square'];
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sci = (x) => {
    if (x == null || !Number.isFinite(x)) return '–';
    if (x === 0) return '0';
    const [m, e] = Math.abs(x).toExponential(1).split('e');
    return `${x < 0 ? '−' : ''}${m} × 10${String(+e).split('').map(c => SUP[c]).join('')}`;
  };

  function walls() {
    const list = (t, what) => String(t).split(/[,;\s]+/).filter(Boolean).map(Number).map(v => { if (!(v > 0)) throw new Error(`${what}: give positive numbers separated by commas`); return v; });
    const H = list(S.heightsText, 'Heights'), t = list(S.thicknessesText, 'Thicknesses');
    if (H.length !== t.length) throw new Error(`give one thickness for each height (${H.length} heights, ${t.length} thicknesses)`);
    if (H.length > 5) throw new Error('at most five walls at a time');
    if (!(+S.mu > 0)) throw new Error('the friction must be positive');
    H.forEach((x, i) => { if (!(t[i] < x)) throw new Error(`wall ${i + 1}: t must be smaller than H`); });
    return H.map((x, i) => ({ H: x, t: t[i], mu: +S.mu }));
  }

  FD.views.rigid = {
    title: 'Rigid phase',
    async render(root) {
      els = {};
      root.append(
        h('div', { class: 'kicker' }, 'Paper · Section 3'),
        h('h1', {}, 'Verification of the rigid phase'),
        h('p', { class: 'lede' }, 'Before it breaks up, the façade is a rigid panel turning about its toe, held there by friction until the toe slips. For each wall the program checks its overturning phase against the closed form of a rectangle pivoting from rest about a corner: the angle at which the toe slips, the energy drift while no friction acts, and the landing state when the time step is halved. The energy balance of the slide regime and the tests of the two-block code used in Section 4 complete the verification. Any wall can be checked; the defaults are the five walls of the paper.'),
        inputs(),
        els.status = h('div'),
        els.tiles = h('div', { class: 'tiles' }),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('h2', {}, 'Friction needed at the toe'),
          h('p', { class: 'sub' }, 'Ratio |T|/N of the toe reactions of the closed form along the fall. The toe slips where the curve reaches the friction μ; the markers are the slip angles of the program. Walls of equal t/H have the same curve (in the paper, H 10 m, t 0.60 m and H 12.6 m, t 0.75 m).'),
          h('div', { class: 'row chart-head' }, els.legend = h('div'), h('div', { class: 'spacer' }), FD.chartActions(() => els.chart, 'rigid_friction_demand')),
          els.chartBox = h('div')),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('div', { class: 'row' }, h('div', {}, h('h2', {}, 'Walls'), els.tableSub = h('p', { class: 'sub' })), h('div', { class: 'spacer' }),
            h('button', { class: 'btn ghost', onclick: () => exportCSV() }, FD.icon('download'), 'CSV'),
            h('button', { class: 'btn ghost', onclick: () => exportJSON() }, FD.icon('download'), 'JSON')),
          els.table = h('div')),
        h('div', { class: 'card', style: 'margin-top:16px' },
          h('h2', {}, 'Tests of the two-block code and of the internal actions'),
          h('p', { class: 'sub' }, 'The code of Section 4 is the one tested here; these tests do not depend on the walls above.'),
          els.tests = h('div')));
      if (!S.paper) S.paper = await window.api.paperRigid();
      if (!S.result) { S.result = S.paper; S.computed = false; }
      renderButton(); renderStatus(); renderResults();
      FD.onTheme(() => { els.chart && els.chart.draw(); }, 'rigid');
    },
  };

  function inputs() {
    const txt = (label, unit, value, set) => h('label', { class: 'field', style: 'grid-template-columns: auto 1fr' }, h('span', {}, label, ' ', h('span', { class: 'unit' }, unit)),
      h('input', { class: 'txt', value, oninput: (e) => { set(e.target.value); check(); } }));
    els.runBtn = h('button', { class: 'btn', onclick: () => run() });
    els.check = h('span', { class: 'muted small' });
    return h('div', { class: 'card' },
      h('div', { style: 'display:grid; grid-template-columns: 1fr 1fr 230px; gap: 0 26px' },
        txt('Heights H', 'm', S.heightsText, (v) => { S.heightsText = v; }),
        txt('Thicknesses t', 'm, one per height', S.thicknessesText, (v) => { S.thicknessesText = v; }),
        h('label', { class: 'field' }, h('span', {}, 'Friction μ at the toe'), h('input', { type: 'number', value: S.mu, step: 0.01, min: 0.05, oninput: (e) => { S.mu = e.target.value; check(); } }))),
      h('p', { class: 'muted small' }, 'Up to five walls, in total collapse, each from rest at 0.5° past its tipping angle. The paper checks five walls with t/H from 0.02 to 0.48 and μ = 0.75.'),
      h('div', { class: 'row', style: 'margin-top:14px' }, els.runBtn, els.check, h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost', title: 'Show the values of the paper (stored results)', onclick: () => { S.result = S.paper; S.computed = false; renderResults(); } }, 'Paper values')));
  }
  function check() {
    try { const w = walls(); els.check.textContent = `${w.length} wall${w.length === 1 ? '' : 's'} · about 10 s`; els.runBtn.disabled = S.running; return w; }
    catch (e) { els.check.textContent = e.message; els.runBtn.disabled = true; return null; }
  }
  function renderButton() {
    els.runBtn.replaceChildren(FD.icon('play'), S.running ? 'Running…' : 'Run the checks');
    check();
  }

  async function run() {
    const w = check();
    if (!w || S.running) return;
    S.running = true; S.error = null; renderButton(); renderStatus();
    try { S.result = await window.api.integrityJob('rigidChecks', { walls: w }); S.computed = true; }
    catch (e) { S.error = String(e && e.message || e); }
    S.running = false; renderButton(); renderStatus(); renderResults();
    if (!S.error) FD.toast('Checks complete');
  }

  function renderStatus() {
    if (!els.status) return;
    if (!S.running && !S.error) { els.status.replaceChildren(); return; }
    els.status.replaceChildren(h('div', { class: 'card', style: 'margin-top:16px' },
      h('div', { class: 'row', style: 'margin-bottom:8px' }, h('b', {}, S.running ? 'Running' : 'Error'),
        h('span', { class: 'muted small' }, S.running ? 'the rigid phase of each wall twice (step h and h/2), the slide regime, and the two-block tests' : '')),
      S.running ? h('div', { class: 'progress indet' }, h('div', { style: 'width:30%' })) : null,
      S.error ? h('p', { class: 'small', style: 'color:var(--critical)' }, S.error.split('\n')[0]) : null));
  }

  const name = (w) => `H ${fmt(w.H, w.H % 1 ? 1 : 0)} m, t ${fmt(w.t, 2)} m`;
  function renderResults() {
    if (!els.tiles) return;
    const R = S.result, W = R.walls, maxOf = (k, f = Math.abs) => Math.max(...W.map(w => f(w[k])).filter(Number.isFinite));
    const slipW = W.filter(w => w.slipCode != null);
    const slide = S.computed ? { v: sci(maxOf('slideResidual')), note: `largest residual of the energy balance of the slide regime, ${W.filter(w => w.slides).length} of ${W.length} walls slide` }
      : { v: sci(R.slide.maxResidual), note: `largest residual, all ${R.slide.nConfigs} configurations of C1–C2 (all slide)` };
    els.tiles.replaceChildren(
      FD.tile('Slip angle', slipW.length ? `${fmt(Math.min(...slipW.map(w => w.slipCode)), 1)}–${fmt(Math.max(...slipW.map(w => w.slipCode)), 1)}°` : 'no slip',
        slipW.length ? `program against the closed form: at most ${sci(maxOf('diff'))}°` : 'the toe holds until the landing'),
      FD.tile('Energy drift', sci(maxOf('drift')), 'relative to m g Hr / 2, while no friction acts'),
      FD.tile('Step halved', sci(maxOf('landing')), 'relative change of the landing velocities'),
      FD.tile('Slide regime', slide.v, slide.note));

    // friction demand
    const series = [], mus = [...new Set(W.map(w => +w.mu))];
    W.forEach((w, i) => {
      const c = COLORS[i % COLORS.length], d = (w.demand || []).map(([x, y]) => ({ x, y, w }));
      series.push({ name: name(w), color: c, line: true, width: 2, points: d, noHover: true });
      if (w.slipCode != null) series.push({ name: name(w), color: c, marker: MARKERS[i % MARKERS.length], filled: true, size: 4.6, points: [{ x: w.slipCode, y: +w.mu, w }] });
    });
    els.legend.replaceChildren(FD.legend(W.map((w, i) => ({ name: name(w), marker: MARKERS[i % MARKERS.length], color: COLORS[i % COLORS.length], filled: true }))
      .concat([{ name: mus.length === 1 ? `μ = ${fmt(mus[0], 2)}` : 'μ', marker: 'dash', color: '--ink-2' }])));
    const spec = { height: 340, x: { label: 'rotation of the panel θ [°]' }, y: { label: '|T| / N at the toe', min: 0, max: Math.max(1.2, 1.6 * Math.max(...mus)) },
      series, hlines: mus.map(m => ({ y: m, color: '--ink-2', dash: true, label: `μ = ${fmt(m, 2)}` })),
      tooltip: (p) => ({ title: name(p.w), rows: [['t / H', fmt(p.w.t / p.w.H, 3)], ['slip, program', `${fmt(p.w.slipCode, 6)}°`], ['slip, closed form', `${fmt(p.w.slipClosedForm, 6)}°`], ['difference', `${sci(p.w.diff)}°`]] }) };
    if (els.chart) els.chart.update(spec); else els.chart = new FD.Chart(els.chartBox, spec);

    els.tableSub.textContent = S.computed ? 'Computed on this computer.' : 'Values of the paper, from its stored results (nothing has been run on this computer yet).';
    const cols = [
      { label: 'H [m]', n: true, get: (w) => fmt(w.H, 2), csv: (w) => w.H },
      { label: 't [m]', n: true, get: (w) => fmt(w.t, 2), csv: (w) => w.t },
      { label: 't/H', n: true, get: (w) => fmt(w.t / w.H, 3), csv: (w) => w.t / w.H },
      { label: 'μ', n: true, get: (w) => fmt(+w.mu, 2), csv: (w) => w.mu },
      { label: 'Slip, program [°]', n: true, get: (w) => fmt(w.slipCode, 4), csv: (w) => w.slipCode ?? '' },
      { label: 'Slip, closed form [°]', n: true, get: (w) => fmt(w.slipClosedForm, 4), csv: (w) => w.slipClosedForm ?? '' },
      { label: 'Difference [°]', n: true, get: (w) => sci(w.diff), csv: (w) => w.diff ?? '' },
      { label: 'Energy drift', n: true, title: 'relative to m g Hr / 2', get: (w) => sci(w.drift), csv: (w) => w.drift },
      { label: 'Step halved', n: true, title: 'relative change of the landing velocities, h = 1e-4 s against 5e-5 s', get: (w) => sci(w.landing), csv: (w) => w.landing },
    ];
    if (S.computed) cols.push({ label: 'Slide residual', n: true, title: 'energy balance of the slide regime, relative to m g Hr / 2', get: (w) => w.slides ? sci(w.slideResidual) : 'no slide', csv: (w) => w.slides ? w.slideResidual : '' },
      { label: 'Regimes', get: (w) => (w.regimes || '').replace(/^start /, ''), csv: (w) => w.regimes || '' });
    els.cols = cols;
    els.table.replaceChildren(FD.table(W, cols));

    const T = R.twoBlock, mx = (q) => Math.max(...Object.values(q)), badge = (ok) => h('span', { class: 'badge' + (ok ? ' good' : '') }, ok ? 'pass' : 'fail');
    const rod = R.rod || null;
    els.tests.replaceChildren(FD.table([
      { what: 'V1', test: `one body with the toe contact rules, against the rigid phase of the model (${T.V1_n === 55 ? 'the paper’s 55 total-collapse walls' : `the ${T.V1_n} walls of C1–C2`})`, v: mx(T.V1), ok: T.V1_pass },
      { what: 'V2', test: 'two pinned blocks in free flight for 2 s: energy, momentum, angular momentum', v: Math.max(T.V2.relE, T.V2.relPx, T.V2.relL), ok: T.V2_pass },
      { what: 'V3', test: 'two thin rods hinged together, against Lagrange’s equations (rod 10⁻⁹ m thick)', v: T.V3['1e-9'], ok: T.V3_pass },
    ].concat(rod ? [{ what: 'Rod', test: `bending moment along a thin rod turning about its base (${rod.n} sections)`, v: rod.maxRelErr, ok: rod.maxRelErr < 1e-9 }] : []), [
      { label: 'Test', get: (r) => r.what },
      { label: 'What is compared', get: (r) => r.test },
      { label: 'Largest relative difference', n: true, get: (r) => sci(r.v) },
      { label: '', get: (r) => badge(r.ok) },
    ]));
  }

  function exportCSV() { FD.saveText(S.computed ? 'rigid_phase_checks.csv' : 'rigid_phase_checks_paper.csv', FD.toCSV(S.result.walls, els.cols), 'csv'); }
  function exportJSON() { FD.saveText(S.computed ? 'rigid_phase_checks.json' : 'rigid_phase_checks_paper.json', JSON.stringify(S.result, null, 1), 'json'); }
})(window.FD);
