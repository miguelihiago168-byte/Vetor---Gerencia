const { runQuery } = require('../config/database');

const migrateAddAlmoxarifado = async () => {
  console.log('Iniciando migração do módulo Almoxarifado...');

  try {
    await runQuery('BEGIN TRANSACTION');

    try {
      await runQuery('ALTER TABLE usuarios ADD COLUMN perfil_almoxarifado TEXT');
      console.log('✓ Coluna perfil_almoxarifado adicionada em usuarios');
    } catch (_) {
      console.log('• Coluna perfil_almoxarifado já existe em usuarios');
    }

    await runQuery(`
      CREATE TABLE IF NOT EXISTS almox_ferramentas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (criado_por) REFERENCES usuarios(id)
      )
    `);

    try {
      await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Outros'`);
      console.log('✓ Coluna categoria adicionada em almox_ferramentas');
    } catch (_) {
      console.log('• Coluna categoria já existe em almox_ferramentas');
    }

    try {
      await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN nf_compra TEXT NOT NULL DEFAULT ''`);
      console.log('✓ Coluna nf_compra adicionada em almox_ferramentas');
    } catch (_) {
      console.log('• Coluna nf_compra já existe em almox_ferramentas');
    }

    try {
      await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN marca TEXT`);
      console.log('✓ Coluna marca adicionada em almox_ferramentas');
    } catch (_) {
      console.log('• Coluna marca já existe em almox_ferramentas');
    }

    try {
      await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN modelo TEXT`);
      console.log('✓ Coluna modelo adicionada em almox_ferramentas');
    } catch (_) {
      console.log('• Coluna modelo já existe em almox_ferramentas');
    }

    await runQuery(`
      UPDATE almox_ferramentas
      SET categoria = 'Outros'
      WHERE categoria IS NULL OR TRIM(categoria) = ''
    `);

    await runQuery(`
      UPDATE almox_ferramentas
      SET nf_compra = 'NÃO INFORMADA'
      WHERE nf_compra IS NULL OR TRIM(nf_compra) = ''
    `);

    await runQuery(`
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
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
        FOREIGN KEY (projeto_id) REFERENCES projetos(id),
        FOREIGN KEY (colaborador_id) REFERENCES usuarios(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id),
        FOREIGN KEY (encerrado_por) REFERENCES usuarios(id)
      )
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS almox_manutencoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ferramenta_id INTEGER NOT NULL,
        alocacao_id INTEGER,
        projeto_id INTEGER NOT NULL,
        quantidade INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'EM_MANUTENCAO',
        justificativa TEXT,
        retorna_estoque INTEGER NOT NULL DEFAULT 1,
        custo REAL,
        data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
        data_retorno DATETIME,
        criado_por INTEGER NOT NULL,
        finalizado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
        FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
        FOREIGN KEY (projeto_id) REFERENCES projetos(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id),
        FOREIGN KEY (finalizado_por) REFERENCES usuarios(id)
      )
    `);

    await runQuery(`
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
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
        FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
        FOREIGN KEY (projeto_id) REFERENCES projetos(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id)
      )
    `);

    await runQuery(`
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
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
        FOREIGN KEY (projeto_origem_id) REFERENCES projetos(id),
        FOREIGN KEY (projeto_destino_id) REFERENCES projetos(id),
        FOREIGN KEY (colaborador_id) REFERENCES usuarios(id),
        FOREIGN KEY (rdo_id) REFERENCES rdos(id),
        FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      )
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS rdo_ferramentas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rdo_id INTEGER NOT NULL,
        ferramenta_id INTEGER NOT NULL,
        alocacao_id INTEGER NOT NULL,
        colaborador_id INTEGER,
        colaborador_nome TEXT,
        quantidade INTEGER NOT NULL,
        criado_por INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
        FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
        FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
        FOREIGN KEY (colaborador_id) REFERENCES usuarios(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id)
      )
    `);

    await runQuery('CREATE INDEX IF NOT EXISTS idx_almox_alocacoes_projeto_status ON almox_alocacoes(projeto_id, status)');
    await runQuery('CREATE INDEX IF NOT EXISTS idx_almox_movimentacoes_tipo_data ON almox_movimentacoes(tipo, criado_em)');
    await runQuery('CREATE INDEX IF NOT EXISTS idx_almox_perdas_projeto_data ON almox_perdas(projeto_id, criado_em)');
    await runQuery('CREATE INDEX IF NOT EXISTS idx_rdo_ferramentas_rdo ON rdo_ferramentas(rdo_id)');

    await runQuery('COMMIT');
    console.log('✅ Migração do almoxarifado concluída com sucesso.');
  } catch (error) {
    try {
      await runQuery('ROLLBACK');
    } catch (_) {}
    console.error('❌ Erro ao executar migração do almoxarifado:', error);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  migrateAddAlmoxarifado();
}

module.exports = migrateAddAlmoxarifado;
