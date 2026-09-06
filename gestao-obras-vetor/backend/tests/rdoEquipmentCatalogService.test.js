const assert = require('node:assert/strict');
const { buildCatalog, changeSettings, createEquipmentCatalogService } = require('../services/rdoEquipmentCatalogService');

async function run() {
  const history = [
    { nome: 'Carro de Apoio', usos: 2, ultimo_uso: '2026-09-01' },
    { nome: 'Guindaste', usos: 1, ultimo_uso: '2026-09-02' }
  ];
  const originalHistory = JSON.stringify(history);
  let settings = changeSettings({}, 'Carro de Apoio', 'Veículo de Apoio', false);
  let catalog = buildCatalog(history, settings);
  assert.equal(catalog.find(row => row.nome === 'Veículo de Apoio').usos, 2);
  assert(!catalog.some(row => row.nome === 'Carro de Apoio'));

  settings = changeSettings(settings, 'Veículo de Apoio', 'Apoio Operacional', false);
  catalog = buildCatalog([...history, { nome: 'Veículo de Apoio', usos: 1 }], settings);
  assert.equal(catalog.find(row => row.nome === 'Apoio Operacional').usos, 3);
  settings = changeSettings(settings, 'Apoio Operacional', 'Apoio Operacional', true);
  assert.deepEqual(buildCatalog(history, settings), [history[1]]);
  assert.equal(JSON.stringify(history), originalHistory, 'Historical RDO data must not change');

  settings = changeSettings({}, 'Carro de Apoio', 'Guindaste', false);
  assert.deepEqual(buildCatalog(history, settings), [{ nome: 'Guindaste', usos: 3, ultimo_uso: '2026-09-02' }]);
  settings = changeSettings(settings, 'Guindaste', 'GUINDASTE', false);
  assert.equal(buildCatalog(history, settings)[0].nome, 'GUINDASTE');
  settings = changeSettings(settings, 'GUINDASTE', 'Guindaste', true);
  assert.deepEqual(buildCatalog(history, settings), []);
  assert.equal(buildCatalog([], changeSettings({}, 'Novo', 'Novo nome', false))[0].nome, 'Novo nome');
  settings = changeSettings({}, 'Antigo', 'Outro', false);
  settings = changeSettings(settings, 'Novo', 'Antigo', false);
  assert(buildCatalog([{ nome: 'Antigo', usos: 1 }], settings).some(row => row.nome === 'Antigo' && row.usos === 1));
  assert.equal(buildCatalog([{ nome: '__proto__', usos: 1 }], changeSettings({}, '__proto__', 'Nome seguro', false))[0].nome, 'Nome seguro');

  let persisted = {};
  let updates = 0;
  const database = {
    withClient: callback => callback({}),
    getWithClient: async (_, sql, [projectId, tenantId]) => {
      assert.match(sql, /WHERE id = \? AND tenant_id = \?/);
      return projectId === 7 && tenantId === 3 ? { id: 7, rdo_equipamentos_catalogo: persisted } : null;
    },
    allWithClient: async (_, sql, params) => {
      assert.deepEqual(params, [7, 3]);
      assert.match(sql, /r\.projeto_id = \? AND r\.tenant_id = \?/);
      return history;
    },
    execWithClient: async (_, sql, [json, projectId, tenantId]) => {
      assert.match(sql, /^UPDATE projetos SET rdo_equipamentos_catalogo/);
      assert.deepEqual([projectId, tenantId], [7, 3]);
      persisted = JSON.parse(json);
      updates += 1;
    }
  };
  let service = createEquipmentCatalogService(database);
  await service.change(7, 3, 'Carro de Apoio', 'Apoio');
  service = createEquipmentCatalogService(database);
  assert((await service.list(7, 3)).some(row => row.nome === 'Apoio'), 'Changes survive a new service instance');
  await service.change(7, 3, 'Apoio', null, true);
  assert.deepEqual(await service.list(7, 3), [history[1]]);
  await assert.rejects(service.change(7, 9, 'Guindaste', 'Outro'), { status: 403 });
  await assert.rejects(service.list(8, 3), { status: 403 });
  await assert.rejects(service.change(7, 3, 'Guindaste', '  '), { status: 400 });
  await assert.rejects(service.change(7, 3, 'Guindaste', 'a'.repeat(201)), { status: 400 });
  assert.equal(updates, 2, 'Invalid or cross-tenant changes must not write');
  console.log('OK: equipment catalog rename, merge, delete, persistence, validation, tenant isolation and preserved history');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
