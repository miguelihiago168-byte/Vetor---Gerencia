const fs = require('fs');
const path = require('path');
const { pool, translateQuery } = require('../config/database');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.has('--status');
const statusOnly = args.has('--status');
const isProduction = process.env.NODE_ENV === 'production';

const migrationsDir = path.join(__dirname, 'migrations');

const usage = () => {
  console.log(`Uso: node scripts/runMigrations.js [--dry-run|--status] [--main-only|--tenants-only]

Opcoes:
  --dry-run       Lista migrations pendentes sem escrever no banco.
  --status        Alias de --dry-run voltado para CI/inspecao.
  As migrations são aplicadas uma vez ao banco compartilhado.

Producao:
  Execucao real com NODE_ENV=production exige MIGRATIONS_ALLOW_PRODUCTION=true.
`);
};

if (args.has('--help') || args.has('-h')) {
  usage();
  process.exit(0);
}

if (args.has('--tenants-only')) {
  console.error('--tenants-only foi removido: não existem schemas por tenant.');
  process.exit(1);
}

if (isProduction && !dryRun && process.env.MIGRATIONS_ALLOW_PRODUCTION !== 'true') {
  console.error('Migrations reais em producao exigem MIGRATIONS_ALLOW_PRODUCTION=true.');
  process.exit(1);
}

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

      return { ...migration, fileName };
    });
};

const listTargetSchemas = async () => {
  return [{ name: 'shared', schema: 'public' }];
};

const ensureSchemaMigrations = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

const appliedMigrations = async (client) => {
  const rows = await client.query('SELECT id FROM schema_migrations ORDER BY id');
  return new Set(rows.rows.map((row) => String(row.id)));
};

const migrationContext = (client, target) => ({
  target,
  run: (sql, params = []) => client.query(translateQuery(sql), params),
  get: async (sql, params = []) => {
    const result = await client.query(translateQuery(sql), params);
    return result.rows[0] || null;
  },
  all: async (sql, params = []) => {
    const result = await client.query(translateQuery(sql), params);
    return result.rows;
  },
});

const applyMigration = async (client, target, migration) => {
  await client.query('BEGIN');
  try {
    await migration.up(migrationContext(client, target));
    await client.query(
      'INSERT INTO schema_migrations (id, description) VALUES ($1, $2)',
      [migration.id, migration.description || '']
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
};

const processTarget = async (target, migrations) => {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${target.schema}", public`);

    if (!dryRun) await ensureSchemaMigrations(client);
    const applied = await appliedMigrations(client).catch(async () => {
      if (dryRun) return new Set();
      throw new Error(`schema_migrations ausente no schema ${target.schema}`);
    });

    const pending = migrations.filter((migration) => {
      if (applied.has(migration.id)) return false;

      // A baseline substitui um historico completo sem exigir que bancos ja
      // existentes recebam uma entrada artificial em schema_migrations.
      const supersedes = Array.isArray(migration.supersedes) ? migration.supersedes : [];
      return !supersedes.length || !supersedes.every((id) => applied.has(id));
    });
    console.log(`[migrations] ${target.name}: aplicadas=${applied.size}, pendentes=${pending.length}`);

    for (const migration of pending) {
      if (dryRun) {
        console.log(`[migrations] ${target.name}: pendente ${migration.id} - ${migration.description || ''}`);
      } else {
        console.log(`[migrations] ${target.name}: aplicando ${migration.id}`);
        await applyMigration(client, target, migration);
      }
    }

    return pending.length;
  } finally {
    client.release();
  }
};

const main = async () => {
  const migrations = loadMigrations();
  const targets = await listTargetSchemas();

  if (targets.length === 0) {
    throw new Error('Nenhum schema alvo encontrado.');
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

main()
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
