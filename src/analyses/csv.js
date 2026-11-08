// CSV with a header row (comma or semicolon separated, quotes as in RFC 4180) -> array of objects; and the
// documented walls read from it (columns id, mechanism, H_m, t_m, Hr_m).
'use strict';
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  const head = (rows.shift() || []).map(c => c.trim());
  return rows.map(r => Object.fromEntries(head.map((k, i) => [k, (r[i] || '').trim()])));
}

function readCases(text) {
  const rows = parseCSV(text);
  const miss = ['id', 'mechanism', 'H_m', 't_m'].filter(k => rows.length && !(k in rows[0]));
  if (miss.length) throw new Error(`missing columns: ${miss.join(', ')}`);
  return rows.filter(r => r.id !== '').map(r => {
    const c = { id: String(r.id), mechanism: r.mechanism, H_m: +r.H_m, t_m: +r.t_m, Hr_m: r.Hr_m ? +r.Hr_m : null };
    if (!(c.H_m > 0 && c.t_m > 0) || !['T', 'P', 'P1', 'P2'].includes(c.mechanism)) throw new Error(`wall ${c.id}: H_m and t_m must be positive, mechanism T, P, P1 or P2`);
    return c;
  });
}
module.exports = { parseCSV, readCases };
