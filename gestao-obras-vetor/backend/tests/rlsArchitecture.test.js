const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const migration = read('scripts', 'migrations', '000013_postgres_rls_groups.js');
const database = read('config', 'database.js');
const runner = read('scripts', 'runMigrations.js');

assert.match(migration, /CREATE TABLE IF NOT EXISTS grupos_empresariais/);
assert.match(migration, /transferencias_recursos/);
assert.match(migration, /app_concluir_transferencia/);
assert.match(migration, /app_rejeitar_transferencia/);
assert.match(migration, /FORCE ROW LEVEL SECURITY/);
assert.match(migration, /app_has_tenant_access/);
assert.match(migration, /tenant_destino_id/);
assert.match(migration, /grupo_id/);
assert.match(database, /SELECT set_config\(\$1, \$2, true\)/);
assert.doesNotMatch(database, /tenantSchema|SET search_path TO tenant_/);
assert.doesNotMatch(runner, /schema_name LIKE 'tenant_%'/);

console.log(JSON.stringify({ ok: true, suite: 'rlsArchitecture' }));
