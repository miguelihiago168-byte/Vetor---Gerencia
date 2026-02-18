const { db } = require('../config/database');

const migrateAddNotifications = async () => {
  console.log('Migrando: criando tabela notificacoes...');
  try {
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS notificacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER NOT NULL,
          tipo TEXT,
          mensagem TEXT NOT NULL,
          referencia_tipo TEXT,
          referencia_id INTEGER,
          lido INTEGER DEFAULT 0,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_notif_usuario_lido ON notificacoes(usuario_id, lido)`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('✓ Tabela notificacoes criada');
  } catch (error) {
    console.error('Erro na migração de notificações:', error);
  } finally {
    db.close();
  }
};

if (require.main === module) {
  migrateAddNotifications();
}

module.exports = migrateAddNotifications;