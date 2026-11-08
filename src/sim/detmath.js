// Deterministic transcendental functions for the simulator.
//
// Why: JavaScript leaves the last bit of Math.sin, Math.cos, Math.atan2, Math.log ... to the engine. Node.js computes
// them with the fdlibm algorithms (V8's ieee754 port), while the V8 inside Electron (Chromium) uses other routines for
// some of them, which differ in the last bit. The debris phase is chaotic, so a last-bit difference in the initial
// state changes every run. The results of the paper were computed with Node.js.
//
// What: a pure-JavaScript port of the fdlibm routines (Sun Microsystems, 1993; the versions of V8's ieee754.cc) for
// the six functions the simulator and planck.js use. JavaScript arithmetic is IEEE 754 double precision with no
// fused multiply-add, so these functions give the same bits on every platform (Windows, macOS, Linux; x64, arm64).
// install() replaces the six Math functions in the current thread (the worker threads and the command line call it
// before loading the simulator); test/detmath.test.js checks them bit for bit against Node.js.
//
// ====================================================
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
// Developed at SunPro, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this software is freely granted, provided that this notice
// is preserved.
// ====================================================
'use strict';

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
const LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HI = LE ? 1 : 0, LO = LE ? 0 : 1;
const hiWord = (x) => { F64[0] = x; return U32[HI] | 0; };           // signed high word
const loWord = (x) => { F64[0] = x; return U32[LO] | 0; };
const withHi = (x, hi) => { F64[0] = x; U32[HI] = hi >>> 0; return F64[0]; };
const withLo = (x, lo) => { F64[0] = x; U32[LO] = lo >>> 0; return F64[0]; };
const fromWords = (hi, lo) => { U32[HI] = hi >>> 0; U32[LO] = lo >>> 0; return F64[0]; };

// ------------------------------------------------------------------ argument reduction (e_rem_pio2.c)
const NPIO2_HW = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
  0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB,
  0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
  0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB];
const invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
  pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21,
  pio2_3t = 8.47842766036889956997e-32;
const Y = new Float64Array(2);
const NATIVE = { sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2, log: Math.log };
let largeArgs = 0;                         // arguments beyond 2^19 pi/2 (never met by the simulator); counted, not hidden

// returns n and writes y[0] + y[1] = x - n pi/2; null for |x| > 2^19 pi/2
function remPio2(x) {
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  let z, w, t, r, fn, n, i, j;
  if (ix <= 0x3fe921fb) { Y[0] = x; Y[1] = 0; return 0; }
  if (ix < 0x4002d97c) {                   // |x| < 3pi/4, special case with n = +-1
    if (hx > 0) {
      z = x - pio2_1;
      if (ix !== 0x3ff921fb) { Y[0] = z - pio2_1t; Y[1] = (z - Y[0]) - pio2_1t; }
      else { z -= pio2_2; Y[0] = z - pio2_2t; Y[1] = (z - Y[0]) - pio2_2t; }
      return 1;
    }
    z = x + pio2_1;
    if (ix !== 0x3ff921fb) { Y[0] = z + pio2_1t; Y[1] = (z - Y[0]) + pio2_1t; }
    else { z += pio2_2; Y[0] = z + pio2_2t; Y[1] = (z - Y[0]) + pio2_2t; }
    return -1;
  }
  if (ix <= 0x413921fb) {                  // |x| ~<= 2^19 (pi/2), medium size
    t = Math.abs(x);
    n = (t * invpio2 + 0.5) | 0;
    fn = n;
    r = t - fn * pio2_1;
    w = fn * pio2_1t;                      // first round, good to 85 bits
    if (n < 32 && ix !== NPIO2_HW[n - 1]) {
      Y[0] = r - w;
    } else {
      j = ix >> 20;
      Y[0] = r - w;
      i = j - ((hiWord(Y[0]) >> 20) & 0x7ff);
      if (i > 16) {                        // second iteration, good to 118 bits
        t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w);
        Y[0] = r - w;
        i = j - ((hiWord(Y[0]) >> 20) & 0x7ff);
        if (i > 49) {                      // third iteration, 151 bits
          t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w);
          Y[0] = r - w;
        }
      }
    }
    Y[1] = (r - Y[0]) - w;
    if (hx < 0) { Y[0] = -Y[0]; Y[1] = -Y[1]; return -n; }
    return n;
  }
  return null;
}

// ------------------------------------------------------------------ kernels (k_sin.c, k_cos.c, k_tan.c)
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function kSin(x, y, iy) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) { if ((x | 0) === 0) return x; }       // |x| < 2^-27
  const z = x * x, v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kCos(x, y) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000) { if ((x | 0) === 0) return 1.0; }     // |x| < 2^-27
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3FD33333) return 1.0 - (0.5 * z - (z * r - x * y));   // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);   // x/4
  const hz = 0.5 * z - qx, a = 1.0 - qx;
  return a - (hz - (z * r - x * y));
}
const T = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
  8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
  2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05];
const pio4 = 7.85398163397448278999e-01, pio4lo = 3.06161699786838301793e-17;
function kTan(x, y, iy) {
  let z, r, v, w, s;
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  if (ix < 0x3e300000) {                   // |x| < 2^-28
    if ((x | 0) === 0) {
      if (((ix | loWord(x)) | (iy + 1)) === 0) return 1 / Math.abs(x);
      if (iy === 1) return x;
      w = x + y; z = withLo(w, 0); v = y - (z - x);
      const a = -1 / w; const t = withLo(a, 0); s = 1 + t * z;
      return t + a * (s + t * v);
    }
  }
  if (ix >= 0x3FE59428) {                  // |x| >= 0.6744
    if (hx < 0) { x = -x; y = -y; }
    z = pio4 - x; w = pio4lo - y; x = z + w; y = 0.0;
  }
  z = x * x; w = z * z;
  r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
  v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
  s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T[0] * s;
  w = x + r;
  if (ix >= 0x3FE59428) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (w * w / (w + v) - r)));
  }
  if (iy === 1) return w;
  z = withLo(w, 0); v = r - (z - x);
  const a = -1.0 / w; const t = withLo(a, 0); s = 1.0 + t * z;
  return t + a * (s + t * v);
}

