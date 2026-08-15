module.exports = {
  id: '000006_received_email_flags',
  description: 'Adiciona flags de favorito, importante e exclusao em emails recebidos',
  async up({ run, all }) {
    const tables = await all("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'received_emails'");
    if (!tables.length) return;

    const columns = await all('PRAGMA table_info(received_emails)');
    const existing = new Set(columns.map((column) => column.name));

    if (!existing.has('favorito')) {
      await run('ALTER TABLE received_emails ADD COLUMN favorito INTEGER DEFAULT 0');
    }
    if (!existing.has('importante')) {
      await run('ALTER TABLE received_emails ADD COLUMN importante INTEGER DEFAULT 0');
    }
    if (!existing.has('importante_auto')) {
      await run('ALTER TABLE received_emails ADD COLUMN importante_auto INTEGER DEFAULT 0');
    }
    if (!existing.has('excluido')) {
      await run('ALTER TABLE received_emails ADD COLUMN excluido INTEGER DEFAULT 0');
    }
  }
};
