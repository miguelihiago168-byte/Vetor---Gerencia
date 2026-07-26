module.exports = {
  id: '000011_material_supplier_name',
  description: 'Adiciona fornecedor informado no recebimento de material',
  async up({ run, all }) {
    const columns = await all('PRAGMA table_info(material_recebimentos)');
    if (!columns.some((column) => column.name === 'fornecedor_nome')) {
      await run('ALTER TABLE material_recebimentos ADD COLUMN fornecedor_nome TEXT');
    }
    await run('CREATE INDEX IF NOT EXISTS idx_material_recebimentos_fornecedor_nome ON material_recebimentos(tenant_id, fornecedor_nome)');
  }
};
