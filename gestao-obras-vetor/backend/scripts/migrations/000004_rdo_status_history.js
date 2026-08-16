module.exports = {
  id: '000004_rdo_status_history',
  description: 'Garante o historico de transicoes de status dos RDOs',
  async up({ run }) {
    // Alguns bancos legados foram criados antes deste campo existir. O fluxo
    // de aprovacao usa o JSON para auditar cada decisao, portanto ele precisa
    // estar presente antes de qualquer transicao de status.
    await run("ALTER TABLE rdos ADD COLUMN IF NOT EXISTS historico_status TEXT NOT NULL DEFAULT '[]'");
  }
};
