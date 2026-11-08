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
            h('div', { class: 'kicker' }, 'Masonry façades · out-of-plane overturning'),
            h('h1', {}, 'Where does the debris of a collapsing façade land?'),
            h('p', { class: 'lede' }, 'A two-dimensional rigid-block model of a masonry façade that overturns onto the street: the panel rotates about its outer toe, breaks into its blocks at the first impact, and the blocks slide and tumble until they stop. The program reproduces the analyses of the accompanying paper on this computer and lets you run your own walls.'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => go('single') }, FD.icon('play'), 'Simulate a wall'),
              h('button', { class: 'btn ghost', onclick: () => go('total') }, FD.icon('chart'), 'Reproduce Section 5'))),
          art),
        h('div', { class: 'cards' },
          card('single', 'wall', 'Single wall', 'One façade from the campaigns or of your own size and materials, animated from the start of the rotation to rest, with P95 and Lmax measured on the debris.'),
          card('total', 'chart', 'Total collapse', 'The 48 configurations of campaigns C1 and C2, 20 seeds each: P95 at break-up and at rest, and what the debris phase adds (Fig. 7).'),
          card('about', 'book', 'Model and reproducibility', 'What is computed, which parameters are used, and how the results compare with the stored runs of the paper.')),
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
