module.exports = {
  id: '000007_mensagem_reunioes',
  description: 'Adiciona agenda de reunioes ao modulo de mensagens',
  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS mensagem_reunioes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        projeto_id INTEGER NOT NULL,
        criada_por INTEGER NOT NULL,
        assunto TEXT NOT NULL,
        descricao TEXT,
        inicio_em DATETIME NOT NULL,
        fim_em DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'ativa',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        cancelado_em DATETIME,
        cancelado_por INTEGER
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS mensagem_reuniao_participantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        reuniao_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(reuniao_id, usuario_id)
      )
    `);

    await run('CREATE INDEX IF NOT EXISTS idx_mensagem_reunioes_tenant_projeto_inicio ON mensagem_reunioes(tenant_id, projeto_id, inicio_em)');
    await run('CREATE INDEX IF NOT EXISTS idx_mensagem_reunioes_criador_inicio ON mensagem_reunioes(tenant_id, criada_por, inicio_em)');
    await run('CREATE INDEX IF NOT EXISTS idx_mensagem_reuniao_participantes_usuario ON mensagem_reuniao_participantes(tenant_id, usuario_id, reuniao_id)');
  }
};
