const assert = require('node:assert/strict');
const dbPath = require.resolve('../config/database');
const calls = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  getQuery: async (sql, params) => {
    calls.push(sql);
    if (sql.includes('information_schema.tables')) return { table_name: params[0] };
    return { codigo_eap: '1.2', nome: 'Atividade' };
  },
  allQuery: async (sql, params) => {
    calls.push(sql);
    if (sql.includes('information_schema.columns')) {
      const columns = params[0] === 'atividade_eap_eventos'
        ? ['atividade_eap_id', 'rdo_id', 'tipo', 'origem', 'percentual_anterior', 'percentual_novo', 'quantidade_anterior', 'quantidade_nova', 'mensagem', 'usuario_id', 'criado_em']
        : ['rdo_id', 'ativo', 'resolvido_em'];
      return columns.map((name) => ({ name }));
    }
    return [{ id: 1, percentual_anterior: 0, percentual_novo: 53 }];
  },
  runQuery: async (sql) => { calls.push(sql); return { lastID: 1 }; }
} };
const { getActivityHistory, recordActivityEvent } = require('../services/eapActivityEventService');
(async () => {
  const history = await getActivityHistory(10);
  assert.equal(history[0].percentual_novo, 53);
  assert.ok(calls.every((sql) => /^\s*SELECT\b/i.test(sql)), 'consultar histórico não deve alterar o banco');
  calls.length = 0;
  await recordActivityEvent({ atividadeId: 10, origem: 'rdo_aprovado', percentualAnterior: 0, percentualNovo: 53 });
  assert.equal(calls.filter((sql) => /^\s*INSERT\b/i.test(sql)).length, 1);
  assert.ok(calls.every((sql) => /^\s*(SELECT|INSERT)\b/i.test(sql)), 'registrar evento não deve executar DDL');
  console.log('Histórico funciona sem permissões de alteração do esquema.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
