// Statistics with the conventions of the paper's analysis scripts (Python statistics.median: the mean of the two
// middle values for an even count).
'use strict';
function median(a) {
  const v = a.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
const min = (a) => Math.min(...a), max = (a) => Math.max(...a);
function range(a) { const v = a.filter(Number.isFinite); return v.length ? [min(v), max(v)] : [NaN, NaN]; }
// the seed range string "1-20" or "1,3,5-7" -> [1, 2, ...]
function parseSeeds(s) {
  const out = new Set();
  for (const part of String(s).split(',').map(x => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.add(i); else if (/^\d+$/.test(part)) out.add(+part); else throw new Error(`bad seed list: ${s}`);
  }
  return [...out].sort((a, b) => a - b);
}
module.exports = { median, range, parseSeeds };
