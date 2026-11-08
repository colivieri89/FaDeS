'use strict';
// Overview: what the program does, with a small wall falling in the header (computed when the page opens).
(function (FD) {
  const { h, fmt } = FD;
  let demo = null;            // the demo run, kept for the session
  let pending = false;
  let stage = null;           // the stage of the page currently shown

  FD.views.home = {
    title: 'Overview',
    render(root, info, go) {
      const art = h('div', { class: 'art stage' });
      const card = (view, iconName, title, text) => h('div', { class: 'card action-card', role: 'button', tabindex: 0, onclick: () => go(view),
        onkeydown: (e) => { if (e.key === 'Enter') go(view); } }, h('div', { class: 'ic' }, FD.icon(iconName)), h('h2', {}, title), h('p', {}, text));
      const VIEW = { single: 'Single wall', study: 'Parametric study', rigid: 'Rigid-phase check', integrity: 'Integrity in the fall' };
      const geo = (w) => `H ${fmt(w.H, w.H % 1 ? 1 : 0)} m${w.mechanism === 'partial' ? `, Hr ${fmt(w.Hr, w.Hr % 1 ? 1 : 0)} m` : ''}, t ${fmt(w.t, 2)} m, blocks ${fmt(w.bx, 2)} × ${fmt(w.by, 2)} m`;
      const examples = h('div', { class: 'card', id: 'examples', style: 'margin-top:16px' },
        h('h2', {}, 'Worked examples'),
        h('p', { class: 'sub' }, 'One wall of each type analysed in the paper, with the paper’s results for it. Open an example in an analysis to see its input and the paper’s results; run it to compare this computer’s results with them, or change it to make your own wall.'),
        FD.table(info.examples, [
          { label: 'Example', get: (x) => h('b', {}, x.title) },
          { label: 'Wall', get: (x) => geo(x.wall) },
          { label: 'Open in', get: (x) => h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
            x.analyses.map(v => h('button', { class: 'btn ghost sm', onclick: () => go(v, { example: x.id }) }, VIEW[v]))) },
        ]));
      root.append(
        h('div', { class: 'hero' },
          h('div', {},
            h('div', { class: 'kicker' }, 'Masonry façades · overturning and debris'),
            h('h1', {}, 'Where does the debris of a collapsing façade land?'),
            h('p', { class: 'lede' }, 'A two-dimensional rigid-block model of a masonry façade that overturns out of plane onto the street: the panel rotates about its outer toe, breaks into its blocks at the first impact, and the blocks slide and tumble until they stop. Give the height, thickness, blocks and materials of any wall, run one wall or many, and read how far the debris reaches and how much of the street stays free. The program makes every analysis of the paper that describes the model, for any wall.'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => go('single') }, FD.icon('play'), 'Simulate a wall'),
              h('button', { class: 'btn ghost', onclick: () => go('study') }, FD.icon('chart'), 'Parametric study'),
              h('button', { class: 'btn ghost', onclick: () => document.getElementById('examples').scrollIntoView({ behavior: 'smooth' }) }, FD.icon('book'), 'Worked examples'))),
          art),
        h('div', { class: 'cards' },
          card('single', 'wall', 'Single wall', 'Any façade, total or partial collapse, of your own size, blocks and materials, animated from the start of the rotation to rest, with P95 and Lmax measured on the debris and the width of the street left free.'),
          card('study', 'chart', 'Parametric study', 'Many walls, each with many seeds: a grid of heights and thicknesses or your own buildings from a CSV file. Extent at break-up and at rest, the increment added by the debris phase, and the street left free.'),
          card('rigid', 'check', 'Rigid-phase check', 'The overturning phase of any wall against the closed form of a rectangle pivoting about its toe: the slip angle, the energy drift and the landing state with the step halved.'),
          card('integrity', 'split', 'Integrity in the fall', 'The force and moment that each section of the falling panel must carry, the first hinge with no tensile strength, the two blocks that follow, and the check at any tensile strength.')),
        examples,
        h('div', { class: 'facts' },
          FD.tile('Worked examples', String(info.examples.length), 'one of each type, with the paper’s results'),
          FD.tile('Debris engine', 'planck.js', `step 1/480 s, the paper's setting`),
          FD.tile('Parallel runs', String(info.defaultWorkers), `${info.cores} cores on this computer`),
          FD.tile('Model version', info.model, `app ${info.version}`)));
      stage = new FD.Stage(art, { compact: true });
      stage.repeat = true;
      FD.onTheme(() => stage.draw(), 'home');
      FD.views.home.leave = () => stage.pause();
      const show = () => stage.setResult(demo);
      if (demo) { show(); return; }
      if (pending) return;
      pending = true;
      const P = Object.assign({}, info.materials, { H: 5, t: 0.30, mechanism: 'total', bx: 0.15, by: 0.15, engine: 'planck',
        variability: Object.assign({ seed: 3 }, info.variability) });
      window.api.startSingle(P).then(({ id }) => {
        const offN = window.api.onSingleNotify((m) => { if (m.id === id && m.partial && !demo) { stage.setPartial(m.partial); } });
        const offD = window.api.onSingleDone((m) => { if (m.id !== id) return; offN(); offD(); offE(); demo = m.result; pending = false; if (FD.current === 'home') show(); });
        const offE = window.api.onSingleError((m) => { if (m.id !== id) return; offN(); offD(); offE(); pending = false; });
      });
    },
  };
})(window.FD);
