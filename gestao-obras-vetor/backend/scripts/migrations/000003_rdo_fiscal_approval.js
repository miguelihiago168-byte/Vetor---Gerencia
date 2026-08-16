module.exports = {
  id: '000003_rdo_fiscal_approval',
  description: 'Adiciona aprovações sequenciais de gestor e fiscal aos RDOs',
  async up({ run }) {
    await run('ALTER TABLE rdos ADD COLUMN IF NOT EXISTS gestor_aprovado_por BIGINT REFERENCES usuarios(id)');
    await run('ALTER TABLE rdos ADD COLUMN IF NOT EXISTS gestor_aprovado_em TIMESTAMPTZ');
    await run('ALTER TABLE rdos ADD COLUMN IF NOT EXISTS fiscal_aprovado_por BIGINT REFERENCES usuarios(id)');
    await run('ALTER TABLE rdos ADD COLUMN IF NOT EXISTS fiscal_aprovado_em TIMESTAMPTZ');
    await run('CREATE INDEX IF NOT EXISTS idx_rdos_status_projeto ON rdos(projeto_id, status)');
  }
};
