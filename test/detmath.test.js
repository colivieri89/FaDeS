// The deterministic math functions (src/sim/detmath.js) give the same bits in every runtime and on every platform:
// a hash of 300 000 values is compared with the one computed when the port was written. The test runs in the GitHub
// workflow on Windows, macOS and Linux.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const D = require('../src/sim/detmath');

const GOLDEN = '76e33c71fa5084a55c2529834d4009007016eb4f4538a26ae83df84b61afd154';
test('the six functions give the reference bits (300 000 values)', () => {
  let s = 987654321; const u = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  const buf = new Float64Array(6 * 50000); let k = 0;
  for (let i = 0; i < 50000; i++) {
    const x = (u() - 0.5) * (i % 3 === 0 ? 20 : i % 3 === 1 ? 3.2 : 1600);
    buf[k++] = D.sin(x); buf[k++] = D.cos(x); buf[k++] = D.tan(x); buf[k++] = D.atan(x); buf[k++] = D.log(Math.abs(x) + 1e-300); buf[k++] = D.atan2(x, (u() - 0.5) * 10);
  }
  assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(buf.buffer)).digest('hex'), GOLDEN);
});

test('special values follow IEEE 754 and the native functions', () => {
  for (const f of ['sin', 'cos', 'tan', 'atan']) for (const x of [0, -0, Infinity, -Infinity, NaN, 1e-310]) {
    const a = D[f](x), b = D.NATIVE[f](x);
    assert.ok(Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)), `${f}(${x})`);
  }
  for (const x of [0, -0, 1, Infinity, NaN, -1, 5e-324]) { const a = D.log(x), b = D.NATIVE.log(x); assert.ok(Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)), `log(${x})`); }
  for (const y of [0, -0, 1, -1, Infinity, -Infinity, NaN]) for (const x of [0, -0, 1, -1, Infinity, -Infinity, 2, NaN]) {
    const a = D.atan2(y, x), b = D.NATIVE.atan2(y, x);
    assert.ok(Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)), `atan2(${y}, ${x})`);
  }
});

test('the functions are accurate to the last bit or so (against the native ones)', () => {
  let s = 4242; const u = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 100000; i++) {
    const x = (u() - 0.5) * 40;
    for (const f of ['sin', 'cos', 'atan']) { const a = D[f](x), b = D.NATIVE[f](x); assert.ok(Math.abs(a - b) <= 2.3e-16 * Math.max(1, Math.abs(b)), `${f}(${x})`); }
  }
});
