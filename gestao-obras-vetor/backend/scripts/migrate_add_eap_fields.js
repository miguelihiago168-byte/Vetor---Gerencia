const { db, runQuery } = require('../config/database');

const migrateEAPFields = async () => {
  console.log('Iniciando migração: Adicionando campos unidade_medida e quantidade_total...');

  try {
    // Verificar se as colunas já existem
    await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(atividades_eap)", (err, columns) => {
        if (err) {
          reject(err);
        } else {
          const hasUnidadeMedida = columns.some(col => col.name === 'unidade_medida');
          const hasQuantidadeTotal = columns.some(col => col.name === 'quantidade_total');

          if (!hasUnidadeMedida) {
            console.log('Adicionando coluna unidade_medida...');
            db.run('ALTER TABLE atividades_eap ADD COLUMN unidade_medida TEXT', (err) => {
              if (err) {
                console.error('Erro ao adicionar unidade_medida:', err);
              } else {
                console.log('✓ Coluna unidade_medida adicionada');
              }
            });
          } else {
            console.log('✓ Coluna unidade_medida já existe');
          }

          if (!hasQuantidadeTotal) {
            console.log('Adicionando coluna quantidade_total...');
            db.run('ALTER TABLE atividades_eap ADD COLUMN quantidade_total REAL DEFAULT 0', (err) => {
              if (err) {
                console.error('Erro ao adicionar quantidade_total:', err);
              } else {
                console.log('✓ Coluna quantidade_total adicionada');
              }
            });
          } else {
            console.log('✓ Coluna quantidade_total já existe');
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
  migrateEAPFields();
}

module.exports = migrateEAPFields;
