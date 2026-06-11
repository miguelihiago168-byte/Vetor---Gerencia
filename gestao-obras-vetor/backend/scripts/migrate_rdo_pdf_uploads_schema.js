/**
 * Migration: metadados para PDF do RDO, fotos, anexos e materiais.
 */
const path = require('path');
const Database = require('sqlite3').Database;

const dbPath = path.join(__dirname, '..', 'database', 'gestao_obras.db');
const db = new Database(dbPath);

const run = (sql) =>
  new Promise((resolve, reject) => {
    db.run(sql, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const addColumn = async (table, columnSql) => {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
    console.log(`[migrate_rdo_pdf_uploads_schema] coluna criada: ${table}.${columnSql}`);
  } catch (err) {
    if (!String(err?.message || '').toLowerCase().includes('duplicate column')) throw err;
  }
};

async function migrate() {
  console.log('[migrate_rdo_pdf_uploads_schema] iniciando...');

  await run(`
    CREATE TABLE IF NOT EXISTS rdo_fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rdo_id INTEGER NOT NULL,
      rdo_atividade_id INTEGER,
      nome_arquivo TEXT NOT NULL,
      caminho_arquivo TEXT NOT NULL,
      descricao TEXT,
      criado_por INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS rdo_materiais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rdo_id INTEGER NOT NULL,
      nome_material TEXT NOT NULL,
      quantidade REAL,
      unidade TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS rdo_equipamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rdo_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
    )
  `);

  await addColumn('anexos', 'descricao TEXT');
  await addColumn('anexos', 'criado_por INTEGER');

  await addColumn('rdo_fotos', 'tipo TEXT');
  await addColumn('rdo_fotos', 'tamanho INTEGER');
  await addColumn('rdo_fotos', 'largura INTEGER');
  await addColumn('rdo_fotos', 'altura INTEGER');

  await addColumn('rdo_materiais', "tipo_movimento TEXT DEFAULT 'recebido'");

  await addColumn('rdo_equipamentos', 'horario_utilizacao TEXT');
  await addColumn('rdo_equipamentos', 'horas_utilizadas REAL');
  await addColumn('rdo_equipamentos', 'observacao TEXT');

  console.log('[migrate_rdo_pdf_uploads_schema] concluida.');
}

migrate()
  .catch((err) => {
    console.error('[migrate_rdo_pdf_uploads_schema] falha fatal:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
