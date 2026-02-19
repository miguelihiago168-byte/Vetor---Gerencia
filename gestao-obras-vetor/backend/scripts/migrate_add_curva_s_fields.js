const { db } = require('../config/database');

const migrate = async () => {
  console.log('Iniciando migração: campos obrigatórios da Curva S em atividades_eap...');
  try {
    await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(atividades_eap)', (err, columns) => {
        if (err) return reject(err);

        const names = columns.map((c) => c.name);
        const operations = [];

        if (!names.includes('id_atividade')) operations.push('ALTER TABLE atividades_eap ADD COLUMN id_atividade TEXT');
        if (!names.includes('nome')) operations.push('ALTER TABLE atividades_eap ADD COLUMN nome TEXT');
        if (!names.includes('data_inicio_planejada')) operations.push('ALTER TABLE atividades_eap ADD COLUMN data_inicio_planejada DATE');
        if (!names.includes('data_fim_planejada')) operations.push('ALTER TABLE atividades_eap ADD COLUMN data_fim_planejada DATE');
        if (!names.includes('peso_percentual_projeto')) operations.push('ALTER TABLE atividades_eap ADD COLUMN peso_percentual_projeto REAL DEFAULT 0');
        if (!names.includes('data_conclusao_real')) operations.push('ALTER TABLE atividades_eap ADD COLUMN data_conclusao_real DATE');

        const runNext = (idx) => {
          if (idx >= operations.length) return resolve();
          db.run(operations[idx], (opErr) => {
            if (opErr) {
              console.error('Erro ao executar:', operations[idx], opErr.message);
            } else {
              console.log('✓', operations[idx]);
            }
            runNext(idx + 1);
          });
        };

        runNext(0);
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE atividades_eap
        SET
          id_atividade = COALESCE(NULLIF(TRIM(id_atividade), ''), 'ATV-' || projeto_id || '-' || codigo_eap),
          nome = COALESCE(NULLIF(TRIM(nome), ''), descricao),
          peso_percentual_projeto = CASE
            WHEN peso_percentual_projeto IS NULL OR peso_percentual_projeto = 0 THEN COALESCE(percentual_previsto, 0)
            ELSE peso_percentual_projeto
          END,
          percentual_previsto = COALESCE(percentual_previsto, peso_percentual_projeto, 0)
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    console.log('✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante migração:', error);
  } finally {
    db.close();
  }
};

if (require.main === module) migrate();

module.exports = migrate;
