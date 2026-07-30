// ---------------------------------------------------------------------------
// Tenant Provisioning — PostgreSQL schema-per-tenant
// ---------------------------------------------------------------------------
// Each tenant gets its own PostgreSQL schema: tenant_<id>
// Tables within the schema mirror the public schema structure via LIKE ... INCLUDING ALL.
// ---------------------------------------------------------------------------

const path = require('path');
const fs = require('fs');

const {
  pool,
  runQueryMain,
  getQueryMain,
  runWithTenantContext,
  runQuery,
  tenantSchema,
  translateQuery,
} = require('../config/database');

const backendDir = path.join(__dirname, '..');
const migrationsDir = path.join(backendDir, 'scripts', 'migrations');

// ---------------------------------------------------------------------------
// Error factory
// ---------------------------------------------------------------------------

const createTenantError = (code, message, details = {}) => {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, details);
  return err;
};

// ---------------------------------------------------------------------------
// Schema existence check
// ---------------------------------------------------------------------------

const schemaExists = async (client, schema) => {
  const result = await client.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
    [schema]
  );
  return result.rows.length > 0;
};

// ---------------------------------------------------------------------------
// Migration support
// ---------------------------------------------------------------------------

const loadMigrations = () => {
  if (!fs.existsSync(migrationsDir)) return [];

  return fs.readdirSync(migrationsDir)
    .filter((fileName) => /^\d+_.+\.js$/.test(fileName))
    .sort()
    .map((fileName) => {
      const migration = require(path.join(migrationsDir, fileName));
      const expectedId = fileName.replace(/\.js$/, '');
      if (!migration || migration.id !== expectedId || typeof migration.up !== 'function') {
        throw createTenantError('TENANT_MIGRATION_INVALID', `Migration invalida: ${fileName}`);
      }
      return migration;
    });
};

