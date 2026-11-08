'use strict';
// SVG charts: scatter (linear or log axes) and lines with a crosshair. Colours are read from the CSS variables when
// the chart is drawn, so an exported SVG or PNG keeps them; the app redraws every chart when the theme changes.
(function (FD) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); return el; };
  const col = (c) => c && c.startsWith('--') ? FD.css(c) : c;

  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function linTicks(min, max, n = 5) {
    const st = niceStep(max - min, n), out = [];
    for (let v = Math.ceil(min / st - 1e-9) * st; v <= max + 1e-9 * st; v += st) out.push(+v.toPrecision(12));
    out.decimals = Math.max(0, -Math.floor(Math.log10(st) + 1e-9));
    return out;
  }
  function logTicks(min, max) {
    const decades = Math.log10(max / min);
    const pick = (mant) => {
      const out = [];
      for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++)
        for (const m of mant) { const v = +(m * Math.pow(10, e)).toPrecision(6); if (v >= min * 0.999 && v <= max * 1.001) out.push(v); }
      return out;
    };
    const out = pick(decades > 2.5 ? [1] : decades > 1.2 ? [1, 3] : [1, 2, 5]);
    return out.length >= 3 ? out : pick([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9]);
  }
  const tickFmt = (v) => { const a = Math.abs(v); return a === 0 ? '0' : a >= 100 ? v.toFixed(0) : a >= 1 ? +v.toFixed(2) + '' : +v.toPrecision(2) + ''; };

  function marker(kind, x, y, r, fill, stroke, sw, ring) {
    const g = s('g');
    const shape = (rr, f, st, w) => {
      if (kind === 'tick') return s('path', { d: `M${x - rr * 1.7},${y}H${x + rr * 1.7}`, stroke: st, 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none' });
      if (kind === 'square') return s('rect', { x: x - rr * 0.9, y: y - rr * 0.9, width: rr * 1.8, height: rr * 1.8, rx: 1.5, fill: f, stroke: st, 'stroke-width': w });
      if (kind === 'triangle') { const a = rr * 1.15; return s('path', { d: `M${x},${y - a}L${x + a * 0.92},${y + a * 0.62}L${x - a * 0.92},${y + a * 0.62}Z`, fill: f, stroke: st, 'stroke-width': w, 'stroke-linejoin': 'round' }); }
      return s('circle', { cx: x, cy: y, r: rr, fill: f, stroke: st, 'stroke-width': w });
    };
    if (ring) g.append(shape(r + 1.5, ring, 'none', 0));
    g.append(shape(r, fill, stroke, sw));
    return g;
  }
  FD.legendMarker = (kind, color, filled) => {
    const svg = s('svg', { viewBox: '0 0 14 14' });
    if (kind === 'line') svg.append(s('path', { d: 'M1 7h12', stroke: col(color), 'stroke-width': 2, 'stroke-linecap': 'round' }));
    else if (kind === 'dash') svg.append(s('path', { d: 'M1 7h12', stroke: col(color), 'stroke-width': 1.5, 'stroke-dasharray': '3 2' }));
    else svg.append(marker(kind, 7, 7, 4.2, filled ? col(color) : col('--surface'), col(color), filled ? 0 : 1.5, null));
    // in the page the legend follows the theme: colours as CSS variables (the exported charts keep resolved colours)
    const v = (c) => c && c.startsWith('--') ? `var(${c})` : c;
    svg.querySelectorAll('circle, rect, path').forEach(n => {
      if (n.getAttribute('fill') && n.getAttribute('fill') !== 'none') n.style.fill = filled ? v(color) : 'var(--surface)';
      if (n.getAttribute('stroke') && n.getAttribute('stroke') !== 'none') n.style.stroke = v(color);
    });
    return svg;
  };
  FD.legend = (items) => FD.h('div', { class: 'legend' }, items.map(it => FD.h('span', { class: 'item' }, FD.legendMarker(it.marker, it.color, it.filled), it.name)));

  // spec: { height, x: {label, log, min, max, ticks}, y: {...}, series: [{name, color, marker, filled, size, line, points: [{x, y, ...}]}],
  //         hlines: [{y, label, color}], vlines: [{x, label, color}], tooltip: (point, series) => ({ title, rows: [[name, value]] }),
  //         crosshair: true (line charts), equal: true (same scale on both axes, for drawings),
  //         polys: [{points: [[x, y], ...], fill, opacity, stroke, width, dash}], segs: [{x1, y1, x2, y2, color, width, dash}] }
  function Chart(container, spec) {
    this.el = container; this.spec = spec;
    this.el.classList.add('chart');
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.el);
    this.draw();
  }
  Chart.prototype.update = function (spec) { this.spec = spec; this.draw(); };
  Chart.prototype.draw = function () {
    const sp = this.spec, W = Math.max(320, this.el.clientWidth || 600), H = sp.height || 300;
    const M = { l: 56, r: 18, t: 12, b: 44 };
    const pts = sp.series.flatMap(se => se.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
      .concat((sp.polys || []).flatMap(q => q.points.map(([x, y]) => ({ x, y }))))
      .concat((sp.segs || []).flatMap(q => [{ x: q.x1, y: q.y1 }, { x: q.x2, y: q.y2 }]));
    const ext = (k, ax) => {
      let lo = ax.min, hi = ax.max;
      const vals = pts.map(p => p[k]).concat(((k === 'y' ? sp.hlines : sp.vlines) || []).map(l => l[k])).filter(v => Number.isFinite(v) && (!ax.log || v > 0));
      if (lo == null) lo = vals.length ? Math.min(...vals) : (ax.log ? 0.1 : 0);
      if (hi == null) hi = vals.length ? Math.max(...vals) : 1;
      if (ax.log) { lo = lo / 1.25; hi = hi * 1.25; } else if (ax.min == null || ax.max == null) { const pad = (hi - lo || Math.abs(hi) || 1) * 0.06; if (ax.min == null) lo -= pad; if (ax.max == null) hi += pad; }
      return [lo, hi];
    };
    let [x0, x1] = ext('x', sp.x), [y0, y1] = ext('y', sp.y);
    let ytPre = sp.y.ticks || (sp.y.log ? logTicks(y0, y1) : linTicks(y0, y1, 5));
    let yFmt = sp.y.fmt || (ytPre.decimals != null ? (v) => v.toFixed(ytPre.decimals) : tickFmt);
    M.l = Math.max(56, 34 + 6.6 * Math.max(...ytPre.map(v => yFmt(v).length)));
    if (sp.equal) {                       // widen the axis with the coarser scale so that one metre is as long on both
      const pw = W - M.l - M.r, ph = H - M.t - M.b, kx = (x1 - x0) / pw, ky = (y1 - y0) / ph;
      if (kx < ky) { const c = (x0 + x1) / 2; x0 = c - ky * pw / 2; x1 = c + ky * pw / 2; }
      else { const c = (y0 + y1) / 2; y0 = c - kx * ph / 2; y1 = c + kx * ph / 2;
        ytPre = sp.y.ticks || linTicks(y0, y1, 5); yFmt = sp.y.fmt || (ytPre.decimals != null ? (v) => v.toFixed(ytPre.decimals) : tickFmt); }
    }
    const map = (v, a, b, p, q, log) => log ? p + (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a)) * (q - p) : p + (v - a) / (b - a) * (q - p);
    const X = (v) => map(v, x0, x1, M.l, W - M.r, sp.x.log), Y = (v) => map(v, y0, y1, H - M.b, M.t, sp.y.log);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': sp.title || '', 'font-family': FD.css('--font') || 'system-ui', 'font-size': 11.5 });
    const grid = col('--grid'), axis = col('--axis'), muted = col('--muted'), ink2 = col('--ink-2'), surface = col('--surface');
    svg.append(s('rect', { x: 0, y: 0, width: W, height: H, fill: surface }));
    const xt = sp.x.ticks || (sp.x.log ? logTicks(x0, x1) : linTicks(x0, x1, Math.max(3, Math.round(W / 110))));
    const xFmt = sp.x.fmt || (xt.decimals != null ? (v) => v.toFixed(xt.decimals) : tickFmt);
    const yt = ytPre;
    for (const v of yt) { const y = Y(v); svg.append(s('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: grid, 'stroke-width': 1 })); const t = s('text', { x: M.l - 8, y: y + 4, 'text-anchor': 'end', fill: muted }); t.textContent = yFmt(v); svg.append(t); }
    for (const v of xt) { const x = X(v); svg.append(s('line', { x1: x, x2: x, y1: H - M.b, y2: H - M.b + 4, stroke: axis, 'stroke-width': 1 })); const t = s('text', { x, y: H - M.b + 17, 'text-anchor': 'middle', fill: muted }); t.textContent = xFmt(v); svg.append(t); }
    svg.append(s('line', { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, stroke: axis, 'stroke-width': 1 }));
    const xl = s('text', { x: (M.l + W - M.r) / 2, y: H - 8, 'text-anchor': 'middle', fill: ink2, 'font-size': 12 }); xl.textContent = sp.x.label || ''; svg.append(xl);
    const yl = s('text', { x: 14, y: (M.t + H - M.b) / 2, 'text-anchor': 'middle', fill: ink2, 'font-size': 12, transform: `rotate(-90 14 ${(M.t + H - M.b) / 2})` }); yl.textContent = sp.y.label || ''; svg.append(yl);
    const clipId = 'c' + Math.random().toString(36).slice(2);
    const defs = s('defs'); const cp = s('clipPath', { id: clipId }); cp.append(s('rect', { x: M.l, y: M.t - 6, width: W - M.l - M.r, height: H - M.t - M.b + 6 })); defs.append(cp); svg.append(defs);
    const plot = s('g', { 'clip-path': `url(#${clipId})` }); svg.append(plot);
    for (const l of sp.hlines || []) {
      const y = Y(l.y); plot.append(s('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, stroke: col(l.color || '--muted'), 'stroke-width': 1.2, 'stroke-dasharray': l.dash ? '4 3' : null }));
      if (l.label) { const t = s('text', { x: W - M.r - 4, y: y - 5, 'text-anchor': 'end', fill: ink2, 'font-size': 11 }); t.textContent = l.label; svg.append(t); }
    }
    for (const l of sp.vlines || []) {
      const x = X(l.x); plot.append(s('line', { x1: x, x2: x, y1: M.t, y2: H - M.b, stroke: col(l.color || '--muted'), 'stroke-width': 1.5, 'stroke-dasharray': l.dash ? '4 3' : null }));
      if (l.label) {
        const left = l.side === 'left', y = l.at === 'bottom' ? H - M.b - 8 - (l.row || 0) * 14 : M.t + 12 + (l.row || 0) * 14;
        const t = s('text', { x: left ? x - 5 : x + 5, y, fill: ink2, 'font-size': 11, 'text-anchor': left ? 'end' : 'start' }); t.textContent = l.label; svg.append(t);
      }
    }
    for (const q of sp.polys || []) {
      const d = q.points.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('') + 'Z';
      plot.append(s('path', { d, fill: q.fill ? col(q.fill) : 'none', 'fill-opacity': q.opacity != null ? q.opacity : null,
        stroke: q.stroke ? col(q.stroke) : 'none', 'stroke-width': q.width || 1.2, 'stroke-dasharray': q.dash ? '5 3' : null, 'stroke-linejoin': 'round' }));
    }
    for (const q of sp.segs || []) plot.append(s('line', { x1: X(q.x1), y1: Y(q.y1), x2: X(q.x2), y2: Y(q.y2), stroke: col(q.color || '--muted'),
      'stroke-width': q.width || 1.2, 'stroke-dasharray': q.dash ? '4 3' : null, 'stroke-linecap': q.cap || 'round' }));
    const hits = [];
    for (const se of sp.series) {
      const c = col(se.color), ok = se.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && (!sp.x.log || p.x > 0) && (!sp.y.log || p.y > 0));
      if (se.line) {
        const d = ok.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
        if (se.area) plot.append(s('path', { d: d + `L${X(ok[ok.length - 1].x)},${Y(sp.y.log ? y0 : Math.max(y0, 0))}L${X(ok[0].x)},${Y(sp.y.log ? y0 : Math.max(y0, 0))}Z`, fill: c, opacity: 0.1 }));
        plot.append(s('path', { d, fill: 'none', stroke: c, 'stroke-width': se.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': se.dash ? '5 4' : null }));
      }
      if (se.marker) for (const p of ok) {
        const r = se.size || 4.2;
        plot.append(marker(se.marker, X(p.x), Y(p.y), r, se.filled ? c : surface, c, se.filled ? 0 : 1.6, se.filled ? surface : null));
      }
      if (!se.noHover) for (const p of ok) hits.push({ px: X(p.x), py: Y(p.y), p, se });
    }
    this.el.replaceChildren(svg);
    this.svgEl = svg;
    // hover: nearest point within 24 px (scatter), or nearest x (crosshair)
    const tip = document.getElementById('tooltip');
    const cross = sp.crosshair ? s('line', { y1: M.t, y2: H - M.b, stroke: axis, 'stroke-width': 1, visibility: 'hidden' }) : null;
    if (cross) svg.append(cross);
    const hl = s('circle', { r: 6.5, fill: 'none', stroke: col('--ink'), 'stroke-width': 1.5, visibility: 'hidden' }); svg.append(hl);
    const move = (ev) => {
      const rect = svg.getBoundingClientRect(), k = W / rect.width;
      const mx = (ev.clientX - rect.left) * k, my = (ev.clientY - rect.top) * k;
      let best = null, bd = Infinity;
      for (const q of hits) { const d = sp.crosshair ? Math.abs(q.px - mx) : Math.hypot(q.px - mx, q.py - my); if (d < bd) { bd = d; best = q; } }
      if (!best || (!sp.crosshair && bd > 24) || mx < M.l || mx > W - M.r) { tip.classList.remove('show'); hl.setAttribute('visibility', 'hidden'); if (cross) cross.setAttribute('visibility', 'hidden'); return; }
      hl.setAttribute('cx', best.px); hl.setAttribute('cy', best.py); hl.setAttribute('visibility', 'visible');
      if (cross) { cross.setAttribute('x1', best.px); cross.setAttribute('x2', best.px); cross.setAttribute('visibility', 'visible'); }
      const info = sp.tooltip ? sp.tooltip(best.p, best.se) : { title: best.se.name, rows: [['x', tickFmt(best.p.x)], ['y', tickFmt(best.p.y)]] };
      tip.replaceChildren(FD.h('div', { class: 'tt-title' }, info.title || ''), ...info.rows.map(([a, b]) => FD.h('div', { class: 'tt-row' }, FD.h('span', {}, a), FD.h('b', {}, b))));
      tip.classList.add('show');
      const tx = Math.min(window.innerWidth - tip.offsetWidth - 12, ev.clientX + 14), ty = Math.max(8, ev.clientY - tip.offsetHeight - 10);
      tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => { tip.classList.remove('show'); hl.setAttribute('visibility', 'hidden'); if (cross) cross.setAttribute('visibility', 'hidden'); });
  };
  Chart.prototype.svgText = function () {
    const c = this.svgEl.cloneNode(true);
    c.setAttribute('xmlns', NS);
    c.querySelectorAll('[visibility="hidden"]').forEach(n => n.remove());
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(c);
  };
  Chart.prototype.pngBase64 = function (scale = 2) {
    return new Promise((resolve, reject) => {
      const txt = this.svgText(), W = +this.svgEl.getAttribute('width'), H = +this.svgEl.getAttribute('height');
      const img = new Image();
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale; const g = cv.getContext('2d'); g.scale(scale, scale); g.drawImage(img, 0, 0); resolve(cv.toDataURL('image/png').split(',')[1]); };
      img.onerror = reject;
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(txt)));
    });
  };
  // the two export buttons of a chart card
  FD.chartActions = (getChart, name) => FD.h('div', { class: 'chart-actions' },
    FD.h('button', { class: 'btn ghost sm', title: 'Save as SVG (vector)', onclick: () => FD.saveText(`${name}.svg`, getChart().svgText(), 'svg') }, FD.icon('download'), 'SVG'),
    FD.h('button', { class: 'btn ghost sm', title: 'Save as PNG', onclick: async () => FD.saveBase64(`${name}.png`, await getChart().pngBase64(), 'png') }, FD.icon('download'), 'PNG'));
  FD.Chart = Chart;
})(window.FD);
