const assert = require('assert');
const { mergeActivityHistory, reconstructGroupHistory } = require('../services/eapHistoryService');

const events = [{ id: 1, atividade_eap_id: 10, rdo_id: 1, origem: 'rdo_criado', fonte: 'atividade_eap_eventos' },
  { id: 2, atividade_eap_id: 10, rdo_id: 3, origem: 'rdo_aprovado', fonte: 'atividade_eap_eventos' }];
const legacy = [{ id: 3, atividade_eap_id: 10, rdo_id: 2, fonte: 'historico_atividades' }];
const executions = [1, 2, 3, 4].map((id) => ({ id, atividade_eap_id: 10, rdo_id: id, numero_rdo: id,
  percentual_executado: 25, quantidade_executada: 5, status: 'Aprovado' }));
// Duas atividades diferentes podem constar no mesmo RDO.
executions.push({ id: 5, atividade_eap_id: 11, rdo_id: 1, numero_rdo: 1, percentual_executado: 10 });
const history = mergeActivityHistory(events, legacy, executions);
const snapshots = history.filter((row) => row.fonte === 'rdo_atividades');
assert.deepStrictEqual(snapshots.map((row) => row.rdo_id), [3, 4, 1]);
assert.strictEqual(snapshots[2].atividade_eap_id, 11);
assert.strictEqual(snapshots[0].quantidade_nova, 5);
assert.strictEqual(snapshots[0].percentual_novo, 25);
assert.strictEqual(snapshots[0].rdo_label, 'RDO-003');
assert.match(snapshots[0].mensagem, /Aprovado/);
assert.strictEqual(mergeActivityHistory([], [], []).length, 0);
const activities = [{ id: 10 }, { id: 11, pai_id: 10, peso_percentual_projeto: 60, quantidade_total: 10 },
  { id: 12, pai_id: 10, peso_percentual_projeto: 40, quantidade_total: 10 }];
const approved = [{ rdo_id: 1, atividade_eap_id: 11, quantidade_executada: 10, aprovado_em: '2026-08-01T10:00:00Z' },
  { rdo_id: 2, atividade_eap_id: 12, quantidade_executada: 10, aprovado_em: '2026-08-02T10:00:00Z' }];
const estimated = reconstructGroupHistory(10, activities, approved);
assert.deepStrictEqual(estimated.map((row) => [row.percentual_anterior, row.percentual_novo]), [[0, 60], [60, 100]]);
assert.strictEqual(reconstructGroupHistory(10, activities, approved, '2026-08-02T10:00:00Z').length, 1);
assert.deepStrictEqual(reconstructGroupHistory(11, activities, approved), []);
console.log('eapHistoryService tests passed');
