const { db } = require('../config/database');

async function ensureIndex(name, createSql) {
  return new Promise((resolve, reject) => {
    db.get("SELECT name FROM sqlite_master WHERE type='index' AND name = ?", [name], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(false);
      db.exec(createSql, (err2) => {
        if (err2) return reject(err2);
        resolve(true);
      });
    });
  });
}

async function run() {
  console.log('Iniciando migração de índices...');
  try {
    const i1 = await ensureIndex('idx_atividades_eap_projeto_pai', "CREATE INDEX IF NOT EXISTS idx_atividades_eap_projeto_pai ON atividades_eap(projeto_id, pai_id)");
    console.log(i1 ? '✓ idx_atividades_eap_projeto_pai criado' : '• idx_atividades_eap_projeto_pai já existe');

    const i2 = await ensureIndex('idx_rdo_atividades_rdo', "CREATE INDEX IF NOT EXISTS idx_rdo_atividades_rdo ON rdo_atividades(rdo_id)");
    console.log(i2 ? '✓ idx_rdo_atividades_rdo criado' : '• idx_rdo_atividades_rdo já existe');

    const i3 = await ensureIndex('idx_rdo_atividades_eap', "CREATE INDEX IF NOT EXISTS idx_rdo_atividades_eap ON rdo_atividades(atividade_eap_id)");
    console.log(i3 ? '✓ idx_rdo_atividades_eap criado' : '• idx_rdo_atividades_eap já existe');

    const i4 = await ensureIndex('idx_rdos_projeto_data', "CREATE INDEX IF NOT EXISTS idx_rdos_projeto_data ON rdos(projeto_id, data_relatorio)");
    console.log(i4 ? '✓ idx_rdos_projeto_data criado' : '• idx_rdos_projeto_data já existe');

    console.log('✅ Migração de índices concluída');
  } catch (err) {
    console.error('❌ Erro na migração de índices:', err);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  run();
}

module.exports = run;
