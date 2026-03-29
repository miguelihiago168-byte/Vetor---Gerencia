const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'database', 'gestao_obras.db'));

// Fase 1: atribui códigos temporários para liberar o índice UNIQUE
db.run('UPDATE almox_ferramentas SET codigo = ("_TMP_" || id) WHERE projeto_id = 2', [], function (e) {
  if (e) { console.error('Fase 1 falhou:', e.message); db.close(); return; }
  console.log('Fase 1 ok — temporários aplicados');

  // Fase 2: renumera apenas os registros ativos (ativo=1) pela ordem de inserção (id ASC)
  db.all('SELECT id FROM almox_ferramentas WHERE projeto_id = 2 AND ativo = 1 ORDER BY id ASC', [], function (err, rows) {
    if (err) { console.error(err); db.close(); return; }
    console.log('Total de ativos válidos:', rows.length);

    let i = 0;
    const next = function () {
      if (i >= rows.length) {
        db.all(
          'SELECT id, codigo, nome FROM almox_ferramentas WHERE projeto_id = 2 AND ativo = 1 ORDER BY id ASC',
          [],
          function (e2, r) {
            console.log('\nResultado final:');
            r.forEach(function (x) { console.log('  id=' + x.id + '  ' + x.codigo + '  ' + x.nome); });
            db.close();
          }
        );
        return;
      }
      const cod = 'IPN-' + String(i + 1).padStart(4, '0');
      db.run('UPDATE almox_ferramentas SET codigo = ? WHERE id = ?', [cod, rows[i].id], function (e2) {
        if (e2) console.error('Erro id=' + rows[i].id + ':', e2.message);
        else console.log('id=' + rows[i].id + ' -> ' + cod);
        i++;
        next();
      });
    };
    next();
  });
});
