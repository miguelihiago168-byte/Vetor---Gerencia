const tableExists = async (get, tableName) => {
  const row = await get(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?",
    [tableName]
  );
  return Boolean(row);
};

module.exports = {
  id: '000008_repair_orphan_notifications',
  description: 'Preserva notificacoes antigas criando usuarios inativos para referencias orfas',
  async up(context) {
    const { run, get } = context;

    if (!(await tableExists(get, 'usuarios')) || !(await tableExists(get, 'notificacoes'))) {
      return;
    }

    await run(`
      INSERT OR IGNORE INTO usuarios (
        id,
        login,
        senha,
        nome,
        email,
        perfil,
        ativo,
        criado_em,
        atualizado_em
      )
      SELECT DISTINCT
        n.usuario_id,
        'usuario-removido-' || n.usuario_id,
        'sem-acesso',
        'Usuario removido',
        NULL,
        'Inativo',
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM notificacoes n
      LEFT JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.usuario_id IS NOT NULL
        AND u.id IS NULL
    `);
  }
};
