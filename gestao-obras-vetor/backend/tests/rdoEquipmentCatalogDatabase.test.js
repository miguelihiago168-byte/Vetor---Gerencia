// Run with: node -r dotenv/config tests/rdoEquipmentCatalogDatabase.test.js
// All fixtures are temporary tables, rolled back without changing application records.
const assert = require('node:assert/strict');
const database = require('../config/database');
const { createEquipmentCatalogService } = require('../services/rdoEquipmentCatalogService');

async function run() {
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("CREATE TEMP TABLE projetos (id INTEGER, tenant_id INTEGER, rdo_equipamentos_catalogo JSONB NOT NULL DEFAULT '{}'::jsonb) ON COMMIT DROP");
    await client.query('CREATE TEMP TABLE rdos (id INTEGER, projeto_id INTEGER, tenant_id INTEGER, data_relatorio DATE) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE rdo_equipamentos (rdo_id INTEGER, nome TEXT) ON COMMIT DROP');
    await client.query('INSERT INTO projetos (id, tenant_id) VALUES (1, 10), (2, 10), (3, 20)');
    await client.query("INSERT INTO rdos VALUES (1, 1, 10, '2026-09-01'), (2, 2, 10, '2026-09-01'), (3, 3, 20, '2026-09-01')");
    await client.query("INSERT INTO rdo_equipamentos VALUES (1, 'Carro de Apoio'), (2, 'Carro de Apoio'), (3, 'Carro de Apoio')");
    const service = createEquipmentCatalogService({ ...database, withClient: callback => callback(client) });
    await service.change(1, 10, 'Carro de Apoio', 'Veículo de Apoio');
    assert.equal((await service.list(1, 10))[0].nome, 'Veículo de Apoio');
    assert.equal((await service.list(2, 10))[0].nome, 'Carro de Apoio');
    assert.equal((await service.list(3, 20))[0].nome, 'Carro de Apoio');
    await assert.rejects(service.change(3, 10, 'Carro de Apoio', 'Indevido'), { status: 403 });
    await service.change(1, 10, 'Veículo de Apoio', null, true);
    assert.deepEqual(await service.list(1, 10), []);
    const historical = await client.query('SELECT nome FROM rdo_equipamentos');
    assert.equal(historical.rowCount, 3);
    assert(historical.rows.every(row => row.nome === 'Carro de Apoio'));
    console.log('OK: PostgreSQL rename/delete persistence, project and tenant isolation, historical records preserved');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await database.pool.end();
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
