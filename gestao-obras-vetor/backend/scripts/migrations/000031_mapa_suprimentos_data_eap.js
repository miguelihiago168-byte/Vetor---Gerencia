module.exports = {
  id: '000031_mapa_suprimentos_data_eap',
  description: 'Preserva a origem automática ou manual da data necessária',
  async up({ run }) {
    await run('ALTER TABLE mapa_suprimentos ADD COLUMN IF NOT EXISTS data_necessidade_manual BOOLEAN NOT NULL DEFAULT TRUE');
  }
};
