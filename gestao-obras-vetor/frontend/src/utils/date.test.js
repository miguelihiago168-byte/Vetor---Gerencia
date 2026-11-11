import assert from 'node:assert/strict';
import { parseTs, fmtData, fmtTs } from './date.js';

assert.equal(parseTs('2026-11-11T10:15:00.000Z').toISOString(), '2026-11-11T10:15:00.000Z');
assert.equal(parseTs('2026-11-11 10:15:00').toISOString(), '2026-11-11T10:15:00.000Z');
assert.equal(parseTs('2026-11-11T07:15:00-03:00').toISOString(), '2026-11-11T10:15:00.000Z');
assert.equal(parseTs('2026-11-11 10:15:00+00').toISOString(), '2026-11-11T10:15:00.000Z');
assert.notEqual(fmtData('2026-11-11T10:15:00.000Z'), '—');
assert.notEqual(fmtTs('2026-11-11T10:15:00.000Z'), '—');
assert.equal(fmtData('data inválida'), '—');
assert.equal(fmtData(null), '—');
console.log('Datas: formatos ISO, UTC e com fuso validados.');
