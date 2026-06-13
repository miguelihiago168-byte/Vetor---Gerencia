const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const databaseDir = process.env.DB_DIR || path.join(__dirname, '..', 'database');
const mainDbPath = path.join(databaseDir, 'gestao_obras.db');
const tenantDbDir = path.join(databaseDir, 'tenants');

const openReadonly = (filePath) => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
    if (err) reject(err);
    else resolve(db);
  });
});

const closeDb = (db) => new Promise((resolve, reject) => {
  db.close((err) => {
    if (err) reject(err);
    else resolve();
  });
});

const all = (db, sql) => new Promise((resolve, reject) => {
  db.all(sql, [], (err, rows) => {
    if (err) reject(err);
    else resolve(rows || []);
  });
});

const listTargets = () => {
  const targets = [{ name: 'main', filePath: mainDbPath }];

  if (fs.existsSync(tenantDbDir)) {
    const tenantFiles = fs.readdirSync(tenantDbDir)
      .filter((fileName) => /^tenant_\d+\.db$/.test(fileName))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const fileName of tenantFiles) {
      targets.push({
        name: fileName.replace(/\.db$/, ''),
        filePath: path.join(tenantDbDir, fileName)
      });
    }
  }

  return targets;
};

const checkTarget = async (target) => {
  if (!fs.existsSync(target.filePath)) {
    throw new Error(`Banco ausente para ${target.name}: ${target.filePath}`);
  }

  const db = await openReadonly(target.filePath);
  try {
    const integrity = await all(db, 'PRAGMA integrity_check');
    const integrityOk = integrity.length === 1 && integrity[0].integrity_check === 'ok';
    console.log(`[db:integrity] ${target.name}: integrity_check=${JSON.stringify(integrity)}`);
    if (!integrityOk) throw new Error(`integrity_check falhou para ${target.name}`);

    const foreignKeys = await all(db, 'PRAGMA foreign_key_check');
    console.log(`[db:integrity] ${target.name}: foreign_key_check=${JSON.stringify(foreignKeys)}`);
    if (foreignKeys.length > 0) throw new Error(`foreign_key_check falhou para ${target.name}`);
  } finally {
    await closeDb(db);
  }
};

const main = async () => {
  for (const target of listTargets()) {
    await checkTarget(target);
  }
};

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
