'use strict';
// Model, reproducibility, data and licence.
(function (FD) {
  const { h } = FD;
  const P = (...k) => h('p', {}, ...k);
  const code = (t) => h('code', {}, t);

  FD.views.about = {
    title: 'About',
    render(root, info) {
      const pp = info.paperParams, v = info.variability, ref = info.reference;
      root.append(
        h('div', { class: 'kicker' }, 'About'),
        h('h1', {}, 'Model and reproducibility'),
        h('div', { class: 'prose' },
          h('div', { class: 'callout' }, 'Companion program of the paper “Simulating the debris of overturning masonry façades with rigid blocks: from the falling panel to the documented collapses” by C. Olivieri, G. Vaiano, L. Sibille, G. Mochi and F. Fabbrocino. Sections, figures and tables cited in the program are those of the paper.'),
          h('h2', {}, 'What is computed'),
          P('A section of the façade, one metre deep, is a panel of height H (or Hr, the part above the hinge for a partial collapse) and thickness t, made of courses of blocks bx × by with diatone courses every 2 m. The panel rotates about its outer toe; the rigid phase is integrated analytically (Runge–Kutta, step 10⁻⁴ s) up to the first impact with the street. At that instant the panel breaks into its blocks, each with the velocity of the panel at its centroid, and the blocks are handed to the planck.js engine (step 1/480 s, 60 velocity and 30 position iterations) until they come to rest or 60 s have passed.'),
          P('The extent is measured on the blocks at rest: P95 is the distance from the façade within which 95 % of the mass lies, taking the far edge of each block; Lmax is the far edge of the farthest block.'),
          h('h2', {}, 'Parameters of the campaigns'),
          P(`Friction μ = ${pp.mu} between blocks and μg = ${pp.muG} against the street, density ρ = ${pp.rho} kg/m³, restitution e = ${pp.e}. Each seed draws the starting tilt (sd ${v.sdThetaDeg}°), the block sizes (sd ${v.sdBlockRel * 100} %) and the friction coefficients (sd ${v.sdMuRel * 100} %). Campaigns C1 and C2 are total collapses with blocks 0.15 × 0.15 m and 0.40 × 0.20 m, H from 2.5 to 15 m and t from 0.30 to 1.20 m; C3 and C4 are partial collapses with Hr = 2/3 H and 1/3 H.`),
          h('h2', {}, 'Agreement with the paper'),
          P(`The paper's ${ref.nRuns.toLocaleString('en-US')} runs (seeds ${ref.seeds}) are stored with the program and shown wherever nothing has been computed yet. Runs made here use the same code, parameters and random draws, and are compared with them run by run.`),
          P('Exact agreement to the last bit cannot be promised on every computer. The engine integrates thousands of contacts over tens of seconds, and the trajectory depends on the last digit of sin, cos, atan2 and log; these functions are not rounded identically by every JavaScript runtime and processor (the paper\'s runs were made with Node.js 24 on Apple Silicon, whose library uses fused multiply–add instructions). The program therefore uses its own implementation of these functions, so that every computer, Windows or macOS, Intel or ARM, gives the same bits as every other. Against the paper, most runs are identical and the others differ by a few tenths of a per cent in Lmax and less in P95; the seed medians are affected far less. The break-up measures do not depend on the engine and agree to within 10⁻¹⁵.'),
          P('The command-line version (', code('npm run cli -- --help'), ') can also run with the native functions of Node.js; on Apple Silicon with Node.js 24 it then reproduces the stored runs bit for bit.'),
          h('h2', {}, 'Data'),
          P('The program ships no field data. Documented collapses can be loaded from a CSV file with the columns ', code('id, mechanism, H_m, t_m, Hr_m'), ' (an empty template is in the ', code('reference'), ' folder of the source code).'),
          h('h2', {}, 'This computer'),
          h('div', { class: 'tablewrap', style: 'max-height:none' }, h('table', { class: 'data' }, h('tbody', {},
            [['Program', `${info.version} (model ${info.model})`], ['System', `${info.platform} ${info.arch}`], ['Processor', `${info.cpu} · ${info.cores} cores`],
             ['Electron / Node.js', `${info.electron} / ${info.node}`], ['Stored runs of this computer', info.resultsDir]].map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b)))))),
          h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn ghost', onclick: () => window.api.openPath(info.resultsDir) }, FD.icon('folder'), 'Open the results folder')),
          h('h2', {}, 'Licence'),
          P('MIT licence. The trigonometric and logarithm functions are a JavaScript translation of fdlibm (Sun Microsystems, freely distributable with its notice, kept in LICENSE). planck.js is distributed under the MIT licence.')));
    },
  };
})(window.FD);
