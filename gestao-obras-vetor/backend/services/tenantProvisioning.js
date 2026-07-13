const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const {
  runQueryMain,
  getQueryMain,
  allQueryMain,
  runWithTenantContext,
  runQuery,
  getQuery,
  allQuery
} = require('../config/database');

const backendDir = path.join(__dirname, '..');
const databaseDir = process.env.DB_DIR || path.join(backendDir, 'database');
const mainDbPath = path.join(databaseDir, 'gestao_obras.db');
const tenantDbDir = path.join(databaseDir, 'tenants');
const migrationsDir = path.join(backendDir, 'scripts', 'migrations');

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

const createTenantError = (code, message, details = {}) => {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, details);
  return err;
};

const openDb = (filePath, mode = sqlite3.OPEN_READWRITE) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(filePath, mode, (err) => {
    if (err) reject(err);
    else resolve(db);
  });
});

const closeDb = (db) => new Promise((resolve, reject) => {
  db.close((err) => {
    if (err) reject(err);
    else resolve();
  });
});

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows || []);
  });
});

const getTenantDbPath = (tenantId) => path.join(tenantDbDir, `tenant_${Number(tenantId)}.db`);

const ensureTenantTargetAvailable = (tenantId) => {
  const numericTenantId = Number(tenantId);
  if (!Number.isInteger(numericTenantId) || numericTenantId <= 0) {
    throw createTenantError('TENANT_INVALID_ID', 'tenant_id invalido.');
  }

  const tenantPath = getTenantDbPath(numericTenantId);
  if (fs.existsSync(tenantPath)) {
    throw createTenantError(
      'TENANT_DATABASE_ALREADY_EXISTS',
      `Banco tenant ${numericTenantId} ja existe.`,
      { tenantPath }
    );
  }

  return tenantPath;
};

const copySchemaFromMain = async (targetDb) => {
  const sourceDb = await openDb(mainDbPath, sqlite3.OPEN_READONLY);
  try {
    const schemaRows = await all(sourceDb, `
      SELECT type, name, sql
      FROM sqlite_master
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
        AND type IN ('table', 'index', 'trigger', 'view')
      ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name
    `);

    for (const row of schemaRows) {
      await run(targetDb, row.sql);
    }
  } finally {
    await closeDb(sourceDb);
  }
};

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

