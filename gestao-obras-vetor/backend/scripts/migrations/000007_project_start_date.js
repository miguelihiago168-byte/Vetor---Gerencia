module.exports = {
  id: '000007_project_start_date',
  description: 'Adiciona a data de inicio ao cadastro de projetos',
  async up({ run }) {
    await run('ALTER TABLE projetos ADD COLUMN IF NOT EXISTS data_inicio DATE');
  }
};
