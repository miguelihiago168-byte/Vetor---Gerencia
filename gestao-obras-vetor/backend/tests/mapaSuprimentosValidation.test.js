const assert = require('node:assert/strict');
process.env.DB_NAME ||= 'mapa_test';
const { validate } = require('../routes/mapa_suprimentos');

const base = { tipo: 'material', descricao: 'Concreto', unidade: 'm³', quantidade: '12.5000', custo_unitario: '' };
assert.equal(validate(base).data.custo_unitario, null, 'custo ausente não é zero');
assert.equal(validate({ ...base, custo_unitario: '0' }).data.custo_unitario, '0');
assert.ok(validate({ ...base, quantidade: '0' }).error);
assert.ok(validate({ ...base, quantidade: '0.00001' }).error);
assert.ok(validate({ ...base, custo_unitario: '-1' }).error);
assert.ok(validate({ ...base, data_necessidade: '2026-02-30' }).error);
assert.ok(validate({ ...base, tipo: 'equipamento', equipamento_inicio: '2026-04-03', equipamento_fim: '2026-04-02' }).error);
assert.equal(validate({ ...base, equipamento_origem: 'proprio' }).data.equipamento_origem, null);
console.log('mapaSuprimentosValidation: validação de quantidades, custos e datas concluída.');
