const assert = require('node:assert/strict');
const { consolidateWeather } = require('../services/relatorioSemanalClima');
const { validPeriod } = require('../services/relatorioSemanalService');
const rdos = ['02','03','04','05','06'].map((day, i) => ({id:i+1,data_relatorio:`2026-03-${day}`}));
const weather = rdos.map((r, i) => ({data:r.data_relatorio,periodo:'Manhã',condicao_tempo:i === 1 ? 'Chuva' : 'Claro',condicao_trabalho:'Praticável'}));
weather.push({data:'2026-03-03',periodo:'Tarde',condicao_tempo:'Chuva',condicao_trabalho:'Impraticável'});
const occurrences = [
  {data:'2026-03-03',data_ocorrencia:'2026-03-03',hora_inicio:'09:00',hora_fim:'12:00'},
  {data:'2026-03-03',data_ocorrencia:'2026-03-03',hora_inicio:'10:00',hora_fim:'11:00'},
  {data:'2026-03-05',data_ocorrencia:'2026-03-05',hora_inicio:'08:00',hora_fim:'13:00'},
  {data:'2026-03-05',data_ocorrencia:'2026-03-05',hora_inicio:'14:00',hora_fim:null}
];
const result = consolidateWeather({inicio:'2026-03-02',fim:'2026-03-11',rdos,weather,occurrences,calendario:{dias:[1,2,3,4,5],excecoes:{}}});
assert.equal(result.dias.length,10);
assert.equal(result.resumo.dias_com_clima,5);
assert.equal(result.resumo.dias_com_impacto,2);
assert.equal(result.resumo.horas_paralisacao,8);
assert.equal(result.resumo.horas_incompletas,true);
assert.equal(result.dias[1].situacao,'Parcialmente impeditivo');
assert.equal(result.dias[1].horas_paralisacao,3);
assert.equal(result.dias[5].presenca,'sem_operacao');
assert.equal(result.dias[7].presenca,'sem_rdo');
const missing = consolidateWeather({inicio:'2026-03-02',fim:'2026-03-03',rdos:[rdos[0]],weather:[],calendario:null});
assert.equal(missing.dias[0].presenca,'sem_clima');
assert.equal(missing.dias[1].presenca,'sem_rdo');
assert.equal(missing.resumo.horas_paralisacao,null);
assert.equal(missing.resumo.dias_operacao_prevista,null);
const pending = consolidateWeather({inicio:'2026-03-02',fim:'2026-03-02',rdos:[],allRdos:[rdos[0]],weather:[],calendario:null});
assert.equal(pending.dias[0].presenca,'sem_rdo_aprovado');
const empty = consolidateWeather({inicio:'2026-03-02',fim:'2026-03-02',rdos:[rdos[0]],weather:[{data:'2026-03-02',periodo:'Manhã'}],calendario:null});
assert.equal(empty.dias[0].presenca,'sem_clima');
assert.equal(validPeriod('2026-03-01','2026-03-31'),true);
assert.equal(validPeriod('2026-03-01','2026-04-01'),false);
console.log('Consolidação climática validada.');
