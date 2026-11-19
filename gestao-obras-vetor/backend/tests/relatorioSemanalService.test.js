const assert = require('assert/strict');
const {validPeriod, buildSnapshot, mergeChoices, validateChoices}=require('../services/relatorioSemanalService');
assert.equal(validPeriod('2026-02-23','2026-03-01'),true);
assert.equal(validPeriod('2026-02-23','2026-03-02'),false);
assert.equal(validPeriod('2026-02-30','2026-03-01'),false);
const source={project:{nome:'Obra'},start:'2026-03-02',end:'2026-03-08',rdos:[{id:7,data_relatorio:'2026-03-03',mao_obra_detalhada:JSON.stringify([{nome:'Ana',funcao:'Eletricista'},{nome:'Bia',funcao:'Eletricista'}]),atividades_avulsas:JSON.stringify([{descricao:'Avulsa',quantidade_prevista:2,quantidade_executada:1}])}],activities:[{id:1,pai_id:null,nome:'Grupo'},{id:2,pai_id:1,nome:'Fundação',quantidade_total:10},{id:3,pai_id:1,nome:'Cabo',quantidade_total:5},{id:4,pai_id:1,nome:'Futura',quantidade_total:3}],entries:[{atividade_eap_id:2,data_relatorio:'2026-02-28',quantidade_executada:6},{atividade_eap_id:2,data_relatorio:'2026-03-03',quantidade_executada:4},{atividade_eap_id:3,data_relatorio:'2026-03-03',quantidade_executada:2}],photos:[{id:11,rdo_id:7,descricao:'Original',data_relatorio:'2026-03-03'}],weather:[{data:'2026-03-03',periodo:'Manhã',condicao_tempo:'Claro',pluviometria_mm:0}]};
const report=buildSnapshot(source); assert.equal(report.atividades.find(a=>a.key==='eap:2').data_conclusao,'2026-03-03'); assert.equal(report.atividades.find(a=>a.key==='eap:3').status,'Em andamento'); assert.equal(report.atividades.find(a=>a.key.startsWith('avulsa')).status,'Em andamento'); assert.deepEqual(report.proximas.map(a=>a.key),['eap:1','eap:4']); assert.equal(report.efetivo[0].quantidade,2); assert.ok(validateChoices(report));
const duplicateAttendance = buildSnapshot({...source, rdos:[...source.rdos, {
  id:8, data_relatorio:'2026-03-03', mao_obra_detalhada:JSON.stringify([
    {nome:' ana ',funcao:'Eletricista'}, {nome:'Caio',funcao:'Eletricista'}
  ])
}]});
assert.deepEqual(duplicateAttendance.efetivo, [{data:'2026-03-03',funcao:'Eletricista',quantidade:3}]);
for(const a of report.atividades.filter(a=>a.status!=='Concluída')) {a.incluir=true;a.previsao='2026-03-10';} report.fotos[0].selecionada=true; report.fotos[0].descricao='Legenda'; report.proximas[0].incluir=true; assert.equal(validateChoices(report),null);
const refreshed=mergeChoices(buildSnapshot(source),report); assert.equal(refreshed.atividades.find(a=>a.key==='eap:3').previsao,'2026-03-10'); assert.equal(refreshed.fotos[0].descricao,'Legenda'); assert.equal(refreshed.proximas[0].incluir,true); refreshed.fotos.push({selecionada:true},{selecionada:true}); assert.match(validateChoices(refreshed),/duas fotos/);
console.log('Relatório semanal: testes de consolidação e validação aprovados.');

const { selectedActivities,restoreSavedActivities } = require('../services/relatorioSemanalService');
const activity = (id, fields={}) => ({
  id,codigo_eap:String(id),nome:'Serviço '+id,criado_em:'2026-01-01T12:00:00Z',...fields
});
const event = (id,day,before,after) => ({
  id:id,atividade_eap_id:id,criado_em:day+'T12:00:00Z',percentual_anterior:before,percentual_novo:after,fonte:'evento'
});
const changes = [[0,30,30],[40,65,25],[50,50,0],[80,100,20],[60,55,-5],[0,0,0],[45,45,0]];
const catalog = changes.map((_,i)=>activity(i+1));
const history = changes.map(([initial],i)=>event(i+1,'2026-03-01',null,initial));
changes.forEach(([initial,final],i)=>history.push(event(i+1,'2026-03-08',initial,final)));
history.push(event(2,'2026-03-09',65,75)); // Monday after the closing Sunday.
catalog.push(activity(8),activity(9,{pai_id:2}),activity(10,{percentual_executado:75,atualizado_em:'2026-03-11T12:00:00Z'}));
catalog.push(activity(11,{percentual_executado:0,status:'Bloqueada',atualizado_em:'2026-02-15T12:00:00Z'}));
const fixture = {...source, activities:catalog, history, entries:[],rdos:[]};
const snapshot = buildSnapshot(fixture);
changes.forEach(([before,after,delta],i)=>{
  const f=snapshot.eap[i].fisico;
  assert.deepEqual([f.anterior,f.atual,f.evolucao],[before,after,delta]);
  assert.equal(f.situacao,after===0?'Não iniciada':after===100?'Concluída':'Em andamento');
});
assert.equal(snapshot.eap[9].fisico.atual,null,'a medição atualizada depois do corte não demonstra o histórico');
assert.equal(snapshot.eap[10].fisico.situacao,'Bloqueada');
const picked = {atividades:[{key:'eap:2',executada:true,incluir:false},{key:'eap:9',executada:true,incluir:false},
  {key:'eap:999',executada:true,incluir:false,nome:'Outra obra'}],proximas:[{key:'eap:2',incluir:true}]};
