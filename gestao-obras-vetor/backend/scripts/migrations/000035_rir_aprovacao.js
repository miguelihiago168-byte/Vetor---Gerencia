module.exports = {
  id: '000035_rir_aprovacao',
  description: 'Acrescenta fluxo de aprovação sequencial aos relatórios RIR',
  async up({ run }) {
    await run("ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Em preenchimento'");
    await run('ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS gestor_aprovado_por BIGINT REFERENCES usuarios(id)');
    await run('ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS gestor_aprovado_em TIMESTAMPTZ');
    await run('ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS fiscal_aprovado_por BIGINT REFERENCES usuarios(id)');
    await run('ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS fiscal_aprovado_em TIMESTAMPTZ');
    await run("ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS historico_status JSONB NOT NULL DEFAULT '[]'::jsonb");
    await run('ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS correcao_solicitada INTEGER NOT NULL DEFAULT 0');
    await run('ALTER TABLE rir_relatorios ADD COLUMN IF NOT EXISTS correcao_motivo TEXT');
    await run('CREATE INDEX IF NOT EXISTS idx_rir_projeto_status ON rir_relatorios (tenant_id, projeto_id, status)');
  }
};
