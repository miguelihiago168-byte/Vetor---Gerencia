const { db, runQuery } = require('../config/database');

const migrateRDOAndProjects = async () => {
  console.log('Iniciando migração de campos para RDO e Projetos...');

  try {
    // Adicionar número único para RDO
    await runQuery(`
      ALTER TABLE rdos ADD COLUMN numero_rdo TEXT UNIQUE;
    `).catch(() => {
      // Coluna já existe, ignorar erro
    });

    // Adicionar campo arquivado para projetos
    await runQuery(`
      ALTER TABLE projetos ADD COLUMN arquivado INTEGER DEFAULT 0;
    `).catch(() => {
      // Coluna já existe, ignorar erro
    });

    console.log('✓ Campos adicionados com sucesso');
    console.log('✅ Migração concluída!');

  } catch (error) {
    console.error('❌ Erro ao executar migração:', error);
    throw error;
  }
};

// Executar se chamado diretamente
if (require.main === module) {
  migrateRDOAndProjects().finally(() => {
    db.close();
  });
}

module.exports = migrateRDOAndProjects;
