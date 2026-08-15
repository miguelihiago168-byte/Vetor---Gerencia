/* Bootstrap for a new, empty PostgreSQL database. It intentionally creates one
 * shared set of tables and never creates tenant schemas. */
const { spawnSync } = require('child_process');
const path = require('path');
const initDatabase = require('./initDatabase');
const { pool } = require('../config/database');

const main = async () => {
  await initDatabase();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id BIGSERIAL PRIMARY KEY, nome TEXT NOT NULL, slug TEXT UNIQUE, ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS usuario_tenants (
        id BIGSERIAL PRIMARY KEY, usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(usuario_id, tenant_id)
      )
    `);
  } finally {
    client.release();
  }

  const migration = spawnSync(process.execPath, [path.join(__dirname, 'runMigrations.js')], {
    cwd: path.join(__dirname, '..'), env: process.env, stdio: 'inherit'
  });
  if (migration.status !== 0) throw new Error('Falha ao aplicar migrations RLS.');

  const setupClient = await pool.connect();
  try {
    await setupClient.query('BEGIN');
    const group = await setupClient.query(
      `INSERT INTO grupos_empresariais (nome) VALUES ('Vetor - Ambiente Inicial')
       ON CONFLICT DO NOTHING RETURNING id`
    );
    const groupId = group.rows[0]?.id || (await setupClient.query("SELECT id FROM grupos_empresariais WHERE nome = 'Vetor - Ambiente Inicial' LIMIT 1")).rows[0].id;
    const tenant = await setupClient.query(
      `INSERT INTO tenants (grupo_id, nome, slug, ativo) VALUES ($1, 'Tenant Inicial', 'tenant-inicial', 1)
       ON CONFLICT (slug) DO UPDATE SET grupo_id = EXCLUDED.grupo_id RETURNING id`, [groupId]
    );
    const admin = await setupClient.query("SELECT id FROM usuarios WHERE login = '000001' LIMIT 1");
    if (admin.rows[0]) {
      await setupClient.query(
        `INSERT INTO usuario_tenants (usuario_id, tenant_id, ativo, tenant_padrao)
         VALUES ($1, $2, 1, TRUE) ON CONFLICT (usuario_id, tenant_id) DO UPDATE SET ativo = 1, tenant_padrao = TRUE`,
        [admin.rows[0].id, tenant.rows[0].id]
      );
    }
    await setupClient.query('COMMIT');
  } catch (error) {
    await setupClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    setupClient.release();
  }
};

main()
  .then(() => console.log('[bootstrap-rls] Banco compartilhado pronto.'))
  .catch((error) => { console.error(error?.stack || error); process.exitCode = 1; })
  .finally(() => pool.end());
