const columnExists = async (all, tableName, columnName) => {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return Array.isArray(columns) && columns.some((column) => String(column.name) === columnName);
};

const addColumnIfMissing = async ({ run, all }, tableName, columnSql) => {
  const columnName = String(columnSql).trim().split(/\s+/)[0];
  if (!(await columnExists(all, tableName, columnName))) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql}`);
  }
};

module.exports = {
  id: '000001_users_runtime_schema',
  description: 'Centraliza schema de usuarios, primeiro acesso, presenca e mao de obra direta',
  async up(context) {
    const { run } = context;

    await run(`
      CREATE TABLE IF NOT EXISTS mao_obra_direta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identificador TEXT,
        projeto_id INTEGER,
        nome TEXT NOT NULL,
        funcao TEXT NOT NULL,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        criado_por INTEGER,
        baixado_em DATETIME,
        baixado_por INTEGER,
        FOREIGN KEY (projeto_id) REFERENCES projetos(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id),
        FOREIGN KEY (baixado_por) REFERENCES usuarios(id)
      )
    `);

    await addColumnIfMissing(context, 'usuarios', 'perfil TEXT');
    await addColumnIfMissing(context, 'usuarios', 'setor TEXT');
    await addColumnIfMissing(context, 'usuarios', 'setor_outro TEXT');
    await addColumnIfMissing(context, 'usuarios', 'funcao TEXT');
    await addColumnIfMissing(context, 'usuarios', 'perfil_almoxarifado TEXT');
    await addColumnIfMissing(context, 'usuarios', 'is_adm INTEGER DEFAULT 0');
    await addColumnIfMissing(context, 'usuarios', 'primeiro_acesso_pendente INTEGER DEFAULT 0');
    await addColumnIfMissing(context, 'usuarios', 'avatar TEXT');
    await addColumnIfMissing(context, 'usuarios', "presenca_status TEXT DEFAULT 'disponivel'");
    await addColumnIfMissing(context, 'usuarios', 'presenca_atualizado_em DATETIME');
    await addColumnIfMissing(context, 'usuarios', 'telefone TEXT');
    await addColumnIfMissing(context, 'usuarios', 'password_reset_token TEXT');
    await addColumnIfMissing(context, 'usuarios', 'password_reset_expires DATETIME');

    await addColumnIfMissing(context, 'mao_obra_direta', 'projeto_id INTEGER');
    await addColumnIfMissing(context, 'mao_obra_direta', 'identificador TEXT');
    await addColumnIfMissing(context, 'mao_obra_direta', 'criado_por INTEGER');
    await addColumnIfMissing(context, 'mao_obra_direta', 'baixado_em DATETIME');
    await addColumnIfMissing(context, 'mao_obra_direta', 'baixado_por INTEGER');
    await addColumnIfMissing(context, 'mao_obra_direta', 'atualizado_em DATETIME');
  }
};
