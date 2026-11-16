import assert from 'node:assert/strict';
import { atividadeSuprimentosConcluida, purchaseInfo } from './mapaPurchaseInfo.js';

const link = (status, quantidade, extra = {}) => ({ status_item: status, quantidade, quantidade_item: quantidade, total_vinculado: quantidade, requisicao_item_id: 1, vinculos_item: 1, quantidade_recebida: 0, ...extra });
const item = (compras) => ({ quantidade: 10, compras });
assert.equal(purchaseInfo(item([link('Comprado', 10)])).label, 'Atendido');
assert.equal(purchaseInfo(item([link('Comprado', 5)])).label, 'Parcialmente atendido');
assert.equal(purchaseInfo(item([link('Comprado', 5), link('Em cotação', 5)])).label, 'Parcialmente atendido');
assert.equal(purchaseInfo(item([link('Cancelado', 10)])).label, 'Não encaminhado');
assert.equal(purchaseInfo(item([link('Comprado', 10, { quantidade_item: 9 })])).label, 'Requisição alterada — conferir');
assert.equal(purchaseInfo(item([link('Comprado', 10, { quantidade_recebida: 4 })])).received, 4);
assert.equal(purchaseInfo(item(null)).label, 'Compras indisponível');
assert.equal(atividadeSuprimentosConcluida([]), false);
assert.equal(atividadeSuprimentosConcluida([item([link('Comprado', 10)])]), true);
assert.equal(atividadeSuprimentosConcluida([item([link('Comprado', 10)]), item([link('Em cotação', 10)])]), false);
console.log('mapaPurchaseInfo: OK');
