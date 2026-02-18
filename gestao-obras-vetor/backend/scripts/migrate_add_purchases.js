const { db } = require('../config/database');

const run = async () => {
  console.log('Iniciando migração: compras + ADM...');
  try {
    // Add is_adm column if not exists
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE usuarios ADD COLUMN is_adm INTEGER DEFAULT 0`, (err) => {
        if (err && !String(err.message).includes('duplicate column')) console.warn('Aviso is_adm:', err.message);
        resolve();
      });
    });

    // Mark default admin as ADM (login 000001)
    await new Promise((resolve, reject) => {
      db.run(`UPDATE usuarios SET is_adm = 1 WHERE login = '000001'`, (err) => {
        if (err) console.warn('Aviso update admin is_adm:', err.message);
        resolve();
      });
    });

    // Create pedidos_compra
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS pedidos_compra (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL,
          solicitante_id INTEGER NOT NULL,
          descricao TEXT NOT NULL,
          quantidade REAL NOT NULL,
          unidade TEXT,
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

    // Create cotacoes
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

    console.log('✅ Migração concluída.');
  } catch (e) {
    console.error('❌ Erro na migração:', e.message);
  } finally {
    db.close();
  }
};

if (require.main === module) run();

module.exports = run;
