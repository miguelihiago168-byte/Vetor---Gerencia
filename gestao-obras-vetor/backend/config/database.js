const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

const resolvedDbName = process.env.DB_NAME || process.env.POSTGRES_DB;
if (!resolvedDbName) {
  throw new Error('DB_NAME (ou POSTGRES_DB) deve ser definido no ambiente.');
}

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: resolvedDbName,
  user: process.env.DB_USER || 'gestao_user',
  password: process.env.DB_PASSWORD || '',
  max: Number(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT) || 5000,
});

pool.on('connect', () => {
  console.log('PostgreSQL: nova conexão estabelecida');
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

// ---------------------------------------------------------------------------
// Tenant context (AsyncLocalStorage)
// ---------------------------------------------------------------------------
const requestDbContext = new AsyncLocalStorage();

// ---------------------------------------------------------------------------
// Query translation helpers
// ---------------------------------------------------------------------------

/**
 * Translate SQLite-style ? placeholders to PostgreSQL $1, $2, ...
 * Also rewrites AUTOINCREMENT → handled at DDL level.
 */
const translateQuery = (sql) => {
  let normalizedSql = String(sql || '');
  const hadInsertOrIgnore = /\bINSERT\s+OR\s+IGNORE\b/i.test(normalizedSql);

  // Legacy SQLite compatibility for migration/runtime scripts.
  normalizedSql = normalizedSql
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ')
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO')
    .replace(
      /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*(\?|\"[^\"]+\"|'[^']+')/gi,
      "SELECT table_name AS name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_name = $1"
    )
    .replace(
      /PRAGMA\s+table_info\s*\(\s*"?([a-zA-Z0-9_]+)"?\s*\)\s*;?/gi,
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = '$1'"
    );

  if (hadInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(normalizedSql)) {
    normalizedSql = `${normalizedSql.replace(/;\s*$/, '')} ON CONFLICT DO NOTHING`;
  }

  let idx = 0;
  // Replace ? with $N (skip ?s inside string literals — simplified heuristic covers common cases)
  return normalizedSql.replace(/\?/g, () => `$${++idx}`);
};

/**
 * Detect whether a SQL statement is an INSERT so we can append RETURNING id.
 */
const isInsert = (sql) => /^\s*INSERT\b/i.test(String(sql));

/**
 * Detect whether a SQL statement is an UPDATE/DELETE so we can return rowCount.
 */
const isModification = (sql) => /^\s*(UPDATE|DELETE)\b/i.test(String(sql));

// ---------------------------------------------------------------------------
// Schema helpers (replaces SQLite PRAGMA / sqlite_master)
// ---------------------------------------------------------------------------

/**
 * Return the PostgreSQL schema name for a tenant.
 */
const tenantSchema = (tenantId) => `tenant_${Number(tenantId)}`;

/**
 * Set search_path on a client to direct queries to the right schema.
 * Main context uses 'public'; tenant context uses 'tenant_N, public'.
 */
const setSearchPath = async (client, schema) => {
  await client.query(`SET search_path TO ${schema}`);
};

// ---------------------------------------------------------------------------
// Core execution with a dedicated client (sets search_path per call)
// ---------------------------------------------------------------------------

const withClient = async (schema, fn) => {
  const client = await pool.connect();
  try {
    await setSearchPath(client, schema);
    return await fn(client);
  } finally {
    client.release();
  }
};

/**
 * Execute any SQL (INSERT/UPDATE/DELETE/DDL).
 * Returns { lastID, changes } to preserve compatibility with existing code.
 * For INSERTs, automatically appends RETURNING id if not already present.
 */
const execWithClient = async (client, sql, params = []) => {
  let finalSql = translateQuery(sql);
  const insert = isInsert(finalSql);

  if (insert && !/RETURNING\s+\S/i.test(finalSql)) {
    finalSql = `${finalSql.replace(/;\s*$/, '')} RETURNING id`;
  }

  const result = await client.query(finalSql, params);
  const lastID = insert && result.rows.length > 0 ? Number(result.rows[0].id) : null;
  return { lastID, changes: result.rowCount };
};

const getWithClient = async (client, sql, params = []) => {
  const result = await client.query(translateQuery(sql), params);
  return result.rows[0] || null;
};

const allWithClient = async (client, sql, params = []) => {
  const result = await client.query(translateQuery(sql), params);
  return result.rows;
};

// ---------------------------------------------------------------------------
// Active connection resolution (based on tenant context)
// ---------------------------------------------------------------------------

const getActiveSchema = () => {
  const ctx = requestDbContext.getStore();
  if (!ctx || !ctx.useTenantDb || !ctx.tenantId) return 'public';
  return `${tenantSchema(ctx.tenantId)}, public`;
};

// ---------------------------------------------------------------------------
// Public query API (schema-aware)
// ---------------------------------------------------------------------------

const runQuery = async (sql, params = []) => {
  const schema = getActiveSchema();
  return withClient(schema, (client) => execWithClient(client, sql, params));
};

const getQuery = async (sql, params = []) => {
  const schema = getActiveSchema();
  return withClient(schema, (client) => getWithClient(client, sql, params));
};

const allQuery = async (sql, params = []) => {
  const schema = getActiveSchema();
  return withClient(schema, (client) => allWithClient(client, sql, params));
};

// Main schema (public) only — used for cross-tenant operations
const runQueryMain = (sql, params = []) =>
  withClient('public', (client) => execWithClient(client, sql, params));

const getQueryMain = (sql, params = []) =>
  withClient('public', (client) => getWithClient(client, sql, params));

const allQueryMain = (sql, params = []) =>
  withClient('public', (client) => allWithClient(client, sql, params));

// ---------------------------------------------------------------------------
// Tenant context runner
// ---------------------------------------------------------------------------

const runWithTenantContext = (tenantId, fn) => {
  const numericTenantId = Number(tenantId);
  return requestDbContext.run({ tenantId: numericTenantId, useTenantDb: true }, fn);
};

// ---------------------------------------------------------------------------
// Tenant schema management
// ---------------------------------------------------------------------------

/**
 * Create schema for a tenant if it does not already exist.
 * Copies table structure from the public schema by running the DDL.
 */
const ensureTenantDatabase = async (tenantId) => {
  const numericTenantId = Number(tenantId);
  if (!Number.isInteger(numericTenantId) || numericTenantId <= 0) {
    throw new Error('tenant_id inválido para provisionamento de banco.');
  }

  const schema = tenantSchema(numericTenantId);

  // Check tenant exists in main table
  const tenant = await getQueryMain('SELECT id FROM tenants WHERE id = ?', [numericTenantId]);
  if (!tenant) {
    throw new Error(`Tenant ${numericTenantId} não encontrado.`);
  }

  // Schema existence check
  const exists = await withClient('public', (client) =>
    getWithClient(
      client,
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schema]
    )
  );

  if (!exists) {
    throw new Error(`Schema tenant ${numericTenantId} ausente: ${schema}`);
  }
};

// ---------------------------------------------------------------------------
// Compatibility shim: db object that mimics the old sqlite3 callback API.
// Used by routes/email.js and services/emailService.js which import { db }.
// ---------------------------------------------------------------------------
const db = {
  run(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    const schema = getActiveSchema();
    withClient(schema, (client) => execWithClient(client, sql, params || []))
      .then((result) => callback && callback.call(result, null))
      .catch((err) => callback && callback.call({}, err));
  },
  get(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    const schema = getActiveSchema();
    withClient(schema, (client) => getWithClient(client, sql, params || []))
      .then((row) => callback && callback(null, row))
      .catch((err) => callback && callback(err));
  },
  all(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    const schema = getActiveSchema();
    withClient(schema, (client) => allWithClient(client, sql, params || []))
      .then((rows) => callback && callback(null, rows))
      .catch((err) => callback && callback(err));
  },
};

// ---------------------------------------------------------------------------
// Introspection helpers (replaces SQLite PRAGMA / sqlite_master)
// ---------------------------------------------------------------------------

/**
 * List table names in the current schema context.
 */
const listTableNames = async () => {
  const schema = getActiveSchema().split(',')[0].trim();
  const rows = await withClient('public', (client) =>
    allWithClient(
      client,
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schema]
    )
  );
  return rows.map((r) => r.name);
};

/**
 * Check whether a column exists in a table (replaces PRAGMA table_info).
 */
const tableHasColumn = async (tableName, columnName) => {
  const schema = getActiveSchema().split(',')[0].trim();
  const row = await withClient('public', (client) =>
    getWithClient(
      client,
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
      [schema, tableName, columnName]
    )
  );
  return Boolean(row);
};

module.exports = {
  pool,
  db,
  runQuery,
  getQuery,
  allQuery,
  runQueryMain,
  getQueryMain,
  allQueryMain,
  runWithTenantContext,
  ensureTenantDatabase,
  // Helpers for internal use
  tenantSchema,
  withClient,
  execWithClient,
  getWithClient,
  allWithClient,
  translateQuery,
  listTableNames,
  tableHasColumn,
};
