const { db } = require('../config/database');

/**
 * Migration: adiciona coluna descricao_correcao_em na tabela rnc
 * Registra o momento exato em que a correção foi submetida.
 */
async function migrate() {
  console.log('Migrando: adicionando coluna descricao_correcao_em na tabela rnc...');
  try {
    const existing = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info('rnc')", [], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    const hasColumn = existing.some((c) => c.name === 'descricao_correcao_em');

    if (hasColumn) {
      console.log('Coluna descricao_correcao_em já existe. Nada a fazer.');
      return;
    }

    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE rnc ADD COLUMN descricao_correcao_em DATETIME', (err) => {
        if (err) reject(err); else resolve();
      });
    });

    console.log('✓ Coluna descricao_correcao_em adicionada com sucesso.');
  } catch (error) {
    console.error('Erro na migração descricao_correcao_em:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
