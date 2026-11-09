// Uses only temporary tables inside a transaction; no application data is changed.
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
if (process.env.DB_HOST && !['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST)) throw new Error('O teste requer PostgreSQL local.');
const db = require('../config/database');
const migration = require('../scripts/migrations/000026_fiq');

(async () => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE folhas_verificacao (id BIGINT PRIMARY KEY,tenant_id BIGINT,projeto_id BIGINT,folha_origem_id BIGINT);
      CREATE TEMP TABLE folhas_verificacao_respostas (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE folhas_verificacao_medicoes (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE folhas_verificacao_eletrica_ensaios (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE folhas_verificacao_eletrica_torques (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE folhas_verificacao_nao_conformidades (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE folhas_verificacao_evidencias (id BIGINT PRIMARY KEY);
      CREATE TEMP TABLE folhas_verificacao_rncs (id BIGINT PRIMARY KEY,tenant_id BIGINT,folha_id BIGINT UNIQUE,rnc_id BIGINT);`);
    await migration.up({run:sql => client.query(sql)});
    await migration.up({run:sql => client.query(sql)});
    await client.query("INSERT INTO folhas_verificacao (id,tenant_id,projeto_id,fiq_numero) VALUES (1,1,10,'FIQ-1-10-000001'),(2,1,10,NULL)");
    await client.query("INSERT INTO folhas_verificacao (id,tenant_id,projeto_id,folha_origem_id,fiq_numero) VALUES (3,1,10,1,'FIQ-1-10-000001')");
    await client.query('SAVEPOINT duplicate');
    await assert.rejects(() => client.query("INSERT INTO folhas_verificacao (id,tenant_id,projeto_id,fiq_numero) VALUES (4,1,10,'FIQ-1-10-000001')"), {code:'23505'});
    await client.query('ROLLBACK TO SAVEPOINT duplicate');
    await client.query('INSERT INTO folhas_verificacao_respostas VALUES (11)');
    await client.query('INSERT INTO folhas_verificacao_rncs (id,tenant_id,folha_id,rnc_id,resposta_id) VALUES (1,1,1,101,11),(2,1,1,102,11)');
    assert.equal((await client.query('SELECT COUNT(*)::int AS total FROM folhas_verificacao_rncs WHERE folha_id=1')).rows[0].total,2);
    console.log('FIQ PostgreSQL: migration idempotente, numeração, revisões e múltiplas RNCs validadas em tabelas temporárias.');
  } finally {
    await client.query('ROLLBACK'); client.release(); await db.pool.end();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
