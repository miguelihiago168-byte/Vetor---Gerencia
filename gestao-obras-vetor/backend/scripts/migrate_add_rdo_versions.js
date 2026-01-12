const { db } = require('../config/database');

const migrate = async () => {
  console.log('Iniciando migração: Criando tabela rdos_versions...');

  try {
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS rdos_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          criado_por INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) return reject(err);
        console.log('✓ Tabela rdos_versions criada (se não existia)');
        resolve();
      });
    });

    console.log('\n✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante migração:', error);
  } finally {
    db.close();
  }
};

if (require.main === module) migrate();

module.exports = migrate;
