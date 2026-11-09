module.exports = {
  id: '000026_fiq',
  description: 'Adiciona identificação de FIQ às novas folhas de verificação',
  async up({ run }) {
    await run('ALTER TABLE folhas_verificacao ADD COLUMN IF NOT EXISTS fiq_numero TEXT');
    await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_fiq_numero_origem ON folhas_verificacao (tenant_id, projeto_id, fiq_numero) WHERE fiq_numero IS NOT NULL AND folha_origem_id IS NULL');
    await run('ALTER TABLE folhas_verificacao_rncs DROP CONSTRAINT IF EXISTS folhas_verificacao_rncs_folha_id_key');
    await run('ALTER TABLE folhas_verificacao_rncs ADD COLUMN IF NOT EXISTS resposta_id BIGINT REFERENCES folhas_verificacao_respostas(id)');
    await run('ALTER TABLE folhas_verificacao_rncs ADD COLUMN IF NOT EXISTS medicao_id BIGINT REFERENCES folhas_verificacao_medicoes(id)');
    await run('ALTER TABLE folhas_verificacao_rncs ADD COLUMN IF NOT EXISTS ensaio_eletrico_id BIGINT REFERENCES folhas_verificacao_eletrica_ensaios(id)');
    await run('ALTER TABLE folhas_verificacao_rncs ADD COLUMN IF NOT EXISTS torque_eletrico_id BIGINT REFERENCES folhas_verificacao_eletrica_torques(id)');
    await run('ALTER TABLE folhas_verificacao_rncs ADD COLUMN IF NOT EXISTS nao_conformidade_id BIGINT REFERENCES folhas_verificacao_nao_conformidades(id)');
    await run('ALTER TABLE folhas_verificacao_evidencias ADD COLUMN IF NOT EXISTS ensaio_eletrico_id BIGINT REFERENCES folhas_verificacao_eletrica_ensaios(id)');
    await run('ALTER TABLE folhas_verificacao_evidencias ADD COLUMN IF NOT EXISTS torque_eletrico_id BIGINT REFERENCES folhas_verificacao_eletrica_torques(id)');
    await run('ALTER TABLE folhas_verificacao_evidencias ADD COLUMN IF NOT EXISTS nao_conformidade_id BIGINT REFERENCES folhas_verificacao_nao_conformidades(id)');
    await run('CREATE INDEX IF NOT EXISTS idx_fiq_rnc_resposta ON folhas_verificacao_rncs (tenant_id,folha_id,resposta_id) WHERE resposta_id IS NOT NULL');
    await run('CREATE INDEX IF NOT EXISTS idx_fiq_rnc_medicao ON folhas_verificacao_rncs (tenant_id,folha_id,medicao_id) WHERE medicao_id IS NOT NULL');
  }
};
