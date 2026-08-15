module.exports = {
  id: '000012_service_accounts',
  description: 'Cria contas de servico para OAuth client credentials',
  async up({ run, target }) {
    // Credenciais de integracao sao globais e nao pertencem a schemas de tenant.
    if (target.schema !== 'public') return;

    await run(`
      CREATE TABLE IF NOT EXISTS service_accounts (
        id BIGSERIAL PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        client_secret_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        token_version INTEGER NOT NULL DEFAULT 1 CHECK (token_version >= 1),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_token_issued_at TIMESTAMPTZ NULL,
        disabled_at TIMESTAMPTZ NULL
      )
    `);
    await run('CREATE INDEX IF NOT EXISTS idx_service_accounts_active ON service_accounts(active)');
  }
};