const applyMigrationsToSchema = async (client, schema, tenantId) => {
  await client.query(`SET search_path TO "${schema}", public`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const appliedResult = await client.query('SELECT id FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map((row) => String(row.id)));
  const migrations = loadMigrations();

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    const context = {
      target: { name: `tenant_${tenantId}`, schema },
      run: (sql, params) => client.query(translateQuery(sql), params || []),
      get: async (sql, params) => {
        const r = await client.query(translateQuery(sql), params || []);
        return r.rows[0] || null;
      },
      all: async (sql, params) => {
        const r = await client.query(translateQuery(sql), params || []);
        return r.rows;
      },
    };

    await migration.up(context);
    await client.query(
      `INSERT INTO schema_migrations (id, description) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [migration.id, migration.description || '']
    );
  }
};

// ---------------------------------------------------------------------------
// Copy table structure from public schema to tenant schema
// ---------------------------------------------------------------------------

const copyTablesFromPublic = async (client, schema) => {
  const tablesResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  for (const { table_name } of tablesResult.rows) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS "${schema}"."${table_name}" (LIKE public."${table_name}" INCLUDING ALL)`
    );

    // Copy any sequence ownership (for SERIAL columns) into tenant schema
    const seqResult = await client.query(`
      SELECT pg_get_serial_sequence('public."${table_name}"', column_name) AS seq, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
        AND column_default LIKE 'nextval%'
    `, [table_name]).catch(() => ({ rows: [] }));

    for (const { column_name } of seqResult.rows) {
      const seqName = `${schema}_${table_name}_${column_name}_seq`;
      await client.query(
        `CREATE SEQUENCE IF NOT EXISTS "${schema}"."${seqName}" START 1`
      ).catch(() => {});
      await client.query(
        `ALTER TABLE "${schema}"."${table_name}"
         ALTER COLUMN "${column_name}" SET DEFAULT nextval('"${schema}"."${seqName}"')`
      ).catch(() => {});
    }
  }
};

// ---------------------------------------------------------------------------
// Insert a row by inspecting actual columns in the target schema
// ---------------------------------------------------------------------------

const insertRowInSchema = async (client, schema, table, row) => {
  const colResult = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  const columns = colResult.rows.map((r) => r.column_name);
  const present = columns.filter((col) => Object.prototype.hasOwnProperty.call(row, col));
  if (present.length === 0) return;

  const placeholders = present.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO "${schema}"."${table}" (${present.map((c) => `"${c}"`).join(', ')})
     VALUES (${placeholders})`,
    present.map((col) => row[col])
  );
};

// ---------------------------------------------------------------------------
// Validate tenant schema
// ---------------------------------------------------------------------------

const validateTenantSchema = async (client, schema, tenantId) => {
  await client.query(`SET search_path TO "${schema}", public`);

  const tenantResult = await client.query(
    'SELECT id FROM tenants WHERE id = $1',
    [tenantId]
  );
  if (tenantResult.rows.length === 0) {
    throw createTenantError('TENANT_METADATA_MISSING', 'Schema tenant sem metadados do tenant.');
  }

  const migrations = loadMigrations();
  const appliedResult = await client.query('SELECT id FROM schema_migrations ORDER BY id');
  const applied = new Set(appliedResult.rows.map((row) => String(row.id)));
  const pending = migrations.filter((m) => !applied.has(m.id));
  if (pending.length > 0) {
    throw createTenantError('TENANT_SCHEMA_OUTDATED', 'Schema tenant com migrations pendentes.', {
      pending: pending.map((m) => m.id),
    });
  }
};

// ---------------------------------------------------------------------------
// Create tenant schema (PostgreSQL equivalent of "create tenant database")
// ---------------------------------------------------------------------------

const createTenantSchema = async ({ tenantId, tenantRow, userRow, userTenantRow }) => {
  const numericTenantId = Number(tenantId);
  const schema = tenantSchema(numericTenantId);

  const client = await pool.connect();
  try {
    if (await schemaExists(client, schema)) {
      throw createTenantError(
        'TENANT_DATABASE_ALREADY_EXISTS',
        `Schema tenant ${numericTenantId} ja existe: ${schema}`
      );
    }

    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${schema}"`);
    await copyTablesFromPublic(client, schema);
    await applyMigrationsToSchema(client, schema, numericTenantId);
    await insertRowInSchema(client, schema, 'tenants', tenantRow);
    await insertRowInSchema(client, schema, 'usuarios', userRow);
    await insertRowInSchema(client, schema, 'usuario_tenants', userTenantRow);
    await validateTenantSchema(client, schema, numericTenantId);
    await client.query('COMMIT');
    return schema;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// Keep legacy alias
const createTenantDatabaseFromCleanSchema = createTenantSchema;

// ---------------------------------------------------------------------------
// Bootstrap data helpers
// ---------------------------------------------------------------------------

const getRowsForTenantBootstrap = async (tenantId, userId) => {
  const tenantRow = await getQueryMain('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  const userRow = await getQueryMain('SELECT * FROM usuarios WHERE id = ?', [userId]);
  const userTenantRow = await getQueryMain(
    'SELECT * FROM usuario_tenants WHERE usuario_id = ? AND tenant_id = ?',
    [userId, tenantId]
  );

  if (!tenantRow || !userRow || !userTenantRow) {
    throw createTenantError('TENANT_BOOTSTRAP_DATA_MISSING', 'Dados iniciais do tenant incompletos.');
  }

  return { tenantRow, userRow, userTenantRow };
};

const activateTenant = async (tenantId) => {
  await runQueryMain('UPDATE tenants SET ativo = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [tenantId]);
  await runWithTenantContext(tenantId, async () => {
    await runQuery('UPDATE tenants SET ativo = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [tenantId]);
  });
};

const rollbackTenantProvisioning = async ({ tenantId, userId }) => {
  if (userId) {
    await runQueryMain('DELETE FROM usuario_tenants WHERE usuario_id = ?', [userId]).catch(() => {});
    await runQueryMain('DELETE FROM usuarios WHERE id = ?', [userId]).catch(() => {});
  }

  if (tenantId) {
    await runQueryMain('DELETE FROM usuario_tenants WHERE tenant_id = ?', [tenantId]).catch(() => {});
    await runQueryMain('DELETE FROM tenants WHERE id = ?', [tenantId]).catch(() => {});
    const client = await pool.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${tenantSchema(tenantId)}" CASCADE`);
    } finally {
      client.release();
    }
  }
};

// ---------------------------------------------------------------------------
// Public API: provision a trial tenant
// ---------------------------------------------------------------------------

const provisionTrialTenant = async ({
  tenantName,
  tenantSlug,
  trialExpiresAt,
  login,
  passwordHash,
  name,
  email,
}) => {
  let tenantId = null;
  let userId = null;

  try {
    const tenantInsert = await runQueryMain(
      'INSERT INTO tenants (nome, slug, ativo, trial_expires_at, trial_ativo) VALUES (?, ?, 0, ?, ?)',
      [tenantName, tenantSlug, trialExpiresAt || null, trialExpiresAt ? 1 : 0]
    );
    tenantId = Number(tenantInsert.lastID);

    const userInsert = await runQueryMain(
      `INSERT INTO usuarios (login, senha, nome, email, perfil, funcao, setor, is_gestor, is_adm, tenant_id, ativo, primeiro_acesso_pendente)
       VALUES (?, ?, ?, ?, 'Gestor Geral', 'Gestor Geral', 'Administrativo', 1, 0, ?, 1, 1)`,
      [login, passwordHash, name, email, tenantId]
    );
    userId = Number(userInsert.lastID);

    await runQueryMain(
      'INSERT INTO usuario_tenants (usuario_id, tenant_id, ativo) VALUES (?, ?, 1)',
      [userId, tenantId]
    );

    const rows = await getRowsForTenantBootstrap(tenantId, userId);
    await createTenantSchema({ tenantId, ...rows });
    await activateTenant(tenantId);

    return { tenantId, userId };
  } catch (error) {
    await rollbackTenantProvisioning({ tenantId, userId }).catch((rollbackError) => {
      console.error('[tenant-provisioning] rollback falhou:', rollbackError?.message || rollbackError);
    });
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Assert tenant is ready (validate schema exists and is up to date)
// ---------------------------------------------------------------------------

const assertTenantReady = async (tenantId) => {
  const numericTenantId = Number(tenantId);
  const tenant = await getQueryMain('SELECT id, ativo FROM tenants WHERE id = ?', [numericTenantId]);
  if (!tenant || Number(tenant.ativo) !== 1) {
    throw createTenantError('TENANT_INACTIVE', 'Tenant inativo ou inexistente.');
  }

  const schema = tenantSchema(numericTenantId);
  const client = await pool.connect();
  try {
    if (!(await schemaExists(client, schema))) {
      throw createTenantError('TENANT_DATABASE_MISSING', `Schema tenant ausente: ${schema}`);
    }
    await validateTenantSchema(client, schema, numericTenantId);
  } finally {
    client.release();
  }
};

module.exports = {
  createTenantError,
  assertTenantReady,
  provisionTrialTenant,
  createTenantDatabaseFromCleanSchema,
  createTenantSchema,
};
