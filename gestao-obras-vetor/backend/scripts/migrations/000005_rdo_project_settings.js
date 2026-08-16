module.exports = {
  id: '000005_rdo_project_settings',
  description: 'Adiciona configuracoes de copia e aprovacao de RDO por projeto',
  async up({ run }) {
    await run('ALTER TABLE projetos ADD COLUMN IF NOT EXISTS rdo_copiar_automaticamente INTEGER NOT NULL DEFAULT 0');
    await run('ALTER TABLE projetos ADD COLUMN IF NOT EXISTS rdo_exige_aprovacao_fiscal INTEGER NOT NULL DEFAULT 1');
  }
};