const applyMigrationsToTenantDb = async (db, tenantId) => {
  await run(db, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedRows = await all(db, 'SELECT id FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => String(row.id)));
  const migrations = loadMigrations();

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    const context = {
      target: { name: `tenant_${tenantId}`, filePath: getTenantDbPath(tenantId) },
      run: (sql, params) => run(db, sql, params),
      get: (sql, params) => get(db, sql, params),
      all: (sql, params) => all(db, sql, params)
    };

    await migration.up(context);
    await run(
      db,
      'INSERT INTO schema_migrations (id, description) VALUES (?, ?)',
      [migration.id, migration.description || '']
    );
  }
};

const tableColumns = async (db, table) => {
  const cols = await all(db, `PRAGMA table_info(${quoteIdent(table)})`);
  return cols.map((column) => column.name);
};

const insertRow = async (db, table, row) => {
  const columns = await tableColumns(db, table);
  const present = columns.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
  if (present.length === 0) return;

  await run(
    db,
    `INSERT INTO ${quoteIdent(table)} (${present.map(quoteIdent).join(', ')}) VALUES (${present.map(() => '?').join(', ')})`,
    present.map((column) => row[column])
  );
};

const validateTenantDatabase = async (db, tenantId) => {
  const tenant = await get(db, 'SELECT id FROM tenants WHERE id = ?', [tenantId]);
  if (!tenant) throw createTenantError('TENANT_METADATA_MISSING', 'Banco tenant sem metadados do tenant.');

  const migrations = loadMigrations();
  const appliedRows = await all(db, 'SELECT id FROM schema_migrations ORDER BY id');
  const applied = new Set(appliedRows.map((row) => String(row.id)));
  const pending = migrations.filter((migration) => !applied.has(migration.id));
  if (pending.length > 0) {
    throw createTenantError('TENANT_SCHEMA_OUTDATED', 'Banco tenant com migrations pendentes.', {
      pending: pending.map((migration) => migration.id)
    });
  }

  const integrity = await all(db, 'PRAGMA integrity_check');
  if (!(integrity.length === 1 && integrity[0].integrity_check === 'ok')) {
    throw createTenantError('TENANT_INTEGRITY_FAILED', 'integrity_check falhou.', { integrity });
  }

  const foreignKeys = await all(db, 'PRAGMA foreign_key_check');
  if (foreignKeys.length > 0) {
    throw createTenantError('TENANT_FOREIGN_KEY_FAILED', 'foreign_key_check falhou.', { foreignKeys });
  }
};

const createTenantDatabaseFromCleanSchema = async ({ tenantId, tenantRow, userRow, userTenantRow }) => {
  if (!fs.existsSync(tenantDbDir)) fs.mkdirSync(tenantDbDir, { recursive: true });

  const tenantPath = ensureTenantTargetAvailable(tenantId);
  const tmpPath = `${tenantPath}.tmp-${process.pid}-${Date.now()}`;
  const db = await openDb(tmpPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

  try {
    await run(db, 'PRAGMA foreign_keys = OFF');
    await run(db, 'BEGIN');
    await copySchemaFromMain(db);
    await applyMigrationsToTenantDb(db, tenantId);
    await insertRow(db, 'tenants', tenantRow);
    await insertRow(db, 'usuarios', userRow);
    await insertRow(db, 'usuario_tenants', userTenantRow);
    await run(db, 'COMMIT');
    await run(db, 'PRAGMA foreign_keys = ON');
    await validateTenantDatabase(db, tenantId);
  } catch (error) {
    await run(db, 'ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await closeDb(db).catch(() => {});
  }

  fs.renameSync(tmpPath, tenantPath);
  return tenantPath;
};

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

const rollbackTenantProvisioning = async ({ tenantId, userId, tenantPath }) => {
  if (userId) {
    await runQueryMain('DELETE FROM usuario_tenants WHERE usuario_id = ?', [userId]).catch(() => {});
    await runQueryMain('DELETE FROM usuarios WHERE id = ?', [userId]).catch(() => {});
  }

  if (tenantId) {
    await runQueryMain('DELETE FROM usuario_tenants WHERE tenant_id = ?', [tenantId]).catch(() => {});
    await runQueryMain('DELETE FROM tenants WHERE id = ?', [tenantId]).catch(() => {});
  }

  if (tenantPath && fs.existsSync(tenantPath)) {
    fs.unlinkSync(tenantPath);
  }
};

const provisionTrialTenant = async ({
  tenantName,
  tenantSlug,
  trialExpiresAt,
  login,
  passwordHash,
  name,
  email
}) => {
  let tenantId = null;
  let userId = null;
  let tenantPath = null;

  try {
    const tenantInsert = await runQueryMain(
      'INSERT INTO tenants (nome, slug, ativo, trial_expires_at, trial_ativo) VALUES (?, ?, 0, ?, ?)',
      [tenantName, tenantSlug, trialExpiresAt || null, trialExpiresAt ? 1 : 0]
    );
    tenantId = Number(tenantInsert.lastID);
    tenantPath = ensureTenantTargetAvailable(tenantId);

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
    tenantPath = await createTenantDatabaseFromCleanSchema({ tenantId, ...rows });
    await activateTenant(tenantId);

    return { tenantId, userId, tenantPath };
  } catch (error) {
    await rollbackTenantProvisioning({ tenantId, userId, tenantPath }).catch((rollbackError) => {
      console.error('[tenant-provisioning] rollback falhou:', rollbackError?.message || rollbackError);
    });
    throw error;
  }
};

const assertTenantReady = async (tenantId) => {
  const numericTenantId = Number(tenantId);
  const tenant = await getQueryMain('SELECT id, ativo FROM tenants WHERE id = ?', [numericTenantId]);
  if (!tenant || Number(tenant.ativo) !== 1) {
    throw createTenantError('TENANT_INACTIVE', 'Tenant inativo ou inexistente.');
  }

  const tenantPath = getTenantDbPath(numericTenantId);
  if (!fs.existsSync(tenantPath)) {
    throw createTenantError('TENANT_DATABASE_MISSING', 'Banco tenant ausente.', { tenantPath });
  }

  const db = await openDb(tenantPath, sqlite3.OPEN_READONLY);
  try {
    await validateTenantDatabase(db, numericTenantId);
  } finally {
    await closeDb(db).catch(() => {});
  }
};

module.exports = {
  createTenantError,
  getTenantDbPath,
  assertTenantReady,
  provisionTrialTenant,
  createTenantDatabaseFromCleanSchema
};
