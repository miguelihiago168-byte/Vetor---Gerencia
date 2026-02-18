const { db } = require('../config/database');

const migrateAddNotificationsUniqueIndex = async () => {
  console.log('Migrando: adicionando índice único em notificacoes...');
  try {
    // Remover duplicadas existentes mantendo o menor id (mais antigo)
    await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM notificacoes
         WHERE id IN (
           SELECT n1.id FROM notificacoes n1
           JOIN notificacoes n2
             ON n1.usuario_id = n2.usuario_id
            AND n1.tipo = n2.tipo
            AND IFNULL(n1.referencia_tipo, '') = IFNULL(n2.referencia_tipo, '')
            AND IFNULL(n1.referencia_id, 0) = IFNULL(n2.referencia_id, 0)
            AND n1.id > n2.id
         )`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    await new Promise((resolve, reject) => {
      db.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_unique
         ON notificacoes (usuario_id, tipo, referencia_tipo, referencia_id)`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    console.log('✓ Índice único idx_notif_unique criado');
  } catch (error) {
    console.error('Erro na migração de índice único de notificações:', error);
  } finally {
    db.close();
  }
};

if (require.main === module) {
  migrateAddNotificationsUniqueIndex();
}

module.exports = migrateAddNotificationsUniqueIndex;