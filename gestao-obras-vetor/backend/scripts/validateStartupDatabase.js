const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'database', 'gestao_obras.db');
const tenantDbDir = path.join(__dirname, '..', 'database', 'tenants');

const requiredMainTables = [
  'usuarios',
  'tenants',
  'usuario_tenants',
  'projetos',
  'projeto_usuarios'
];

const requiredTenantTables = [
  'usuarios',
  'tenants',
  'projetos',
  'projeto_usuarios',
  'rdos',
  'atividades_eap',
  'rnc',
  'anexos'
];

const fail = (message) => {
  throw new Error(`[startup-db-guard] ${message}`);
};

const assertExistingFile = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    fail(`${label} ausente: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    fail(`${label} nao e arquivo regular: ${filePath}`);
  }

  if (stats.size <= 0) {
    fail(`${label} vazio: ${filePath}`);
  }

  return stats;
};

const openReadOnly = (filePath) => new Promise((resolve, reject) => {
  const conn = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
    if (err) reject(err);
    else resolve(conn);
  });
});

const closeDb = (conn) => new Promise((resolve, reject) => {
  conn.close((err) => {
    if (err) reject(err);
    else resolve();
  });
});

const get = (conn, sql, params = []) => new Promise((resolve, reject) => {
  conn.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const all = (conn, sql, params = []) => new Promise((resolve, reject) => {
  conn.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const tableExists = async (conn, tableName) => {
  const row = await get(
    conn,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return Boolean(row);
};

const countRows = async (conn, tableName) => {
  if (!(await tableExists(conn, tableName))) return 0;
  const row = await get(conn, `SELECT COUNT(*) AS total FROM ${tableName}`);
  return Number(row?.total || 0);
};

const assertRequiredTables = async (conn, requiredTables, label) => {
  const missing = [];

  for (const table of requiredTables) {
    if (!(await tableExists(conn, table))) missing.push(table);
  }

  if (missing.length > 0) {
    fail(`${label} sem tabelas obrigatorias: ${missing.join(', ')}`);
  }
};

const assertMainDatabase = async () => {
  const stats = assertExistingFile(dbPath, 'Banco principal');
  const conn = await openReadOnly(dbPath);

  try {
    await assertRequiredTables(conn, requiredMainTables, 'Banco principal');

    const usuarios = await countRows(conn, 'usuarios');
    const tenants = await countRows(conn, 'tenants');
    const projetos = await countRows(conn, 'projetos');
    const rdos = await countRows(conn, 'rdos');
    const eap = await countRows(conn, 'atividades_eap');
    const rnc = await countRows(conn, 'rnc');
    const anexos = await countRows(conn, 'anexos');

    if (usuarios <= 0) fail('Banco principal sem usuarios.');
    if (tenants <= 0) fail('Banco principal sem tenants.');

    const operationalRows = projetos + rdos + eap + rnc + anexos;
    if (operationalRows <= 0) {
      fail('Banco principal sem dados operacionais; possivel banco recem-criado.');
    }

    const activeTenants = await all(
      conn,
      'SELECT id, nome, criado_em FROM tenants WHERE COALESCE(ativo, 1) = 1 ORDER BY id'
    );

    if (activeTenants.length <= 0) fail('Banco principal sem tenants ativos.');

    console.log(
      `[startup-db-guard] Banco principal OK: ${dbPath} (${stats.size} bytes), usuarios=${usuarios}, tenants=${tenants}, projetos=${projetos}, rdos=${rdos}, eap=${eap}, rnc=${rnc}, anexos=${anexos}`
    );

    return activeTenants;
  } finally {
    await closeDb(conn);
  }
};

const assertTenantDatabase = async (tenant) => {
  const tenantId = Number(tenant.id);
  const tenantPath = path.join(tenantDbDir, `tenant_${tenantId}.db`);
  const stats = assertExistingFile(tenantPath, `Banco tenant ${tenantId}`);
  const conn = await openReadOnly(tenantPath);

  try {
    await assertRequiredTables(conn, requiredTenantTables, `Banco tenant ${tenantId}`);

    const tenantRow = await get(conn, 'SELECT id, criado_em FROM tenants WHERE id = ?', [tenantId]);
    if (!tenantRow) {
      fail(`Banco tenant ${tenantId} nao contem metadados do tenant correspondente.`);
    }

    if (tenant.criado_em && tenantRow.criado_em && tenant.criado_em !== tenantRow.criado_em) {
      fail(`Banco tenant ${tenantId} com metadados divergentes do banco principal.`);
    }

    const projetos = await countRows(conn, 'projetos');
    const rdos = await countRows(conn, 'rdos');
    const eap = await countRows(conn, 'atividades_eap');
    const rnc = await countRows(conn, 'rnc');
    const anexos = await countRows(conn, 'anexos');

    const operationalRows = projetos + rdos + eap + rnc + anexos;
    if (operationalRows <= 0) {
      fail(`Banco tenant ${tenantId} sem dados operacionais; possivel banco recem-criado.`);
    }

    console.log(
      `[startup-db-guard] Banco tenant ${tenantId} OK: ${tenantPath} (${stats.size} bytes), projetos=${projetos}, rdos=${rdos}, eap=${eap}, rnc=${rnc}, anexos=${anexos}`
    );
  } finally {
    await closeDb(conn);
  }
};

const main = async () => {
  const activeTenants = await assertMainDatabase();

  if (!fs.existsSync(tenantDbDir)) {
    fail(`Diretorio de tenants ausente: ${tenantDbDir}`);
  }

  for (const tenant of activeTenants) {
    await assertTenantDatabase(tenant);
  }

  console.log('[startup-db-guard] Validacao somente-leitura concluida.');
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}

module.exports = { main };
