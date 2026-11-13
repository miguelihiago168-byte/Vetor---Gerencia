module.exports = {
  id: '000032_relatorio_semanal',
  description: 'Armazena retratos dos relatórios semanais por obra',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS relatorios_semanais (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      projeto_id BIGINT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
      inicio DATE NOT NULL, fim DATE NOT NULL, conteudo JSONB NOT NULL,
      criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (fim >= inicio AND fim <= inicio + 6)
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_relatorio_semanal_projeto ON relatorios_semanais (tenant_id, projeto_id, inicio DESC)');
    await run('ALTER TABLE relatorios_semanais ENABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE relatorios_semanais FORCE ROW LEVEL SECURITY');
    await run(`CREATE POLICY relatorios_semanais_tenant_isolation ON relatorios_semanais
      USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
      WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
  }
};
