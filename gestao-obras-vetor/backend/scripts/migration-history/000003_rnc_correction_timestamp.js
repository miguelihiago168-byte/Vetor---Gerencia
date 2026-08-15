const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const tableExists = async ({ get }, tableName) => {
  const row = await get(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?",
    [tableName]
  );
  return Boolean(row);
};

const columnExists = async ({ all }, tableName, columnName) => {
  const columns = await all(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  return Array.isArray(columns) && columns.some((column) => String(column.name) === columnName);
};

const addColumnIfMissing = async (context, tableName, columnSql) => {
  if (!(await tableExists(context, tableName))) return;
  const columnName = String(columnSql).trim().split(/\s+/)[0];
  if (!(await columnExists(context, tableName, columnName))) {
    await context.run(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${columnSql}`);
  }
};

module.exports = {
  id: '000003_rnc_correction_timestamp',
  description: 'Adiciona timestamp da resposta de correcao da RNC',
  async up(context) {
    await addColumnIfMissing(context, 'rnc', 'descricao_correcao_em DATETIME');
  }
};
