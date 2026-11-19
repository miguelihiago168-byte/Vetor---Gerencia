module.exports = {
  id: '000037_hse_planejamento',
  description: 'Calendário e previsões de mão de obra por projeto',
  async up({ run }) {
    await run(`CREATE TABLE hse_calendarios (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, projeto_id BIGINT NOT NULL,
      dias JSONB NOT NULL, excecoes JSONB NOT NULL DEFAULT '{}'::jsonb,
      atualizado_por BIGINT REFERENCES usuarios(id), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id,projeto_id), FOREIGN KEY (tenant_id,projeto_id) REFERENCES projetos(tenant_id,id) ON DELETE CASCADE
    )`);
    await run(`CREATE TABLE hse_previsoes (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, projeto_id BIGINT NOT NULL,
      funcao TEXT NOT NULL, quantidade INTEGER NOT NULL CHECK (quantidade>=0), inicio DATE NOT NULL, fim DATE NOT NULL CHECK (fim>=inicio),
      empresa TEXT NOT NULL DEFAULT '', fase TEXT NOT NULL DEFAULT '', referencia TEXT NOT NULL DEFAULT '', observacoes TEXT NOT NULL DEFAULT '', revisao TEXT NOT NULL DEFAULT '',
      anterior_id BIGINT REFERENCES hse_previsoes(id), ativa BOOLEAN NOT NULL DEFAULT TRUE,
      criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (tenant_id,projeto_id) REFERENCES projetos(tenant_id,id) ON DELETE CASCADE
    )`);
    await run('CREATE INDEX hse_previsoes_periodo ON hse_previsoes (tenant_id,projeto_id,inicio,fim) WHERE ativa');
    for (const table of ['hse_calendarios','hse_previsoes']) {
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table} USING (tenant_id=app_current_tenant_id() AND app_has_tenant_access(tenant_id)) WITH CHECK (tenant_id=app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }
  }
};
