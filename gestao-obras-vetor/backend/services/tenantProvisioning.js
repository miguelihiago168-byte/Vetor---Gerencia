// Tenant provisioning for the single PostgreSQL database. A tenant is a legal
// entity (CNPJ), never a schema or a copied database.
const { pool, getQueryMain } = require('../config/database');

const createTenantError = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });

const assertTenantReady = async (tenantId) => {
  const tenant = await getQueryMain(
    'SELECT id, grupo_id, ativo FROM tenants WHERE id = ? AND ativo = 1',
    [Number(tenantId)]
  );
  if (!tenant) throw createTenantError('TENANT_INACTIVE', 'Tenant inativo ou inexistente.');
  if (!tenant.grupo_id) throw createTenantError('TENANT_GROUP_MISSING', 'Tenant sem grupo empresarial.');
  return tenant;
};

const provisionTrialTenant = async ({ tenantName, tenantSlug, trialExpiresAt, login, passwordHash, name, email }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const groupResult = await client.query(
      'INSERT INTO grupos_empresariais (nome, ativo) VALUES ($1, true) RETURNING id',
      [tenantName]
    );
    const grupoId = Number(groupResult.rows[0].id);
    const tenantResult = await client.query(
      `INSERT INTO tenants (grupo_id, nome, slug, ativo, trial_expires_at, trial_ativo)
       VALUES ($1, $2, $3, 0, $4, $5) RETURNING id`,
      [grupoId, tenantName, tenantSlug, trialExpiresAt || null, trialExpiresAt ? 1 : 0]
    );
    const tenantId = Number(tenantResult.rows[0].id);
    const userResult = await client.query(
      `INSERT INTO usuarios (login, senha, nome, email, perfil, funcao, setor, is_gestor, is_adm, ativo, primeiro_acesso_pendente)
       VALUES ($1, $2, $3, $4, 'Gestor Geral', 'Gestor Geral', 'Administrativo', 1, 0, 1, 1)
       RETURNING id`,
      [login, passwordHash, name, email]
    );
    const userId = Number(userResult.rows[0].id);
    await client.query(
      'INSERT INTO usuario_tenants (usuario_id, tenant_id, ativo, tenant_padrao) VALUES ($1, $2, 1, true)',
      [userId, tenantId]
    );
    await client.query('UPDATE tenants SET ativo = 1 WHERE id = $1', [tenantId]);
    await client.query('COMMIT');
    return { tenantId, userId, grupoId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// Compatibility aliases for callers from the former schema-per-tenant code.
const createTenantSchema = async () => 'public';
const createTenantDatabaseFromCleanSchema = createTenantSchema;

module.exports = {
  createTenantError,
  assertTenantReady,
  provisionTrialTenant,
  createTenantSchema,
  createTenantDatabaseFromCleanSchema,
};
