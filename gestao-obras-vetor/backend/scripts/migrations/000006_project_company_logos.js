module.exports = {
  id: '000006_project_company_logos',
  description: 'Adiciona logos das empresas responsável e executante aos projetos',
  async up({ run }) {
    await run('ALTER TABLE projetos ADD COLUMN IF NOT EXISTS logo_empresa_responsavel TEXT');
    await run('ALTER TABLE projetos ADD COLUMN IF NOT EXISTS logo_empresa_executante TEXT');
  }
};
