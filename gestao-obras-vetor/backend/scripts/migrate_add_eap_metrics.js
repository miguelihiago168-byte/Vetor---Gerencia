const { db } = require('../config/database');

const migrate = async () => {
  console.log('Iniciando migração: adicionando métricas (metros/volume) e unidade_base em atividades_eap...');
  try {
    await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(atividades_eap)', (err, columns) => {
        if (err) return reject(err);
        const names = columns.map(c => c.name);
        const ops = [];
        if (!names.includes('quantidade_total_metros')) ops.push(['ALTER TABLE atividades_eap ADD COLUMN quantidade_total_metros REAL DEFAULT 0']);
        if (!names.includes('quantidade_total_volume')) ops.push(['ALTER TABLE atividades_eap ADD COLUMN quantidade_total_volume REAL DEFAULT 0']);
        if (!names.includes('unidade_base')) ops.push(['ALTER TABLE atividades_eap ADD COLUMN unidade_base TEXT']);
        const runNext = (i) => {
          if (i >= ops.length) return resolve();
          db.run(ops[i][0], (e) => { if (e) console.error('Erro em migração EAP metrics:', e.message); runNext(i+1); });
        };
        runNext(0);
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