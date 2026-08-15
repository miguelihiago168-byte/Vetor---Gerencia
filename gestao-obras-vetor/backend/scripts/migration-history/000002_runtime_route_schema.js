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

const backfillIfTableExists = async (context, tableName, sql) => {
  if (await tableExists(context, tableName)) await context.run(sql);
};

module.exports = {
  id: '000002_runtime_route_schema',
  description: 'Centraliza schema legado de rotas: RDO, EAP, anexos, almoxarifado, financeiro, email e mensagens',
  async up(context) {
    const { run } = context;

    await addColumnIfMissing(context, 'tenants', 'trial_expires_at DATETIME');
    await addColumnIfMissing(context, 'tenants', 'trial_ativo INTEGER DEFAULT 1');

    await addColumnIfMissing(context, 'usuarios', 'perfil_almoxarifado TEXT');
    await addColumnIfMissing(context, 'usuarios', 'avatar TEXT');
    await addColumnIfMissing(context, 'usuarios', "presenca_status TEXT DEFAULT 'disponivel'");
    await addColumnIfMissing(context, 'usuarios', 'presenca_atualizado_em DATETIME');
    await addColumnIfMissing(context, 'usuarios', 'email_signature_html TEXT');
    await addColumnIfMissing(context, 'usuarios', 'email_signature_auto INTEGER DEFAULT 1');
    await addColumnIfMissing(context, 'usuarios', 'password_reset_token TEXT');
    await addColumnIfMissing(context, 'usuarios', 'password_reset_expires DATETIME');

    await addColumnIfMissing(context, 'anexos', 'descricao TEXT');
    await addColumnIfMissing(context, 'anexos', 'criado_por INTEGER');
    await addColumnIfMissing(context, 'anexos', 'rnc_id INTEGER');
    await addColumnIfMissing(context, 'anexos', "categoria TEXT DEFAULT 'registro'");

    await addColumnIfMissing(context, 'atividades_eap', 'tenant_id INTEGER');
    await addColumnIfMissing(context, 'atividades_eap', 'unidade_medida TEXT');
    await addColumnIfMissing(context, 'atividades_eap', 'quantidade_total REAL DEFAULT 0');
    await addColumnIfMissing(context, 'atividades_eap', 'id_atividade TEXT');
    await addColumnIfMissing(context, 'atividades_eap', 'nome TEXT');
    await addColumnIfMissing(context, 'atividades_eap', 'data_inicio_planejada DATE');
    await addColumnIfMissing(context, 'atividades_eap', 'data_fim_planejada DATE');
    await addColumnIfMissing(context, 'atividades_eap', 'peso_percentual_projeto REAL DEFAULT 0');
    await addColumnIfMissing(context, 'atividades_eap', 'data_conclusao_real DATE');
    await addColumnIfMissing(context, 'atividades_eap', 'status TEXT');
    await addColumnIfMissing(context, 'atividades_eap', 'nivel INTEGER');

    if (await columnExists(context, 'projetos', 'tenant_id')) {
      await backfillIfTableExists(context, 'atividades_eap', `
        UPDATE atividades_eap
        SET tenant_id = (
          SELECT p.tenant_id FROM projetos p WHERE p.id = atividades_eap.projeto_id
        )
        WHERE tenant_id IS NULL OR tenant_id = 0
      `);
    }

    await run(`
      CREATE TABLE IF NOT EXISTS atividades_dependencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER NOT NULL,
        tenant_id INTEGER,
        atividade_origem_id INTEGER NOT NULL,
        atividade_destino_id INTEGER NOT NULL,
        tipo_vinculo TEXT DEFAULT 'FS',
        sugerida_por_sistema INTEGER DEFAULT 1,
        confirmada_usuario INTEGER DEFAULT 0,
        score_sugestao REAL,
        motivo_sugestao TEXT,
        criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        confirmada_em DATETIME,
        confirmada_por INTEGER,
        UNIQUE(atividade_origem_id, atividade_destino_id)
      )
    `);
    await addColumnIfMissing(context, 'atividades_dependencias', 'tenant_id INTEGER');
    await addColumnIfMissing(context, 'atividades_dependencias', "tipo_vinculo TEXT DEFAULT 'FS'");
    await addColumnIfMissing(context, 'atividades_dependencias', 'sugerida_por_sistema INTEGER DEFAULT 1');
    await addColumnIfMissing(context, 'atividades_dependencias', 'confirmada_usuario INTEGER DEFAULT 0');
    await addColumnIfMissing(context, 'atividades_dependencias', 'score_sugestao REAL');
    await addColumnIfMissing(context, 'atividades_dependencias', 'motivo_sugestao TEXT');
    await addColumnIfMissing(context, 'atividades_dependencias', 'criada_em DATETIME');
    await addColumnIfMissing(context, 'atividades_dependencias', 'atualizado_em DATETIME');
    await addColumnIfMissing(context, 'atividades_dependencias', 'confirmada_em DATETIME');
    await addColumnIfMissing(context, 'atividades_dependencias', 'confirmada_por INTEGER');
    await run('CREATE INDEX IF NOT EXISTS idx_dependencias_projeto ON atividades_dependencias(projeto_id, confirmada_usuario)');
    await run('CREATE INDEX IF NOT EXISTS idx_dependencias_origem ON atividades_dependencias(atividade_origem_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_dependencias_destino ON atividades_dependencias(atividade_destino_id)');

    await run(`
      CREATE TABLE IF NOT EXISTS almox_ferramentas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER,
        codigo TEXT UNIQUE,
        nome TEXT NOT NULL,
        categoria TEXT NOT NULL DEFAULT 'Outros',
        nf_compra TEXT NOT NULL DEFAULT '',
        marca TEXT,
        modelo TEXT,
        descricao TEXT,
        unidade TEXT DEFAULT 'UN',
        quantidade_total INTEGER NOT NULL DEFAULT 0,
        quantidade_disponivel INTEGER NOT NULL DEFAULT 0,
        valor_reposicao REAL NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_por INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'almox_ferramentas', 'projeto_id INTEGER');
    await addColumnIfMissing(context, 'almox_ferramentas', "categoria TEXT NOT NULL DEFAULT 'Outros'");
    await addColumnIfMissing(context, 'almox_ferramentas', "nf_compra TEXT NOT NULL DEFAULT ''");
    await addColumnIfMissing(context, 'almox_ferramentas', 'marca TEXT');
    await addColumnIfMissing(context, 'almox_ferramentas', 'modelo TEXT');
    await backfillIfTableExists(context, 'almox_ferramentas', "UPDATE almox_ferramentas SET categoria = 'Outros' WHERE categoria IS NULL OR TRIM(categoria) = ''");
    await backfillIfTableExists(context, 'almox_ferramentas', "UPDATE almox_ferramentas SET nf_compra = 'NAO INFORMADA' WHERE nf_compra IS NULL OR TRIM(nf_compra) = ''");

    await run(`
      CREATE TABLE IF NOT EXISTS almox_alocacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ferramenta_id INTEGER NOT NULL,
        projeto_id INTEGER NOT NULL,
        colaborador_id INTEGER,
        colaborador_nome TEXT,
        quantidade INTEGER NOT NULL,
        quantidade_devolvida INTEGER NOT NULL DEFAULT 0,
        data_retirada DATETIME DEFAULT CURRENT_TIMESTAMP,
        previsao_devolucao DATE NOT NULL,
        data_devolucao DATETIME,
        status TEXT NOT NULL DEFAULT 'ALOCADA',
        observacao TEXT,
        criado_por INTEGER NOT NULL,
        encerrado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'almox_alocacoes', 'colaborador_nome TEXT');
    await addColumnIfMissing(context, 'almox_alocacoes', 'quantidade_devolvida INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(context, 'almox_alocacoes', "status TEXT NOT NULL DEFAULT 'ALOCADA'");
    await addColumnIfMissing(context, 'almox_alocacoes', 'atualizado_em DATETIME');

    await run(`
      CREATE TABLE IF NOT EXISTS almox_manutencoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ferramenta_id INTEGER NOT NULL,
        alocacao_id INTEGER,
        projeto_id INTEGER NOT NULL,
        quantidade INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'EM_MANUTENCAO',
        justificativa TEXT,
        local_manutencao TEXT,
        prazo_estimado_dias INTEGER,
        endereco_manutencao TEXT,
        responsavel_retirada TEXT,
        retirada_necessaria INTEGER NOT NULL DEFAULT 0,
        retorna_estoque INTEGER NOT NULL DEFAULT 1,
        custo REAL,
        data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_retorno DATETIME,
        criado_por INTEGER NOT NULL,
        finalizado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const column of [
      'local_manutencao TEXT',
      'prazo_estimado_dias INTEGER',
      'endereco_manutencao TEXT',
      'responsavel_retirada TEXT',
      'retirada_necessaria INTEGER NOT NULL DEFAULT 0',
      'custo REAL',
      'alocacao_id INTEGER',
      'projeto_id INTEGER',
      'quantidade INTEGER NOT NULL DEFAULT 1',
      "status TEXT NOT NULL DEFAULT 'EM_MANUTENCAO'",
      'justificativa TEXT',
      'retorna_estoque INTEGER NOT NULL DEFAULT 1',
      'data_envio DATETIME',
      'data_retorno DATETIME',
      'criado_por INTEGER',
      'finalizado_por INTEGER',
      'criado_em DATETIME',
      'atualizado_em DATETIME'
    ]) await addColumnIfMissing(context, 'almox_manutencoes', column);

    await run(`
      CREATE TABLE IF NOT EXISTS almox_perdas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ferramenta_id INTEGER NOT NULL,
        alocacao_id INTEGER,
        projeto_id INTEGER NOT NULL,
        quantidade INTEGER NOT NULL,
        valor_unitario REAL NOT NULL,
        custo_total REAL NOT NULL,
        justificativa TEXT,
        criado_por INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS almox_movimentacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ferramenta_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        quantidade INTEGER NOT NULL,
        projeto_origem_id INTEGER,
        projeto_destino_id INTEGER,
        colaborador_id INTEGER,
        colaborador_nome TEXT,
        rdo_id INTEGER,
        alocacao_id INTEGER,
        justificativa TEXT,
        custo REAL,
        usuario_id INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_ferramentas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        ferramenta_id INTEGER NOT NULL,
        alocacao_id INTEGER NOT NULL,
        colaborador_id INTEGER,
        colaborador_nome TEXT,
        quantidade INTEGER NOT NULL,
        criado_por INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run('CREATE INDEX IF NOT EXISTS idx_almox_ferramentas_projeto ON almox_ferramentas(projeto_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_almox_alocacoes_projeto_status ON almox_alocacoes(projeto_id, status)');
    await run('CREATE INDEX IF NOT EXISTS idx_almox_movimentacoes_tipo_data ON almox_movimentacoes(tipo, criado_em)');
    await run('CREATE INDEX IF NOT EXISTS idx_almox_perdas_projeto_data ON almox_perdas(projeto_id, criado_em)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_ferramentas_rdo ON rdo_ferramentas(rdo_id)');

    await run(`
      CREATE TABLE IF NOT EXISTS email_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        provider TEXT NOT NULL DEFAULT 'custom',
        smtp_host TEXT NOT NULL DEFAULT '',
        smtp_port INTEGER NOT NULL DEFAULT 587,
        smtp_user TEXT NOT NULL DEFAULT '',
        smtp_pass_encrypted TEXT NOT NULL DEFAULT '',
        from_name TEXT NOT NULL DEFAULT '',
        from_email TEXT NOT NULL DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_by_user_id INTEGER,
        imap_host TEXT NOT NULL DEFAULT '',
        imap_port INTEGER NOT NULL DEFAULT 993,
        imap_user TEXT NOT NULL DEFAULT '',
        imap_pass_encrypted TEXT NOT NULL DEFAULT '',
        imap_tls INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        description TEXT,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS email_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        sender_user_id INTEGER,
        recipient_email TEXT NOT NULL,
        subject TEXT,
        corpo_html TEXT,
        body_html TEXT,
        template_used TEXT,
        status TEXT DEFAULT 'PENDENTE',
        error_message TEXT,
        sent_at DATETIME,
        favorito INTEGER NOT NULL DEFAULT 0,
        excluido INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS received_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        imap_uid INTEGER,
        from_email TEXT,
        from_name TEXT,
        to_email TEXT,
        subject TEXT,
        body_html TEXT,
        body_text TEXT,
        received_at DATETIME,
        is_read INTEGER DEFAULT 0,
        favorito INTEGER DEFAULT 0,
        importante INTEGER DEFAULT 0,
        importante_auto INTEGER DEFAULT 0,
        excluido INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'email_history', 'favorito INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing(context, 'email_history', 'excluido INTEGER NOT NULL DEFAULT 0');
    for (const column of [
      "imap_host TEXT NOT NULL DEFAULT ''",
      'imap_port INTEGER NOT NULL DEFAULT 993',
      "imap_user TEXT NOT NULL DEFAULT ''",
      "imap_pass_encrypted TEXT NOT NULL DEFAULT ''",
      'imap_tls INTEGER NOT NULL DEFAULT 1'
    ]) await addColumnIfMissing(context, 'email_config', column);
    for (const column of [
      'tenant_id INTEGER',
      "provider TEXT NOT NULL DEFAULT 'custom'",
      "smtp_host TEXT NOT NULL DEFAULT ''",
      'smtp_port INTEGER NOT NULL DEFAULT 587',
      "smtp_user TEXT NOT NULL DEFAULT ''",
      "smtp_pass_encrypted TEXT NOT NULL DEFAULT ''",
      "from_name TEXT NOT NULL DEFAULT ''",
      "from_email TEXT NOT NULL DEFAULT ''",
      'is_active INTEGER DEFAULT 1',
      'created_by_user_id INTEGER',
      'created_at DATETIME',
      'updated_at DATETIME'
    ]) await addColumnIfMissing(context, 'email_config', column);
    for (const column of [
      'tenant_id INTEGER',
      'name TEXT',
      'subject TEXT',
      'body_html TEXT',
      'description TEXT',
      'created_by_user_id INTEGER',
      'created_at DATETIME',
      'updated_at DATETIME'
    ]) await addColumnIfMissing(context, 'email_templates', column);
    for (const column of [
      'tenant_id INTEGER',
      'sender_user_id INTEGER',
      'recipient_email TEXT',
      'subject TEXT',
      'body_html TEXT',
      'template_used TEXT',
      "status TEXT DEFAULT 'PENDENTE'",
      'error_message TEXT',
      'sent_at DATETIME',
      'created_at DATETIME'
    ]) await addColumnIfMissing(context, 'email_history', column);
    for (const column of [
      'tenant_id INTEGER',
      'imap_uid INTEGER',
      'from_email TEXT',
      'from_name TEXT',
      'to_email TEXT',
      'subject TEXT',
      'body_html TEXT',
      'body_text TEXT',
      'received_at DATETIME',
      'is_read INTEGER DEFAULT 0',
      'favorito INTEGER DEFAULT 0',
      'importante INTEGER DEFAULT 0',
      'importante_auto INTEGER DEFAULT 0',
      'excluido INTEGER DEFAULT 0',
      'created_at DATETIME'
    ]) await addColumnIfMissing(context, 'received_emails', column);
    await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_received_emails_uid ON received_emails(tenant_id, imap_uid)');

    await run(`
      CREATE TABLE IF NOT EXISTS mensagem_conversas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'direta',
        chave_unica TEXT NOT NULL,
        projeto_a_id INTEGER NOT NULL,
        projeto_b_id INTEGER NOT NULL,
        usuario_a_id INTEGER NOT NULL,
        usuario_b_id INTEGER NOT NULL,
        criada_por INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        ultima_mensagem_em DATETIME,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, chave_unica)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS mensagem_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        conversa_id INTEGER NOT NULL,
        remetente_usuario_id INTEGER NOT NULL,
        conteudo TEXT NOT NULL,
        resposta_para_id INTEGER,
        enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        editado_em DATETIME,
        deletado_em DATETIME,
        deletado_por_usuario_id INTEGER,
        respondido_em DATETIME
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS mensagem_recibos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        mensagem_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        entregue_em DATETIME,
        lido_em DATETIME,
        respondido_em DATETIME,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(mensagem_id, usuario_id)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS mensagem_anexos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        mensagem_id INTEGER NOT NULL,
        nome_original TEXT NOT NULL,
        caminho TEXT NOT NULL,
        mime_type TEXT,
        tamanho INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const column of [
      "tipo TEXT NOT NULL DEFAULT 'direta'",
      'chave_unica TEXT',
      'projeto_a_id INTEGER',
      'projeto_b_id INTEGER',
      'criada_por INTEGER',
      'criado_em DATETIME',
      'ultima_mensagem_em DATETIME',
      'atualizado_em DATETIME'
    ]) await addColumnIfMissing(context, 'mensagem_conversas', column);
    for (const column of [
      'tenant_id INTEGER',
      'remetente_usuario_id INTEGER',
      'conteudo TEXT',
      'resposta_para_id INTEGER',
      'enviado_em DATETIME',
      'editado_em DATETIME',
      'deletado_em DATETIME',
      'deletado_por_usuario_id INTEGER',
      'respondido_em DATETIME'
    ]) await addColumnIfMissing(context, 'mensagem_itens', column);
    for (const column of [
      'tenant_id INTEGER',
      'entregue_em DATETIME',
      'lido_em DATETIME',
      'respondido_em DATETIME',
      'criado_em DATETIME'
    ]) await addColumnIfMissing(context, 'mensagem_recibos', column);
    for (const column of [
      'tenant_id INTEGER',
      'nome_original TEXT',
      'caminho TEXT',
      'mime_type TEXT',
      'tamanho INTEGER',
      'criado_em DATETIME'
    ]) await addColumnIfMissing(context, 'mensagem_anexos', column);
    await run('CREATE INDEX IF NOT EXISTS idx_mensagem_conversas_tenant_usera ON mensagem_conversas(tenant_id, usuario_a_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_mensagem_conversas_tenant_userb ON mensagem_conversas(tenant_id, usuario_b_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_mensagem_itens_conversa_data ON mensagem_itens(conversa_id, enviado_em DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_mensagem_recibos_usuario_lido ON mensagem_recibos(usuario_id, lido_em)');

    await run(`
      CREATE TABLE IF NOT EXISTS pedidos_compra_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        tipo_alteracao TEXT NOT NULL,
        detalhes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'pedidos_compra_historico', 'usuario_id INTEGER');
    await addColumnIfMissing(context, 'pedidos_compra_historico', 'tipo_alteracao TEXT');
    await addColumnIfMissing(context, 'pedidos_compra_historico', 'detalhes TEXT');

    await run(`
      CREATE TABLE IF NOT EXISTS financeiro_obra_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER NOT NULL UNIQUE,
        saldo_inicial NUMERIC NOT NULL DEFAULT 0,
        criado_por INTEGER,
        atualizado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'financeiro_obra_config', 'saldo_inicial NUMERIC NOT NULL DEFAULT 0');
    await addColumnIfMissing(context, 'financeiro_obra_config', 'criado_por INTEGER');
    await addColumnIfMissing(context, 'financeiro_obra_config', 'atualizado_por INTEGER');
    await run(`
      CREATE TABLE IF NOT EXISTS financeiro_receitas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER NOT NULL,
        numero_contrato TEXT,
        cliente TEXT,
        descricao TEXT,
        valor_previsto NUMERIC NOT NULL,
        valor_recebido NUMERIC NOT NULL DEFAULT 0,
        data_prevista DATE NOT NULL,
        data_recebida DATE,
        nf_numero TEXT,
        status TEXT NOT NULL DEFAULT 'PREVISTO',
        criado_por INTEGER NOT NULL,
        atualizado_por INTEGER,
        recebido_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const column of [
      'numero_contrato TEXT',
      'cliente TEXT',
      'descricao TEXT',
      'valor_previsto NUMERIC',
      'valor_recebido NUMERIC NOT NULL DEFAULT 0',
      'data_prevista DATE',
      'data_recebida DATE',
      'nf_numero TEXT',
      "status TEXT NOT NULL DEFAULT 'PREVISTO'",
      'criado_por INTEGER',
      'atualizado_por INTEGER',
      'recebido_por INTEGER',
      'criado_em DATETIME',
      'atualizado_em DATETIME'
    ]) await addColumnIfMissing(context, 'financeiro_receitas', column);
    await run(`
      CREATE TABLE IF NOT EXISTS financeiro_despesas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        fornecedor TEXT,
        descricao TEXT,
        categoria TEXT,
        valor_previsto NUMERIC NOT NULL,
        valor_pago NUMERIC NOT NULL DEFAULT 0,
        data_prevista DATE NOT NULL,
        data_paga DATE,
        forma_pagamento TEXT,
        status TEXT NOT NULL DEFAULT 'PREVISTO',
        pedido_compra_id INTEGER,
        cotacao_id INTEGER,
        criado_por INTEGER NOT NULL,
        atualizado_por INTEGER,
        pago_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const column of [
      'tipo TEXT',
      'fornecedor TEXT',
      'descricao TEXT',
      'categoria TEXT',
      'valor_previsto NUMERIC',
      'valor_pago NUMERIC NOT NULL DEFAULT 0',
      'data_prevista DATE',
      'data_paga DATE',
      'forma_pagamento TEXT',
      "status TEXT NOT NULL DEFAULT 'PREVISTO'",
      'pedido_compra_id INTEGER',
      'cotacao_id INTEGER',
      'criado_por INTEGER',
      'atualizado_por INTEGER',
      'pago_por INTEGER',
      'criado_em DATETIME',
      'atualizado_em DATETIME'
    ]) await addColumnIfMissing(context, 'financeiro_despesas', column);
    await run(`
      CREATE TABLE IF NOT EXISTS financeiro_estornos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entidade_tipo TEXT NOT NULL,
        entidade_id INTEGER NOT NULL,
        projeto_id INTEGER NOT NULL,
        valor_estornado NUMERIC NOT NULL,
        motivo TEXT NOT NULL,
        usuario_id INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const column of [
      'entidade_tipo TEXT',
      'entidade_id INTEGER',
      'projeto_id INTEGER',
      'valor_estornado NUMERIC',
      'motivo TEXT',
      'usuario_id INTEGER',
      'criado_em DATETIME'
    ]) await addColumnIfMissing(context, 'financeiro_estornos', column);
    await run('CREATE INDEX IF NOT EXISTS idx_fin_receitas_proj_data ON financeiro_receitas (projeto_id, data_prevista, data_recebida)');
    await run('CREATE INDEX IF NOT EXISTS idx_fin_receitas_status ON financeiro_receitas (status)');
    await run('CREATE INDEX IF NOT EXISTS idx_fin_despesas_proj_data ON financeiro_despesas (projeto_id, data_prevista, data_paga)');
    await run('CREATE INDEX IF NOT EXISTS idx_fin_despesas_status ON financeiro_despesas (status)');
    await run('CREATE INDEX IF NOT EXISTS idx_fin_estornos_proj ON financeiro_estornos (projeto_id, criado_em)');
    await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_despesa_pedido_unico ON financeiro_despesas (pedido_compra_id) WHERE pedido_compra_id IS NOT NULL');

    await addColumnIfMissing(context, 'rdos', 'atividades_avulsas TEXT');
    await addColumnIfMissing(context, 'rdos', 'aprovado_por INTEGER');
    await addColumnIfMissing(context, 'rdos', 'aprovado_em DATETIME');
    for (const column of [
      'necessita_correcao INTEGER DEFAULT 0',
      'motivo_correcao TEXT',
      'marcado_correcao_em DATETIME',
      'marcado_correcao_por INTEGER',
      'corrigido_em DATETIME',
      'corrigido_por INTEGER',
      'correcao_solicitada INTEGER DEFAULT 0',
      'correcao_motivo TEXT',
      'correcao_origem TEXT',
      'correcao_solicitada_em DATETIME',
      'correcao_solicitada_por TEXT',
      'status_anterior_correcao TEXT'
    ]) await addColumnIfMissing(context, 'rdos', column);

    await run(`
      CREATE TABLE IF NOT EXISTS rdo_fotos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        rdo_atividade_id INTEGER,
        atividade_eap_id INTEGER,
        nome_arquivo TEXT NOT NULL,
        caminho_arquivo TEXT NOT NULL,
        descricao TEXT,
        criado_por INTEGER,
        atividade_avulsa_descricao TEXT,
        ordem INTEGER DEFAULT 0,
        tipo TEXT,
        tamanho INTEGER,
        largura INTEGER,
        altura INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const column of [
      'rdo_atividade_id INTEGER',
      'descricao TEXT',
      'criado_por INTEGER',
      'criado_em DATETIME',
      'atividade_avulsa_descricao TEXT',
      'ordem INTEGER DEFAULT 0',
      'tipo TEXT',
      'tamanho INTEGER',
      'largura INTEGER',
      'altura INTEGER'
    ]) await addColumnIfMissing(context, 'rdo_fotos', column);

    await run(`
      CREATE TABLE IF NOT EXISTS rdo_materiais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        nome_material TEXT NOT NULL,
        quantidade REAL,
        unidade TEXT,
        numero_nf TEXT,
        tipo_movimento TEXT DEFAULT 'recebido',
        observacao TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'rdo_materiais', 'nome_material TEXT');
    await addColumnIfMissing(context, 'rdo_materiais', 'numero_nf TEXT');
    await addColumnIfMissing(context, 'rdo_materiais', "tipo_movimento TEXT DEFAULT 'recebido'");

    await run(`
      CREATE TABLE IF NOT EXISTS rdo_equipamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        nome TEXT NOT NULL,
        quantidade REAL NOT NULL DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        horario_utilizacao TEXT,
        horas_utilizadas REAL,
        observacao TEXT
      )
    `);
    await addColumnIfMissing(context, 'rdo_equipamentos', 'nome TEXT');
    await addColumnIfMissing(context, 'rdo_equipamentos', 'quantidade REAL NOT NULL DEFAULT 1');
    await addColumnIfMissing(context, 'rdo_equipamentos', 'criado_em DATETIME');
    await addColumnIfMissing(context, 'rdo_equipamentos', 'horario_utilizacao TEXT');
    await addColumnIfMissing(context, 'rdo_equipamentos', 'horas_utilizadas REAL');
    await addColumnIfMissing(context, 'rdo_equipamentos', 'observacao TEXT');

    await run(`
      CREATE TABLE IF NOT EXISTS rdo_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        usuario_id INTEGER,
        acao TEXT NOT NULL,
        detalhes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_comentarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        usuario_id INTEGER,
        comentario TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_ocorrencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        titulo TEXT,
        descricao TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'rdo_ocorrencias', 'titulo TEXT');
    await addColumnIfMissing(context, 'rdo_ocorrencias', 'descricao TEXT');
    await addColumnIfMissing(context, 'rdo_ocorrencias', 'gravidade TEXT');
    await addColumnIfMissing(context, 'rdo_ocorrencias', 'criado_por INTEGER');
    await addColumnIfMissing(context, 'rdo_ocorrencias', 'criado_em DATETIME');
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_assinaturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        usuario_id INTEGER,
        tipo TEXT,
        arquivo_assinatura TEXT,
        assinado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'rdo_assinaturas', 'usuario_id INTEGER');
    await addColumnIfMissing(context, 'rdo_assinaturas', 'tipo TEXT');
    await addColumnIfMissing(context, 'rdo_assinaturas', 'arquivo_assinatura TEXT');
    await addColumnIfMissing(context, 'rdo_assinaturas', 'assinado_em DATETIME');
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_clima (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        periodo TEXT,
        condicao_tempo TEXT,
        condicao_trabalho TEXT,
        pluviometria_mm REAL DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'rdo_clima', 'periodo TEXT');
    await addColumnIfMissing(context, 'rdo_clima', 'condicao_tempo TEXT');
    await addColumnIfMissing(context, 'rdo_clima', 'condicao_trabalho TEXT');
    await addColumnIfMissing(context, 'rdo_clima', 'pluviometria_mm REAL DEFAULT 0');
    await addColumnIfMissing(context, 'rdo_clima', 'criado_em DATETIME');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_logs_rdo_id ON rdo_logs(rdo_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_logs_usuario_id ON rdo_logs(usuario_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_logs_acao ON rdo_logs(acao)');

    await run(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT,
        titulo TEXT,
        mensagem TEXT,
        referencia_tipo TEXT,
        referencia_id INTEGER,
        lida INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addColumnIfMissing(context, 'notificacoes', 'titulo TEXT');
    await addColumnIfMissing(context, 'notificacoes', 'referencia_tipo TEXT');
    await addColumnIfMissing(context, 'notificacoes', 'referencia_id INTEGER');
    await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_unicas ON notificacoes(usuario_id, tipo, titulo, mensagem)');

    await addColumnIfMissing(context, 'requisicao_itens', 'quantidade_original REAL');
    await addColumnIfMissing(context, 'requisicao_itens', 'alterado_em DATETIME');
    await addColumnIfMissing(context, 'requisicao_itens', 'alterado_por_nome TEXT');
  }
};
