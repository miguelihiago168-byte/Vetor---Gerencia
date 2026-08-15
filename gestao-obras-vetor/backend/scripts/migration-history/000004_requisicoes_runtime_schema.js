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
  id: '000004_requisicoes_runtime_schema',
  description: 'Garante schema completo de requisicoes de compra em bancos tenant legados',
  async up(context) {
    const { run } = context;

    await run(`
      CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        razao_social TEXT NOT NULL,
        nome_fantasia TEXT,
        cnpj TEXT,
        telefone TEXT,
        email TEXT,
        observacao TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS requisicoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_requisicao TEXT NOT NULL UNIQUE,
        projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
        solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
        centro_custo TEXT,
        tipo_material TEXT NOT NULL,
        urgencia TEXT NOT NULL DEFAULT 'Normal',
        observacao_geral TEXT,
        status_requisicao TEXT NOT NULL DEFAULT 'Em análise',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS requisicao_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisicao_id INTEGER NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
        descricao TEXT NOT NULL,
        quantidade REAL NOT NULL,
        unidade TEXT,
        especificacao_tecnica TEXT,
        justificativa TEXT,
        foto_url TEXT,
        aprovado_para_cotacao INTEGER,
        motivo_reprovacao TEXT,
        status_item TEXT NOT NULL DEFAULT 'Aguardando análise',
        impacto_cronograma INTEGER DEFAULT 0,
        impacto_seguranca INTEGER DEFAULT 0,
        impacto_qualidade INTEGER DEFAULT 0,
        quantidade_original REAL,
        alterado_em DATETIME,
        alterado_por_nome TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS requisicao_cotacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES requisicao_itens(id) ON DELETE CASCADE,
        fornecedor_id INTEGER REFERENCES fornecedores(id),
        fornecedor_nome TEXT,
        cnpj TEXT,
        telefone TEXT,
        email TEXT,
        valor_unitario REAL NOT NULL,
        frete REAL DEFAULT 0,
        prazo_entrega TEXT,
        condicao_pagamento TEXT,
        observacao TEXT,
        selecionada INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS requisicao_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requisicao_id INTEGER NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES requisicao_itens(id) ON DELETE SET NULL,
        usuario_id INTEGER REFERENCES usuarios(id),
        tipo_evento TEXT NOT NULL,
        status_anterior TEXT,
        status_novo TEXT,
        detalhes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const column of [
      'numero_requisicao TEXT',
      'projeto_id INTEGER',
      'solicitante_id INTEGER',
      'centro_custo TEXT',
      'tipo_material TEXT',
      "urgencia TEXT DEFAULT 'Normal'",
      'observacao_geral TEXT',
      "status_requisicao TEXT DEFAULT 'Em análise'",
      'criado_em DATETIME',
      'atualizado_em DATETIME'
    ]) await addColumnIfMissing(context, 'requisicoes', column);

    for (const column of [
      'requisicao_id INTEGER',
      'descricao TEXT',
      'quantidade REAL',
      'unidade TEXT',
      'especificacao_tecnica TEXT',
      'justificativa TEXT',
      'foto_url TEXT',
      'aprovado_para_cotacao INTEGER',
      'motivo_reprovacao TEXT',
      "status_item TEXT DEFAULT 'Aguardando análise'",
      'impacto_cronograma INTEGER DEFAULT 0',
      'impacto_seguranca INTEGER DEFAULT 0',
      'impacto_qualidade INTEGER DEFAULT 0',
      'quantidade_original REAL',
      'alterado_em DATETIME',
      'alterado_por_nome TEXT',
      'criado_em DATETIME',
      'atualizado_em DATETIME'
    ]) await addColumnIfMissing(context, 'requisicao_itens', column);

    for (const column of [
      'item_id INTEGER',
      'fornecedor_id INTEGER',
      'fornecedor_nome TEXT',
      'cnpj TEXT',
      'telefone TEXT',
      'email TEXT',
      'valor_unitario REAL',
      'frete REAL DEFAULT 0',
      'prazo_entrega TEXT',
      'condicao_pagamento TEXT',
      'observacao TEXT',
      'selecionada INTEGER DEFAULT 0',
      'criado_em DATETIME'
    ]) await addColumnIfMissing(context, 'requisicao_cotacoes', column);

    for (const column of [
      'requisicao_id INTEGER',
      'item_id INTEGER',
      'usuario_id INTEGER',
      'tipo_evento TEXT',
      'status_anterior TEXT',
      'status_novo TEXT',
      'detalhes TEXT',
      'criado_em DATETIME'
    ]) await addColumnIfMissing(context, 'requisicao_historico', column);

    await run('CREATE INDEX IF NOT EXISTS idx_req_projeto ON requisicoes(projeto_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_req_status ON requisicoes(status_requisicao)');
    await run('CREATE INDEX IF NOT EXISTS idx_req_tipo ON requisicoes(tipo_material)');
    await run('CREATE INDEX IF NOT EXISTS idx_item_req ON requisicao_itens(requisicao_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_item_status ON requisicao_itens(status_item)');
    await run('CREATE INDEX IF NOT EXISTS idx_cot_item ON requisicao_cotacoes(item_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_hist_req ON requisicao_historico(requisicao_id)');
  }
};
