module.exports = {
  id: '000027_rir',
  description: 'Relatórios de inspeção e recebimento por carga',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS rir_relatorios (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      projeto_id BIGINT NOT NULL REFERENCES projetos(id), dados JSONB NOT NULL DEFAULT '{}'::jsonb,
      criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await run(`CREATE TABLE IF NOT EXISTS rir_itens (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      rir_id BIGINT NOT NULL REFERENCES rir_relatorios(id) ON DELETE CASCADE,
      lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id), codigo TEXT,
      quantidade_prevista NUMERIC(18,4), quantidade_recebida NUMERIC(18,4) NOT NULL,
      resultado TEXT, observacoes TEXT, UNIQUE (rir_id, lote_id), UNIQUE (tenant_id, lote_id)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS rir_anexos (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      rir_id BIGINT NOT NULL REFERENCES rir_relatorios(id) ON DELETE CASCADE,
      caminho TEXT NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL, legenda TEXT,
      criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    for (const table of ['rir_relatorios', 'rir_itens', 'rir_anexos']) {
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table} USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id)) WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }
  }
};
