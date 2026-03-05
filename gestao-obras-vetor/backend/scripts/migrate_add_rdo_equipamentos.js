/**
 * Migration: cria tabela rdo_equipamentos e migra dados do campo JSON rdos.equipamentos
 */
const path = require('path');
const Database = require('sqlite3').Database;

const dbPath = path.join(__dirname, '..', 'database', 'gestao_obras.db');
const db = new Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );

const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    })
  );

async function migrate() {
  console.log('[migrate_add_rdo_equipamentos] iniciando...');

  // 1. Criar tabela se não existir
  await run(`
    CREATE TABLE IF NOT EXISTS rdo_equipamentos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      rdo_id    INTEGER NOT NULL,
      nome      TEXT    NOT NULL,
      quantidade REAL   NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
    )
  `);
  console.log('[migrate_add_rdo_equipamentos] tabela rdo_equipamentos criada/verificada.');

  // 2. Migrar dados do campo JSON equipamentos da tabela rdos
  const rdos = await all(`SELECT id, equipamentos FROM rdos WHERE equipamentos IS NOT NULL AND equipamentos <> '' AND equipamentos <> '[]'`);
  let migrados = 0;
  let erros = 0;
  for (const rdo of rdos) {
    try {
      const lista = JSON.parse(rdo.equipamentos);
      if (!Array.isArray(lista) || lista.length === 0) continue;
      for (const item of lista) {
        const nome = (item.nome || item.descricao || String(item)).trim();
        const qtd = Number(item.quantidade || item.qtd || 1);
        if (!nome) continue;
        // Verificar se já foi migrado
        const existe = await all(
          `SELECT id FROM rdo_equipamentos WHERE rdo_id = ? AND LOWER(TRIM(nome)) = LOWER(TRIM(?))`,
          [rdo.id, nome]
        );
        if (existe.length === 0) {
          await run(
            `INSERT INTO rdo_equipamentos (rdo_id, nome, quantidade) VALUES (?, ?, ?)`,
            [rdo.id, nome, isFinite(qtd) ? qtd : 1]
          );
          migrados++;
        }
      }
    } catch (e) {
      console.warn(`[migrate_add_rdo_equipamentos] erro ao migrar rdo ${rdo.id}:`, e.message);
      erros++;
    }
  }

  console.log(`[migrate_add_rdo_equipamentos] migração concluída. Itens migrados: ${migrados}, erros: ${erros}`);
  db.close();
}

migrate().catch((err) => {
  console.error('[migrate_add_rdo_equipamentos] falha fatal:', err);
  db.close();
  process.exit(1);
});
