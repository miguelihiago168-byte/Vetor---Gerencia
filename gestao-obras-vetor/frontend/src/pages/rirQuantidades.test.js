import assert from 'node:assert/strict';
import { quantidadeParaEdicao, resumoQuantidade } from './rirQuantidades.js';

assert.equal(quantidadeParaEdicao('1250.0000'), '1250');
assert.equal(quantidadeParaEdicao('12.3400'), '12.34');
assert.equal(quantidadeParaEdicao('0.0001'), '0.0001');
assert.equal(quantidadeParaEdicao('99999999999999.0000'), '99999999999999');
assert.equal(quantidadeParaEdicao(''), '');

assert.deepEqual(resumoQuantidade(0, 100), { saldo:100, percentual:0, status:'Aguardando recebimento' });
assert.deepEqual(resumoQuantidade(40, 100), { saldo:60, percentual:40, status:'Recebimento parcial' });
assert.deepEqual(resumoQuantidade(100, 100), { saldo:0, percentual:100, status:'Recebimento completo' });
assert.deepEqual(resumoQuantidade(125, 100), { saldo:-25, percentual:125, status:'Recebido acima do total' });
assert.equal(resumoQuantidade('', 100), null);
assert.equal(resumoQuantidade(1, 0), null);
assert.equal(resumoQuantidade(-1, 10), null);
assert.equal(resumoQuantidade(0.1, 0.3).saldo, 0.2);
console.log('Cálculos de recebimento do RIR verificados.');
