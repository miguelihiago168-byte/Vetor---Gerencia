const assert = require('node:assert/strict');
const express = require('express');
const mock = (name,exports) => { const id=require.resolve(name); require.cache[id]={id,filename:id,loaded:true,exports}; };
let records=[{id:1,tenant_id:7,projeto_id:1,funcao:'Eletricista',empresa:'A',fase:'',inicio:'2026-01-15',fim:'2026-03-20',quantidade:5,referencia:'Contrato',observacoes:'',revisao:'R1',ativa:true}];
let nextId=2;
mock('../config/database',{
  getQuery:async (_sql,args)=>Number(args[0])===1 ? {id:1} : null,
  allQuery:async()=>[],runQuery:async()=>({changes:1}),
  withClient:async fn=>{
    const before=structuredClone(records), previousId=nextId;
    try { return await fn({query:async(sql,args)=>{
      if (sql.includes('SELECT id FROM projetos')) return {rows:[{id:1}],rowCount:1};
      if (sql.includes('SELECT * FROM hse_previsoes')) return {rows:structuredClone(records.filter(r=>r.ativa)),rowCount:records.filter(r=>r.ativa).length};
      if (sql.includes('UPDATE hse_previsoes')) { const row=records.find(r=>String(r.id)===String(args[1])); row.ativa=false; return {rows:[],rowCount:1}; }
      if (sql.includes('INSERT INTO hse_previsoes')) {
        const [tenant_id,projeto_id,funcao,quantidade,inicio,fim,empresa,fase,referencia,observacoes,revisao,anterior_id,criado_por]=args;
        const row={id:nextId++,tenant_id,projeto_id,funcao,quantidade,inicio,fim,empresa,fase,referencia,observacoes,revisao,anterior_id,criado_por,ativa:true};
        records.push(row); return {rows:[structuredClone(row)],rowCount:1};
      }
      throw Error(sql);
    }}); } catch(error) { records=before; nextId=previousId; throw error; }
  }
});
mock('../middleware/auth',{auth:(req,_res,next)=>{req.tenantId=7;req.usuario={id:9};next();}});
mock('../middleware/rbac',{PERMISSIONS:{HSE_MANAGE:'hse.manage'},requirePermission:()=> (_req,_res,next)=>next(),assertProjectAccess:async (_req,res,id)=>{if(id===1)return true;res.status(403).end();return false;}});
const app=express(); app.use(express.json()); app.use('/hse',require('../routes/hse'));
const server=app.listen(0,'127.0.0.1',async()=>{
  try {
    const root=`http://127.0.0.1:${server.address().port}/hse/projetos/1/grade-mensal`;
    const save=body=>fetch(root,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const body={versao:[1],alteracoes:[
      {funcao:'Eletricista',empresa:'A',fase:'',inicio:'2026-02-01',fim:'2026-02-28',quantidade:8},
      {funcao:'Eletricista',empresa:'A',fase:'',inicio:'2026-03-01',fim:'2026-03-20',quantidade:null}
    ]};
    assert.equal((await save(body)).status,200);
    const active=records.filter(row=>row.ativa).sort((a,b)=>a.inicio.localeCompare(b.inicio));
    assert.deepEqual(active.map(({inicio,fim,quantidade})=>({inicio,fim,quantidade})),[
      {inicio:'2026-01-15',fim:'2026-01-31',quantidade:5},
      {inicio:'2026-02-01',fim:'2026-02-28',quantidade:8}
    ]);
    assert.equal(active[1].referencia,'Contrato');
    assert.equal(records[0].ativa,false);
    const snapshot=JSON.stringify(records);
    assert.equal((await save(body)).status,409);
    assert.equal(JSON.stringify(records),snapshot);
    assert.equal((await save({versao:active.map(row=>row.id),alteracoes:[{...body.alteracoes[0],quantidade:-1}]})).status,400);
    assert.equal(JSON.stringify(records),snapshot);
    records=[
      {...records[0],id:10,inicio:'2026-02-01',fim:'2026-02-10',referencia:'Contrato A',ativa:true},
      {...records[0],id:11,inicio:'2026-02-20',fim:'2026-02-28',referencia:'Contrato B',ativa:true}
    ];
    nextId=12;
    assert.equal((await save({versao:[10,11],alteracoes:[{...body.alteracoes[0],quantidade:6}]})).status,200);
    const revised=records.filter(row=>row.ativa).sort((a,b)=>a.inicio.localeCompare(b.inicio));
    assert.deepEqual(revised.map(row=>[row.inicio,row.fim,row.quantidade,row.referencia]),[
      ['2026-02-01','2026-02-10',6,'Contrato A'],
      ['2026-02-11','2026-02-19',6,''],
      ['2026-02-20','2026-02-28',6,'Contrato B']
    ]);
    console.log('Grade mensal: revisões, preservação, lacunas e concorrência aprovadas.');
  } catch(error) {console.error(error);process.exitCode=1;} finally {server.close();}
});
