module.exports = {
  id: '000017_repair_rdo_status_history',
  description: 'Repara o historico de status ausente em bancos legados de RDO',
  async up({ run }) {
    await run("ALTER TABLE rdos ADD COLUMN IF NOT EXISTS historico_status TEXT NOT NULL DEFAULT '[]'");
  }
};