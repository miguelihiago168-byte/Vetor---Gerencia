module.exports = {
  id: '000010_pedidos_compra_sem_projeto',
  description: 'Permite compras globais destinadas ao estoque central',
  async up({ run }) {
    await run('ALTER TABLE pedidos_compra ALTER COLUMN projeto_id DROP NOT NULL');
  }
};
