// Integração com PostgreSQL local: todas as tabelas são TEMP, sombreiam as
// tabelas reais apenas nesta conexão e são descartadas com ROLLBACK.
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
if (process.env.DB_HOST && !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error('Este teste requer PostgreSQL local.');
const database = require('../config/database');
const { getProjectMeasurements } = require('../services/eapMeasurementService');
const migration = require('../scripts/migrations/000025_eap_valor_medicao');

(async () => {
  const client = await database.pool.connect();
  const audit = [];
  let physicalReviews = 0;
  const writes = [];
  const allQuery = async (sql, params = []) => (await client.query(database.translateQuery(sql), params)).rows;
  const getQuery = async (sql, params) => (await allQuery(sql, params))[0] || null;
  const runQuery = async (sql, params = []) => {
    writes.push(sql);
    const returning = /^\s*INSERT\b/i.test(sql) && !/RETURNING/i.test(sql) ? ' RETURNING id' : '';
    const result = await client.query(database.translateQuery(sql + returning), params);
    return { lastID: result.rows[0]?.id, changes: result.rowCount };
  };
  const mock = (name, exports) => { require.cache[require.resolve(name)] = { id: require.resolve(name), filename: require.resolve(name), loaded: true, exports }; };
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE projetos (id INTEGER PRIMARY KEY, tenant_id INTEGER);
      CREATE TEMP TABLE atividades_eap (
        id SERIAL PRIMARY KEY, tenant_id INTEGER, projeto_id INTEGER, codigo_eap TEXT, descricao TEXT,
        percentual_previsto REAL DEFAULT 0, pai_id INTEGER, ordem INTEGER DEFAULT 0, unidade_medida TEXT,
        quantidade_total REAL DEFAULT 0, criado_por INTEGER, id_atividade TEXT, nome TEXT,
        data_inicio_planejada DATE, data_fim_planejada DATE, peso_percentual_projeto REAL DEFAULT 0,
        nivel INTEGER DEFAULT 1, percentual_executado REAL DEFAULT 0, status TEXT,
        data_conclusao_real DATE, atualizado_em TIMESTAMP DEFAULT NOW()
      );
      CREATE TEMP TABLE rdos (id INTEGER PRIMARY KEY, tenant_id INTEGER, projeto_id INTEGER, status TEXT, data_relatorio DATE);
      CREATE TEMP TABLE rdo_atividades (id SERIAL PRIMARY KEY, rdo_id INTEGER, atividade_eap_id INTEGER, quantidade_executada REAL, percentual_executado REAL);
      CREATE TEMP TABLE atividades_dependencias (projeto_id INTEGER, atividade_origem_id INTEGER, atividade_destino_id INTEGER, tipo_vinculo TEXT, confirmada_usuario INTEGER, sugerida_por_sistema INTEGER);
      CREATE TEMP TABLE historico_atividades (id SERIAL PRIMARY KEY, atividade_eap_id INTEGER, rdo_id INTEGER, percentual_anterior REAL, percentual_executado REAL, percentual_novo REAL, usuario_id INTEGER, data_execucao TIMESTAMP);
      INSERT INTO projetos VALUES (10, 1), (20, 1), (30, 2);
      INSERT INTO atividades_eap (id, tenant_id, projeto_id, codigo_eap, nome, descricao, quantidade_total, percentual_executado)
        VALUES (1, 1, 10, '1', 'Serviço', 'Serviço', 100, 95), (2, 1, 20, '1', 'Outro projeto', '', 100, 0), (3, 2, 30, '1', 'Outra empresa', '', 100, 0);
      SELECT setval(pg_get_serial_sequence('atividades_eap','id'), 3);
    `);
    await migration.up({ run: (sql) => client.query(sql) });
    await migration.up({ run: (sql) => client.query(sql) });
    assert.equal((await getQuery('SELECT valor_total_medicao FROM atividades_eap WHERE id=1')).valor_total_medicao, null, 'migration mantém registros existentes sem preço');
    await client.query(`
      UPDATE atividades_eap SET valor_total_medicao=10000;
      INSERT INTO rdos VALUES (1,1,10,'Aprovado','2026-01-01'), (2,1,10,'Aprovado','2026-01-02'), (3,1,10,'Rascunho','2026-01-03'), (4,1,10,'Reprovado','2026-01-04'), (5,1,20,'Aprovado','2026-01-05'), (6,2,30,'Aprovado','2026-01-06');
      INSERT INTO rdo_atividades (rdo_id,atividade_eap_id,quantidade_executada,percentual_executado) VALUES
        (1,1,10,10), (2,1,20,20), (3,1,50,50), (4,1,50,50), (5,1,50,50), (6,1,50,50), (1,2,50,50), (1,3,50,50);
    `);
    const measure = async (projectId = 10, tenantId = 1) => getProjectMeasurements({ projectId, tenantId, activities: await allQuery('SELECT * FROM atividades_eap WHERE projeto_id=? AND tenant_id=?', [projectId, tenantId]), allQuery });
    assert.equal((await measure())[0].medicao.valor_medido, 3000, 'soma aprovados anteriores; exclui rascunhos, reprovados e vínculos de outro projeto/tenant');
    assert.equal((await measure(20))[0].medicao.valor_medido, 0);
    assert.equal((await measure(30, 2))[0].medicao.valor_medido, 0);
    await client.query("UPDATE rdos SET status='Rascunho' WHERE id=2");
    assert.equal((await measure())[0].medicao.valor_medido, 1000, 'reversão reduz medição mesmo com cache físico em 95%');
    await client.query("UPDATE rdos SET status='Aprovado' WHERE id=2");
    assert.equal((await measure())[0].medicao.valor_medido, 3000, 'reaprovação não duplica');
    await client.query('UPDATE rdo_atividades SET quantidade_executada=15 WHERE rdo_id=2');
    assert.equal((await measure())[0].medicao.valor_medido, 2500, 'correção altera medição');
    await client.query('DELETE FROM rdos WHERE id=2');
    assert.equal((await measure())[0].medicao.valor_medido, 1000, 'exclusão do RDO elimina sua contribuição');

    mock('../config/database', { ...database, allQuery, getQuery, runQuery });
    mock('../utils/schemaGuard', { ensureSchemaReady: async () => {} });
    mock('../middleware/auditoria', { registrarAuditoria: async (...event) => audit.push(event) });
    mock('../middleware/auth', { auth: (_req, _res, next) => next(), isGestor: (_req, _res, next) => next() });
    mock('../services/eapActivityEventService', { ORIGINS: {}, markRdosAffectedByEapEdit: async () => { physicalReviews++; return { affectedRDOs: 0, rdos: [] }; } });
    const router = require('../routes/eap');
    const invoke = async (method, path, { body = {}, params = {}, tenantId = 1 } = {}) => {
      const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
      const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
      await route.stack.at(-1).handle({ body, params, tenantId, usuario: { id: 1 } }, res);
      return res;
    };
    const rdoBefore = await allQuery('SELECT * FROM rdo_atividades ORDER BY id');
    const writeStart = writes.length;
    let response = await invoke('put', '/:id', { params: { id: 1 }, body: { valor_total_medicao: 20000 } });
    assert.equal(response.code, 200);
    assert.equal(response.data.affectedRDOs, 0);
    assert.equal((await measure())[0].medicao.valor_medido, 2000, 'novo preço vale para execução anterior');
    assert.equal((await getQuery('SELECT quantidade_total FROM atividades_eap WHERE id=1')).quantidade_total, 100);
    assert.deepEqual(await allQuery('SELECT * FROM rdo_atividades ORDER BY id'), rdoBefore);
    assert.equal(physicalReviews, 0);
    assert.equal(writes.length - writeStart, 1, 'edição monetária faz somente a gravação do preço');
    assert.equal(audit.at(-1)[4].valor_total_medicao, '20000.00');
    response = await invoke('put', '/:id', { params: { id: 1 }, body: { valor_total_medicao: null } });
    assert.equal(response.code, 200);
    assert.equal((await measure())[0].medicao.valor_medido, null);
    await invoke('put', '/:id', { params: { id: 1 }, body: { valor_total_medicao: 0 } });
    assert.equal((await measure())[0].medicao.atividades_sem_valor, 0);
    for (const value of [-1, '1.001', true, '10000000000000']) {
      assert.equal((await invoke('put', '/:id', { params: { id: 1 }, body: { valor_total_medicao: value } })).code, 400);
    }
    assert.equal((await invoke('put', '/:id', { params: { id: 3 }, body: { valor_total_medicao: 100 } })).code, 404);
    assert.equal((await invoke('get', '/projeto/:projetoId', { params: { projetoId: 30 } })).code, 404);
    assert.equal((await invoke('get', '/projeto/:projetoId', { params: { projetoId: 10 } })).data[0].medicao.valor_medido, 0);

    for (const value of [null, 0, 123.45]) {
      response = await invoke('post', '/', { body: { projeto_id: 10, codigo_eap: `N${value}`, nome: 'Nova', valor_total_medicao: value } });
      assert.equal(response.code, 201);
      const saved = await getQuery('SELECT valor_total_medicao FROM atividades_eap WHERE id=?', [response.data.atividade.id]);
      assert.equal(saved.valor_total_medicao, value === null ? null : value.toFixed(2));
    }
    assert.equal((await invoke('post', '/', { body: { projeto_id: 10, codigo_eap: 'INV', valor_total_medicao: -1 } })).code, 400);
    await client.query("UPDATE atividades_eap SET valor_total_medicao=123.45 WHERE id=1");
    response = await invoke('put', '/:id', { params: { id: 1 }, body: { nome: 'Nome revisado' } });
    assert.equal(response.code, 200);
    assert.equal((await getQuery('SELECT valor_total_medicao FROM atividades_eap WHERE id=1')).valor_total_medicao, '123.45', 'omitir preço na edição preserva valor');
    await client.query('UPDATE atividades_eap SET pai_id=1 WHERE id=4');
    assert.equal((await invoke('put', '/:id', { params: { id: 1 }, body: { valor_total_medicao: 500 } })).code, 400, 'agrupador não aceita preço próprio');
    response = await invoke('post', '/copiar', { body: { sourceProjetoId: 10, targetProjetoId: 20 } });
    assert.equal(response.code, 200);
    assert.equal((await getQuery("SELECT valor_total_medicao FROM atividades_eap WHERE projeto_id=20 AND codigo_eap='1' AND id<>2")).valor_total_medicao, '123.45');
    assert.equal((await invoke('post', '/copiar', { body: { sourceProjetoId: 10, targetProjetoId: 30 } })).code, 404);
    console.log('EAP medição PostgreSQL: migration, cálculo por RDO, isolamento, CRUD, auditoria e cópia validados em tabelas temporárias.');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await database.pool.end();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
