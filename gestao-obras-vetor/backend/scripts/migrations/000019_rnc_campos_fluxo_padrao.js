module.exports = {
  id: '000019_rnc_campos_fluxo_padrao',
  description: 'Garante os campos usados pelo formulário padrão de RNC',
  async up({ run }) {
    await run('ALTER TABLE rnc ADD COLUMN IF NOT EXISTS data_prevista_encerramento DATE');
    await run('ALTER TABLE rnc ADD COLUMN IF NOT EXISTS origem TEXT');
    await run('ALTER TABLE rnc ADD COLUMN IF NOT EXISTS area_afetada TEXT');
    await run('ALTER TABLE rnc ADD COLUMN IF NOT EXISTS norma_referencia TEXT');
    await run('ALTER TABLE rnc ADD COLUMN IF NOT EXISTS registros_fotograficos JSONB');
  }
};
