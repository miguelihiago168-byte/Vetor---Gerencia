import assert from 'node:assert/strict';
import { numeroRequisicaoExibicao, buscaNumeroRequisicao } from './numeroRequisicao.js';

const antigo = 'MAP-20261111-e122ce5d-c171-48ee-b93d-b3afb6d1c83b';
assert.equal(numeroRequisicaoExibicao(antigo, 17), 'MAP-20261111-000017');
assert.equal(numeroRequisicaoExibicao(antigo, null), antigo);
assert.equal(numeroRequisicaoExibicao('REQ-20261111-0001', 17), 'REQ-20261111-0001');
assert.equal(numeroRequisicaoExibicao('MAP-20261111-000017', 17), 'MAP-20261111-000017');
assert.ok(buscaNumeroRequisicao(antigo, 17, '000017'));
assert.ok(buscaNumeroRequisicao(antigo, 17, 'e122ce5d'));
assert.notEqual(numeroRequisicaoExibicao(antigo, 17), numeroRequisicaoExibicao(antigo, 18));
console.log('Número de requisição: apresentação e busca dos códigos antigos validadas.');
