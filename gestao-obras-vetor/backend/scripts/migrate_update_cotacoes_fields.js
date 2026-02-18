const { db } = require('../config/database');

const run = async () => {
  console.log('Migrando cotacoes: adicionando campos de análise detalhada...');
  try {
    const addCol = async (name, type) => {
      await new Promise((resolve) => {
        db.run(`ALTER TABLE cotacoes ADD COLUMN ${name} ${type}`, (err) => {
          if (err && !String(err.message).includes('duplicate column')) {
            console.warn(`Aviso ao adicionar coluna ${name}:`, err.message);
          }
          resolve();
        });
      });
    };

    await addCol('condicoes_pagamento', 'TEXT');
    await addCol('garantia', 'TEXT');
    await addCol('frete', 'TEXT');
    await addCol('observacoes', 'TEXT');

    console.log('✅ Migração concluída.');
  } catch (e) {
    console.error('❌ Erro na migração:', e.message);
  } finally {
    db.close();
  }
};

if (require.main === module) run();

module.exports = run;
