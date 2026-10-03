const assert = require('assert');
const {
  calcularHorasLiquidasColaborador,
  calcularHhMaoObraDireta
} = require('../services/rdoWorkforceHoursService');

const horarioRdo = { intervalo_almoco_inicio: '12:00', intervalo_almoco_fim: '13:00' };

assert.strictEqual(calcularHorasLiquidasColaborador({ entrada: '07:00', saida_final: '17:00', saida_almoco: '12:00', retorno_almoco: '13:00' }), 9);
assert.strictEqual(calcularHorasLiquidasColaborador({ entrada: '07:15', saida_final: '16:45', saida_almoco: '12:00', retorno_almoco: '12:30' }), 9);
assert.strictEqual(calcularHhMaoObraDireta([
  { tipo: 'Direta', entrada: '07:00', saida_final: '17:00', saida_almoco: '12:00', retorno_almoco: '13:00' },
  { tipo: 'DIRETA', entrada: '08:00', saida_final: '16:30', saida_almoco: '12:00', retorno_almoco: '12:30' },
  { tipo: 'Indireta', entrada: '07:00', saida_final: '17:00', saida_almoco: '12:00', retorno_almoco: '13:00' },
  { tipo: 'Terceiros', entrada: '07:00', saida_final: '17:00', saida_almoco: '12:00', retorno_almoco: '13:00' }
]), 17);
assert.strictEqual(calcularHhMaoObraDireta([
  { classificacao: 'Direta', entrada: '07:00', saida: '17:00' }
], horarioRdo), 9, 'formato do aplicativo deve usar o intervalo geral do RDO');
assert.strictEqual(calcularHhMaoObraDireta([
  { tipo: 'Direta', entrada: '', saida_final: '17:00' },
  { tipo: 'Direta', entrada: '18:00', saida_final: '17:00' },
  { tipo: 'Direta', entrada: '25:00', saida_final: '27:00' },
  { tipo: 'Direta', entrada: '07:00', saida_final: '17:00', saida_almoco: '13:00', retorno_almoco: '12:00' }
]), 0, 'jornadas ausentes, invalidas ou invertidas nao podem gerar HH');

console.log(JSON.stringify({ ok: true, suite: 'rdoWorkforceHoursService', scenarios: 5 }));
