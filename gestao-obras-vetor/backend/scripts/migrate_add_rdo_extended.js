const { db } = require('../config/database');

const migrate = async () => {
  console.log('Iniciando migração: adicionando tabelas estendidas para RDO...');

  try {
    // Tabela de catálogo de mão de obra
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS mao_obra (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          funcao TEXT,
          criado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela mao_obra criada');

    // Tabela de mão de obra vinculada ao RDO com horários
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_mao_obra (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          mao_obra_id INTEGER NOT NULL,
          horario_entrada TEXT,
          horario_saida_almoco TEXT,
          horario_retorno_almoco TEXT,
          horario_saida_final TEXT,
          horas_trabalhadas REAL DEFAULT 0,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (mao_obra_id) REFERENCES mao_obra(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_mao_obra criada');

    // Tabela de fotos vinculadas a atividades dentro do RDO
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_fotos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          rdo_atividade_id INTEGER,
          nome_arquivo TEXT NOT NULL,
          caminho_arquivo TEXT NOT NULL,
          descricao TEXT,
          criado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (rdo_atividade_id) REFERENCES rdo_atividades(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_fotos criada');

    // Tabela de comentários do RDO
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_comentarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          usuario_id INTEGER NOT NULL,
          comentario TEXT NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_comentarios criada');

    // Tabela de materiais recebidos vinculados ao RDO
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_materiais (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          nome_material TEXT NOT NULL,
          quantidade REAL,
          unidade TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_materiais criada');

    // Tabela de ocorrências do dia vinculadas ao RDO
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_ocorrencias (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          titulo TEXT,
          descricao TEXT NOT NULL,
          gravidade TEXT,
          criado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_ocorrencias criada');

    // Tabela de anexos específicos (PDFs, etc.) - já existe 'anexos', mas adicionamos tabela de assinaturas
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_assinaturas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          usuario_id INTEGER NOT NULL,
          tipo TEXT NOT NULL, -- preenchedor | aprovador
          arquivo_assinatura TEXT, -- caminho se for arquivo ou hash
          assinado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_assinaturas criada');

    // Opcional: tabela de clima por período (manhã/tarde/noite) para o RDO
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdo_clima (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          periodo TEXT NOT NULL, -- manha|tarde|noite
          condicao_tempo TEXT, -- Ensolarado|Nublado|Chuvoso
          condicao_trabalho TEXT, -- Praticavel|Impraticavel
          pluviometria_mm REAL DEFAULT 0,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela rdo_clima criada');

    console.log('\n✅ Migração estendida para RDO concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante migração estendida:', error);
  } finally {
    db.close();
  }
};

if (require.main === module) migrate();

module.exports = migrate;
