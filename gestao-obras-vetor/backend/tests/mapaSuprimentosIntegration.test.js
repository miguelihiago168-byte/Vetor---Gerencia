// Integração isolada: tabelas temporárias e transação revertida ao final.
const assert = require('node:assert/strict');
require('dotenv').config({ path: process.env.MAPA_TEST_ENV_FILE || require('node:path').join(__dirname, '..', '.env') });
if (process.env.DB_HOST && !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error('Este teste requer PostgreSQL local.');
const db = require('../config/database');

(async () => {
  const client = await db.pool.connect(); let server;
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE tenants (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE usuarios (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE projetos (id BIGINT PRIMARY KEY, tenant_id BIGINT, nome TEXT);
      CREATE TEMP TABLE projeto_usuarios (id BIGINT, projeto_id BIGINT, usuario_id BIGINT);
      CREATE TEMP TABLE atividades_eap (id BIGINT PRIMARY KEY, projeto_id BIGINT, tenant_id BIGINT, codigo_eap TEXT, descricao TEXT, data_inicio_planejada DATE, pai_id BIGINT);
      CREATE TEMP TABLE estoque_insumos (id BIGINT PRIMARY KEY, tenant_id BIGINT, nome TEXT, unidade TEXT);
      CREATE TEMP TABLE estoque_lotes (id BIGINT PRIMARY KEY, insumo_id BIGINT, tenant_id BIGINT, pendencia_recebimento_id BIGINT, recebido_em TIMESTAMPTZ);
      CREATE TEMP TABLE rdo_atividades (id BIGINT PRIMARY KEY, atividade_eap_id BIGINT);
      CREATE TEMP TABLE estoque_aplicacoes (id BIGINT PRIMARY KEY, tenant_id BIGINT, projeto_id BIGINT, lote_id BIGINT, unidade TEXT, atividade_eap_id BIGINT, rdo_atividade_id BIGINT, quantidade NUMERIC);
      CREATE TEMP TABLE requisicoes (id BIGSERIAL PRIMARY KEY, grupo_id BIGINT, tenant_destino_id BIGINT, projeto_destino_id BIGINT, numero_requisicao TEXT UNIQUE, projeto_id BIGINT, solicitante_id BIGINT, tipo_material TEXT, urgencia TEXT, observacao_geral TEXT);
      CREATE TEMP TABLE requisicao_itens (id BIGSERIAL PRIMARY KEY, requisicao_id BIGINT REFERENCES requisicoes(id), descricao TEXT, quantidade NUMERIC, unidade TEXT, especificacao_tecnica TEXT, justificativa TEXT, status_item TEXT DEFAULT 'Aguardando análise');
      CREATE TEMP TABLE requisicao_historico (id BIGSERIAL PRIMARY KEY, requisicao_id BIGINT, usuario_id BIGINT, tipo_evento TEXT, status_novo TEXT, detalhes TEXT);
      CREATE TEMP TABLE estoque_pendencias_recebimento (id BIGINT PRIMARY KEY, tenant_id BIGINT, referencia_tipo TEXT, referencia_id BIGINT, quantidade_comprada NUMERIC, quantidade_recebida NUMERIC);
      SET LOCAL search_path TO pg_temp, public;
      INSERT INTO tenants VALUES (1), (2); INSERT INTO usuarios VALUES (7), (8);
      INSERT INTO projetos VALUES (10,1,'Obra A'), (11,1,'Obra B'), (20,2,'Outra empresa');
      INSERT INTO projeto_usuarios VALUES (1,10,7);
      INSERT INTO atividades_eap VALUES (90,10,1,'1','Civil','2026-12-01',NULL), (100,10,1,'1.1','Fundação','2026-12-01',90), (101,10,1,'1.2','Pilar','2026-12-01',90), (200,20,2,'1','Outra','2026-12-01',NULL);
      INSERT INTO estoque_insumos VALUES (40,1,'Concreto','m³');
    `);
    await require('../scripts/migrations/000029_mapa_suprimentos').up({ run: (sql) => client.query(sql) });
    await require('../scripts/migrations/000030_mapa_suprimentos_compras').up({ run: (sql) => client.query(sql) });
    await require('../scripts/migrations/000031_mapa_suprimentos_data_eap').up({ run: (sql) => client.query(sql) });
    for (const table of ['mapa_suprimentos', 'mapa_suprimentos_requisicoes']) await client.query(`ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY`);
    const query = (sql, args = []) => client.query(db.translateQuery(sql), args);
    const get = async (sql, args) => (await query(sql, args)).rows[0] || null;
    const all = async (sql, args) => (await query(sql, args)).rows;
    const exec = async (sql, args = []) => { const insert = /^\s*INSERT/i.test(sql); const result = await query(insert ? `${sql} RETURNING id` : sql, args); return { lastID: result.rows[0]?.id, changes: result.rowCount }; };
    const mock = (name, exports) => { require.cache[require.resolve(name)] = { id: require.resolve(name), filename: require.resolve(name), loaded: true, exports }; };
    mock('../config/database', { ...db, getQuery: get, allQuery: all, runQuery: exec,
      withClient: async (fn) => { await client.query('SAVEPOINT mapa_test'); try { const value = await fn(client); await client.query('RELEASE SAVEPOINT mapa_test'); return value; } catch (error) { await client.query('ROLLBACK TO SAVEPOINT mapa_test'); throw error; } },
      getWithClient: (_c, sql, args) => get(sql, args), allWithClient: (_c, sql, args) => all(sql, args), execWithClient: (_c, sql, args) => exec(sql, args) });
    mock('../middleware/auth', { auth: (req, _res, next) => { req.tenantId = Number(req.headers['x-tenant'] || 1); req.grupoId = 1; req.usuario = { id: Number(req.headers['x-user'] || 7), perfil: req.headers['x-role'] || 'Gestor da Obra' }; next(); }, isGestor: (req, res, next) => ['Gestor Geral','Gestor da Obra'].includes(req.usuario.perfil) ? next() : res.status(403).json({ erro: 'Sem permissão.' }) });
    const express = require('express'); const app = express(); app.use(express.json()); app.use('/mapa', require('../routes/mapa_suprimentos'));
    server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/mapa/projeto`;
    const call = async (path, options = {}) => { const response = await fetch(base + path, options); return { status: response.status, body: await response.json() }; };
    const post = (body, headers = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const item = (atividade_id, quantidade) => ({ atividade_id, tipo: 'material', insumo_id: 40, descricao: 'Concreto', unidade: 'm³', quantidade, data_necessidade: '2026-12-01' });
    let parentResult = await call('/10', post(item(90, '1'))); assert.equal(parentResult.status, 409, 'atividade com filhas não aceita novos insumos');
    let result = await call('/10', post(item(100, '10'))); assert.equal(result.status, 201); const first = result.body.id;
    result = await call('/10', post({ ...item(101, '5'), data_necessidade_manual: false })); assert.equal(result.status, 201); const second = result.body.id;
    await query("UPDATE atividades_eap SET data_inicio_planejada='2026-12-02' WHERE id IN (100,101)");
    result = await call('/10'); assert.equal(result.body.necessidades[0].data_necessidade_efetiva, '2026-12-01', 'data manual permanece'); assert.equal(result.body.necessidades[1].data_necessidade_efetiva, '2026-12-02', 'data automática acompanha a EAP');
    await query("UPDATE atividades_eap SET data_inicio_planejada='2026-12-01' WHERE id IN (100,101)");
    await query(`INSERT INTO estoque_lotes (id,insumo_id,tenant_id) VALUES (50,40,1)`);
    await query(`INSERT INTO estoque_aplicacoes VALUES (1,1,10,50,'m³',100,NULL,3)`);
    result = await call('/11'); assert.equal(result.status, 403, 'projeto não vinculado deve ser negado');
    result = await call('/20', post(item(200, '1'))); assert.equal(result.status, 403, 'outro tenant deve ser negado');
    result = await call('/20', { headers: { 'x-role': 'Gestor Geral' } }); assert.equal(result.status, 404, 'acesso global não atravessa tenants');
    result = await call('/10', { headers: { 'x-role': 'Fiscal' } }); assert.equal(result.status, 403, 'perfil sem EAP não vê o mapa');
    result = await call('/10', post(item(100, '1'), { 'x-role': 'Gestor da Qualidade' })); assert.equal(result.status, 403, 'perfil de leitura não altera necessidades');
    result = await call('/10/sugestao-data?necessidade=2026-11-16&prazo=1'); assert.equal(result.status, 200); assert.equal(result.body.data_solicitacao, '2026-11-13', 'usa dias úteis existentes');
    result = await call('/10/requisicoes', post({ itens: [{ id: first, quantidade: '10' }, { id: second, quantidade: '5' }] })); assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.match(result.body.numero, /^MAP-\d{8}-\d{6,}$/); assert.equal((await get('SELECT numero_requisicao FROM requisicoes WHERE id=?', [result.body.id])).numero_requisicao, result.body.numero);
    assert.equal(Number((await get('SELECT COUNT(*) AS total FROM requisicao_itens')).total), 1, 'insumos equivalentes são consolidados');
    assert.equal(Number((await get('SELECT quantidade FROM requisicao_itens')).quantidade), 15);
    assert.equal(Number((await get('SELECT COUNT(*) AS total FROM mapa_suprimentos_requisicoes')).total), 2, 'vínculos preservam atividades');
    result = await call('/10/requisicoes', post({ itens: [{ id: first, quantidade: '1' }] })); assert.equal(result.status, 409, 'impede solicitação duplicada');
    result = await call('/10'); assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.necessidades.length, 2); assert.equal(result.body.necessidades[0].compras.length, 1); assert.equal(Number(result.body.necessidades[0].quantidade_consumida), 3); assert.equal(result.body.necessidades[1].quantidade_consumida, null);
    result = await call(`/10/${first}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...item(100, '10'), custo_unitario: '42', data_necessidade: '2026-12-03' }) }); assert.equal(result.status, 200, 'permite atualizar custos e datas mesmo depois do encaminhamento');
    result = await call(`/10/${first}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item(100, '9')) }); assert.equal(result.status, 409, 'não reduz o planejado abaixo da cobertura existente');
    result = await call(`/10/${first}`, { method: 'DELETE' }); assert.equal(result.status, 409, 'vínculo impede remoção do histórico');
    await query("UPDATE requisicao_itens SET quantidade=12");
    result = await call('/10/requisicoes', post({ itens: [{ id: second, quantidade: '1' }] })); assert.equal(result.status, 409, 'alteração na compra exige reconciliação');
    await query("UPDATE requisicao_itens SET status_item='Cancelado'");
    result = await call('/10', post({ ...item(101, '1'), descricao: 'Concreto especial', data_necessidade: '2026-12-03' })); assert.equal(result.status, 201); const third = result.body.id;
    result = await call('/10/requisicoes', post({ itens: [{ id: first, quantidade: '10' }, { id: third, quantidade: '1' }] })); assert.equal(result.status, 201, 'cancelamento libera a demanda para nova requisição');
    assert.equal(Number((await get('SELECT COUNT(*) AS total FROM requisicao_itens WHERE requisicao_id=?', [result.body.id])).total), 2, 'descrições diferentes não são consolidadas');
    result = await call('/10', post({ ...item(101, '1'), insumo_id: null, tipo: 'equipamento', equipamento_origem: 'proprio' })); assert.equal(result.status, 201); const equipment = result.body.id;
    result = await call('/10/requisicoes', post({ itens: [{ id: equipment, quantidade: '1' }] })); assert.equal(result.status, 409, 'equipamento próprio não é encaminhado para compra');
    const historical = await exec(`INSERT INTO mapa_suprimentos (tenant_id,projeto_id,atividade_id,projeto_original_id,atividade_original_id,atividade_codigo,atividade_descricao,tipo,descricao,unidade,quantidade)
      VALUES (1,10,90,10,90,'1','Civil','material','Registro anterior','un',1)`);
    result = await call('/10'); assert.ok(result.body.necessidades.some((entry) => Number(entry.id) === Number(historical.lastID)), 'registro anterior em atividade agrupadora continua visível');
    result = await call(`/10/${historical.lastID}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...item(90, '2'), insumo_id: null, descricao: 'Registro anterior', unidade: 'un' }) }); assert.equal(result.status, 200, 'registro anterior permanece editável');
    console.log('mapaSuprimentosIntegration: cadastro, acesso, consolidação, histórico e duplicidade validados.');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await client.query('ROLLBACK'); client.release(); await db.pool.end();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