// ------------------------------------------------------------------ sin, cos, tan (s_sin.c, s_cos.c, s_tan.c)
function sin(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kSin(x, 0, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  if (n === null) { largeArgs++; return NATIVE.sin(x); }
  switch (n & 3) {
    case 0: return kSin(Y[0], Y[1], 1);
    case 1: return kCos(Y[0], Y[1]);
    case 2: return -kSin(Y[0], Y[1], 1);
    default: return -kCos(Y[0], Y[1]);
  }
}
function cos(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kCos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  if (n === null) { largeArgs++; return NATIVE.cos(x); }
  switch (n & 3) {
    case 0: return kCos(Y[0], Y[1]);
    case 1: return -kSin(Y[0], Y[1], 1);
    case 2: return -kCos(Y[0], Y[1]);
    default: return kSin(Y[0], Y[1], 1);
  }
}
function tan(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kTan(x, 0, 1);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  if (n === null) { largeArgs++; return NATIVE.tan(x); }
  return kTan(Y[0], Y[1], 1 - ((n & 1) << 1));
}

// ------------------------------------------------------------------ atan, atan2 (s_atan.c, e_atan2.c)
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
function atan(x) {
  let id;
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {                  // |x| >= 2^66
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && loWord(x) !== 0)) return x + x;
    return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
  }
  if (ix < 0x3fdc0000) {                   // |x| < 0.4375
    if (ix < 0x3e400000) return x;         // |x| < 2^-27
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {                 // |x| < 1.1875
      if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); }
      else { id = 1; x = (x - 1.0) / (x + 1.0); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); }
    else { id = 3; x = -1.0 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const zz = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return hx < 0 ? -zz : zz;
}
const tiny = 1.0e-300, pi_o_4 = 7.8539816339744827900E-01, pi_o_2 = 1.5707963267948965580E+00,
  pi = 3.1415926535897931160E+00, pi_lo = 1.2246467991473531772E-16;
function atan2(y, x) {
  let z;
  const hx = hiWord(x), ix = hx & 0x7fffffff, lx = loWord(x);
  const hy = hiWord(y), iy = hy & 0x7fffffff, ly = loWord(y);
  if (((ix | ((lx | -lx) >>> 31)) >>> 0) > 0x7ff00000 || ((iy | ((ly | -ly) >>> 31)) >>> 0) > 0x7ff00000) return x + y;   // NaN
  if (hx === 0x3ff00000 && lx === 0) return atan(y);            // x = 1.0
  let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);                  // 2 sign(x) + sign(y)
  if ((iy | ly) === 0) {                                        // y = 0
    switch (m) { case 0: case 1: return y; case 2: return pi + tiny; default: return -pi - tiny; }
  }
  if ((ix | lx) === 0) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;   // x = 0
  if (ix === 0x7ff00000) {                                      // x = +-inf
    if (iy === 0x7ff00000) {
      switch (m) { case 0: return pi_o_4 + tiny; case 1: return -pi_o_4 - tiny; case 2: return 3.0 * pi_o_4 + tiny; default: return -3.0 * pi_o_4 - tiny; }
    }
    switch (m) { case 0: return 0.0; case 1: return -0.0; case 2: return pi + tiny; default: return -pi - tiny; }
  }
  if (iy === 0x7ff00000) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;   // y = +-inf
  const k = (iy - ix) >> 20;
  if (k > 60) { z = pi_o_2 + 0.5 * pi_lo; m &= 1; }             // |y/x| > 2^60
  else if (hx < 0 && k < -60) z = 0.0;                          // 0 > |y|/x > -2^-60
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return pi - (z - pi_lo);
    default: return (z - pi_lo) - pi;
  }
}

// ------------------------------------------------------------------ log (e_log.c)
const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10, two54 = 1.80143985094819840000e+16,
  Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01,
  Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
  Lg7 = 1.479819860511658591e-01;
function log(x) {
  let hx = hiWord(x), k = 0;
  const lx = loWord(x);
  if (hx < 0x00100000) {                   // x < 2^-1022
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54; x *= two54; hx = hiWord(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000));    // normalise x or x/2
  k += i >> 20;
  const f = x - 1.0;
  let dk;
  if ((0x000fffff & (2 + hx)) < 3) {       // -2^-20 <= f < 2^-20
    if (f === 0) { if (k === 0) return 0; dk = k; return dk * ln2_hi + dk * ln2_lo; }
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    dk = k; return dk * ln2_hi - ((R - dk * ln2_lo) - f);
  }
  const s = f / (2.0 + f);
  dk = k;
  const z = s * s;
  i = hx - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  const R = t2 + t1;
  if (i > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
}

const FUNCS = { sin, cos, tan, atan, atan2, log };
let installed = false;
// replace the six Math functions in this thread (idempotent)
function install() {
  if (installed) return;
  for (const [k, f] of Object.entries(FUNCS)) Math[k] = f;
  installed = true;
}
module.exports = { install, ...FUNCS, NATIVE, largeArgCount: () => largeArgs };
