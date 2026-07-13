const columnExists = async (all, tableName, columnName) => {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return Array.isArray(columns) && columns.some((column) => String(column.name) === columnName);
};

module.exports = {
  id: '000009_user_signature',
  description: 'Adiciona assinatura PNG operacional ao cadastro de usuarios',
  async up(context) {
    const { run, all } = context;
    if (!(await columnExists(all, 'usuarios', 'assinatura_png'))) {
      await run('ALTER TABLE usuarios ADD COLUMN assinatura_png TEXT');
    }
  }
};
