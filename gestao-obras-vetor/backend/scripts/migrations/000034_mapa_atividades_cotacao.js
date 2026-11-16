module.exports = {
  id: '000034_mapa_atividades_cotacao',
  description: 'Seleciona atividades do mapa e registra previsão de entrega da cotação',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS mapa_suprimentos_atividades (
      tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      projeto_id BIGINT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
      atividade_id BIGINT NOT NULL REFERENCES atividades_eap(id) ON DELETE CASCADE,
      PRIMARY KEY (tenant_id, projeto_id, atividade_id)
    )`);
    await run(`INSERT INTO mapa_suprimentos_atividades (tenant_id, projeto_id, atividade_id)
      SELECT DISTINCT m.tenant_id, m.projeto_id, m.atividade_id FROM mapa_suprimentos m
      JOIN atividades_eap a ON a.id=m.atividade_id AND a.projeto_id=m.projeto_id AND a.tenant_id=m.tenant_id
      WHERE m.removido_em IS NULL AND NOT EXISTS (SELECT 1 FROM atividades_eap c WHERE c.pai_id=a.id AND c.projeto_id=a.projeto_id AND c.tenant_id=a.tenant_id)
      ON CONFLICT DO NOTHING`);
    await run('ALTER TABLE mapa_suprimentos_atividades ENABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE mapa_suprimentos_atividades FORCE ROW LEVEL SECURITY');
    await run(`CREATE POLICY mapa_suprimentos_atividades_tenant_isolation ON mapa_suprimentos_atividades
      USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
      WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS data_entrega_prevista DATE');
  }
};
