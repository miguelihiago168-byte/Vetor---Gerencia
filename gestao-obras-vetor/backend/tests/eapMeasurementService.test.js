const assert = require('node:assert/strict');
const { normalizeMeasurementValue, consolidateMeasurements, isMeasurementOnlyUpdate } = require('../services/eapMeasurementService');

const activity = { id: 1, pai_id: null, quantidade_total: 100, valor_total_medicao: '10000.00', percentual_executado: 95 };
const measure = (overrides = {}, execution = { quantidade: 30 }) => consolidateMeasurements([{ ...activity, ...overrides }], [{ atividade_eap_id: 1, ...execution }])[0].medicao;
assert.deepEqual(measure(), { valor_previsto: 10000, valor_medido: 3000, saldo: 7000, atividades_sem_valor: 0 });
assert.equal(measure({}, { quantidade: 0, percentual: 95 }).valor_medido, 0, 'quantidade prevista positiva não usa percentual nem cache como fallback');
assert.equal(measure({ quantidade_total: 0 }, { percentual: 30 }).valor_medido, 3000);
assert.equal(measure({ quantidade_total: null }, { percentual: 150 }).valor_medido, 10000);
assert.equal(measure({}, { quantidade: -10 }).valor_medido, 0);
assert.equal(measure({}, { quantidade: 130 }).valor_medido, 10000);
assert.equal(measure({ quantidade_total: 3, valor_total_medicao: '100.00' }, { quantidade: 1 }).valor_medido, 33.33, 'não arredonda o percentual antes da multiplicação');
assert.equal(measure({ quantidade_total: 2, valor_total_medicao: '0.01' }, { quantidade: 1 }).valor_medido, 0.01, 'meio centavo arredonda para cima');
assert.equal(measure({ quantidade_total: 1e-7 }, { quantidade: 1e-8 }).valor_medido, 1000);
assert.equal(measure({ valor_total_medicao: 0 }).atividades_sem_valor, 0);
assert.deepEqual(measure({ valor_total_medicao: null }), { valor_previsto: null, valor_medido: null, saldo: null, atividades_sem_valor: 1 });
assert.equal(measure({ valor_total_medicao: '9999999999999.99' }, { quantidade: 100 }).valor_medido, 9999999999999.99);

const hierarchy = consolidateMeasurements([
  { ...activity, id: 1, valor_total_medicao: 99999 },
  { ...activity, id: 2, pai_id: 1, valor_total_medicao: 88888 },
  { ...activity, id: 3, pai_id: 2, valor_total_medicao: 10000 },
  { ...activity, id: 4, pai_id: 1, valor_total_medicao: null },
  { ...activity, id: 5, pai_id: 1, valor_total_medicao: 0 }
], [{ atividade_eap_id: 3, quantidade: 30 }, { atividade_eap_id: 1, quantidade: 100 }]);
assert.deepEqual(hierarchy[0].medicao, { valor_previsto: 10000, valor_medido: 3000, saldo: 7000, atividades_sem_valor: 1 });
assert.equal(hierarchy[1].medicao.valor_previsto, 10000, 'agrupadores não contam seu próprio preço');
assert.equal(consolidateMeasurements([{ ...activity, id: 2, pai_id: null, valor_total_medicao: 88888 }])[0].medicao.valor_previsto, 88888, 'valor próprio volta a valer quando a atividade não possui filhos');
assert.throws(() => consolidateMeasurements([{ ...activity, pai_id: 1 }]), /circular/);

assert.equal(normalizeMeasurementValue(null), null);
assert.equal(normalizeMeasurementValue(0), '0.00');
assert.equal(normalizeMeasurementValue('12.3'), '12.30');
for (const value of ['', -1, true, {}, [], '1,50', '1.001', 'Infinity', Infinity, NaN, '10000000000000', '1e3']) {
  assert.throws(() => normalizeMeasurementValue(value), (error) => error.status === 400, `deve recusar ${String(value)}`);
}
assert.equal(isMeasurementOnlyUpdate(activity, { valor_total_medicao: null }), true);
assert.equal(isMeasurementOnlyUpdate(activity, { valor_total_medicao: 20000, quantidade_total: '100' }), true);
assert.equal(isMeasurementOnlyUpdate(activity, { valor_total_medicao: 20000, quantidade_total: 200 }), false);
assert.equal(isMeasurementOnlyUpdate(activity, { valor_total_medicao: 20000, predecessora_id: 2 }), false);
assert.equal(isMeasurementOnlyUpdate(activity, { nome: 'Revisada' }), false);
console.log('EAP medição: cálculo decimal, limites, hierarquia, preço opcional e classificação de edições validados.');
