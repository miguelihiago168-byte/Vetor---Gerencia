module.exports = {
  id: '000011_fluxo_transferencias_operacional',
  description: 'Separa aprovacao, retirada fisica e recebimento das transferencias internas',
  async up({ run }) {
    await run('ALTER TABLE estoque_transferencias ADD COLUMN IF NOT EXISTS separada_por BIGINT REFERENCES usuarios(id)');
    await run('ALTER TABLE estoque_transferencias ADD COLUMN IF NOT EXISTS separada_em TIMESTAMPTZ');
    await run('ALTER TABLE estoque_transferencias ADD COLUMN IF NOT EXISTS despachada_por BIGINT REFERENCES usuarios(id)');
    await run('ALTER TABLE estoque_transferencias ADD COLUMN IF NOT EXISTS despachada_em TIMESTAMPTZ');
    await run('ALTER TABLE estoque_transferencias DROP CONSTRAINT IF EXISTS estoque_transferencias_status_check');
    await run("UPDATE estoque_transferencias SET status='SOLICITADA' WHERE status='PENDENTE_ORIGEM'");
    await run("UPDATE estoque_transferencias SET status='AGUARDANDO_RECEBIMENTO' WHERE status='PENDENTE_DESTINO'");
    await run(`
      ALTER TABLE estoque_transferencias
      ADD CONSTRAINT estoque_transferencias_status_check CHECK (status IN (
        'SOLICITADA','APROVADA_RESERVADA','EM_SEPARACAO','AGUARDANDO_RECEBIMENTO',
        'CONCLUIDA','REJEITADA','CANCELADA','DIVERGENCIA'
      ))
    `);
    await run("ALTER TABLE estoque_transferencias ALTER COLUMN status SET DEFAULT 'SOLICITADA'");
  }
};
