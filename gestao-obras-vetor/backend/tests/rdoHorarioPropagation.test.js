const assert = require('node:assert/strict');
const {
  normalizarHorarioRdo,
  calcularHorasTrabalhadas,
  houveAlteracaoHorario
} = require('../services/rdoHorarioService');

const horarioPadrao = {
  entrada_saida_inicio: '07:00',
  entrada_saida_fim: '17:00',
  intervalo_almoco_inicio: '12:00',
  intervalo_almoco_fim: '13:00'
};

assert.deepEqual(normalizarHorarioRdo({}), horarioPadrao);
assert.deepEqual(normalizarHorarioRdo({ ...horarioPadrao, entrada_saida_inicio: '08:30' }), {
  ...horarioPadrao,
  entrada_saida_inicio: '08:30'
});
assert.equal(calcularHorasTrabalhadas(horarioPadrao), 9);
assert.equal(calcularHorasTrabalhadas({ ...horarioPadrao, entrada_saida_inicio: '08:30', entrada_saida_fim: '18:00' }), 8.5);
assert.equal(houveAlteracaoHorario(horarioPadrao, { ...horarioPadrao }), false);
assert.equal(houveAlteracaoHorario(horarioPadrao, { ...horarioPadrao, intervalo_almoco_fim: '14:00' }), true);

console.log('OK: o horário do RDO é normalizado, recalculado e detecta mudanças para propagação futura.');
