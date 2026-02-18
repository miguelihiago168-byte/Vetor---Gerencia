const { db, runQuery } = require('../config/database');

const migrateSoftDeleteUsers = async () => {
  console.log('Iniciando migração de soft delete para usuários...');

  try {
    // Adicionar colunas de soft delete se não existirem
    await runQuery(`
      ALTER TABLE usuarios ADD COLUMN deletado_em DATETIME;
    `).catch(() => {
      // Coluna já existe, ignorar erro
    });

    await runQuery(`
      ALTER TABLE usuarios ADD COLUMN deletado_por INTEGER;
    `).catch(() => {
      // Coluna já existe, ignorar erro
    });

    console.log('✓ Colunas de soft delete adicionadas à tabela usuarios');
    console.log('✅ Migração de soft delete concluída!');

  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    throw error;
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  migrateSoftDeleteUsers().finally(() => {
    db.close();
  });
}

module.exports = migrateSoftDeleteUsers;
