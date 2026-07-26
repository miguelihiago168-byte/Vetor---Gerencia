module.exports = {
  id: '000004_material_traceability',
  description: 'Adiciona rastreabilidade de materiais integrada a qualidade',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS material_tipos (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER, codigo TEXT NOT NULL, nome TEXT NOT NULL, schema_campos TEXT NOT NULL DEFAULT '{}', ativo INTEGER NOT NULL DEFAULT 1, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id, codigo))`);
    await run(`CREATE TABLE IF NOT EXISTS material_unidades (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER, codigo TEXT NOT NULL, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, UNIQUE(tenant_id, codigo))`);
    await run(`CREATE TABLE IF NOT EXISTS material_recebimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, codigo TEXT NOT NULL, projeto_id INTEGER NOT NULL, tipo_id INTEGER, tipo_outro TEXT,
      codigo_material TEXT, nome_material TEXT NOT NULL, descricao TEXT, quantidade_recebida REAL NOT NULL, unidade TEXT NOT NULL, recebido_em DATETIME NOT NULL,
      recebido_por INTEGER NOT NULL, fornecedor_id INTEGER, fabricante TEXT, pedido_compra_id INTEGER, nota_fiscal TEXT, lote TEXT, numero_serie TEXT,
      local_armazenamento TEXT, observacoes TEXT, dados_tecnicos TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'Rascunho',
      status_inspecao TEXT NOT NULL DEFAULT 'Aguardando inspeção', quantidade_aprovada REAL NOT NULL DEFAULT 0, quantidade_bloqueada REAL NOT NULL DEFAULT 0,
      quantidade_reprovada REAL NOT NULL DEFAULT 0, quantidade_devolvida REAL NOT NULL DEFAULT 0, justificativa_divergencia TEXT, rdo_id INTEGER,
      criado_por INTEGER NOT NULL, atualizado_por INTEGER, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      encerrado_em DATETIME, cancelado_em DATETIME, UNIQUE(tenant_id, codigo)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS material_inspecoes (id INTEGER PRIMARY KEY AUTOINCREMENT, recebimento_id INTEGER NOT NULL, inspetor_id INTEGER, inspecionado_em DATETIME, resultado TEXT NOT NULL, criterios TEXT, quantidade_aprovada REAL NOT NULL DEFAULT 0, quantidade_bloqueada REAL NOT NULL DEFAULT 0, quantidade_reprovada REAL NOT NULL DEFAULT 0, motivo TEXT, ressalvas TEXT, providencias TEXT, prazo_tratamento DATE, observacoes TEXT, criado_por INTEGER NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run(`CREATE TABLE IF NOT EXISTS material_caminhoes_concreto (id INTEGER PRIMARY KEY AUTOINCREMENT, recebimento_id INTEGER NOT NULL, volume REAL NOT NULL, placa TEXT, motorista TEXT, romaneio TEXT, lote TEXT, lacre TEXT, saida_usina TEXT, chegada_obra TEXT, inicio_descarga TEXT, inicio_concretagem TEXT, fim_concretagem TEXT, slump_obtido REAL, temperatura REAL, resultado_inspecao TEXT, dados TEXT DEFAULT '{}', criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run(`CREATE TABLE IF NOT EXISTS material_corpos_prova (id INTEGER PRIMARY KEY AUTOINCREMENT, recebimento_id INTEGER NOT NULL, identificacao TEXT NOT NULL, quantidade INTEGER NOT NULL DEFAULT 1, horario_coleta TEXT, laboratorio TEXT, idades_previstas TEXT, data_ensaio DATE, resistencia_obtida REAL, resultado TEXT, laudo_caminho TEXT, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run(`CREATE TABLE IF NOT EXISTS material_aplicacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, recebimento_id INTEGER NOT NULL, projeto_id INTEGER NOT NULL, destino TEXT NOT NULL, frente_servico TEXT, setor TEXT, bloco TEXT, equipamento TEXT, elemento_construtivo TEXT, atividade_eap_id INTEGER, rdo_id INTEGER, aplicado_em DATETIME NOT NULL, quantidade REAL NOT NULL, unidade TEXT NOT NULL, responsavel_id INTEGER, observacoes TEXT, tipo_movimento TEXT NOT NULL DEFAULT 'Aplicação', criado_por INTEGER NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run(`CREATE TABLE IF NOT EXISTS material_evidencias (id INTEGER PRIMARY KEY AUTOINCREMENT, recebimento_id INTEGER NOT NULL, caminho_arquivo TEXT NOT NULL, nome_arquivo TEXT NOT NULL, tipo_arquivo TEXT, categoria TEXT NOT NULL DEFAULT 'Outro', descricao TEXT, entidade_tipo TEXT, entidade_id INTEGER, criado_por INTEGER NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run(`CREATE TABLE IF NOT EXISTS material_rncs (id INTEGER PRIMARY KEY AUTOINCREMENT, recebimento_id INTEGER NOT NULL, rnc_id INTEGER NOT NULL, criado_por INTEGER NOT NULL, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(recebimento_id, rnc_id))`);
    await run(`CREATE TABLE IF NOT EXISTS material_historico (id INTEGER PRIMARY KEY AUTOINCREMENT, recebimento_id INTEGER NOT NULL, usuario_id INTEGER, acao TEXT NOT NULL, antes TEXT, depois TEXT, criado_em DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await run('CREATE INDEX IF NOT EXISTS idx_material_recebimentos_tenant_projeto ON material_recebimentos(tenant_id, projeto_id, recebido_em)');
    await run('CREATE INDEX IF NOT EXISTS idx_material_recebimentos_status ON material_recebimentos(tenant_id, status_inspecao, status)');
    await run('CREATE INDEX IF NOT EXISTS idx_material_recebimentos_lote ON material_recebimentos(tenant_id, lote, numero_serie)');
    await run('CREATE INDEX IF NOT EXISTS idx_material_aplicacoes_recebimento ON material_aplicacoes(recebimento_id, aplicado_em)');
    await run('CREATE INDEX IF NOT EXISTS idx_material_historico_recebimento ON material_historico(recebimento_id, criado_em)');
    const tipos = [
      ['CONCRETO','Concreto'], ['ACO','Aço e armadura'], ['CABOS','Cabos e condutores'], ['ELETRICOS','Materiais elétricos'], ['EQUIPAMENTOS','Equipamentos'], ['FOTOVOLTAICOS','Módulos fotovoltaicos'], ['ESTRUTURAS','Estruturas metálicas'], ['AGREGADOS','Agregados'], ['OUTROS','Outros']
    ];
    for (const [codigo, nome] of tipos) await run('INSERT OR IGNORE INTO material_tipos (tenant_id, codigo, nome, schema_campos) VALUES (NULL, ?, ?, ?)', [codigo, nome, '{}']);
    for (const [codigo, nome] of [['UN','Unidade'],['M','Metro'],['M2','Metro quadrado'],['M3','Metro cúbico'],['KG','Quilograma'],['T','Tonelada'],['L','Litro'],['ROLO','Rolo'],['BOBINA','Bobina'],['PALETE','Palete'],['SACO','Saco'],['CAIXA','Caixa'],['CONJ','Conjunto']]) await run('INSERT OR IGNORE INTO material_unidades (tenant_id, codigo, nome) VALUES (NULL, ?, ?)', [codigo, nome]);
  }
};
