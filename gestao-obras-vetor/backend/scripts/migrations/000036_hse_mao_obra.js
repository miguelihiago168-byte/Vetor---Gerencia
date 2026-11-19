module.exports = {
  id: '000036_hse_mao_obra',
  description: 'Cadastro global de funções e classificação de mão de obra HSE',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS hse_funcoes (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      nome TEXT NOT NULL, criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await run('CREATE UNIQUE INDEX IF NOT EXISTS hse_funcoes_nome ON hse_funcoes (tenant_id, lower(trim(nome)))');
    await run(`CREATE TABLE IF NOT EXISTS hse_classificacoes (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      origem TEXT NOT NULL CHECK (origem IN ('usuario', 'mao_obra')),
      pessoa_id BIGINT NOT NULL, funcao TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('Direta', 'Indireta', 'Terceiros')),
      atualizado_por BIGINT REFERENCES usuarios(id), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, origem, pessoa_id)
    )`);
    for (const table of ['hse_funcoes', 'hse_classificacoes']) {
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
        WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }
  }
};
