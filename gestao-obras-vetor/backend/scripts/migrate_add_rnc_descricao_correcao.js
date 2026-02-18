const { db } = require('../config/database');

const migrateAddRncDescricaoCorrecao = async () => {
  console.log('Migrando: adicionando coluna descricao_correcao na tabela rnc...');
  try {
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE rnc ADD COLUMN descricao_correcao TEXT`, (err) => {
        if (err) {
          if (/duplicate column|already exists/i.test(err.message)) {
            console.log('Coluna descricao_correcao já existe.');
            resolve();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    });
    console.log('✓ Coluna descricao_correcao adicionada');
  } catch (error) {
    console.error('Erro na migração descricao_correcao:', error);
  } finally {
    db.close();
  }
};

if (require.main === module) {
  migrateAddRncDescricaoCorrecao();
}

module.exports = migrateAddRncDescricaoCorrecao;