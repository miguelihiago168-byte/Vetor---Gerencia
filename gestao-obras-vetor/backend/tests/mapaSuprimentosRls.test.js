// Verifica RLS com papel sem BYPASSRLS, usando apenas tabelas temporárias.
const assert = require('node:assert/strict');
require('dotenv').config({ path: process.env.MAPA_TEST_ENV_FILE || require('node:path').join(__dirname, '..', '.env') });
if (process.env.DB_HOST && !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error('Este teste requer PostgreSQL local.');
const { pool } = require('../config/database');
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const role = process.env.DB_APP_USER || 'gestao_app';
    if (!/^[a-z_][a-z0-9_]*$/i.test(role)) throw new Error('Papel de teste inválido.');
    const r = await client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=$1', [role]);
    assert.ok(r.rows.length && !r.rows[0].rolsuper && !r.rows[0].rolbypassrls, 'papel de aplicação deve existir e respeitar RLS');
    const membership = (await client.query('SELECT usuario_id, tenant_id FROM usuario_tenants WHERE ativo=1 LIMIT 1')).rows[0];
    if (!membership) throw new Error('Não há vínculo local de usuário e tenant para validar RLS.');
    const tenant = Number(membership.tenant_id), other = tenant + 1000000000;
    await client.query(`CREATE TEMP TABLE tenants (id BIGINT PRIMARY KEY); CREATE TEMP TABLE projetos (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE atividades_eap (id BIGINT PRIMARY KEY); CREATE TEMP TABLE estoque_insumos (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE usuarios (id BIGINT PRIMARY KEY); CREATE TEMP TABLE requisicao_itens (id BIGINT PRIMARY KEY); SET LOCAL search_path TO pg_temp,public`);
    await client.query('INSERT INTO tenants VALUES ($1),($2)', [tenant, other]);
    await require('../scripts/migrations/000029_mapa_suprimentos').up({ run: (sql) => client.query(sql) });
    await require('../scripts/migrations/000030_mapa_suprimentos_compras').up({ run: (sql) => client.query(sql) });
    await client.query(`INSERT INTO mapa_suprimentos (tenant_id, projeto_original_id, atividade_original_id, atividade_codigo, atividade_descricao, tipo, descricao, unidade, quantidade)
      VALUES ($1,1,1,'1','Atividade','material','Autorizado','un',1), ($2,2,2,'2','Atividade','material','Outro tenant','un',1)`, [tenant, other]);
    await client.query('INSERT INTO requisicao_itens VALUES (1), (2)');
    await client.query(`INSERT INTO mapa_suprimentos_requisicoes (tenant_id,necessidade_id,requisicao_item_id,requisicao_item_original_id,quantidade)
      SELECT tenant_id,id,CASE WHEN tenant_id=$1 THEN 1 ELSE 2 END,CASE WHEN tenant_id=$1 THEN 1 ELSE 2 END,1 FROM mapa_suprimentos`, [tenant]);
    await client.query(`GRANT SELECT, INSERT ON mapa_suprimentos, mapa_suprimentos_requisicoes TO "${role}"`);
    await client.query(`GRANT USAGE, SELECT ON SEQUENCE mapa_suprimentos_id_seq, mapa_suprimentos_requisicoes_id_seq TO "${role}"`);
    await client.query(`SET LOCAL ROLE "${role}"`);
    await client.query("SELECT set_config('app.user_id',$1,true), set_config('app.tenant_id',$2,true)", [String(membership.usuario_id), String(tenant)]);
    const rows = (await client.query('SELECT descricao FROM mapa_suprimentos ORDER BY descricao')).rows;
    assert.deepEqual(rows.map((row) => row.descricao), ['Autorizado']);
    assert.equal((await client.query('SELECT * FROM mapa_suprimentos_requisicoes')).rows.length, 1, 'vínculos seguem o tenant');
    await client.query('SAVEPOINT invalid_insert');
    await assert.rejects(client.query(`INSERT INTO mapa_suprimentos (tenant_id,projeto_original_id,atividade_original_id,atividade_codigo,atividade_descricao,tipo,descricao,unidade,quantidade)
      VALUES ($1,3,3,'3','Atividade','material','Inválido','un',1)`, [other]), (error) => error.code === '42501');
    await client.query('ROLLBACK TO SAVEPOINT invalid_insert');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [String(other)]);
    assert.equal((await client.query('SELECT * FROM mapa_suprimentos')).rows.length, 0, 'tenant sem vínculo deve ser invisível');
    assert.equal((await client.query('SELECT * FROM mapa_suprimentos_requisicoes')).rows.length, 0, 'vínculos de tenant não autorizado ficam invisíveis');
    console.log('mapaSuprimentosRls: isolamento real por tenant validado.');
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
