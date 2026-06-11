const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbDir = path.join(__dirname, '..', 'database');
const mainDbPath = path.join(dbDir, 'gestao_obras.db');
const tenantsDir = path.join(dbDir, 'tenants');

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

const openDb = (dbPath) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) reject(err);
    else resolve(db);
  });
});

const run = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const get = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const exec = (db, sql) => new Promise((resolve, reject) => {
  db.exec(sql, (err) => {
    if (err) reject(err);
    else resolve();
  });
});

const close = (db) => new Promise((resolve) => db.close(() => resolve()));

const numeroConvertExpr = (source = 'numero_rdo') => {
  const value = `TRIM(CAST(${source} AS TEXT))`;
  return `
    CASE
      WHEN ${source} IS NULL OR ${value} = '' THEN NULL
      WHEN ${value} GLOB '*[0-9]' THEN CAST(substr(${value}, length(rtrim(${value}, '0123456789')) + 1) AS INTEGER)
      ELSE NULL
    END
  `;
};

const buildColumnDefinition = (column) => {
  if (column.name === 'id' && Number(column.pk) === 1) {
    return `${quoteIdent(column.name)} INTEGER PRIMARY KEY AUTOINCREMENT`;
  }

  if (column.name === 'numero_rdo') {
    return `${quoteIdent(column.name)} INTEGER`;
  }

  const type = String(column.type || '').trim() || 'TEXT';
  const parts = [`${quoteIdent(column.name)} ${type}`];
  if (Number(column.notnull) === 1) parts.push('NOT NULL');
  if (column.dflt_value !== null && column.dflt_value !== undefined) {
    parts.push(`DEFAULT ${column.dflt_value}`);
  }
  if (Number(column.pk) === 1) parts.push('PRIMARY KEY');
  return parts.join(' ');
};

const shouldRebuildRdos = async (db) => {
  const table = await get(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'rdos'");
  if (!table?.sql) return false;

  const columns = await all(db, 'PRAGMA table_info(rdos)');
  const numero = columns.find((column) => column.name === 'numero_rdo');
  const tableSql = String(table.sql).replace(/\s+/g, ' ').toLowerCase();

  return !numero
    || String(numero.type || '').toUpperCase() !== 'INTEGER'
    || tableSql.includes('numero_rdo text unique')
    || !tableSql.includes('unique(projeto_id, numero_rdo)');
};

const migrateDatabase = async (dbPath) => {
  if (!fs.existsSync(dbPath)) return { dbPath, migrated: false, skipped: true };

  const db = await openDb(dbPath);
  try {
    const shouldRebuild = await shouldRebuildRdos(db);
    if (!shouldRebuild) {
      await run(db, 'DROP INDEX IF EXISTS idx_rdos_tenant_projeto_numero');
      return { dbPath, migrated: false, skipped: false };
    }

    let columns = await all(db, 'PRAGMA table_info(rdos)');
    if (!columns.some((column) => column.name === 'numero_rdo')) {
      await run(db, 'ALTER TABLE rdos ADD COLUMN numero_rdo INTEGER');
      columns = await all(db, 'PRAGMA table_info(rdos)');
    }

    const indexes = await all(
      db,
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'rdos' AND sql IS NOT NULL"
    );
    const triggers = await all(
      db,
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'rdos' AND sql IS NOT NULL"
    );

    const duplicateRows = await all(db, `
      SELECT projeto_id, numero_convertido, COUNT(*) AS total
      FROM (
        SELECT projeto_id, ${numeroConvertExpr('numero_rdo')} AS numero_convertido
        FROM rdos
      )
      WHERE numero_convertido IS NOT NULL
      GROUP BY projeto_id, numero_convertido
      HAVING COUNT(*) > 1
    `);
    const useRowNumber = duplicateRows.length > 0;

    const columnDefs = columns.map(buildColumnDefinition);
    const hasColumn = (name) => columns.some((column) => column.name === name);
    if (hasColumn('projeto_id')) {
      columnDefs.push('FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE');
    }
    if (hasColumn('criado_por')) {
      columnDefs.push('FOREIGN KEY (criado_por) REFERENCES usuarios(id)');
    }
    if (hasColumn('aprovado_por')) {
      columnDefs.push('FOREIGN KEY (aprovado_por) REFERENCES usuarios(id)');
    }
    if (hasColumn('projeto_id') && hasColumn('data_relatorio')) {
      columnDefs.push('UNIQUE(projeto_id, data_relatorio)');
    }
    if (hasColumn('projeto_id')) {
      columnDefs.push('UNIQUE(projeto_id, numero_rdo)');
    }

    const columnNames = columns.map((column) => quoteIdent(column.name)).join(', ');
    const selectColumns = columns.map((column) => {
      if (column.name !== 'numero_rdo') return quoteIdent(column.name);
      if (useRowNumber) {
        return 'ROW_NUMBER() OVER (PARTITION BY projeto_id ORDER BY data_relatorio, id)';
      }
      return numeroConvertExpr('numero_rdo');
    }).join(', ');

    await exec(db, 'PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
    try {
      for (const trigger of triggers) {
        await run(db, `DROP TRIGGER IF EXISTS ${quoteIdent(trigger.name)}`);
      }

      await run(db, 'ALTER TABLE rdos RENAME TO rdos_old');
      await run(db, `CREATE TABLE rdos (${columnDefs.join(', ')})`);
      await run(db, `INSERT INTO rdos (${columnNames}) SELECT ${selectColumns} FROM rdos_old`);
      await run(db, 'DROP TABLE rdos_old');

      for (const index of indexes) {
        const sql = String(index.sql || '');
        const lowerSql = sql.toLowerCase();
        if (lowerSql.includes('numero_rdo') && lowerSql.includes('unique')) continue;
        await run(db, sql);
      }

      for (const trigger of triggers) {
        await run(db, trigger.sql);
      }

      await exec(db, 'COMMIT; PRAGMA foreign_keys = ON;');
    } catch (err) {
      await exec(db, 'ROLLBACK; PRAGMA foreign_keys = ON;').catch(() => {});
      throw err;
    }

    return { dbPath, migrated: true, skipped: false, renumbered: useRowNumber };
  } finally {
    await close(db);
  }
};

const listDatabasePaths = () => {
  const paths = [mainDbPath];
  if (fs.existsSync(tenantsDir)) {
    for (const entry of fs.readdirSync(tenantsDir)) {
      if (entry.toLowerCase().endsWith('.db')) paths.push(path.join(tenantsDir, entry));
    }
  }
  return paths;
};

const migrateRdoNumeroPorProjeto = async () => {
  const results = [];
  for (const dbPath of listDatabasePaths()) {
    const result = await migrateDatabase(dbPath);
    results.push(result);
    const label = path.relative(dbDir, dbPath) || path.basename(dbPath);
    const status = result.migrated ? 'migrado' : 'ok';
    const suffix = result.renumbered ? ' (renumerado por projeto por duplicidade legada)' : '';
    console.log(`[migrate_rdo_numero_por_projeto] ${label}: ${status}${suffix}`);
  }
  return results;
};

if (require.main === module) {
  migrateRdoNumeroPorProjeto()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate_rdo_numero_por_projeto] erro:', err);
      process.exit(1);
    });
}

module.exports = {
  migrateRdoNumeroPorProjeto,
  migrateDatabase
};
