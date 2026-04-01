const { migrateAddRdoLogs } = require('../scripts/migrate_add_rdo_logs');

migrateAddRdoLogs().catch(() => {
  process.exitCode = 1;
});
