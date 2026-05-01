/**
 * Adiciona coluna 'categoria' à tabela 'anexos' para diferenciar
 * registros fotográficos (registro) de fotos da correção (correcao).
 */
const { db } = require('../config/database');

const migrate = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`ALTER TABLE anexos ADD COLUMN categoria TEXT DEFAULT 'registro'`, (err) => {
        if (err) {
          if (err.message.includes('duplicate column name')) {
            console.log('[migrate_add_rnc_categoria] Coluna já existe, ignorando.');
            resolve();
          } else {
            reject(err);
          }
        } else {
          console.log('[migrate_add_rnc_categoria] Coluna "categoria" adicionada com sucesso.');
          resolve();
        }
      });
    });
  });
};

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate_add_rnc_categoria] Erro:', err);
    process.exit(1);
  });
