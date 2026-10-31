module.exports = {
  id: '000025_eap_valor_medicao',
  description: 'Adiciona valor total opcional para a medição financeira da EAP',
  async up({ run }) {
    await run(`ALTER TABLE atividades_eap ADD COLUMN IF NOT EXISTS valor_total_medicao NUMERIC(15,2)
      CHECK (valor_total_medicao >= 0 AND valor_total_medicao <= 9999999999999.99)`);
  }
};
