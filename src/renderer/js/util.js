'use strict';
window.FD = window.FD || {};
window.FD.views = {};
(function (FD) {
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;          // only for trusted, static markup (icons)
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const fmt = (v, d = 2) => (v == null || !Number.isFinite(v)) ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtSigned = (v, d = 2) => (v == null || !Number.isFinite(v)) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d);
  function duration(s) {
    if (s == null || !Number.isFinite(s)) return '–';
    if (s < 60) return `${Math.max(1, Math.round(s))} s`;
    if (s < 3600) return `${Math.round(s / 60)} min`;
    const hh = Math.floor(s / 3600), mm = Math.round((s % 3600) / 60);
    return mm ? `${hh} h ${mm} min` : `${hh} h`;
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // a few line icons (24 x 24, stroke = currentColor)
  const ICON = {
    play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
    pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    wall: '<path d="M4 20h16M7 20V6l5-2v16M12 8h5v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    chart: '<path d="M4 20h16M6 16l4-5 3 3 5-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM17 7h2v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    folder: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  };
  const icon = (name) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = ICON[name]; return s; };

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function toCSV(rows, cols) {
    const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return cols.map(c => q(c.label)).join(',') + '\n' + rows.map(r => cols.map(c => q(c.csv ? c.csv(r) : c.get(r))).join(',')).join('\n') + '\n';
  }
  async function saveText(name, content, kind) {
    const filters = { csv: [{ name: 'CSV', extensions: ['csv'] }], json: [{ name: 'JSON', extensions: ['json'] }], svg: [{ name: 'SVG', extensions: ['svg'] }] }[kind];
    const p = await window.api.save({ defaultName: name, content, filters });
    if (p) toast(`Saved ${p}`);
  }
  async function saveBase64(name, b64, kind) {
    const p = await window.api.save({ defaultName: name, content: b64, encoding: 'base64', filters: [{ name: kind.toUpperCase(), extensions: [kind] }] });
    if (p) toast(`Saved ${p}`);
  }
  // a data table with an optional CSV export
  function table(rows, cols) {
    return h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: c.n ? 'n' : '', title: c.title || null }, c.label)))),
      h('tbody', {}, rows.map(r => h('tr', {}, cols.map(c => { const v = c.get(r); return h('td', { class: c.n ? 'n' : '' }, v && v.nodeType ? v : (v == null ? '–' : String(v))); }))))));
  }
  // "1-20" or "1,3,5-7" -> [1, 2, ...] (the same rule as src/analyses/stats.js)
  function parseSeeds(text) {
    const out = new Set();
    for (const part of String(text).split(',').map(x => x.trim()).filter(Boolean)) {
      const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { if (+m[2] - +m[1] > 1000) throw new Error('at most 1000 seeds'); for (let i = +m[1]; i <= +m[2]; i++) out.add(i); }
      else if (/^\d+$/.test(part)) out.add(+part);
      else throw new Error(`not a seed list: ${text}`);
    }
    if (!out.size) throw new Error('no seeds given');
    return [...out].sort((a, b) => a - b);
  }
  // CSV with a header row (comma or semicolon separated, quotes as in RFC 4180) -> array of objects
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/, 1)[0], sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; }
      else cell += ch;
    }
    row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row);
    const head = (rows.shift() || []).map(c => c.trim());
    return rows.map(r => Object.fromEntries(head.map((k, i) => [k, (r[i] || '').trim()])));
  }
  // theme listeners: one per key, cleared when the view changes
  const themeCbs = new Map();
  const onTheme = (cb, key) => themeCbs.set(key || Symbol('theme'), cb);
  const themeChanged = () => { for (const cb of themeCbs.values()) cb(); };
  const clearTheme = () => themeCbs.clear();
  Object.assign(FD, { h, fmt, fmtSigned, duration, css, icon, toast, toCSV, saveText, saveBase64, table, parseSeeds, parseCSV, onTheme, themeChanged, clearTheme });
})(window.FD);
