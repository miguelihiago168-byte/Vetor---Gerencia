const { db } = require('../config/database');
const bcrypt = require('bcryptjs');

const initDatabase = async () => {
  console.log('Iniciando criação das tabelas...');

  try {
    // Tabela de Usuários
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          login TEXT UNIQUE NOT NULL,
          senha TEXT NOT NULL,
          pin TEXT,
          nome TEXT NOT NULL,
          email TEXT,
          perfil TEXT,
          setor TEXT,
          setor_outro TEXT,
          is_gestor INTEGER DEFAULT 0,
          is_adm INTEGER DEFAULT 0,
          ativo INTEGER DEFAULT 1,
          deletado_em DATETIME,
          deletado_por INTEGER,
          criado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (deletado_por) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela usuarios criada');

    // Tabela de Projetos
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS projetos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          empresa_responsavel TEXT NOT NULL,
          empresa_executante TEXT NOT NULL,
          prazo_termino DATE NOT NULL,
          cidade TEXT NOT NULL,
          ativo INTEGER DEFAULT 1,
          arquivado INTEGER DEFAULT 0,
          criado_por INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela projetos criada');

    // Tabela de Usuários por Projeto
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS projeto_usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL,
          usuario_id INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
          UNIQUE(projeto_id, usuario_id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela projeto_usuarios criada');

    // Tabela de Atividades EAP
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS atividades_eap (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          id_atividade TEXT,
          projeto_id INTEGER NOT NULL,
          codigo_eap TEXT NOT NULL,
          nome TEXT,
          descricao TEXT NOT NULL,
          percentual_previsto REAL DEFAULT 100.0,
          peso_percentual_projeto REAL DEFAULT 0.0,
          percentual_executado REAL DEFAULT 0.0,
          data_inicio_planejada DATE,
          data_fim_planejada DATE,
          data_conclusao_real DATE,
          status TEXT DEFAULT 'Não iniciada',
          pai_id INTEGER,
          ordem INTEGER DEFAULT 0,
          unidade_medida TEXT,
          quantidade_total REAL DEFAULT 0,
          criado_por INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (pai_id) REFERENCES atividades_eap(id) ON DELETE CASCADE,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          UNIQUE(projeto_id, codigo_eap)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela atividades_eap criada');

    // Tabela de RDOs
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero_rdo TEXT UNIQUE,
          projeto_id INTEGER NOT NULL,
          data_relatorio DATE NOT NULL,
          dia_semana TEXT NOT NULL,
          entrada_saida_inicio TEXT DEFAULT '07:00',
          entrada_saida_fim TEXT DEFAULT '17:00',
          intervalo_almoco_inicio TEXT DEFAULT '12:00',
          intervalo_almoco_fim TEXT DEFAULT '13:00',
          horas_trabalhadas REAL DEFAULT 0,
          clima_manha TEXT DEFAULT 'Claro',
          tempo_manha TEXT DEFAULT '★',
          praticabilidade_manha TEXT DEFAULT 'Praticável',
          clima_tarde TEXT DEFAULT 'Claro',
          tempo_tarde TEXT DEFAULT '★',
          praticabilidade_tarde TEXT DEFAULT 'Praticável',
          mao_obra_direta INTEGER DEFAULT 0,
          mao_obra_indireta INTEGER DEFAULT 0,
          mao_obra_terceiros INTEGER DEFAULT 0,
          equipamentos TEXT,
          ocorrencias TEXT,
          comentarios TEXT,
          status TEXT DEFAULT 'Em preenchimento',
          criado_por INTEGER NOT NULL,
          aprovado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          aprovado_em DATETIME,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (aprovado_por) REFERENCES usuarios(id),
          UNIQUE(projeto_id, data_relatorio)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdos criada');

    // Tabela de Atividades Executadas no RDO
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_atividades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          atividade_eap_id INTEGER NOT NULL,
          percentual_executado REAL NOT NULL,
          quantidade_executada REAL,
          observacao TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (atividade_eap_id) REFERENCES atividades_eap(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_atividades criada');

    // Tabela de Anexos
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS anexos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          nome_arquivo TEXT NOT NULL,
          caminho_arquivo TEXT NOT NULL,
          tamanho INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela anexos criada');

    // Tabela de Histórico de Atividades
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS historico_atividades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          atividade_eap_id INTEGER NOT NULL,
          rdo_id INTEGER NOT NULL,
          percentual_anterior REAL NOT NULL,
          percentual_executado REAL NOT NULL,
          percentual_novo REAL NOT NULL,
          usuario_id INTEGER NOT NULL,
          data_execucao DATE NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (atividade_eap_id) REFERENCES atividades_eap(id) ON DELETE CASCADE,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela historico_atividades criada');

    // Tabela de RNC (Relatório de Não Conformidade)
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rnc (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL,
          rdo_id INTEGER,
          titulo TEXT NOT NULL,
          descricao TEXT NOT NULL,
          gravidade TEXT NOT NULL,
          status TEXT DEFAULT 'Aberta',
          acao_corretiva TEXT,
          responsavel_id INTEGER,
          criado_por INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolvido_em DATETIME,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id),
          FOREIGN KEY (responsavel_id) REFERENCES usuarios(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rnc criada');

    // Tabela de Auditoria
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS auditoria (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tabela TEXT NOT NULL,
          registro_id INTEGER NOT NULL,
          acao TEXT NOT NULL,
          dados_anteriores TEXT,
          dados_novos TEXT,
          usuario_id INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela auditoria criada');

    // Tabela de Pedidos de Compra
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS pedidos_compra (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL,
          solicitante_id INTEGER NOT NULL,
          descricao TEXT NOT NULL,
          quantidade REAL NOT NULL,
          unidade TEXT,
          aplicacao_local TEXT,
          status TEXT NOT NULL DEFAULT 'SOLICITADO',
          gestor_aprovador_id INTEGER,
          adm_responsavel_id INTEGER,
          cotacao_vencedora_id INTEGER,
          reprovado_motivo TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
          FOREIGN KEY (gestor_aprovador_id) REFERENCES usuarios(id),
          FOREIGN KEY (adm_responsavel_id) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela pedidos_compra criada');

    // Tabela de Cotações
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS cotacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER NOT NULL,
          fornecedor TEXT NOT NULL,
          valor_unitario REAL NOT NULL,
          marca TEXT,
          modelo TEXT,
          prazo_entrega TEXT,
          status TEXT DEFAULT 'NAO_SELECIONADA',
          pdf_path TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela cotacoes criada');

    // Criar usuário gestor padrão
    const senhaHash = await bcrypt.hash('123456', 10);
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT OR IGNORE INTO usuarios (login, senha, nome, email, is_gestor, is_adm)
        VALUES ('000001', ?, 'Administrador', 'admin@vetor.com', 1, 1)
      `, [senhaHash], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Usuário administrador criado (Login: 000001, Senha: 123456)');

    console.log('\n✅ Banco de dados inicializado com sucesso!');
    console.log('\n📋 Credenciais padrão:');
    console.log('   Login: 000001');
    console.log('   Senha: 123456');

  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
  } finally {
    db.close();
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;
