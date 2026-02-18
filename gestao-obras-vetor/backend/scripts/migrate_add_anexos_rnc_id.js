const { db } = require('../config/database');

const migrate = async () => {
  console.log('Iniciando migração: adicionando coluna rnc_id em anexos...');
  try {
    await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(anexos)', (err, columns) => {
        if (err) return reject(err);
        const hasField = columns.some(col => col.name === 'rnc_id');
        if (!hasField) {
          db.run('ALTER TABLE anexos ADD COLUMN rnc_id INTEGER', (err) => {
            if (err) console.error('Erro ao adicionar rnc_id em anexos:', err.message);
            else console.log('✓ Coluna rnc_id adicionada em anexos');
            resolve();
          });
        } else {
          console.log('✓ Coluna rnc_id já existe em anexos');
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