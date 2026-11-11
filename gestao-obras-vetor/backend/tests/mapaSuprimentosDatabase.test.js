// Tabelas temporárias dentro de uma transação revertida, sem alterar dados existentes.
const assert = require('node:assert/strict');
require('dotenv').config({ path: process.env.MAPA_TEST_ENV_FILE || require('node:path').join(__dirname, '..', '.env') });
if (process.env.DB_HOST && !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) throw new Error('Este teste requer PostgreSQL local.');
const { pool } = require('../config/database');
const migration = require('../scripts/migrations/000029_mapa_suprimentos');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE tenants (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE projetos (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE atividades_eap (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE estoque_insumos (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE usuarios (id BIGINT PRIMARY KEY);
      SET LOCAL search_path TO pg_temp, public;
      INSERT INTO tenants VALUES (1);
      INSERT INTO projetos VALUES (10);
      INSERT INTO atividades_eap VALUES (20);`);
    await migration.up({ run: (sql) => client.query(sql) });
    // O teste usa o papel de proprietário apenas para inspecionar o schema e as FKs.
    await client.query('ALTER TABLE mapa_suprimentos NO FORCE ROW LEVEL SECURITY');
    await client.query(`INSERT INTO mapa_suprimentos
      (tenant_id, projeto_id, atividade_id, projeto_original_id, atividade_original_id, atividade_codigo, atividade_descricao, tipo, descricao, unidade, quantidade)
      VALUES (1,10,20,10,20,'1','Fundação','material','Concreto','m³',12)`);
    const row = (await client.query('SELECT custo_unitario FROM mapa_suprimentos')).rows[0];
    assert.equal(row.custo_unitario, null);
    await client.query('DELETE FROM atividades_eap WHERE id=20');
    const historical = (await client.query('SELECT atividade_id, atividade_original_id, atividade_descricao FROM mapa_suprimentos')).rows[0];
    assert.equal(historical.atividade_id, null);
    assert.equal(Number(historical.atividade_original_id), 20);
    assert.equal(historical.atividade_descricao, 'Fundação');
    await client.query('DELETE FROM projetos WHERE id=10');
    assert.equal((await client.query('SELECT projeto_id FROM mapa_suprimentos')).rows[0].projeto_id, null);
    console.log('mapaSuprimentosDatabase: migration, custo ausente e preservação histórica validados.');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
