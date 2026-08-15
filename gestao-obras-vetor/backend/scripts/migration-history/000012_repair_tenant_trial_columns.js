const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const tableExists = async ({ get, target }, tableName) => {
  const row = await get(
    `SELECT table_name AS name
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
        AND table_name = ?`,
    [target.schema, tableName]
  );
  return Boolean(row);
};

const columnExists = async ({ all, target }, tableName, columnName) => {
  const columns = await all(
    `SELECT column_name AS name
       FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?`,
    [target.schema, tableName]
  );
  return columns.some((column) => String(column.name) === columnName);
};

const addColumnIfMissing = async (context, tableName, columnSql) => {
  if (!(await tableExists(context, tableName))) return;

  const columnName = String(columnSql).trim().split(/\s+/)[0];
  if (!(await columnExists(context, tableName, columnName))) {
    await context.run(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnSql}`);
  }
};

module.exports = {
  id: '000012_repair_tenant_trial_columns',
  description: 'Repara colunas de trial ausentes em schemas ja marcados como migrados',
  async up(context) {
    await addColumnIfMissing(context, 'tenants', 'trial_expires_at TIMESTAMPTZ');
    await addColumnIfMissing(context, 'tenants', 'trial_ativo INTEGER DEFAULT 1');
  }
};
