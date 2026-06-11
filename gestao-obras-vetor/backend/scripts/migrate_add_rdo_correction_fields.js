const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'gestao_obras.db');
const db = new sqlite3.Database(dbPath);

const fields = [
  ['correcao_solicitada', 'correcao_solicitada INTEGER DEFAULT 0'],
  ['correcao_motivo', 'correcao_motivo TEXT'],
  ['correcao_origem', 'correcao_origem TEXT'],
  ['correcao_solicitada_em', 'correcao_solicitada_em DATETIME'],
  ['correcao_solicitada_por', 'correcao_solicitada_por TEXT'],
  ['status_anterior_correcao', 'status_anterior_correcao TEXT']
];

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

async function main() {
  console.log('Migrando: adicionando campos de correção automática em rdos...');
  const columns = await all('PRAGMA table_info(rdos)');
  const existing = new Set(columns.map((c) => c.name));

  for (const [name, definition] of fields) {
    if (existing.has(name)) {
      console.log(`- Coluna ${name} ja existe.`);
      continue;
    }
    await run(`ALTER TABLE rdos ADD COLUMN ${definition}`);
    console.log(`✓ Coluna ${name} adicionada.`);
  }

  console.log('✓ Migração de correção automática de RDO concluída.');
}

main()
  .catch((err) => {
    console.error('Erro na migração de correção automática de RDO:', err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
