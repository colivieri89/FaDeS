'use strict';
// Single wall: one run with its animation, the extent at rest (Fig. 3 of the paper) and the debris profile.
(function (FD) {
  const { h, fmt } = FD;
  const PRESETS = [
    { name: 'C1 · H 10 m · t 0.60 m', mech: 'total', H: 10, t: 0.60, bx: 0.15, by: 0.15 },
    { name: 'C1 · H 5 m · t 0.30 m', mech: 'total', H: 5, t: 0.30, bx: 0.15, by: 0.15 },
    { name: 'C1 · H 15 m · t 1.20 m', mech: 'total', H: 15, t: 1.20, bx: 0.15, by: 0.15 },
    { name: 'C2 · H 7.5 m · t 0.90 m', mech: 'total', H: 7.5, t: 0.90, bx: 0.40, by: 0.20 },
    { name: 'C3 · H 9 m · Hr = 2/3 H · t 0.60 m', mech: 'partial', H: 9, Hr: 6, t: 0.60, bx: 0.15, by: 0.15 },
    { name: 'C4 · H 12 m · Hr = 1/3 H · t 0.30 m', mech: 'partial', H: 12, Hr: 4, t: 0.30, bx: 0.15, by: 0.15 },
  ];
  const state = { form: null, stage: null, running: null, last: null };

  function numberField(id, label, unit, value, step, min, max) {
    return h('label', { class: 'field' }, h('span', {}, label, ' ', h('span', { class: 'unit' }, unit)),
      h('input', { id, type: 'number', value, step, min, max }));
  }
  const val = (id) => +document.getElementById(id).value;
  const streetW = () => { const v = document.getElementById('f-W'); return v && v.value !== '' && +v.value > 0 ? +v.value : null; };

  function params(info) {
    const mech = document.querySelector('#mechSeg .on').dataset.v;
    const H = val('f-H'), t = val('f-t');
    const P = Object.assign({}, info.paperParams, { H, t, mechanism: mech, bx: val('f-bx'), by: val('f-by'),
      mu: val('f-mu'), muG: val('f-muG'), e: val('f-e'), rho: val('f-rho'), engine: 'planck' });
    P.diatones = val('f-dia') > 0 ? { on: true, step: val('f-dia'), h: 0.20 } : { on: false, step: 2, h: 0.20 };
    if (mech === 'partial') P.Hr = val('f-Hr');
    const vm = document.querySelector('#varSeg .on').dataset.v;
    if (vm === 'none') P.variability = { seed: 1, sdThetaDeg: 0, sdBlockRel: 0, sdMuRel: 0 };
    else if (vm === 'custom') P.variability = { seed: val('f-seed'), sdThetaDeg: val('f-sdTheta'), sdBlockRel: val('f-sdBlock') / 100, sdMuRel: val('f-sdMu') / 100 };
    else P.variability = Object.assign({ seed: val('f-seed') }, info.variability);
    const bad = [];
    if (!(H > 0)) bad.push('the height H must be positive');
    if (!(t > 0)) bad.push('the thickness t must be positive');
    if (mech === 'partial' && !(P.Hr > 0 && P.Hr < H)) bad.push('the collapsing height Hr must be between 0 and H');
    if (!(P.bx > 0 && P.by > 0)) bad.push('the block size must be positive');
    if (bad.length) throw new Error(bad.join('; '));
    return P;
  }
  function applyPreset(p) {
    const set = (id, v) => { document.getElementById(id).value = v; };
    set('f-H', p.H); set('f-t', p.t.toFixed(2)); set('f-bx', p.bx); set('f-by', p.by);
    setSeg('mechSeg', p.mech); if (p.Hr) set('f-Hr', +p.Hr.toFixed(3));
    document.getElementById('hrField').style.display = p.mech === 'partial' ? '' : 'none';
  }
  function setSeg(id, v) { document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
  const seg = (id, options, on, onchange) => h('div', { class: 'seg', id }, options.map(([v, label]) => h('button', { 'data-v': v, class: v === on ? 'on' : '', type: 'button',
    onclick: (e) => { setSeg(id, v); onchange && onchange(v); } }, label)));

  FD.views.single = {
    title: 'Single wall',
    render(root, info) {
      const form = h('div', { class: 'card sticky' },
        h('fieldset', {}, h('legend', {}, 'Start from'),
          h('select', { class: 'txt', id: 'f-preset', onchange: (e) => applyPreset(PRESETS[+e.target.value]) }, PRESETS.map((p, i) => h('option', { value: i }, p.name)))),
        h('fieldset', {}, h('legend', {}, 'Geometry'),
          h('div', { style: 'margin:4px 0 8px' }, seg('mechSeg', [['total', 'Total collapse'], ['partial', 'Partial']], 'total', (v) => {
            document.getElementById('hrField').style.display = v === 'partial' ? '' : 'none';
          })),
          numberField('f-H', 'Height H', 'm', 10, 0.5, 1, 30),
          h('div', { id: 'hrField', style: 'display:none' }, numberField('f-Hr', 'Collapsing height Hr', 'm', 6, 0.5, 0.5, 30)),
          numberField('f-t', 'Thickness t', 'm', '0.60', 0.05, 0.1, 2),
          numberField('f-bx', 'Block width bx', 'm', 0.15, 0.05, 0.05, 1),
          numberField('f-by', 'Block height by', 'm', 0.15, 0.05, 0.05, 1),
          numberField('f-dia', 'Diatone courses every', 'm (0 = none)', 2, 0.5, 0, 10)),
        h('fieldset', {}, h('legend', {}, 'Materials'),
          numberField('f-mu', 'Friction μ, block–block', '', info.paperParams.mu, 0.01, 0.05, 1.5),
          numberField('f-muG', 'Friction μg, block–street', '', info.paperParams.muG, 0.01, 0.05, 1.5),
          numberField('f-e', 'Restitution e', '', info.paperParams.e, 0.01, 0, 0.9),
          numberField('f-rho', 'Density ρ', 'kg/m³', info.paperParams.rho, 50, 500, 3000)),
        h('fieldset', {}, h('legend', {}, 'Street'),
          h('label', { class: 'field' }, h('span', {}, 'Street width W ', h('span', { class: 'unit' }, 'm, optional')),
            h('input', { id: 'f-W', type: 'number', value: '', step: 0.5, min: 0, max: 100, placeholder: 'none',
              oninput: () => { state.stage && state.stage.setStreet(streetW()); if (state.last) showResult(state.last); } }))),
        h('fieldset', {}, h('legend', {}, 'Run'),
          h('div', { style: 'margin:4px 0 8px' }, seg('varSeg', [['paper', 'Paper'], ['custom', 'Custom'], ['none', 'Nominal']], 'paper', (v) => {
            document.getElementById('f-seed').disabled = v === 'none';
            document.getElementById('sdFields').style.display = v === 'custom' ? '' : 'none';
          })),
          h('div', { id: 'sdFields', style: 'display:none' },
            numberField('f-sdTheta', 'Start angle, sd', '°', info.variability.sdThetaDeg, 0.05, 0, 5),
            numberField('f-sdBlock', 'Block joints, sd', '% of the block', info.variability.sdBlockRel * 100, 1, 0, 30),
            numberField('f-sdMu', 'Friction, sd', '%', info.variability.sdMuRel * 100, 1, 0, 30)),
          numberField('f-seed', 'Seed', 'any integer; 1–20 in the paper', 1, 1, 1, 100000)),
        h('div', { class: 'row' },
          h('button', { class: 'btn', id: 'simBtn', onclick: () => run(info) }, FD.icon('play'), 'Simulate'),
          h('span', { class: 'muted small', id: 'simNote' }, 'about 1–20 s')));

      const hudPhase = h('span', { class: 'phase', id: 'hudPhase' }, 'Ready');
      const hudClock = h('span', { class: 'clock', id: 'hudClock' }, 't = 0.00 s');
      const empty = h('div', { class: 'empty', id: 'stageEmpty' }, h('div', {}, h('b', {}, 'Choose a wall and press Simulate'),
        'The façade overturns about its outer toe, breaks into its blocks at the first impact and the blocks settle on the street.'));
      const stageWrap = h('div', { class: 'stage' }, h('div', { class: 'hud' }, hudPhase, hudClock), empty);
      const playBtn = h('button', { class: 'iconbtn', title: 'Play / pause', onclick: () => { const s = state.stage; if (!s.data) return; s.playing ? s.pause() : s.play(); } }, FD.icon('play'));
      const scrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, oninput: (e) => { const s = state.stage; if (s.data) { s.pause(); s.seek(+e.target.value / 1000 * s.duration()); } } });
      const speeds = seg('speedSeg', [['0.25', '¼×'], ['0.5', '½×'], ['1', '1×']], '1', (v) => { state.stage.speed = +v; });
      const player = h('div', { class: 'player' }, playBtn, scrub, speeds);
      const out = h('div', { id: 'singleOut' });
      root.append(
        h('div', { class: 'kicker' }, 'Analysis · one wall · Sect. 2 of the paper'),
        h('h1', {}, 'Simulate one façade'),
        h('p', { class: 'lede' }, 'Any wall: set its height, thickness, blocks and materials, or start from a wall of the paper’s campaigns. The façade overturns rigidly about its outer toe, breaks into its blocks at the first impact (each block takes the velocity of the panel at its centroid), and the debris settles in planck.js. The extent is measured at rest: P95 by mass and the farthest block, Lmax. With a street width, the program shows how much of the street stays free.'),
        h('div', { class: 'layout-single' }, form, h('div', {}, h('div', { class: 'card', style: 'padding:0;overflow:hidden' }, stageWrap, player), out)));
      state.stage = new FD.Stage(stageWrap);
      state.stage.street = streetW();
      state.stage.onTime((st) => {
        hudPhase.textContent = st.phase === 'idle' ? 'Ready' : st.label;
        hudClock.textContent = st.phase === 'idle' ? 't = 0.00 s' : `t = ${fmt(st.clock)} s`;
        playBtn.replaceChildren(FD.icon(state.stage.playing ? 'pause' : 'play'));
        const D = state.stage.duration(); if (D > 0) scrub.value = Math.round(state.stage.time / D * 1000);
      });
      FD.onTheme(() => state.stage.draw(), 'single-stage');
      FD.views.single.leave = () => state.stage.pause();
      if (state.running) { document.getElementById('simBtn').disabled = true; document.getElementById('simNote').textContent = 'computing…'; empty.remove(); }
      else if (state.last) { empty.remove(); state.stage.setResult(state.last.result); showResult(state.last); }
    },
  };

  async function run(info) {
    let P;
    try { P = params(info); } catch (e) { FD.toast(String(e.message || e)); return; }
    const $ = (id) => document.getElementById(id);
    const note = (t) => { const n = $('simNote'); if (n) n.textContent = t; };
    $('simBtn').disabled = true;
    note('computing the rigid fall…');
    if ($('stageEmpty')) $('stageEmpty').remove();
    state.stage.clear();
    $('singleOut').replaceChildren();
    const { id } = await window.api.startSingle(P);
    state.running = id;
    const t0 = performance.now();
    const offN = window.api.onSingleNotify((m) => {
      if (m.id !== id) return;
      if (m.partial) { state.stage.setPartial(m.partial); note('settling the debris…'); }
      if (m.progress) note(`settling the debris · ${fmt(m.progress.t)} s simulated`);
    });
    const finish = () => { offN(); offD(); offE(); state.running = null; if ($('simBtn')) $('simBtn').disabled = false; };
    const offD = window.api.onSingleDone((m) => {
      if (m.id !== id) return;
      finish();
      note(`done in ${FD.duration((performance.now() - t0) / 1000)}`);
      state.last = { result: m.result, params: P, match: m.match };
      if (FD.current !== 'single') return;
      state.stage.setResult(m.result);
      showResult(state.last);
    });
    const offE = window.api.onSingleError((m) => { if (m.id !== id) return; finish(); note(''); FD.toast(m.message.split('\n')[0]); });
  }

  function showResult({ result, params: P, match }) {
    const rec = result.record, Hr = P.mechanism === 'partial' ? P.Hr : P.H;
    const tiles = h('div', { class: 'tiles' },
      tile('P95 by mass', `${fmt(rec.p.p95.mass)} m`, `${fmt(rec.p.p95.mass / P.H, 3)} H`),
      tile('Farthest block, Lmax', `${fmt(rec.Lmax)} m`, `${fmt(rec.Lmax / P.H, 3)} H`),
      tile('Blocks', rec.nBlocks.toLocaleString('en-US'), rec.stop === 'rest' ? `at rest after ${fmt(rec.tStop)} s` : 'stopped at the 60 s cap'),
      tile('Rotation at impact', `${fmt(rec.rigid.thetaBreak, 1)}°`, `fall ${fmt(result.tImpact)} s`),
      tile('Kinetic energy at impact', `${fmt(rec.rigid.KE / 1000, 1)} kJ/m`, `ω = ${fmt(Math.abs(rec.rigid.omega), 3)} rad/s`));
    const W = streetW();
    if (W) {
      const free = Math.max(0, W - rec.p.p95.mass), k = Math.floor((W - rec.profile.x0) / rec.profile.bin);
      const atW = k >= 0 && k < rec.profile.height.length ? rec.profile.height[k] : 0;
      tiles.append(tile('Street width W', `${fmt(W)} m`, free > 0 ? `${fmt(free)} m free beyond P95` + (rec.Lmax >= W ? '; the farthest block reaches W' : '')
        : `P95 reaches W; heap ${fmt(atW)} m high at W`));
    }
    const rel = (a, b) => { const d = Math.abs(a / b - 1) * 100; return d === 0 ? '0' : d < 0.001 ? '< 0.001' : fmt(d, 3); };
    const badge = match
      ? (match.identical ? h('span', { class: 'badge good' }, `Identical to the paper's run (${match.campaign}, seed ${match.seed})`)
        : h('span', { class: 'badge info' }, `Paper's run ${match.campaign}, seed ${match.seed}: P95 ${fmt(match.ref.p95m, 3)} m, Lmax ${fmt(match.ref.Lmax, 3)} m; difference ${rel(rec.p.p95.mass, match.ref.p95m)} % and ${rel(rec.Lmax, match.ref.Lmax)} %`))
      : h('span', { class: 'badge' }, 'Not a configuration of the paper’s campaigns');
    const cdfPts = result.cdf.map(([x, f]) => ({ x: x / P.H, y: f }));
    cdfPts.unshift({ x: Math.min(0, cdfPts[0].x), y: 0 });
    const cdfChart = h('div');
    const prof = rec.profile, profPts = prof.height.map((y, i) => ({ x: (prof.x0 + (i + 0.5) * prof.bin) / P.H, y }));
    const profChart = h('div');
    const out = document.getElementById('singleOut');
    out.replaceChildren(h('div', { class: 'row', style: 'margin-top:16px' }, badge), tiles,
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('h2', {}, 'Cumulative mass of the debris'), h('p', { class: 'sub' }, 'Fraction of the mass whose far edge lies within x (as Fig. 3b of the paper)'),
          h('div', { class: 'row chart-head' }, FD.legend([{ name: 'F(x)', marker: 'line', color: '--series-3' }, { name: 'P95', marker: 'line', color: '--series-1' }, { name: 'Lmax', marker: 'line', color: '--series-2' }]),
            h('div', { class: 'spacer' }), FD.chartActions(() => c1, 'cumulative_mass')), cdfChart),
        h('div', { class: 'card' }, h('h2', {}, 'Debris profile at rest'), h('p', { class: 'sub' }, 'Height of the heap on 5 cm bins'),
          h('div', { class: 'row chart-head' }, h('div', { class: 'spacer' }), FD.chartActions(() => c2, 'debris_profile')), profChart)));
    const c1 = new FD.Chart(cdfChart, { height: 260, x: { label: 'x / H', min: Math.min(0, cdfPts[0].x) }, y: { label: 'F(x)', min: 0, max: 1.02 }, crosshair: true,
      series: [{ name: 'F(x)', color: '--series-3', line: true, points: cdfPts }],
      vlines: [{ x: rec.p.p95.mass / P.H, color: '--series-1', label: 'P95', at: 'bottom', side: 'left' }, { x: rec.Lmax / P.H, color: '--series-2', label: 'Lmax', at: 'bottom' }]
        .concat(W ? [{ x: W / P.H, color: '--ink-2', label: 'W', dash: true }] : []),
      tooltip: (p) => ({ title: `x = ${fmt(p.x * P.H)} m (${fmt(p.x, 3)} H)`, rows: [['mass within x', `${fmt(p.y * 100, 1)} %`]] }) });
    const c2 = new FD.Chart(profChart, { height: 260, x: { label: 'x / H' }, y: { label: 'height [m]', min: 0 }, crosshair: true,
      series: [{ name: 'heap', color: '--series-1', line: true, area: true, points: profPts }],
      vlines: W ? [{ x: W / P.H, color: '--ink-2', label: 'W', dash: true }] : [],
      tooltip: (p) => ({ title: `x = ${fmt(p.x * P.H)} m`, rows: [['height', `${fmt(p.y)} m`]] }) });
    FD.onTheme(() => { c1.draw(); c2.draw(); state.stage.draw(); }, 'single');
  }
  function tile(label, value, note) { return h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), note ? h('div', { class: 'note' }, note) : null); }
  FD.tile = tile;
})(window.FD);
