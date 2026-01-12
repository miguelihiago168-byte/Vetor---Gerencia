const { db } = require('../config/database');

const migrateAddRDOFields = async () => {
  console.log('Iniciando migração: Adicionando campos à tabela rdos...');

  try {
    await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(rdos)", (err, columns) => {
        if (err) {
          reject(err);
        } else {
          const fieldMap = {
            'entrada_saida_inicio': 'TEXT DEFAULT "07:00"',
            'entrada_saida_fim': 'TEXT DEFAULT "17:00"',
            'intervalo_almoco_inicio': 'TEXT DEFAULT "12:00"',
            'intervalo_almoco_fim': 'TEXT DEFAULT "13:00"',
            'horas_trabalhadas': 'REAL DEFAULT 0',
            'tempo_manha': 'TEXT DEFAULT "★"',
            'tempo_tarde': 'TEXT DEFAULT "★"'
          };

          for (const [fieldName, fieldDef] of Object.entries(fieldMap)) {
            const hasField = columns.some(col => col.name === fieldName);
            if (!hasField) {
              console.log(`Adicionando coluna ${fieldName}...`);
              db.run(`ALTER TABLE rdos ADD COLUMN ${fieldName} ${fieldDef}`, (err) => {
                if (err) {
                  console.error(`Erro ao adicionar ${fieldName}:`, err);
                } else {
                  console.log(`✓ Coluna ${fieldName} adicionada`);
                }
              });
            } else {
              console.log(`✓ Coluna ${fieldName} já existe`);
            }
          }

          // Update defaults for existing columns
          db.run(`UPDATE rdos SET clima_manha = COALESCE(clima_manha, 'Claro') WHERE clima_manha IS NULL`, (err) => {
            if (!err) console.log('✓ Padrão de clima_manha definido');
          });
          
          db.run(`UPDATE rdos SET clima_tarde = COALESCE(clima_tarde, 'Claro') WHERE clima_tarde IS NULL`, (err) => {
            if (!err) console.log('✓ Padrão de clima_tarde definido');
          });

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
  migrateAddRDOFields();
}

module.exports = migrateAddRDOFields;
