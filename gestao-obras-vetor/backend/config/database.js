const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

// PostgreSQL DATE representa somente um dia do calendário. Deixá-lo chegar
// como Date faz o Node serializar meia-noite em UTC e pode exibir o dia
// anterior no navegador. Preserve-o sempre como YYYY-MM-DD.
types.setTypeParser(1082, (value) => value);

const resolvedDbName = process.env.DB_NAME || process.env.POSTGRES_DB;
if (!resolvedDbName) throw new Error('DB_NAME (ou POSTGRES_DB) deve ser definido no ambiente.');

// The application role must not own application tables nor have BYPASSRLS.
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

pool.on('error', (err) => console.error('PostgreSQL pool error:', err));

// Only transports verified request context. It no longer selects a tenant schema.
const requestDbContext = new AsyncLocalStorage();

const translateQuery = (sql) => {
  let normalizedSql = String(sql || '');
  const hadInsertOrIgnore = /\bINSERT\s+OR\s+IGNORE\b/i.test(normalizedSql);
  normalizedSql = normalizedSql
    .replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, 'BIGSERIAL PRIMARY KEY')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ')
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO')
    .replace(
      /SELECT\s+name\s+FROM\s+postgres_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*(\?|\"[^\"]+\"|'[^']+')/gi,
      "SELECT table_name AS name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_name = $1"
    )
    .replace(
      /PRAGMA\s+table_info\s*\(\s*\"?([a-zA-Z0-9_]+)\"?\s*\)\s*;?/gi,
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = '$1'"
    );
  if (hadInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(normalizedSql)) {
    normalizedSql = `${normalizedSql.replace(/;\s*$/, '')} ON CONFLICT DO NOTHING`;
  }
  let idx = 0;
  return normalizedSql.replace(/\?/g, () => `$${++idx}`);
};

const isInsert = (sql) => /^\s*INSERT\b/i.test(String(sql));
const normalizeContext = (context = {}) => ({
  userId: Number(context.userId || context.usuarioId || 0) || null,
  tenantId: Number(context.tenantId || 0) || null,
  groupId: Number(context.groupId || context.grupoId || 0) || null,
  role: context.role || context.perfil || null,
});
const getRequestContext = () => normalizeContext(requestDbContext.getStore() || {});

const setRlsContext = async (client, context) => {
  for (const [key, value] of [
    ['app.user_id', context.userId],
    ['app.tenant_id', context.tenantId],
    ['app.group_id', context.groupId],
    ['app.role', context.role],
  ]) {
    await client.query('SELECT set_config($1, $2, true)', [key, value === null ? '' : String(value)]);
  }
};

// Every compatibility query receives a short transaction, so SET LOCAL context
// never leaks to another request through the pool.
const withClient = async (schemaOrFn, maybeFn, explicitContext) => {
  const fn = typeof schemaOrFn === 'function' ? schemaOrFn : maybeFn;
  if (typeof fn !== 'function') throw new Error('withClient requer uma função de execução.');
  const context = normalizeContext(explicitContext || getRequestContext());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setRlsContext(client, context);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const execWithClient = async (client, sql, params = []) => {
  let finalSql = translateQuery(sql);
  const insert = isInsert(finalSql);
  if (insert && !/RETURNING\s+\S/i.test(finalSql)) finalSql = `${finalSql.replace(/;\s*$/, '')} RETURNING id`;
  const result = await client.query(finalSql, params);
  return { lastID: insert && result.rows.length ? Number(result.rows[0].id) : null, changes: result.rowCount };
};
const getWithClient = async (client, sql, params = []) => (await client.query(translateQuery(sql), params)).rows[0] || null;
const allWithClient = async (client, sql, params = []) => (await client.query(translateQuery(sql), params)).rows;

const runQuery = (sql, params = []) => withClient((client) => execWithClient(client, sql, params));
const getQuery = (sql, params = []) => withClient((client) => getWithClient(client, sql, params));
const allQuery = (sql, params = []) => withClient((client) => allWithClient(client, sql, params));

// Kept for callers that operate on identity/provisioning metadata; no schema switch occurs.
const runQueryMain = runQuery;
const getQueryMain = getQuery;
const allQueryMain = allQuery;
const runWithRequestContext = (context, fn) => requestDbContext.run(normalizeContext(context), fn);
const runWithTenantContext = (tenantId, fn, context = {}) => runWithRequestContext({ ...context, tenantId }, fn);

const ensureTenantDatabase = async (tenantId) => {
  const id = Number(tenantId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('tenant_id inválido.');
  const tenant = await getQuery('SELECT id, grupo_id, ativo FROM tenants WHERE id = ?', [id]);
  if (!tenant || Number(tenant.ativo) !== 1) throw new Error('Tenant inválido ou inativo.');
  return tenant;
};

const db = {
  run(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    runQuery(sql, params || []).then((result) => callback && callback.call(result, null)).catch((err) => callback && callback.call({}, err));
  },
  get(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    getQuery(sql, params || []).then((row) => callback && callback(null, row)).catch((err) => callback && callback(err));
  },
  all(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    allQuery(sql, params || []).then((rows) => callback && callback(null, rows)).catch((err) => callback && callback(err));
  },
};

const listTableNames = async () => (await allQuery("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")).map((row) => row.name);
const tableHasColumn = async (tableName, columnName) => Boolean(await getQuery(
  "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?",
  [tableName, columnName]
));

module.exports = {
  pool, db, runQuery, getQuery, allQuery, runQueryMain, getQueryMain, allQueryMain,
  runWithRequestContext, runWithTenantContext, ensureTenantDatabase, withClient,
  execWithClient, getWithClient, allWithClient, translateQuery, listTableNames,
  tableHasColumn, getRequestContext,
};
