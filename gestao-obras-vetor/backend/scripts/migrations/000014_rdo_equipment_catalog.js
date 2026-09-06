module.exports = {
  id: '000014_rdo_equipment_catalog',
  description: 'Persiste edicoes e exclusoes do catalogo de equipamentos por obra',
  async up({ run }) {
    await run("ALTER TABLE projetos ADD COLUMN IF NOT EXISTS rdo_equipamentos_catalogo JSONB NOT NULL DEFAULT '{}'::jsonb");
  }
};
