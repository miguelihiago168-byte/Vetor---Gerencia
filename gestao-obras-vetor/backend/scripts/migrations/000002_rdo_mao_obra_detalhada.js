const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const columnExists = async ({ all }, tableName, columnName) => {
  const columns = await all(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  return columns.some((column) => String(column.name) === columnName);
};

module.exports = {
  id: '000002_rdo_mao_obra_detalhada',
  description: 'Adiciona o detalhamento de mao de obra aos RDOs',
  async up(context) {
    if (!(await columnExists(context, 'rdos', 'mao_obra_detalhada'))) {
      await context.run('ALTER TABLE rdos ADD COLUMN mao_obra_detalhada TEXT');
    }
  },
};
