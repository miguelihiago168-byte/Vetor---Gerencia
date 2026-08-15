const { pool } = require('../config/database');

const main = async () => {
  const connection = await pool.query('SELECT current_database() AS database, NOW() AS checked_at');
  const schemas = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name = 'public' OR schema_name LIKE 'tenant_%'
    ORDER BY schema_name
  `);

  if (!schemas.rows.some((row) => row.schema_name === 'public')) {
    throw new Error('Schema public ausente.');
  }

  console.log(`[db:integrity] PostgreSQL conectado: ${connection.rows[0].database}`);
  console.log(`[db:integrity] Schemas verificados: ${schemas.rows.map((row) => row.schema_name).join(', ')}`);
};

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
