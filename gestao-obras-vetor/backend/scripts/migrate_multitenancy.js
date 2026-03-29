const { runQuery, getQuery } = require('../config/database');

async function ensureMultitenancySchema() {
  // Entidade de tenant (empresa)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      slug TEXT UNIQUE,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Vínculo N:N entre usuário e tenant
  await runQuery(`
    CREATE TABLE IF NOT EXISTS usuario_tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(usuario_id, tenant_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // Convites para cadastro restrito por token
  await runQuery(`
    CREATE TABLE IF NOT EXISTS convites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      tenant_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      nome TEXT,
      perfil TEXT,
      setor TEXT,
      setor_outro TEXT,
      expira_em DATETIME NOT NULL,
      usado INTEGER DEFAULT 0,
      usado_em DATETIME,
      usuario_id INTEGER,
      criado_por INTEGER NOT NULL,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (criado_por) REFERENCES usuarios(id)
    )
  `);

  // Colunas de tenant nos domínios críticos
  try { await runQuery('ALTER TABLE usuarios ADD COLUMN tenant_id INTEGER'); } catch (_) {}
  try { await runQuery('ALTER TABLE projetos ADD COLUMN tenant_id INTEGER'); } catch (_) {}
  try { await runQuery('ALTER TABLE atividades_eap ADD COLUMN tenant_id INTEGER'); } catch (_) {}
  try { await runQuery('ALTER TABLE rdos ADD COLUMN tenant_id INTEGER'); } catch (_) {}
  try { await runQuery('ALTER TABLE rnc ADD COLUMN tenant_id INTEGER'); } catch (_) {}
  try { await runQuery('ALTER TABLE auditoria ADD COLUMN tenant_id INTEGER'); } catch (_) {}

  // Tenant padrão para bases legadas
  let tenant = await getQuery('SELECT id FROM tenants ORDER BY id LIMIT 1');
  if (!tenant) {
    const r = await runQuery('INSERT INTO tenants (nome, slug, ativo) VALUES (?, ?, 1)', ['Tenant Padrao', 'tenant-padrao']);
    tenant = { id: r.lastID };
  }

  const defaultTenantId = Number(tenant.id);

  // Backfill
  await runQuery('UPDATE usuarios SET tenant_id = ? WHERE tenant_id IS NULL', [defaultTenantId]);
  await runQuery('UPDATE projetos SET tenant_id = ? WHERE tenant_id IS NULL', [defaultTenantId]);

  await runQuery(`
    UPDATE atividades_eap
    SET tenant_id = (
      SELECT p.tenant_id FROM projetos p WHERE p.id = atividades_eap.projeto_id
    )
    WHERE tenant_id IS NULL
  `);

  await runQuery(`
    UPDATE rdos
    SET tenant_id = (
      SELECT p.tenant_id FROM projetos p WHERE p.id = rdos.projeto_id
    )
    WHERE tenant_id IS NULL
  `);

  await runQuery(`
    UPDATE rnc
    SET tenant_id = (
      SELECT p.tenant_id FROM projetos p WHERE p.id = rnc.projeto_id
    )
    WHERE tenant_id IS NULL
  `);

  await runQuery('INSERT OR IGNORE INTO usuario_tenants (usuario_id, tenant_id, ativo) SELECT id, tenant_id, 1 FROM usuarios WHERE tenant_id IS NOT NULL');
  await runQuery(`
    INSERT OR IGNORE INTO usuario_tenants (usuario_id, tenant_id, ativo)
    SELECT DISTINCT pu.usuario_id, p.tenant_id, 1
    FROM projeto_usuarios pu
    INNER JOIN projetos p ON p.id = pu.projeto_id
    WHERE p.tenant_id IS NOT NULL
  `);

  // Índices de desempenho e unicidade solicitada
  await runQuery('CREATE INDEX IF NOT EXISTS idx_projetos_tenant ON projetos(tenant_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_rdos_tenant ON rdos(tenant_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_rnc_tenant ON rnc(tenant_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_eap_tenant ON atividades_eap(tenant_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_usuario_tenants_user ON usuario_tenants(usuario_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_usuario_tenants_tenant ON usuario_tenants(tenant_id)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_convites_token ON convites(token)');
  await runQuery('CREATE INDEX IF NOT EXISTS idx_convites_tenant ON convites(tenant_id)');
  await runQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_rdos_tenant_projeto_numero ON rdos(tenant_id, projeto_id, numero_rdo) WHERE numero_rdo IS NOT NULL');
}

if (require.main === module) {
  ensureMultitenancySchema()
    .then(() => {
      console.log('Multitenancy schema OK');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Falha ao garantir schema multitenancy:', err?.message || err);
      process.exit(1);
    });
}

module.exports = { ensureMultitenancySchema };
