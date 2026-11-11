module.exports = {
  id: '000029_mapa_suprimentos',
  description: 'Adiciona planejamento de suprimentos associado a atividades da EAP',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS mapa_suprimentos (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      projeto_id BIGINT REFERENCES projetos(id) ON DELETE SET NULL,
      atividade_id BIGINT REFERENCES atividades_eap(id) ON DELETE SET NULL,
      projeto_original_id BIGINT NOT NULL,
      atividade_original_id BIGINT NOT NULL,
      atividade_codigo TEXT NOT NULL,
      atividade_descricao TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('material', 'insumo', 'equipamento')),
      insumo_id BIGINT REFERENCES estoque_insumos(id) ON DELETE SET NULL,
      descricao TEXT NOT NULL,
      unidade TEXT NOT NULL,
      quantidade NUMERIC(18,4) NOT NULL CHECK (quantidade > 0),
      custo_unitario NUMERIC(18,4) CHECK (custo_unitario >= 0),
      data_necessidade DATE,
      prazo_dias INTEGER CHECK (prazo_dias >= 0),
      data_solicitacao DATE,
      data_entrega_prevista DATE,
      equipamento_inicio DATE,
      equipamento_fim DATE,
      equipamento_origem TEXT CHECK (equipamento_origem IN ('proprio', 'alugado', 'a_contratar')),
      observacoes TEXT,
      criado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      removido_em TIMESTAMPTZ
    )`);
    await run('CREATE INDEX IF NOT EXISTS idx_mapa_suprimentos_projeto ON mapa_suprimentos (tenant_id, projeto_id, atividade_id) WHERE removido_em IS NULL');
    await run('ALTER TABLE mapa_suprimentos ENABLE ROW LEVEL SECURITY');
    await run('ALTER TABLE mapa_suprimentos FORCE ROW LEVEL SECURITY');
    await run(`CREATE POLICY mapa_suprimentos_tenant_isolation ON mapa_suprimentos
      USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
      WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
  }
};
