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
  const shot = async (name) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); console.log('saved', name); };
  try {
    await until("document.querySelector('.hero') !== null");
    await wait(9000); await shot('1_overview');
    await js("document.querySelector('[data-view=single]').click()");
    await wait(500);
    await js("document.getElementById('simBtn').click()");
    await until("document.querySelector('#singleOut .tiles') !== null");
    await wait(12000); await shot('2_single_wall');
    await scroll(700); await wait(400); await shot('2b_single_wall_charts'); await scroll(0);
    await js("document.querySelector('[data-view=total]').click()");
    await until("document.querySelector('table.data tbody tr') !== null");
    await wait(800); await shot('3_total_paper');
    await scroll(800); await wait(400); await shot('3b_total_paper_charts'); await scroll(0);
    await js("document.querySelector('#themeSwitch [data-t=dark]').click()");
    await wait(800); await shot('4_total_dark');
    await js("document.querySelector('#themeSwitch [data-t=light]').click()");
    // a small study: C1, H 2.5 m, t 0.30 m, seeds 1-2
    await js(`(() => { const chips = [...document.querySelectorAll('.chip')];
      const off = (t) => { const c = chips.find(c => c.textContent.trim() === t); if (c && c.classList.contains('on')) c.click(); };
      off('C2, blocks 0.40 × 0.20 m'); ['5 m','7.5 m','10 m','12.5 m','15 m','0.60 m','0.90 m','1.20 m'].forEach(off);
      const s = document.querySelector('.filters input.txt'); s.value = '1-2'; s.dispatchEvent(new Event('input')); })()`);
    await wait(500);
    await js("[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('Run the study')).click()");
    await until("document.querySelector('.card b') && [...document.querySelectorAll('.card b')].some(b => b.textContent === 'Done')", 300000);
    await wait(800); await shot('5_total_run');
    await scroll(1500); await wait(400); await shot('5b_total_run_table'); await scroll(0);
    console.log('tiles:', await js("[...document.querySelectorAll('.tile')].map(t => t.innerText.replace(/\\n/g, ' | ')).join('  //  ')"));
    await js("document.querySelector('[data-view=about]').click()");
    await wait(600); await shot('6_about');
  } catch (e) { console.error('ERROR', e.message); }
  app.quit();
});
