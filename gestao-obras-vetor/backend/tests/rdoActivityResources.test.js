const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const migration = read('scripts', 'migrations', '000016_rdo_activity_resources.js');
const route = read('routes', 'rdos.js');
const pdfService = read('services', 'rdoPdfService.js');

assert.match(migration, /rdo_atividade_mao_obra/);
assert.match(migration, /rdo_atividade_ferramentas/);
assert.match(migration, /rdo_atividade_id/);
assert.match(migration, /ESTORNO_SAIDA_USO/);
assert.match(migration, /ROW LEVEL SECURITY/);
assert.match(route, /recursos-atividade\/disponiveis/);
assert.match(route, /mao_obra_utilizada/);
assert.match(route, /insumos_utilizados/);
assert.match(route, /ferramentas_utilizadas/);
assert.match(route, /Saldo disponível insuficiente/);
assert.match(route, /clearActivityResources/);
assert.match(route, /activityResourcesSchemaExists/);
assert.match(route, /localizarOuCadastrarMaoObraDaAtividade/);
assert.match(route, /Informe a mão de obra utilizada na atividade/);
assert.match(route, /INSERT INTO mao_obra_direta/);
// Um colaborador pode atuar em mais de uma atividade, respeitando a jornada diária.
assert.match(route, /SUM\(ram\.horas_utilizadas\)/);
assert.match(route, /horas > horasDisponiveis/);
assert.match(route, /excedem o saldo diário/);
assert.match(route, /Atividade do RDO não encontrada para vincular recursos/);
assert.match(pdfService, /Recursos utilizados por atividade/);
assert.match(pdfService, /rdo_atividade_mao_obra/);
assert.match(pdfService, /rdo_atividade_ferramentas/);
assert.match(pdfService, /rdo_atividade_id IS NOT NULL/);

console.log(JSON.stringify({ ok: true, suite: 'rdoActivityResources', assertions: 23 }));
