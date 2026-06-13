const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');

const dbPath = path.join(process.env.DB_DIR || path.join(__dirname, '..', 'database'), 'gestao_obras.db');
const dbDir = path.dirname(dbPath);
const tenantDbDir = path.join(dbDir, 'tenants');
const isProduction = process.env.NODE_ENV === 'production';

const assertReadableFile = (targetPath, label) => {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} ausente em producao: ${targetPath}`);
  }

  const stats = fs.statSync(targetPath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`${label} invalido em producao: ${targetPath}`);
  }
};

if (isProduction) {
  if (!fs.existsSync(dbDir)) throw new Error(`Diretorio de banco ausente em producao: ${dbDir}`);
  if (!fs.existsSync(tenantDbDir)) throw new Error(`Diretorio de tenants ausente em producao: ${tenantDbDir}`);
  assertReadableFile(dbPath, 'Banco principal');
} else {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(tenantDbDir)) fs.mkdirSync(tenantDbDir, { recursive: true });
}

const requestDbContext = new AsyncLocalStorage();
const tenantDbMap = new Map();

const createConnection = (targetPath) => new Promise((resolve, reject) => {
  const conn = new sqlite3.Database(targetPath, (err) => {
    if (err) reject(err);
    else resolve(conn);
  });
});

const mainDb = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados principal:', err);
  } else {
    console.log('Conectado ao banco de dados SQLite (principal)');
  }
});

const isSchemaMutation = (sql) => /^\s*(CREATE|ALTER|DROP)\b/i.test(String(sql || ''));

const withDbRun = (conn, sql, params = []) => new Promise((resolve, reject) => {
  if (isProduction && process.env.DISABLE_STARTUP_SCHEMA_MUTATIONS === 'true' && isSchemaMutation(sql)) {
    reject(new Error('Mutacao automatica de schema bloqueada em producao.'));
    return;
  }

  conn.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const withDbGet = (conn, sql, params = []) => new Promise((resolve, reject) => {
  conn.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const withDbAll = (conn, sql, params = []) => new Promise((resolve, reject) => {
  conn.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const listTableNames = async (conn) => {
  const tables = await withDbAll(
    conn,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  return tables.map((r) => r.name);
};

const tableHasColumn = async (conn, table, columnName) => {
  const cols = await withDbAll(conn, `PRAGMA table_info(${table})`);
  return cols.some((c) => String(c.name) === columnName);
};

const deleteByFkSet = async (conn, table, fkColumn, allowedIds) => {
  if (allowedIds.length === 0) {
    await withDbRun(conn, `DELETE FROM ${table}`);
    return;
  }
  const placeholders = allowedIds.map(() => '?').join(',');
  await withDbRun(conn, `DELETE FROM ${table} WHERE ${fkColumn} NOT IN (${placeholders})`, allowedIds);
};

const pruneTenantData = async (conn, tenantId) => {
  const tables = await listTableNames(conn);

  for (const table of tables) {
    if (await tableHasColumn(conn, table, 'tenant_id')) {
      await withDbRun(conn, `DELETE FROM ${table} WHERE tenant_id IS NOT NULL AND tenant_id != ?`, [tenantId]);
    }
  }

  const projetoIds = (await withDbAll(conn, 'SELECT id FROM projetos')).map((r) => Number(r.id)).filter(Boolean);
  const rdoIds = (await withDbAll(conn, 'SELECT id FROM rdos')).map((r) => Number(r.id)).filter(Boolean);
  const rncIds = (await withDbAll(conn, 'SELECT id FROM rnc')).map((r) => Number(r.id)).filter(Boolean);
  const atividadeIds = (await withDbAll(conn, 'SELECT id FROM atividades_eap')).map((r) => Number(r.id)).filter(Boolean);

  for (const table of tables) {
    if (table !== 'projetos' && await tableHasColumn(conn, table, 'projeto_id')) {
      await deleteByFkSet(conn, table, 'projeto_id', projetoIds);
    }
    if (table !== 'rdos' && await tableHasColumn(conn, table, 'rdo_id')) {
      await deleteByFkSet(conn, table, 'rdo_id', rdoIds);
    }
    if (table !== 'rnc' && await tableHasColumn(conn, table, 'rnc_id')) {
      await deleteByFkSet(conn, table, 'rnc_id', rncIds);
    }
    if (table !== 'atividades_eap' && await tableHasColumn(conn, table, 'atividade_eap_id')) {
      await deleteByFkSet(conn, table, 'atividade_eap_id', atividadeIds);
    }
  }
};

const getTenantDbPath = (tenantId) => path.join(tenantDbDir, `tenant_${tenantId}.db`);

const ensureTenantDatabase = async (tenantId) => {
  const numericTenantId = Number(tenantId);
  if (!Number.isInteger(numericTenantId) || numericTenantId <= 0) {
    throw new Error('tenant_id inválido para provisionamento de banco.');
  }

  const tenantPath = getTenantDbPath(numericTenantId);
  // Detectar banco stale (ex: arquivo de dev em produção): compara criado_em do tenant no banco principal
  if (fs.existsSync(tenantPath)) {
    try {
      const mainTenant = await withDbGet(mainDb, 'SELECT criado_em FROM tenants WHERE id = ?', [numericTenantId]);
      if (mainTenant && mainTenant.criado_em) {
        const testConn = await createConnection(tenantPath);
        const fileRecord = await withDbGet(testConn, 'SELECT criado_em FROM tenants WHERE id = ?', [numericTenantId]).catch(() => null);
        await new Promise((r) => testConn.close(() => r()));
        if (!fileRecord || fileRecord.criado_em !== mainTenant.criado_em) {
          throw new Error(`Banco tenant ${numericTenantId} divergente do banco principal.`);
        }
      }
    } catch (err) {
      throw err;
    }
  }

  if (!fs.existsSync(tenantPath)) {
    throw new Error(`Banco tenant ${numericTenantId} ausente: ${tenantPath}`);
  }

  return tenantPath;
};

const getTenantDbConnection = async (tenantId) => {
  const numericTenantId = Number(tenantId);
  if (!Number.isInteger(numericTenantId) || numericTenantId <= 0) {
    return mainDb;
  }

  await ensureTenantDatabase(numericTenantId);

  if (tenantDbMap.has(numericTenantId)) {
    return tenantDbMap.get(numericTenantId);
  }

  const tenantPath = getTenantDbPath(numericTenantId);
  const conn = await createConnection(tenantPath);
  tenantDbMap.set(numericTenantId, conn);
  return conn;
};

const runWithTenantContext = (tenantId, fn) => {
  return requestDbContext.run({ tenantId: Number(tenantId), useTenantDb: true }, fn);
};

const getActiveConnection = async () => {
  const ctx = requestDbContext.getStore();
  if (!ctx || !ctx.useTenantDb || !ctx.tenantId) return mainDb;
  return getTenantDbConnection(ctx.tenantId);
};

const runQuery = async (sql, params = []) => {
  const conn = await getActiveConnection();
  return withDbRun(conn, sql, params);
};

const getQuery = async (sql, params = []) => {
  const conn = await getActiveConnection();
  return withDbGet(conn, sql, params);
};

const allQuery = async (sql, params = []) => {
  const conn = await getActiveConnection();
  return withDbAll(conn, sql, params);
};

const runQueryMain = (sql, params = []) => withDbRun(mainDb, sql, params);
const getQueryMain = (sql, params = []) => withDbGet(mainDb, sql, params);
const allQueryMain = (sql, params = []) => withDbAll(mainDb, sql, params);

module.exports = {
  db: mainDb,
  runQuery,
  getQuery,
  allQuery,
  runQueryMain,
  getQueryMain,
  allQueryMain,
  runWithTenantContext,
  ensureTenantDatabase
};
