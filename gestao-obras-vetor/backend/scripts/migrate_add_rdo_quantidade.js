const { db, runQuery } = require('../config/database');

const migrateRDOActividades = async () => {
  console.log('Iniciando migração: Adicionando campo quantidade_executada à tabela rdo_atividades...');

  try {
    // Verificar se a coluna já existe
    await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(rdo_atividades)", (err, columns) => {
        if (err) {
          reject(err);
        } else {
          const hasQuantidadeExecutada = columns.some(col => col.name === 'quantidade_executada');

          if (!hasQuantidadeExecutada) {
            console.log('Adicionando coluna quantidade_executada...');
            db.run('ALTER TABLE rdo_atividades ADD COLUMN quantidade_executada REAL', (err) => {
              if (err) {
                console.error('Erro ao adicionar quantidade_executada:', err);
              } else {
                console.log('✓ Coluna quantidade_executada adicionada');
              }
            });
          } else {
            console.log('✓ Coluna quantidade_executada já existe');
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
  migrateRDOActividades();
}

module.exports = migrateRDOActividades;
