const { allQueryMain, getQueryMain, pool } = require('../config/database');

const requiredMainTables = [
  'usuarios',
  'projetos',
  'projeto_usuarios',
  'rdos',
  'atividades_eap',
  'rnc',
  'anexos'
];

const fail = (message) => {
  throw new Error(`[startup-db-guard] ${message}`);
};

const tableExists = async (tableName) => {
  const row = await getQueryMain(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = ?`,
    [tableName]
  );
  return Boolean(row);
};

const countRows = async (tableName) => {
  if (!(await tableExists(tableName))) return 0;
  const row = await getQueryMain(`SELECT COUNT(*)::int AS total FROM "${tableName}"`);
  return Number(row?.total || 0);
};

const assertRequiredTables = async () => {
  const missing = [];
  for (const table of requiredMainTables) {
    if (!(await tableExists(table))) missing.push(table);
  }

  if (missing.length > 0) {
    fail(`Schema public sem tabelas obrigatorias: ${missing.join(', ')}`);
  }
};

const assertMigrationsTable = async () => {
  const exists = await tableExists('schema_migrations');
  if (!exists) {
    fail('Tabela schema_migrations ausente. Execute db:migrate antes de subir o backend.');
  }

  const rows = await allQueryMain('SELECT id FROM schema_migrations ORDER BY id');
  console.log(`[startup-db-guard] schema_migrations OK: ${rows.length} migrations aplicadas.`);
};

const main = async () => {
  // Valida conectividade e schema base
  await assertRequiredTables();
  await assertMigrationsTable();

  const usuarios = await countRows('usuarios');
  const projetos = await countRows('projetos');
  const rdos = await countRows('rdos');
  const eap = await countRows('atividades_eap');
  const rnc = await countRows('rnc');
  const anexos = await countRows('anexos');

  if (usuarios <= 0) fail('Banco sem usuarios. Execute db:init antes de iniciar o backend.');

  console.log(
    `[startup-db-guard] Banco PostgreSQL OK: usuarios=${usuarios}, projetos=${projetos}, rdos=${rdos}, eap=${eap}, rnc=${rnc}, anexos=${anexos}`
  );
};

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err?.message || err);
      process.exit(1);
    })
    .finally(async () => {
      await pool.end().catch(() => {});
    });
}

module.exports = { main };
