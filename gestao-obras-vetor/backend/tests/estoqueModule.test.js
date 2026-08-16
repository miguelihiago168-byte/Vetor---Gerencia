const assert = require('assert');

const { normalizarNomeInsumo } = require('../utils/estoque');

assert.strictEqual(normalizarNomeInsumo(' Cimento  CP-II  '), 'cimento cp-ii');
assert.strictEqual(normalizarNomeInsumo('Ciménto CP-II'), 'cimento cp-ii');
assert.strictEqual(normalizarNomeInsumo('CABO\tDE\nCOBRE'), 'cabo de cobre');
assert.notStrictEqual(normalizarNomeInsumo('cimento 50kg'), normalizarNomeInsumo('cimento 25kg'));

console.log(JSON.stringify({ ok: true, suite: 'estoqueModule', scenarios: 4 }));
