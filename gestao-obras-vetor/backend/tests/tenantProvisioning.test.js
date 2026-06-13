const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vetor-tenant-test-'));
const dbDir = path.join(tmpRoot, 'database');

process.env.DB_DIR = dbDir;
process.env.NODE_ENV = 'test';

const {
  provisionTrialTenant,
  assertTenantReady,
  getTenantDbPath,
  createTenantDatabaseFromCleanSchema
} = require('../services/tenantProvisioning');

const {
  getQueryMain,
  allQueryMain,
  runWithTenantContext,
  getQuery,
  runQuery
} = require('../config/database');

const unique = () => Math.random().toString(36).slice(2, 10);

const createTrialTenant = async (prefix) => {
  const token = unique();
  return provisionTrialTenant({
    tenantName: `${prefix} ${token}`,
    tenantSlug: `${prefix.toLowerCase()}-${token}`,
    trialExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    login: `${prefix.toLowerCase()}_${token}`,
    passwordHash: '$2a$10$012345678901234567890uJZp4VJYeS9CFYB5f2vQ6H4I3J2K1L0M',
    name: `${prefix} Admin`,
    email: `${prefix.toLowerCase()}_${token}@example.test`
  });
};

const main = async () => {
  execFileSync(process.execPath, ['scripts/initDatabase.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DB_DIR: dbDir, NODE_ENV: 'test' },
    stdio: 'inherit'
  });
  execFileSync(process.execPath, ['scripts/migrate_multitenancy.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DB_DIR: dbDir, NODE_ENV: 'test' },
    stdio: 'inherit'
  });
  execFileSync(process.execPath, ['scripts/runMigrations.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DB_DIR: dbDir, NODE_ENV: 'test' },
    stdio: 'inherit'
  });

  const tenantA = await createTrialTenant('TenantA');
  const tenantB = await createTrialTenant('TenantB');

  assert.ok(fs.existsSync(getTenantDbPath(tenantA.tenantId)), 'tenant A database should exist');
  assert.ok(fs.existsSync(getTenantDbPath(tenantB.tenantId)), 'tenant B database should exist');

  await assertTenantReady(tenantA.tenantId);
  await assertTenantReady(tenantB.tenantId);

  const mainTenants = await allQueryMain('SELECT id, ativo FROM tenants WHERE id IN (?, ?) ORDER BY id', [
    tenantA.tenantId,
    tenantB.tenantId
  ]);
  assert.deepStrictEqual(mainTenants.map((row) => Number(row.ativo)), [1, 1]);

  await runWithTenantContext(tenantA.tenantId, async () => {
    await runQuery(
      `INSERT INTO projetos (nome, empresa_responsavel, empresa_executante, prazo_termino, cidade, criado_por, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['Projeto A', 'Empresa A', 'Empresa A', '2026-12-31', 'Cidade A', tenantA.userId, tenantA.tenantId]
    );
  });

  await runWithTenantContext(tenantB.tenantId, async () => {
    const projectA = await getQuery('SELECT id FROM projetos WHERE nome = ?', ['Projeto A']);
    assert.strictEqual(projectA, undefined, 'tenant B must not see tenant A project');
  });

  const tenantARow = await getQueryMain('SELECT * FROM tenants WHERE id = ?', [tenantA.tenantId]);
  const userARow = await getQueryMain('SELECT * FROM usuarios WHERE id = ?', [tenantA.userId]);
  const linkARow = await getQueryMain('SELECT * FROM usuario_tenants WHERE usuario_id = ? AND tenant_id = ?', [
    tenantA.userId,
    tenantA.tenantId
  ]);

  await assert.rejects(
    () => createTenantDatabaseFromCleanSchema({
      tenantId: tenantA.tenantId,
      tenantRow: tenantARow,
      userRow: userARow,
      userTenantRow: linkARow
    }),
    (err) => err && err.code === 'TENANT_DATABASE_ALREADY_EXISTS'
  );

  console.log(JSON.stringify({
    ok: true,
    dbDir,
    tenantA: tenantA.tenantId,
    tenantB: tenantB.tenantId
  }));
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (_) {}
  });
