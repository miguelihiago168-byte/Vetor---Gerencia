module.exports = {
  id: '000016_rdo_activity_resources',
  description: 'Vincula mao de obra, insumos e ferramentas a atividades do RDO',
  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_atividade_mao_obra (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL DEFAULT app_current_tenant_id(),
        rdo_atividade_id BIGINT NOT NULL REFERENCES rdo_atividades(id) ON DELETE CASCADE,
        mao_obra_direta_id BIGINT NOT NULL REFERENCES mao_obra_direta(id),
        funcao_snapshot TEXT,
        horas_utilizadas NUMERIC(10,2) NOT NULL CHECK (horas_utilizadas > 0),
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, rdo_atividade_id, mao_obra_direta_id)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS rdo_atividade_ferramentas (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL DEFAULT app_current_tenant_id(),
        rdo_atividade_id BIGINT NOT NULL REFERENCES rdo_atividades(id) ON DELETE CASCADE,
        ferramenta_id BIGINT NOT NULL REFERENCES almox_ferramentas(id),
        codigo_snapshot TEXT,
        horas_utilizadas NUMERIC(10,2) NOT NULL CHECK (horas_utilizadas > 0),
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, rdo_atividade_id, ferramenta_id)
      )
    `);
    await run('ALTER TABLE estoque_aplicacoes ADD COLUMN IF NOT EXISTS rdo_atividade_id BIGINT REFERENCES rdo_atividades(id) ON DELETE CASCADE');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_atividade_mao_obra_atividade ON rdo_atividade_mao_obra(tenant_id, rdo_atividade_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_atividade_ferramentas_atividade ON rdo_atividade_ferramentas(tenant_id, rdo_atividade_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_estoque_aplicacoes_rdo_atividade ON estoque_aplicacoes(tenant_id, rdo_atividade_id) WHERE rdo_atividade_id IS NOT NULL');
    await run('CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_aplicacoes_rdo_atividade_lote ON estoque_aplicacoes(tenant_id, rdo_atividade_id, lote_id) WHERE rdo_atividade_id IS NOT NULL');
    await run('ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_tipo_check');
    await run(`ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_tipo_check CHECK (tipo IN (
      'ENTRADA_COMPRA','MIGRACAO_HISTORICO','RESERVA_TRANSFERENCIA','TRANSFERENCIA_SAIDA','TRANSFERENCIA_ENTRADA',
      'CANCELAMENTO_TRANSFERENCIA','AJUSTE','SAIDA_USO','ESTORNO_SAIDA_USO','LIBERACAO_QUALIDADE','BLOQUEIO_QUALIDADE'
    ))`);
    for (const table of ['rdo_atividade_mao_obra', 'rdo_atividade_ferramentas']) {
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
        WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }
  }
};
