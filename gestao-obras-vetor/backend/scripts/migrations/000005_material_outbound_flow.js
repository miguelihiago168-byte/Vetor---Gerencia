module.exports = {
  id: '000005_material_outbound_flow',
  description: 'Adiciona identificação de quem retirou materiais rastreáveis',
  async up({ run, all }) {
    const columns = await all('PRAGMA table_info(material_aplicacoes)');
    if (!columns.some((column) => column.name === 'retirado_por_nome')) {
      await run('ALTER TABLE material_aplicacoes ADD COLUMN retirado_por_nome TEXT');
    }
    await run('CREATE INDEX IF NOT EXISTS idx_material_aplicacoes_retirado_por ON material_aplicacoes(recebimento_id, retirado_por_nome)');
  }
};
