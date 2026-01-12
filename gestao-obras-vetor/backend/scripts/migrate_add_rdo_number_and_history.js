const { db } = require('../config/database');

const migrate = async () => {
  console.log('Iniciando migração: Adicionando campos numero_relatorio e historico_status à tabela rdos...');

  try {
    await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(rdos)", (err, columns) => {
        if (err) return reject(err);

        const fieldMap = {
          'numero_relatorio': 'INTEGER',
          'historico_status': 'TEXT'
        };

        let pending = 0;
        for (const [fieldName, fieldDef] of Object.entries(fieldMap)) {
          const hasField = columns.some(col => col.name === fieldName);
          if (!hasField) {
            pending++;
            console.log(`Adicionando coluna ${fieldName}...`);
            db.run(`ALTER TABLE rdos ADD COLUMN ${fieldName} ${fieldDef}`, (err) => {
              if (err) console.error(`Erro ao adicionar ${fieldName}:`, err.message);
              else console.log(`✓ Coluna ${fieldName} adicionada`);
              pending--;
              if (pending === 0) resolve();
            });
          }
        }

        if (pending === 0) resolve();
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
