module.exports = {
  id: '000024_rdo_hh_mao_obra_direta',
  description: 'Adiciona HH persistido da mao de obra direta aos RDOs, sem recalcular o historico',
  async up({ run }) {
    await run('ALTER TABLE rdos ADD COLUMN IF NOT EXISTS hh_mao_obra_direta NUMERIC(10,2)');
  }
};
