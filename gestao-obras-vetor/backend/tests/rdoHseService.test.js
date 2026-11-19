const assert = require('node:assert/strict');
const { cadastrarPessoasDoRdo } = require('../services/rdoHseService');

async function main() {
  const calls=[];
  const client={query:async (sql,params)=>{
    calls.push({sql,params});
    if (sql.includes('FROM usuarios')) return {rows:[{nome:'Pessoa cadastrada'}]};
    if (sql.includes('SELECT nome FROM mao_obra_direta')) return {rows:[{nome:'Pessoa existente'}]};
    if (sql.includes('INSERT INTO mao_obra_direta')) return {rows:[{id:42}]};
    return {rows:[]};
  }};
  await cadastrarPessoasDoRdo(client,{tenantId:7,usuarioId:9,pessoas:[
    {nome:' pessoa cadastrada ',funcao:'Fiscal',tipo:'Indireta'},
    {nome:'PESSOA EXISTENTE',funcao:'Montador',tipo:'Direta'},
    {nome:'Nova Pessoa',funcao:'Fiscal',tipo:'Indireta'},
    {nome:'Nova   Pessoa',funcao:'Fiscal',tipo:'Indireta'},
    {nome:'Sem função',funcao:'',tipo:'Direta'},
    {nome:'Sem categoria',funcao:'Auxiliar'}
  ]});
  const people=calls.filter(call=>call.sql.includes('INSERT INTO mao_obra_direta'));
  const classifications=calls.filter(call=>call.sql.includes('INSERT INTO hse_classificacoes'));
  assert.equal(people.length,1);
  assert.deepEqual(people[0].params.slice(2),['Nova Pessoa','Fiscal',9]);
  assert.deepEqual(classifications[0].params,[7,42,'Fiscal','Indireta',9]);
  calls.length=0;
  await cadastrarPessoasDoRdo(client,{tenantId:7,usuarioId:9,pessoas:[{nome:'Terceira Pessoa',funcao:'Montador',classificacao:'Terceiros'}]});
  assert.equal(calls.find(call=>call.sql.includes('INSERT INTO hse_classificacoes')).params[3],'Terceiros');
  console.log('RDO e HSE: cadastro, classificação, duplicidade e dados incompletos validados.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
