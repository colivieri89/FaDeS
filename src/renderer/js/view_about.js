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
          h('div', { class: 'callout' }, 'FaDeS (Façade Debris Simulator) simulates the out-of-plane overturning of a masonry façade and the debris it leaves on the street, for any wall given by its geometry, blocks and materials. It is the simulator described in the paper “Simulating the debris of overturning masonry façades with rigid blocks: from the falling panel to the documented collapses” by C. Olivieri, G. Vaiano, L. Sibille, G. Mochi and F. Fabbrocino, and it reproduces the paper’s analyses. Sections, figures and tables cited in the program are those of the paper.'),
          h('h2', {}, 'What is computed'),
          P('A section of the façade, one metre deep, is a panel of height H (or Hr, the part above the hinge for a partial collapse) and thickness t, made of courses of blocks bx × by with diatone courses every 2 m. The panel rotates about its outer toe; the rigid phase is integrated analytically (Runge–Kutta, step 10⁻⁴ s) up to the first impact with the street. At that instant the panel breaks into its blocks, each with the velocity of the panel at its centroid, and the blocks are handed to the planck.js engine (step 1/480 s, 60 velocity and 30 position iterations) until they come to rest or 60 s have passed.'),
          P('The extent is measured on the blocks at rest: P95 is the distance from the façade within which 95 % of the mass lies, taking the far edge of each block; Lmax is the far edge of the farthest block.'),
          P('Two further analyses check the rigid phase of any wall in total collapse. Rigid phase (Section 3) compares the overturning phase with the closed form of a rectangle pivoting about its toe: the angle at which the toe slips, the energy drift and the landing state with the step halved. Integrity in the fall (Section 4) computes the force and the moment that each section of the falling panel must carry, finds the first hinge with no tensile strength, follows the two blocks that it leaves, and applies the check at any tensile strength in its elastic and rigid-plastic forms.'),
          h('h2', {}, 'Parameters'),
          P('Every parameter of a wall can be set in Single wall and in Parametric study: height H, overturning height Hr (partial collapse), thickness t, block size bx × by, spacing of the diatone courses, friction μ between blocks and μg against the street, restitution e, density ρ, the run-to-run variability and the seeds. A street width W adds the width left free and the height of the debris at the far side of the street. The defaults are the values of the paper’s campaigns.'),
          P(`The paper’s campaigns use friction μ = ${pp.mu} between blocks and μg = ${pp.muG} against the street, density ρ = ${pp.rho} kg/m³, restitution e = ${pp.e}. Each seed draws the starting tilt (sd ${v.sdThetaDeg}°), the block sizes (sd ${v.sdBlockRel * 100} %) and the friction coefficients (sd ${v.sdMuRel * 100} %). Campaigns C1 and C2 are total collapses with blocks 0.15 × 0.15 m and 0.40 × 0.20 m, H from 2.5 to 15 m and t from 0.30 to 1.20 m; C3 and C4 are partial collapses with Hr = 2/3 H and 1/3 H.`),
          h('h2', {}, 'Scope of the model'),
          P('The model is a vertical strip of façade, one metre long, without return walls or floors; the building behind it is a rigid backstop. The wall starts from rest just past its tipping angle and pivots on its outer toe (or on the top of the residual wall in a partial collapse), with no ground motion during the fall. It stays rigid until its first impact and breaks completely into its blocks at that instant.'),
          P('The paper verifies the overturning phase to rounding error. It shows that a masonry panel with little or no tensile strength would crack before landing, and that in total collapse the extent is largely set at break-up: 95 % of the mass lies within about one height when the panel lands. Its convergence and engine tests pass in seven tall, slender walls, which verifies the break-up geometry; the debris phase itself and partial collapse do not pass the convergence test. The extent computed for a wall is therefore a property of the rigid-block idealisation, to be read with these results, not a prediction for a real wall nor an established bound on it.'),
          h('h2', {}, 'Agreement with the paper'),
          P(`The paper's ${ref.nRuns.toLocaleString('en-US')} runs (seeds ${ref.seeds}) are stored with the program and shown wherever nothing has been computed yet. Runs made here use the same code, parameters and random draws, and are compared with them run by run.`),
          P('Exact agreement to the last bit cannot be promised on every computer. The engine integrates thousands of contacts over tens of seconds, and the trajectory depends on the last digit of sin, cos, atan2 and log; these functions are not rounded identically by every JavaScript runtime and processor (the paper\'s runs were made with Node.js 24 on Apple Silicon, whose library uses fused multiply–add instructions). The program therefore uses its own implementation of these functions, so that every computer, Windows or macOS, Intel or ARM, gives the same bits as every other. Against the paper, most runs are identical and the others differ by a few tenths of a per cent in Lmax and less in P95; the seed medians are affected far less. The break-up measures do not depend on the engine and agree to within 10⁻¹⁵.'),
          P('The command-line version (', code('npm run cli -- --help'), ') can also run with the native functions of Node.js; on Apple Silicon with Node.js 24 it then reproduces the stored runs bit for bit.'),
          h('h2', {}, 'Data'),
          P('The program ships no field data. Walls, documented collapses included, can be loaded from a CSV file with one wall per row; the template, with two example walls, is ', code('reference/walls_template.csv'), ' in the source code and can be saved from the Parametric study.'),
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
