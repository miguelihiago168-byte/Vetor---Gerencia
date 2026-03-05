const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./database/gestao_obras.db');

db.all(
  "SELECT id, descricao, codigo_eap, quantidade_total, percentual_executado, status, pai_id FROM atividades_eap WHERE lower(descricao) LIKE lower('%perf%')",
  [],
  (err, rows) => {
    if (err) { console.error('ERR_ATIVIDADES:', err); db.close(); return; }
    console.log('=== ATIVIDADES PERFURACAO ===');
    console.log(JSON.stringify(rows, null, 2));

    if (!rows.length) { console.log('Nenhuma atividade encontrada.'); db.close(); return; }

    const ids = rows.map(r => r.id);
    db.all(
      'SELECT ra.atividade_eap_id, ra.quantidade_executada, ra.percentual_executado, r.status AS rdo_status, r.id AS rdo_id, r.data_relatorio FROM rdo_atividades ra JOIN rdos r ON ra.rdo_id = r.id WHERE ra.atividade_eap_id IN (' + ids.join(',') + ')',
      [],
      (err2, rows2) => {
        if (err2) { console.error('ERR_RDO_ATIVIDADES:', err2); }
        else {
          console.log('\n=== RDO_ATIVIDADES VINCULADAS ===');
          console.log(JSON.stringify(rows2, null, 2));
        }
        db.close();
      }
    );
  }
);
