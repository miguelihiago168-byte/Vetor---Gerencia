module.exports = {
  id: '000012_estoque_rastreabilidade_unificada',
  description: 'Centraliza estoque, quarentena de qualidade e rastreabilidade de uso',
  async up({ run }) {
    await run(`ALTER TABLE estoque_lotes ADD COLUMN IF NOT EXISTS requer_inspecao BOOLEAN NOT NULL DEFAULT FALSE`);
    await run(`ALTER TABLE estoque_lotes ADD COLUMN IF NOT EXISTS status_qualidade TEXT NOT NULL DEFAULT 'NAO_APLICAVEL'
      CHECK (status_qualidade IN ('NAO_APLICAVEL','AGUARDANDO_INSPECAO','APROVADO','APROVADO_COM_RESSALVA','BLOQUEADO','REPROVADO'))`);
    await run(`ALTER TABLE estoque_saldos ADD COLUMN IF NOT EXISTS quantidade_quarentena NUMERIC(18,4) NOT NULL DEFAULT 0`);
    await run(`ALTER TABLE estoque_saldos DROP CONSTRAINT IF EXISTS estoque_saldos_quantidade_quarentena_check`);
    await run(`ALTER TABLE estoque_saldos ADD CONSTRAINT estoque_saldos_quantidade_quarentena_check
      CHECK (quantidade_quarentena >= 0 AND quantidade_reservada + quantidade_quarentena <= quantidade)`);
    await run(`ALTER TABLE estoque_movimentacoes DROP CONSTRAINT IF EXISTS estoque_movimentacoes_tipo_check`);
    await run(`ALTER TABLE estoque_movimentacoes ADD CONSTRAINT estoque_movimentacoes_tipo_check CHECK (tipo IN (
      'ENTRADA_COMPRA','MIGRACAO_HISTORICO','RESERVA_TRANSFERENCIA','TRANSFERENCIA_SAIDA','TRANSFERENCIA_ENTRADA',
      'CANCELAMENTO_TRANSFERENCIA','AJUSTE','SAIDA_USO','LIBERACAO_QUALIDADE','BLOQUEIO_QUALIDADE'
    ))`);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_inspecoes (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id),
        resultado TEXT NOT NULL CHECK (resultado IN ('APROVADO','APROVADO_COM_RESSALVA','BLOQUEADO','REPROVADO')),
        quantidade_aprovada NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantidade_aprovada >= 0),
        quantidade_bloqueada NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantidade_bloqueada >= 0),
        quantidade_reprovada NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantidade_reprovada >= 0),
        motivo TEXT,
        ressalvas TEXT,
        observacoes TEXT,
        inspecionado_por BIGINT REFERENCES usuarios(id),
        inspecionado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_aplicacoes (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id),
        saldo_id BIGINT NOT NULL REFERENCES estoque_saldos(id),
        projeto_id BIGINT REFERENCES projetos(id),
        frente_servico TEXT NOT NULL,
        atividade_eap_id BIGINT REFERENCES atividades_eap(id),
        elemento_construtivo TEXT,
        responsavel_nome TEXT NOT NULL,
        quantidade NUMERIC(18,4) NOT NULL CHECK (quantidade > 0),
        unidade TEXT NOT NULL,
        aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        observacoes TEXT,
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_lote_rncs (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id),
        rnc_id BIGINT NOT NULL REFERENCES rnc(id),
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, lote_id, rnc_id)
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_estoque_inspecoes_lote ON estoque_inspecoes (tenant_id, lote_id, inspecionado_em DESC)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_estoque_aplicacoes_lote ON estoque_aplicacoes (tenant_id, lote_id, aplicado_em DESC)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_estoque_lote_rncs_lote ON estoque_lote_rncs (tenant_id, lote_id)`);

    // O estoque existente continua utilizável; somente novas entradas marcadas
    // para inspeção ficam em quarentena. Não há conversão ou soma de saldos legados.
    for (const table of ['estoque_insumos', 'estoque_pendencias_recebimento', 'estoque_lotes', 'estoque_saldos', 'estoque_transferencias', 'estoque_movimentacoes', 'estoque_inspecoes', 'estoque_aplicacoes', 'estoque_lote_rncs']) {
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
        WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }
    // Itens e anexos herdam a autorização da entidade de estoque à qual pertencem.
    for (const [table, expression] of [
      ['estoque_transferencia_itens', "EXISTS (SELECT 1 FROM estoque_transferencias t WHERE t.id=transferencia_id)"],
      ['estoque_lote_anexos', "EXISTS (SELECT 1 FROM estoque_lotes l WHERE l.id=lote_id AND l.tenant_id=app_current_tenant_id())"]
    ]) {
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_access ON ${table}`);
      await run(`CREATE POLICY ${table}_tenant_access ON ${table} USING (${expression}) WITH CHECK (${expression})`);
    }
  }
};
