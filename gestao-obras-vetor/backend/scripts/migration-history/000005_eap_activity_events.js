module.exports = {
  id: '000005_eap_activity_events',
  description: 'Adiciona eventos de atividade EAP e alertas operacionais de RDO',
  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS atividade_eap_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        atividade_eap_id INTEGER NOT NULL,
        rdo_id INTEGER,
        tipo TEXT NOT NULL,
        origem TEXT NOT NULL,
        percentual_anterior REAL,
        percentual_novo REAL,
        quantidade_anterior REAL,
        quantidade_nova REAL,
        mensagem TEXT,
        usuario_id INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS rdo_alertas_atividade (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        atividade_eap_id INTEGER,
        tipo TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        ativo INTEGER DEFAULT 1,
        criado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolvido_em DATETIME
      )
    `);

    await run('CREATE INDEX IF NOT EXISTS idx_atividade_eap_eventos_atividade ON atividade_eap_eventos(atividade_eap_id, criado_em)');
    await run('CREATE INDEX IF NOT EXISTS idx_atividade_eap_eventos_rdo ON atividade_eap_eventos(rdo_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_alertas_atividade_rdo ON rdo_alertas_atividade(rdo_id, ativo)');
  }
};
