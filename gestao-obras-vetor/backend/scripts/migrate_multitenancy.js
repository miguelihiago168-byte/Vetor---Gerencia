// Deprecated compatibility entrypoint. Tenant isolation is now enforced by
// tenant_id + PostgreSQL RLS in one shared database; this script must never
// create schemas or duplicate rows.
const { pool } = require('../config/database');

async function ensureMultitenancySchema() {
  const result = await pool.query(`
    SELECT to_regclass('public.grupos_empresariais') AS grupos,
           to_regclass('public.usuario_tenants') AS vinculos
  `);
  if (!result.rows[0]?.grupos || !result.rows[0]?.vinculos) {
    throw new Error('Banco RLS não inicializado. Execute npm run db:bootstrap-rls.');
  }
}

if (require.main === module) {
  ensureMultitenancySchema()
    .then(() => console.log('Multitenancy RLS compartilhada OK.'))
    .catch((error) => { console.error(error.message || error); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { ensureMultitenancySchema };
