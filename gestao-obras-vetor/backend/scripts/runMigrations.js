const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.has('--status');
const statusOnly = args.has('--status');
const includeTenants = !args.has('--main-only');
const includeMain = !args.has('--tenants-only');
const isProduction = process.env.NODE_ENV === 'production';

const backendDir = path.join(__dirname, '..');
const databaseDir = process.env.DB_DIR || path.join(backendDir, 'database');
const mainDbPath = path.join(databaseDir, 'gestao_obras.db');
const tenantDbDir = path.join(databaseDir, 'tenants');
const migrationsDir = path.join(__dirname, 'migrations');

const usage = () => {
  console.log(`Uso: node scripts/runMigrations.js [--dry-run|--status] [--main-only|--tenants-only]

Opcoes:
  --dry-run       Lista migrations pendentes sem escrever no banco.
  --status        Alias de --dry-run voltado para CI/inspecao.
  --main-only     Processa apenas database/gestao_obras.db.
  --tenants-only  Processa apenas database/tenants/tenant_*.db.

Producao:
  Execucao real com NODE_ENV=production exige MIGRATIONS_ALLOW_PRODUCTION=true.
`);
};

if (args.has('--help') || args.has('-h')) {
  usage();
  process.exit(0);
}

if (args.has('--main-only') && args.has('--tenants-only')) {
  console.error('Use apenas uma opcao: --main-only ou --tenants-only.');
  process.exit(1);
}

if (isProduction && !dryRun && process.env.MIGRATIONS_ALLOW_PRODUCTION !== 'true') {
  console.error('Migrations reais em producao exigem MIGRATIONS_ALLOW_PRODUCTION=true.');
  process.exit(1);
}

const openDb = (filePath, readonly = false) => new Promise((resolve, reject) => {
  const flags = readonly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
  const db = new sqlite3.Database(filePath, flags, (err) => {
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
    else resolve(rows);
  });
});

const tableExists = async (db, tableName) => {
  const row = await get(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row);
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
        throw new Error(`Migration invalida: ${fileName}`);
      }

      return {
        ...migration,
        fileName
      };
    });
};

const listTargets = () => {
  const targets = [];

  if (includeMain) {
    targets.push({ name: 'main', filePath: mainDbPath });
  }

  if (includeTenants && fs.existsSync(tenantDbDir)) {
    const tenantTargets = fs.readdirSync(tenantDbDir)
      .filter((fileName) => /^tenant_\d+\.db$/.test(fileName))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((fileName) => ({
        name: fileName.replace(/\.db$/, ''),
        filePath: path.join(tenantDbDir, fileName)
      }));

    targets.push(...tenantTargets);
  }

  return targets;
};

const ensureSchemaMigrations = async (db) => {
  await run(db, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const appliedMigrations = async (db) => {
  if (!(await tableExists(db, 'schema_migrations'))) return new Set();
  const rows = await all(db, 'SELECT id FROM schema_migrations ORDER BY id');
  return new Set(rows.map((row) => String(row.id)));
};

const applyMigration = async (db, target, migration) => {
  await run(db, 'BEGIN IMMEDIATE');

  try {
    const context = {
      target,
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
    await run(db, 'COMMIT');
  } catch (err) {
    await run(db, 'ROLLBACK').catch(() => {});
    throw err;
  }
};

const processTarget = async (target, migrations) => {
  if (!fs.existsSync(target.filePath)) {
    throw new Error(`Banco nao encontrado para ${target.name}: ${target.filePath}`);
  }

  const db = await openDb(target.filePath, dryRun);

  try {
    if (!dryRun) await ensureSchemaMigrations(db);

    const applied = await appliedMigrations(db);
    const pending = migrations.filter((migration) => !applied.has(migration.id));

    console.log(`[migrations] ${target.name}: aplicadas=${applied.size}, pendentes=${pending.length}`);

    for (const migration of pending) {
      if (dryRun) {
        console.log(`[migrations] ${target.name}: pendente ${migration.id} - ${migration.description || ''}`);
      } else {
        console.log(`[migrations] ${target.name}: aplicando ${migration.id}`);
        await applyMigration(db, target, migration);
      }
    }

    return pending.length;
  } finally {
    await closeDb(db);
  }
};

const main = async () => {
  const migrations = loadMigrations();
  const targets = listTargets();

  if (targets.length === 0) {
    throw new Error('Nenhum banco alvo encontrado.');
  }

  if (migrations.length === 0) {
    console.log('[migrations] Nenhuma migration versionada encontrada.');
  }

  let pendingTotal = 0;
  for (const target of targets) {
    pendingTotal += await processTarget(target, migrations);
  }

  if (statusOnly && pendingTotal > 0) {
    process.exitCode = 2;
  }
};

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
