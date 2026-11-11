module.exports = {
  id: '000030_mapa_suprimentos_compras',
  description: 'Vincula necessidades planejadas a itens de requisição existentes',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS mapa_suprimentos_requisicoes (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      necessidade_id BIGINT NOT NULL REFERENCES mapa_suprimentos(id),
      requisicao_item_id BIGINT REFERENCES requisicao_itens(id) ON DELETE SET NULL,
      requisicao_item_original_id BIGINT NOT NULL,
      quantidade NUMERIC(18,4) NOT NULL CHECK (quantidade > 0),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_mapa_compra_necessidade ON mapa_suprimentos_requisicoes (tenant_id, necessidade_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_mapa_compra_item ON mapa_suprimentos_requisicoes (tenant_id, requisicao_item_id)');
    await run('ALTER TABLE mapa_suprimentos_requisicoes ENABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE mapa_suprimentos_requisicoes FORCE ROW LEVEL SECURITY');
    await run(`CREATE POLICY mapa_suprimentos_requisicoes_tenant_isolation ON mapa_suprimentos_requisicoes
      USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
      WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
  }
};
