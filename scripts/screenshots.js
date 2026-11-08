// Opens the app, goes through the views and saves screenshots (for the README and for checking the interface).
// Usage: npx electron scripts/screenshots.js <output folder>
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[process.argv.length - 1]);
fs.mkdirSync(OUT, { recursive: true });
require('../src/main/main.js');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  let win;
  while (!(win = BrowserWindow.getAllWindows()[0])) await wait(100);
  win.webContents.on('console-message', (e, level, msg) => console.log('[renderer]', msg));
  const js = (code) => win.webContents.executeJavaScript(code);
  const until = async (cond, ms = 120000) => { const t0 = Date.now(); while (!(await js(cond))) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + cond); await wait(250); } };
  const scroll = (y) => js(`document.getElementById('main').scrollTop = ${y}`);
  const shot = async (name) => { await js("document.getElementById('toast').classList.remove('show')"); await wait(300); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); console.log('saved', name); };
  try {
    await until("document.querySelector('.hero') !== null");
    await wait(9000); await shot('1_overview');
    await scroll(520); await wait(400); await shot('1b_overview_examples'); await scroll(0);
    await js("document.querySelector('[data-view=single]').click()");
    await wait(500);
    await js("(() => { const w = document.getElementById('f-W'); w.value = '12'; w.dispatchEvent(new Event('input')); })()");
    await js("document.getElementById('simBtn').click()");
    await until("document.querySelector('#singleOut .tiles') !== null");
    await wait(12000); await shot('2_single_wall');
    await scroll(700); await wait(400); await shot('2b_single_wall_charts'); await scroll(0);
    // the parametric study opens with the paper's results for the worked examples
    await js("document.querySelector('[data-view=study]').click()");
    await until("document.querySelector('table.data tbody tr') !== null");
    await wait(1200); await shot('3_study_examples');
    await scroll(900); await wait(400); await shot('3b_study_examples_charts'); await scroll(0);
    await js("document.querySelector('#themeSwitch [data-t=dark]').click()");
    await wait(800); await shot('4_study_dark');
    await js("document.querySelector('#themeSwitch [data-t=light]').click()");
    // a parametric study: walls of 4 and 6 m, t 0.45 m, seeds 1-3, street 5 m wide
    await js("[...document.querySelectorAll('.seg button')].find(b => b.textContent === 'Grid of H and t').click()");
    await wait(500);
    await js(`(() => { const set = (i, v) => { i.value = v; i.dispatchEvent(new Event('input')); };
      const field = (lab) => [...document.querySelectorAll('label.field')].find(l => l.textContent.startsWith(lab)).querySelector('input');
      set(field('Heights H'), '4, 6'); set(field('Thicknesses t'), '0.45');
      set(document.querySelector('.filters input[placeholder=none]'), '5');
      set([...document.querySelectorAll('.filters input.txt')].find(i => i.value === '1-20'), '1-3'); })()`);
    await wait(600); await shot('7_study_inputs');
    await js("[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('Run the study')).click()");
    await until("[...document.querySelectorAll('.card b')].some(b => b.textContent === 'Done')", 300000);
    await wait(800); await scroll(560); await wait(400); await shot('7b_study_results');
    await scroll(1250); await wait(400); await shot('7c_study_slenderness');
    await scroll(1900); await wait(400); await shot('7d_study_table'); await scroll(0);
    console.log('study tiles:', await js("[...document.querySelectorAll('.tile')].map(t => t.innerText.replace(/\\n/g, ' | ')).join('  //  ')"));
    // Sects. 3 and 4 with the paper's results for the examples; (a) of Fig. 5 is computed when the view opens
    await js("document.querySelector('[data-view=rigid]').click()");
    await until("document.querySelector('table.data tbody tr') !== null");
    await wait(800); await scroll(520); await wait(400); await shot('8_rigid_phase'); await scroll(0);
    await js("document.querySelector('[data-view=integrity]').click()");
    await until("/first hinge at/.test([...document.querySelectorAll('.chart-head .muted.small')].map(e => e.textContent).join(' '))", 180000);
    await wait(800); await scroll(560); await wait(400); await shot('9_integrity');
    await scroll(1250); await wait(400); await shot('9b_integrity_events'); await scroll(0);
    console.log('integrity tiles:', await js("[...document.querySelectorAll('.tile')].map(t => t.innerText.replace(/\\n/g, ' | ')).join('  //  ')"));
    await js("document.querySelector('[data-view=about]').click()");
    await wait(600); await shot('6_about');
  } catch (e) { console.error('ERROR', e.message); }
  app.quit();
});
