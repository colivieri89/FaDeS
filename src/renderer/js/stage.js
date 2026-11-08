'use strict';
// The animated section of one run, drawn to scale: the rigid fall (panel poses sampled in angle, interpolated in
// time), the break-up into blocks, the debris settling (block poses at every stop check), and the extent at rest.
(function (FD) {
  function Stage(wrap, { compact = false } = {}) {
    this.wrap = wrap; this.compact = compact;
    this.canvas = FD.h('canvas'); wrap.append(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.data = null; this.time = 0; this.playing = false; this.speed = 1; this.loop = false; this.repeat = false; this.listeners = [];
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.canvas);
    this.resize();
  }
  Stage.prototype.resize = function () {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.W = Math.max(200, r.width); this.H = Math.max(160, r.height);
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  };
  Stage.prototype.onTime = function (cb) { this.listeners.push(cb); };
  Stage.prototype.duration = function () {
    const d = this.data; if (!d) return 0;
    const deb = d.debris ? d.debris.frames[d.debris.frames.length - 1].t : 0;
    return d.tImpact + deb;
  };
  Stage.prototype.setPartial = function (p) { this.data = { rigid: p.rigid, tImpact: p.tImpact, geom: p.geom, debris: null, final: null }; this.fit(); this.time = 0; this.loop = true; this.play(); };
  Stage.prototype.setResult = function (r) {
    this.data = { rigid: r.rigid, tImpact: r.tImpact, geom: r.geom, debris: r.debris, final: r };
    this.fit(); this.loop = false; this.time = 0; this.play();
  };
  Stage.prototype.clear = function () { this.data = null; this.pause(); this.draw(); };
  // width of the street (m, null for none): the façade across the street is drawn at that distance
  Stage.prototype.setStreet = function (w) { this.street = w > 0 ? w : null; if (this.data) { this.fit(); this.draw(); } };
  Stage.prototype.fit = function () {
    const d = this.data, G = d.geom;
    let reach = d.final ? Math.max(d.final.record.Lmax, G.Hr) : 1.15 * G.H;
    if (this.street) reach = Math.max(reach, this.street + 0.08 * G.H);
    this.view = { x0: -G.t - 0.9 - 0.05 * G.H, x1: reach * 1.06 + 0.6, y0: -0.12 * G.H - 0.4, y1: G.H * 1.06 + 0.4 };
  };
  Stage.prototype.play = function () {
    if (!this.data) return;
    if (this.time >= this.duration() - 1e-9 && !this.loop) this.time = 0;
    this.playing = true; this.last = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed; this.last = now;
      this.time += dt;
      const D = this.data.debris ? this.duration() : this.data.tImpact;
      if (this.time >= D) {
        if (this.repeat && this.data.debris) { if (this.time >= D + 2) this.time = 0; }      // hold the final state 2 s, then again
        else if (this.loop) this.time = this.data.debris ? D : 0;
        else { this.time = D; this.playing = false; }
      }
      this.draw(); this.emit();
      if (this.playing) this.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(tick);
  };
  Stage.prototype.pause = function () { this.playing = false; cancelAnimationFrame(this.raf); this.emit(); };
  Stage.prototype.seek = function (t) { this.time = Math.max(0, Math.min(this.duration(), t)); this.draw(); this.emit(); };
  Stage.prototype.emit = function () { for (const cb of this.listeners) cb(this.state()); };
  Stage.prototype.state = function () {
    const d = this.data;
    if (!d) return { phase: 'idle' };
    const t = this.time;
    if (t < d.tImpact) return { phase: 'fall', t, label: 'Rigid fall', clock: t };
    if (!d.debris) return { phase: 'waiting', t, label: 'Break-up at impact · settling being computed', clock: d.tImpact };
    const td = t - d.tImpact, end = d.debris.frames[d.debris.frames.length - 1].t;
    return { phase: td >= end - 1e-9 ? 'rest' : 'debris', t, label: td >= end - 1e-9 ? 'At rest' : 'Debris settling', clock: t, debrisT: td };
  };

  const lerp = (a, b, u) => a + (b - a) * u;
  function bracket(arr, t, key = 't') {
    let lo = 0, hi = arr.length - 1;
    if (t <= arr[0][key]) return [0, 0, 0];
    if (t >= arr[hi][key]) return [hi, hi, 0];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][key] <= t) lo = m; else hi = m; }
    return [lo, hi, (t - arr[lo][key]) / (arr[hi][key] - arr[lo][key])];
  }

  Stage.prototype.draw = function () {
    const g = this.g, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    const d = this.data; if (!d) return;
    const v = this.view, G = d.geom;
    const pad = this.compact ? 10 : 22;
    const k = Math.min((W - 2 * pad) / (v.x1 - v.x0), (H - 2 * pad) / (v.y1 - v.y0));
    const ox = pad - v.x0 * k + Math.max(0, (W - 2 * pad - (v.x1 - v.x0) * k) / 2);
    const oy = H - pad + v.y0 * k;
    const X = (x) => ox + x * k, Y = (y) => oy - y * k;
    const c = (n) => FD.css(n);
    // building behind the facade and the floor
    g.fillStyle = c('--building');
    g.fillRect(X(v.x0), Y(G.H + 0.2), X(-G.t) - X(v.x0), Y(0) - Y(G.H + 0.2));
    // the building across the street
    if (this.street) {
      g.fillStyle = c('--building'); g.fillRect(X(this.street), Y(0.8 * G.H), W - X(this.street), Y(0) - Y(0.8 * G.H));
      if (!this.compact) { g.fillStyle = c('--ink-2'); g.font = '600 11px ' + c('--font'); g.textAlign = 'left'; g.fillText(`W = ${FD.fmt(this.street)} m`, X(this.street) + 6, Y(0.8 * G.H) + 16); }
    }
    // ground and street
    g.fillStyle = c('--surface-2'); g.fillRect(0, Y(0), W, H - Y(0));
    g.strokeStyle = c('--ground'); g.lineWidth = 2; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke();
    if (!this.compact) {
      g.fillStyle = c('--muted'); g.font = '11px ' + c('--font'); g.textAlign = 'center';
      const span = v.x1, step = span > 30 ? 5 : span > 12 ? 2 : 1;
      g.strokeStyle = c('--axis'); g.lineWidth = 1;
      for (let x = 0; x <= v.x1; x += step) { g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), Y(0) + 5); g.stroke(); g.fillText(`${x} m`, X(x), Y(0) + 17); }
      g.fillStyle = c('--ink-2'); g.font = '600 11px ' + c('--font');
      for (const m of [1, 1.5]) if (m * G.H < v.x1) { g.fillText(m === 1 ? 'H' : '1.5 H', X(m * G.H), Y(0) + 31); g.beginPath(); g.moveTo(X(m * G.H), Y(0) + 20); g.lineTo(X(m * G.H), Y(0) + 22); g.stroke(); }
    }
    // residual wall of a partial collapse
    if (G.residualWall) { const r = G.residualWall; g.fillStyle = c('--masonry-dark'); g.fillRect(X(r.x0), Y(r.y1), (r.x1 - r.x0) * k, (r.y1 - r.y0) * k); }
    const st = this.state();
    if (st.phase === 'fall' || st.phase === 'waiting' || !d.debris) {
      const [i, j, u] = bracket(d.rigid, Math.min(this.time, d.tImpact));
      const P = d.rigid[i].poly.map((p, n) => [lerp(p[0], d.rigid[j].poly[n][0], u), lerp(p[1], d.rigid[j].poly[n][1], u)]);
      this.drawPanel(P, X, Y, G, k);
    } else {
      const F = d.debris.frames, meta = d.debris.meta;
      const [i, j, u] = bracket(F, this.time - d.tImpact);
      const a = F[i].xyz, b = F[j].xyz;
      const fill = c('--masonry'), dia = c('--masonry-dark'), edge = c('--surface');
      g.lineWidth = Math.max(0.4, Math.min(1, k * 0.012)); g.strokeStyle = edge;
      for (let n = 0; n < meta.ids.length; n++) {
        const x = lerp(a[3 * n], b[3 * n], u), y = lerp(a[3 * n + 1], b[3 * n + 1], u), ph = lerp(a[3 * n + 2], b[3 * n + 2], u);
        g.save(); g.translate(X(x), Y(y)); g.rotate(-ph);
        g.fillStyle = meta.diatone[n] ? dia : fill;
        const w = meta.w[n] * k, hh = meta.h[n] * k;
        g.fillRect(-w / 2, -hh / 2, w, hh); if (k * Math.min(meta.w[n], meta.h[n]) > 3) g.strokeRect(-w / 2, -hh / 2, w, hh);
        g.restore();
      }
      if (st.phase === 'rest' && d.final && !this.compact) this.drawExtent(d.final.record, X, Y, G);
    }
  };
  Stage.prototype.drawPanel = function (P, X, Y, G, k) {
    const g = this.g, c = (n) => FD.css(n);
    g.fillStyle = c('--masonry'); g.beginPath(); P.forEach(([x, y], n) => n ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.closePath(); g.fill();
    // courses: lines across the thickness, between the two long edges
    const L = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
    const long = L(0, 1) > L(1, 2) ? [[0, 1], [3, 2]] : [[1, 2], [0, 3]];
    const [e1, e2] = long, n = Math.max(2, Math.round(G.Hr / 0.3));
    g.strokeStyle = c('--masonry-line'); g.lineWidth = 1;
    if (k * 0.3 > 4) for (let i = 1; i < n; i++) {
      const u = i / n, p = [lerp(P[e1[0]][0], P[e1[1]][0], u), lerp(P[e1[0]][1], P[e1[1]][1], u)], q = [lerp(P[e2[0]][0], P[e2[1]][0], u), lerp(P[e2[0]][1], P[e2[1]][1], u)];
      g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); g.lineTo(X(q[0]), Y(q[1])); g.stroke();
    }
  };
  Stage.prototype.drawExtent = function (rec, X, Y, G) {
    const g = this.g, c = (n) => FD.css(n);
    const mark = (x, color, label, row) => {
      g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), Y(0.42 * G.H) - row * 26); g.stroke();
      g.font = '600 12px ' + c('--font'); const tw = g.measureText(label).width + 16, bx = Math.min(X(x) - 8, this.W - tw - 8), by = Y(0.42 * G.H) - row * 26 - 24;
      g.fillStyle = c('--surface'); g.strokeStyle = c('--ring'); g.lineWidth = 1;
      roundRect(g, bx, by, tw, 21, 10); g.fill(); g.stroke();
      g.fillStyle = color; g.beginPath(); g.arc(bx + 9, by + 10.5, 3.5, 0, 7); g.fill();
      g.fillStyle = c('--ink'); g.textAlign = 'left'; g.fillText(label, bx + 16, by + 15);
    };
    mark(rec.p.p95.mass, c('--series-1'), `P95 = ${FD.fmt(rec.p.p95.mass)} m`, 0);
    mark(rec.Lmax, c('--series-2'), `Lmax = ${FD.fmt(rec.Lmax)} m`, 1);
  };
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  FD.Stage = Stage;
})(window.FD);
