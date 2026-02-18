const { db } = require('../config/database');

const run = async () => {
  console.log('Iniciando migração: adicionar coluna aplicacao_local em pedidos_compra...');
  try {
    await new Promise((resolve) => {
      db.all("PRAGMA table_info('pedidos_compra')", (err, rows) => {
        if (err) {
          console.error('Erro ao verificar tabela:', err.message);
          return resolve();
        }
        const hasCol = rows && rows.some((r) => r.name === 'aplicacao_local');
        if (hasCol) {
          console.log('✓ Coluna aplicacao_local já existe.');
          return resolve();
        }
        db.run("ALTER TABLE pedidos_compra ADD COLUMN aplicacao_local TEXT", (alterErr) => {
          if (alterErr) {
            console.error('Erro ao adicionar coluna aplicacao_local:', alterErr.message);
          } else {
            console.log('✓ Coluna aplicacao_local adicionada com sucesso.');
          }
          resolve();
        });
      });
    });

    console.log('✅ Migração concluída.');
  } catch (e) {
    console.error('❌ Erro na migração:', e.message);
  } finally {
    db.close();
  }
};

if (require.main === module) run();

module.exports = run;
