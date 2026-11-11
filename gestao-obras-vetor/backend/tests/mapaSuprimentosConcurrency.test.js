// Duas conexões reais disputam a mesma necessidade em schema de teste isolado.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
require('dotenv').config({ path: process.env.MAPA_TEST_ENV_FILE || require('node:path').join(__dirname, '..', '.env') });
if (process.env.DB_HOST && !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error('Este teste requer PostgreSQL local.');
const db = require('../config/database');
const schema = `mapa_test_${randomBytes(6).toString('hex')}`;
(async () => {
  const setup = await db.pool.connect(); let server; let created = false;
  try {
    await setup.query(`CREATE SCHEMA "${schema}"`); created = true;
    await setup.query(`SET search_path TO "${schema}",public`);
    await setup.query(`
      CREATE TABLE tenants (id BIGINT PRIMARY KEY); CREATE TABLE usuarios (id BIGINT PRIMARY KEY);
      CREATE TABLE projetos (id BIGINT PRIMARY KEY, tenant_id BIGINT, nome TEXT);
      CREATE TABLE projeto_usuarios (id BIGINT, projeto_id BIGINT, usuario_id BIGINT);
      CREATE TABLE atividades_eap (id BIGINT PRIMARY KEY, projeto_id BIGINT, tenant_id BIGINT, codigo_eap TEXT, descricao TEXT, data_inicio_planejada DATE, pai_id BIGINT);
      CREATE TABLE estoque_insumos (id BIGINT PRIMARY KEY, tenant_id BIGINT, nome TEXT, unidade TEXT);
      CREATE TABLE requisicoes (id BIGSERIAL PRIMARY KEY, grupo_id BIGINT, tenant_destino_id BIGINT, projeto_destino_id BIGINT, numero_requisicao TEXT UNIQUE, projeto_id BIGINT, solicitante_id BIGINT, tipo_material TEXT, urgencia TEXT, observacao_geral TEXT);
      CREATE TABLE requisicao_itens (id BIGSERIAL PRIMARY KEY, requisicao_id BIGINT REFERENCES requisicoes(id), descricao TEXT, quantidade NUMERIC, unidade TEXT, especificacao_tecnica TEXT, justificativa TEXT, status_item TEXT DEFAULT 'Aguardando análise');
      CREATE TABLE requisicao_historico (id BIGSERIAL PRIMARY KEY, requisicao_id BIGINT, usuario_id BIGINT, tipo_evento TEXT, status_novo TEXT, detalhes TEXT);
      INSERT INTO tenants VALUES (1); INSERT INTO usuarios VALUES (7); INSERT INTO projetos VALUES (10,1,'Obra');
      INSERT INTO projeto_usuarios VALUES (1,10,7); INSERT INTO atividades_eap VALUES (100,10,1,'1','Fundação','2026-12-01',NULL);
    `);
    for (const id of ['000029_mapa_suprimentos', '000030_mapa_suprimentos_compras', '000031_mapa_suprimentos_data_eap']) await require(`../scripts/migrations/${id}`).up({ run: (sql) => setup.query(sql) });
    await setup.query(`INSERT INTO mapa_suprimentos (tenant_id,projeto_id,atividade_id,projeto_original_id,atividade_original_id,atividade_codigo,atividade_descricao,tipo,descricao,unidade,quantidade)
      VALUES (1,10,100,10,100,'1','Fundação','material','Concreto','m³',10)`);
    const withClient = async (fn) => {
      const c = await db.pool.connect();
      try { await c.query('BEGIN'); await c.query(`SET LOCAL search_path TO "${schema}",public`); const result = await fn(c); await c.query('COMMIT'); return result; }
      catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
    };
    const getWith = async (c, sql, args = []) => (await c.query(db.translateQuery(sql), args)).rows[0] || null;
    const allWith = async (c, sql, args = []) => (await c.query(db.translateQuery(sql), args)).rows;
    const execWith = async (c, sql, args = []) => { const insert = /^\s*INSERT/i.test(sql); const r = await c.query(db.translateQuery(insert ? `${sql} RETURNING id` : sql), args); return { lastID: r.rows[0]?.id, changes: r.rowCount }; };
    const mock = (name, exports) => { require.cache[require.resolve(name)] = { id: require.resolve(name), filename: require.resolve(name), loaded: true, exports }; };
    mock('../config/database', { ...db, withClient, getWithClient: getWith, allWithClient: allWith, execWithClient: execWith,
      getQuery: (sql, args) => withClient((c) => getWith(c,sql,args)), allQuery: (sql,args) => withClient((c) => allWith(c,sql,args)), runQuery: (sql,args) => withClient((c) => execWith(c,sql,args)) });
    mock('../middleware/auth', { auth: (req,_res,next) => { req.tenantId=1; req.grupoId=1; req.usuario={id:7,perfil:'Gestor da Obra'}; next(); }, isGestor: (_req,_res,next) => next() });
    const express = require('express'); const app=express(); app.use(express.json()); app.use('/mapa',require('../routes/mapa_suprimentos'));
    server=await new Promise((resolve)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const url=`http://127.0.0.1:${server.address().port}/mapa/projeto/10/requisicoes`;
    const send=()=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({itens:[{id:1,quantidade:'10'}]})});
    const responses=await Promise.all([send(),send()]);
    assert.deepEqual(responses.map((r)=>r.status).sort(),[201,409]);
    assert.equal(Number((await setup.query('SELECT COUNT(*) AS total FROM requisicoes')).rows[0].total),1);
    assert.equal(Number((await setup.query('SELECT COUNT(*) AS total FROM mapa_suprimentos_requisicoes')).rows[0].total),1);
    console.log('mapaSuprimentosConcurrency: apenas uma requisição concorrente foi criada.');
  } finally {
    if(server) await new Promise((resolve)=>server.close(resolve));
    await setup.query('SET search_path TO public');
    if(created) await setup.query(`DROP SCHEMA "${schema}" CASCADE`);
    setup.release(); await db.pool.end();
  }
})().catch((error)=>{console.error(error.message);process.exitCode=1;});
