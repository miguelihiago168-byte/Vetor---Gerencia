module.exports = {
  id: '000015_agenda_lembretes',
  description: 'Lembretes de reuniões com envio único por participante e revisão',
  up: async ({ run }) => {
    await run(`ALTER TABLE mensagem_reunioes ADD COLUMN IF NOT EXISTS lembrete_minutos INTEGER DEFAULT 15
      CHECK (lembrete_minutos IN (5, 15, 30, 60, 1440))`);
    await run(`ALTER TABLE mensagem_reunioes ADD COLUMN IF NOT EXISTS lembrete_revisao INTEGER NOT NULL DEFAULT 1`);
    // Lembretes têm identidade própria; assuntos iguais ou uma nova revisão não são duplicatas.
    await run(`DROP INDEX IF EXISTS idx_notificacoes_unicas`);
    await run(`CREATE UNIQUE INDEX idx_notificacoes_unicas ON notificacoes(usuario_id, tipo, titulo, mensagem)
      WHERE tipo IS DISTINCT FROM 'reuniao_lembrete'`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_mensagem_reunioes_tenant_id ON mensagem_reunioes(tenant_id, id)`);
    await run(`CREATE TABLE IF NOT EXISTS mensagem_reuniao_lembretes (
      tenant_id BIGINT NOT NULL DEFAULT app_current_tenant_id(),
      reuniao_id BIGINT NOT NULL,
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
      revisao INTEGER NOT NULL,
      notificacao_id BIGINT REFERENCES notificacoes(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, reuniao_id, usuario_id, revisao),
      FOREIGN KEY (tenant_id, reuniao_id) REFERENCES mensagem_reunioes(tenant_id, id) ON DELETE CASCADE
    )`);
    await run(`CREATE INDEX IF NOT EXISTS idx_reuniao_lembretes_notificacao ON mensagem_reuniao_lembretes(notificacao_id)`);
    await run(`ALTER TABLE mensagem_reuniao_lembretes ENABLE ROW LEVEL SECURITY`);
    await run(`ALTER TABLE mensagem_reuniao_lembretes FORCE ROW LEVEL SECURITY`);
    await run(`DROP POLICY IF EXISTS mensagem_reuniao_lembretes_tenant_isolation ON mensagem_reuniao_lembretes`);
    await run(`CREATE POLICY mensagem_reuniao_lembretes_tenant_isolation ON mensagem_reuniao_lembretes
      USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))
      WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
  }
};
