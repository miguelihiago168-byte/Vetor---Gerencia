module.exports = {
  id: '000002_rdo_workforce_schema',
  description: 'Cria o cadastro detalhado de mao de obra usado pelo cockpit',
  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS mao_obra (
        id BIGSERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        funcao TEXT,
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        tenant_id BIGINT NOT NULL DEFAULT app_current_tenant_id()
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS rdo_mao_obra (
        id BIGSERIAL PRIMARY KEY,
        rdo_id BIGINT NOT NULL REFERENCES rdos(id) ON DELETE CASCADE,
        mao_obra_id BIGINT NOT NULL REFERENCES mao_obra(id) ON DELETE CASCADE,
        horario_entrada TEXT,
        horario_saida_almoco TEXT,
        horario_retorno_almoco TEXT,
        horario_saida_final TEXT,
        horas_trabalhadas NUMERIC(10,2) NOT NULL DEFAULT 0,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        tenant_id BIGINT NOT NULL DEFAULT app_current_tenant_id()
      )
    `);

    await run('CREATE INDEX IF NOT EXISTS idx_mao_obra_tenant ON mao_obra(tenant_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_mao_obra_rdo ON rdo_mao_obra(rdo_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_rdo_mao_obra_tenant ON rdo_mao_obra(tenant_id)');

    for (const table of ['mao_obra', 'rdo_mao_obra']) {
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await run(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
          USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
          WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
      `);
    }
  }
};
