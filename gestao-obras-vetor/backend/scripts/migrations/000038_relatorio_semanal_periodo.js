module.exports = {
  id: '000038_relatorio_semanal_periodo',
  description: 'Permite armazenar o período de até 31 dias aceito pelo relatório semanal',
  async up({ run }) {
    await run('ALTER TABLE relatorios_semanais DROP CONSTRAINT IF EXISTS relatorios_semanais_check');
    await run('ALTER TABLE relatorios_semanais ADD CONSTRAINT relatorios_semanais_check CHECK (fim >= inicio AND fim <= inicio + 30)');
  }
};
