'use strict';
// Overview: what the program does, with a small wall falling in the header (computed when the page opens).
(function (FD) {
  const { h } = FD;
  let demo = null;            // the demo run, kept for the session
  let pending = false;
  let stage = null;           // the stage of the page currently shown

  FD.views.home = {
    title: 'Overview',
    render(root, info, go) {
      const art = h('div', { class: 'art stage' });
      const card = (view, iconName, title, text) => h('div', { class: 'card action-card', role: 'button', tabindex: 0, onclick: () => go(view),
        onkeydown: (e) => { if (e.key === 'Enter') go(view); } }, h('div', { class: 'ic' }, FD.icon(iconName)), h('h2', {}, title), h('p', {}, text));
      root.append(
        h('div', { class: 'hero' },
          h('div', {},
            h('div', { class: 'kicker' }, 'Masonry façades · overturning and debris'),
            h('h1', {}, 'Where does the debris of a collapsing façade land?'),
            h('p', { class: 'lede' }, 'A two-dimensional rigid-block model of a masonry façade that overturns out of plane onto the street: the panel rotates about its outer toe, breaks into its blocks at the first impact, and the blocks slide and tumble until they stop. Give the height, thickness, blocks and materials of any wall, run one wall or many, and read how far the debris reaches and how much of the street stays free. The same program reproduces the analyses of the paper that describes the model.'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => go('single') }, FD.icon('play'), 'Simulate a wall'),
              h('button', { class: 'btn ghost', onclick: () => go('study') }, FD.icon('chart'), 'Parametric study'),
              h('button', { class: 'btn ghost', onclick: () => go('rigid') }, FD.icon('book'), 'Reproduce the paper'))),
          art),
        h('div', { class: 'cards' },
          card('single', 'wall', 'Single wall', 'Any façade, total or partial collapse, of your own size, blocks and materials, animated from the start of the rotation to rest, with P95 and Lmax measured on the debris and the width of the street left free.'),
          card('study', 'chart', 'Parametric study', 'Many walls, each with many seeds: a grid of heights and thicknesses, your own buildings from a CSV file, or the paper’s campaigns. Extent at break-up and at rest, and the street left free.'),
          card('rigid', 'book', 'The paper, Sections 3–5', 'The verification of the rigid phase, the integrity of the panel during the fall (Figs. 5–6) and the total-collapse study of campaigns C1 and C2 (Fig. 7): the paper’s stored results, recomputed here for its walls or for any others.')),
        h('div', { class: 'facts' },
          FD.tile('Stored runs of the paper', info.reference.nRuns.toLocaleString('en-US'), 'campaigns C1–C4, seeds 1–20'),
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
      const P = Object.assign({}, info.paperParams, { H: 5, t: 0.30, mechanism: 'total', bx: 0.15, by: 0.15, engine: 'planck',
        variability: Object.assign({ seed: 3 }, info.variability) });
      window.api.startSingle(P).then(({ id }) => {
        const offN = window.api.onSingleNotify((m) => { if (m.id === id && m.partial && !demo) { stage.setPartial(m.partial); } });
        const offD = window.api.onSingleDone((m) => { if (m.id !== id) return; offN(); offD(); offE(); demo = m.result; pending = false; if (FD.current === 'home') show(); });
        const offE = window.api.onSingleError((m) => { if (m.id !== id) return; offN(); offD(); offE(); pending = false; });
      });
    },
  };
})(window.FD);
