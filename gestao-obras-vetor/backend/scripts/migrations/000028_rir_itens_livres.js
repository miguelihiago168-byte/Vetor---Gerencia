module.exports = {
  id: '000028_rir_itens_livres',
  description: 'Permite itens livres e controle quantitativo no RIR',
  async up({ run }) {
    await run('ALTER TABLE rir_itens ALTER COLUMN lote_id DROP NOT NULL');
    await run('ALTER TABLE rir_itens ADD COLUMN IF NOT EXISTS descricao TEXT');
    await run('ALTER TABLE rir_itens ADD COLUMN IF NOT EXISTS unidade TEXT');
    await run('ALTER TABLE rir_itens ADD COLUMN IF NOT EXISTS quantidade NUMERIC(18,4)');
    await run('ALTER TABLE rir_itens ADD COLUMN IF NOT EXISTS quantidade_total NUMERIC(18,4)');
  }
};
