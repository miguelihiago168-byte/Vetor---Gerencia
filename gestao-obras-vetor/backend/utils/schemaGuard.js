const DEFAULT_MIGRATION = '000002_runtime_route_schema';

const schemaOutdatedError = (migration, missing) => {
  const err = new Error('Schema do banco desatualizado. Execute as migrations pendentes.');
  err.code = 'DATABASE_SCHEMA_OUTDATED';
  err.migration = migration || DEFAULT_MIGRATION;
  err.missing = Array.isArray(missing) ? missing : [missing].filter(Boolean);
  return err;
};

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const tableExists = async (getQuery, tableName) => {
  const row = await getQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row);
};

const existingColumns = async (allQuery, tableName) => {
  const rows = await allQuery(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  return new Set((rows || []).map((row) => String(row.name)));
};

const ensureTablesReady = async ({ getQuery }, tableNames, migration = DEFAULT_MIGRATION) => {
  const missing = [];
  for (const tableName of tableNames) {
    if (!(await tableExists(getQuery, tableName))) missing.push(`table:${tableName}`);
  }
  if (missing.length) throw schemaOutdatedError(migration, missing);
};

const ensureColumnsReady = async ({ allQuery }, tableName, columnNames, migration = DEFAULT_MIGRATION) => {
  const columns = await existingColumns(allQuery, tableName);
  const missing = columnNames
    .filter((columnName) => !columns.has(columnName))
    .map((columnName) => `column:${tableName}.${columnName}`);
  if (missing.length) throw schemaOutdatedError(migration, missing);
};

const ensureSchemaReady = async ({ getQuery, allQuery }, spec, migration = DEFAULT_MIGRATION) => {
  if (spec.tables?.length) await ensureTablesReady({ getQuery }, spec.tables, migration);
  if (spec.columns) {
    for (const [tableName, columns] of Object.entries(spec.columns)) {
      await ensureColumnsReady({ allQuery }, tableName, columns, migration);
    }
  }
};

const sendSchemaOutdated = (res, error, message) => {
  if (error?.code !== 'DATABASE_SCHEMA_OUTDATED') return false;
  res.status(503).json({
    erro: message || error.message,
    codigo: 'DATABASE_SCHEMA_OUTDATED',
    migration: error.migration || DEFAULT_MIGRATION,
    ausentes: error.missing || []
  });
  return true;
};

module.exports = {
  DEFAULT_MIGRATION,
  ensureSchemaReady,
  ensureTablesReady,
  ensureColumnsReady,
  schemaOutdatedError,
  sendSchemaOutdated
};
