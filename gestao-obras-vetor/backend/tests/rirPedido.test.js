const assert = require('node:assert/strict');
const dbPath = require.resolve('../config/database');
const state = { pending: null, writes: [] };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  getWithClient: async (_client, sql, params) => {
    if (sql.includes('FROM estoque_pendencias_recebimento')) return state.pending && Number(params[0]) === 7 && Number(params[1]) === 1 && Number(params[2]) === 10 ? { ...state.pending } : null;
    if (sql.includes('FROM estoque_insumos')) return { id: 3 };
    throw new Error(`Unexpected query: ${sql}`);
  },
  execWithClient: async (_client, sql, params) => {
    state.writes.push({ sql, params });
    if (sql.startsWith('UPDATE estoque_pendencias_recebimento')) { state.pending.quantidade_recebida = params[0]; state.pending.status = params[1]; }
    return { lastID: sql.includes('INSERT INTO estoque_lotes') ? 42 : 1, changes: 1 };
  }
} };
const { insertItem } = require('../routes/rir');
const req = { tenantId: 1, usuario: { id: 2 } };
const project = { id: 10 };
const makeItem = (amount) => ({ pendencia_recebimento_id: 7, descricao: 'Descrição editada', unidade: 'm', quantidade: 10, quantidade_recebida: amount, quantidade_total: 10 });
const reset = () => { state.pending = { id: 7, descricao: 'Cabo original', unidade: 'm', quantidade_comprada: 10, quantidade_recebida: 0, status: 'AGUARDANDO_RECEBIMENTO' }; state.writes = []; };
(async () => {
  reset();
  await insertItem({}, req, 5, makeItem(4), project, { data: '2026-11-16', nota_fiscal: 'NF1' });
  assert.equal(state.pending.status, 'RECEBIMENTO_PARCIAL');
  assert.equal(state.pending.quantidade_recebida, 4);
  assert.equal(state.writes.filter(w => w.sql.includes('INSERT INTO estoque_movimentacoes')).length, 1);
  assert.equal(state.writes.find(w => w.sql.includes('INSERT INTO rir_itens')).params[2], 42);
  await insertItem({}, req, 6, makeItem(6), project, {});
  assert.equal(state.pending.status, 'RECEBIDO_TOTAL');
  assert.equal(state.pending.quantidade_recebida, 10);
  await assert.rejects(() => insertItem({}, req, 7, makeItem(1), project, {}), /indisponível/);
  reset();
  await assert.rejects(() => insertItem({}, req, 5, makeItem(11), project, {}), /saldo do pedido/);
  assert.equal(state.writes.length, 0);
  await assert.rejects(() => insertItem({}, req, 5, makeItem(1), { id: 20 }, {}), /indisponível/);
  await assert.rejects(() => insertItem({}, req, 5, makeItem(1), project, { data: '2026-02-30' }), /Data/);
  reset();
  const free = makeItem(2); delete free.pendencia_recebimento_id;
  await insertItem({}, req, 5, free, project, {});
  assert.equal(state.writes.filter(w => w.sql.includes('INSERT INTO estoque_movimentacoes')).length, 1);
  assert.equal(state.writes.find(w => w.sql.includes('INSERT INTO estoque_lotes')).params[2], null);
  assert.equal(state.writes.find(w => w.sql.includes('INSERT INTO rir_itens')).params[2], 42);
  console.log('rirPedido: recebimento parcial, total, limites, obra e item livre verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