mergeChoices(snapshot,picked);
let rows = selectedActivities(snapshot);
assert.deepEqual(rows.executed.map(a=>a.key),['eap:2','eap:9']);
assert.deepEqual(rows.next.map(a=>a.key),['eap:2']);
assert.deepEqual(rows.summary.map(a=>a.key),['eap:2','eap:9']);
assert.equal(rows.summary[0].fisico.atual,65);
assert.equal(rows.summary[1].fisico.atual,null);
const refreshedWithoutParent=buildSnapshot({...fixture,activities:catalog.filter(a=>a.id!==2)});
restoreSavedActivities(refreshedWithoutParent,snapshot);
mergeChoices(refreshedWithoutParent,snapshot);
assert.equal(refreshedWithoutParent.eap.find(a=>a.id===2).fonte_ausente,true);
assert.equal(selectedActivities(refreshedWithoutParent).summary[0].fisico.atual,65);
mergeChoices(snapshot,{atividades:[{key:'eap:2',executada:false,incluir:false}],proximas:[]});
assert.deepEqual(selectedActivities(snapshot).summary.map(a=>a.key),['eap:9']);
const legacy={atividades:[{key:'eap:42',nome:'Nome salvo',status:'Em andamento',incluir:true}],
  eap:[{id:42,nome:'Nome salvo',percentual:99}],proximas:[]};
rows=selectedActivities(legacy);
assert.equal(rows.summary.length,1);
assert.equal(rows.executed[0].fisico.atual,undefined);
const completedSources=buildSnapshot({...fixture,activities:[
  activity(21,{status:'Concluída',percentual_executado:100}),
  activity(22,{status:'Em andamento',percentual_executado:100}),
  activity(23,{status:'Em andamento',percentual_executado:50})
],history:[]});
assert.deepEqual(completedSources.proximas.map(a=>a.key),['eap:23']);
const savedWithCompleted={eap:[{id:21,status:'Concluída',percentual:100},{id:23,status:'Em andamento',percentual:50}],
  atividades:[{key:'eap:21',nome:'Concluída',status:'Concluída',incluir:true}],
  proximas:[{key:'eap:21',nome:'Concluída',incluir:true},{key:'eap:23',nome:'Parcial',incluir:true}]};
assert.deepEqual(selectedActivities(savedWithCompleted).next.map(a=>a.key),['eap:23']);
restoreSavedActivities(completedSources,savedWithCompleted);
assert.equal(completedSources.proximas.some(a=>a.key==='eap:21'),false);
const discontinuity = buildSnapshot({...fixture,history:[event(1,'2026-03-01',0,10),event(1,'2026-03-06',25,30)]});
assert.equal(discontinuity.eap[0].fisico.anterior,null);
assert.equal(discontinuity.eap[0].fisico.evolucao,null);
const partial=buildSnapshot({...fixture,history:[event(1,'2026-03-06',null,30)]}).eap[0].fisico;
assert.deepEqual([partial.anterior,partial.atual,partial.evolucao],[null,30,null]);
const laterOnly=buildSnapshot({...fixture,history:[event(1,'2026-04-15',60,75)]}).eap[0].fisico;
assert.deepEqual([laterOnly.anterior,laterOnly.atual],[null,null]);
const reportingDay=buildSnapshot({...fixture,history:[
  { ...event(1,'2026-03-08',0,30),criado_em:'2026-03-09T01:30:00Z' }
]}).eap[0].fisico;
assert.equal(reportingDay.atual,30,'a noite de domingo em São Paulo integra o encerramento');
console.log('Avanço semanal: cortes, regressão, seleção, hierarquia, exclusão, lacunas e legado aprovados.');
