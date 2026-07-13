const columnExists = async (all, tableName, columnName) => {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return Array.isArray(columns) && columns.some((column) => String(column.name) === columnName);
};

module.exports = {
  id: '000010_rnc_approval_signature',
  description: 'Registra o usuario e a data de aprovacao da RNC',
  async up(context) {
    const { run, all } = context;
    if (!(await columnExists(all, 'rnc', 'aprovado_por'))) {
      await run('ALTER TABLE rnc ADD COLUMN aprovado_por INTEGER');
    }
    if (!(await columnExists(all, 'rnc', 'aprovado_em'))) {
      await run('ALTER TABLE rnc ADD COLUMN aprovado_em DATETIME');
    }
  }
};
