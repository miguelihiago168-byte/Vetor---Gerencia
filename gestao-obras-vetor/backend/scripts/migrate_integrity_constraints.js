const { db } = require('../config/database');

async function ensureTrigger(name, createSql) {
  return new Promise((resolve, reject) => {
    db.get("SELECT name FROM sqlite_master WHERE type='trigger' AND name = ?", [name], (err, row) => {
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
  console.log('Iniciando migração de integridade (triggers)...');
  try {
    // 1) Bloquear INSERT em rdos se projeto não tiver nenhuma EAP
    const created1 = await ensureTrigger('trg_rdos_require_eap_on_project', `
      CREATE TRIGGER trg_rdos_require_eap_on_project
      BEFORE INSERT ON rdos
      BEGIN
        SELECT CASE
          WHEN (SELECT COUNT(*) FROM atividades_eap WHERE projeto_id = NEW.projeto_id) = 0
          THEN RAISE(ABORT, 'Projeto sem EAP: não é permitido criar RDO')
        END;
      END;
    `);
    if (created1) console.log('✓ Trigger trg_rdos_require_eap_on_project criada'); else console.log('• Trigger trg_rdos_require_eap_on_project já existe');

    // 2) Garantir consistência de projeto entre rdo_atividades e EAP/RDO
    const created2 = await ensureTrigger('trg_rdo_atividades_project_consistency', `
      CREATE TRIGGER trg_rdo_atividades_project_consistency
      BEFORE INSERT ON rdo_atividades
      BEGIN
        SELECT CASE
          WHEN (
            (SELECT projeto_id FROM atividades_eap WHERE id = NEW.atividade_eap_id) 
            != (SELECT projeto_id FROM rdos WHERE id = NEW.rdo_id)
          )
          THEN RAISE(ABORT, 'Atividade EAP pertence a outro projeto')
        END;
      END;
    `);
    if (created2) console.log('✓ Trigger trg_rdo_atividades_project_consistency criada'); else console.log('• Trigger trg_rdo_atividades_project_consistency já existe');

    // 2b) Também para UPDATE de rdo_atividades
    const created2b = await ensureTrigger('trg_rdo_atividades_project_consistency_upd', `
      CREATE TRIGGER trg_rdo_atividades_project_consistency_upd
      BEFORE UPDATE ON rdo_atividades
      BEGIN
        SELECT CASE
          WHEN (
            (SELECT projeto_id FROM atividades_eap WHERE id = NEW.atividade_eap_id) 
            != (SELECT projeto_id FROM rdos WHERE id = NEW.rdo_id)
          )
          THEN RAISE(ABORT, 'Atividade EAP pertence a outro projeto')
        END;
      END;
    `);
    if (created2b) console.log('✓ Trigger trg_rdo_atividades_project_consistency_upd criada'); else console.log('• Trigger trg_rdo_atividades_project_consistency_upd já existe');

    // 3) Impedir UPDATE de status para além de 'Em preenchimento' sem atividades vinculadas
    const created3 = await ensureTrigger('trg_rdos_status_require_atividade', `
      CREATE TRIGGER trg_rdos_status_require_atividade
      BEFORE UPDATE OF status ON rdos
      WHEN NEW.status <> 'Em preenchimento'
      BEGIN
        SELECT CASE
          WHEN (SELECT COUNT(*) FROM rdo_atividades WHERE rdo_id = NEW.id) = 0
          THEN RAISE(ABORT, 'RDO sem atividades: não é permitido alterar status')
        END;
      END;
    `);
    if (created3) console.log('✓ Trigger trg_rdos_status_require_atividade criada'); else console.log('• Trigger trg_rdos_status_require_atividade já existe');

    console.log('✅ Migração de integridade concluída');
  } catch (err) {
    console.error('❌ Erro na migração de integridade:', err);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  run();
}

module.exports = run;
