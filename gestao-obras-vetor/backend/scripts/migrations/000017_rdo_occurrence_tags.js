module.exports = {
  id: '000017_rdo_occurrence_tags',
  description: 'Adiciona tags classificadoras a ocorrencias do RDO',
  async up({ run }) {
    await run("ALTER TABLE rdo_ocorrencias ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb");
    await run("CREATE INDEX IF NOT EXISTS idx_rdo_ocorrencias_tags ON rdo_ocorrencias USING GIN (tags)");
  }
};
