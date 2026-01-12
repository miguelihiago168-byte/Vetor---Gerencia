const { db } = require('../config/database');

const migrateAddPIN = async () => {
  console.log('Iniciando migração: Adicionando coluna PIN à tabela usuários...');

  try {
    await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(usuarios)", (err, columns) => {
        if (err) {
          reject(err);
        } else {
          const hasPin = columns.some(col => col.name === 'pin');

          if (!hasPin) {
            console.log('Adicionando coluna pin...');
            db.run('ALTER TABLE usuarios ADD COLUMN pin TEXT', (err) => {
              if (err) {
                console.error('Erro ao adicionar pin:', err);
              } else {
                console.log('✓ Coluna pin adicionada');
              }
            });
          } else {
            console.log('✓ Coluna pin já existe');
          }

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

// Executar se chamado diretamente
if (require.main === module) {
  migrateAddPIN();
}

module.exports = migrateAddPIN;
