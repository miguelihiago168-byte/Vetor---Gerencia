const { db } = require('../config/database');

const migrate = async () => {
  console.log('Iniciando migração: Adicionando coluna mao_obra_detalhada à tabela rdos...');

  try {
    await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(rdos)", (err, columns) => {
        if (err) return reject(err);

        const hasField = columns.some(col => col.name === 'mao_obra_detalhada');
        if (!hasField) {
          db.run(`ALTER TABLE rdos ADD COLUMN mao_obra_detalhada TEXT`, (err) => {
            if (err) console.error('Erro ao adicionar mao_obra_detalhada:', err.message);
            else console.log('✓ Coluna mao_obra_detalhada adicionada');
            resolve();
          });
        } else {
          console.log('✓ Coluna mao_obra_detalhada já existe');
          resolve();
        }
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
