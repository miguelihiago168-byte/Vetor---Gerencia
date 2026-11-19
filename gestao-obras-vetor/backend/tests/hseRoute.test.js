const assert = require('node:assert/strict');
const express = require('express');

const mock = (name, exports) => { require.cache[require.resolve(name)] = { id:require.resolve(name), filename:require.resolve(name), loaded:true, exports }; };
const writes = [];
let overlapping = false;
mock('../config/database', {
  allQuery: async sql => sql.includes('FROM usuarios') ? [{id:1,nome:'Ana',origem:'usuario'}] : [],
  getQuery: async (sql, params) => sql.includes('data_inicio,prazo_termino') ? {data_inicio:'2026-01-15',prazo_termino:'2026-10-20'} : Number(params[0]) === 1 ? {id:1} : null,
  runQuery: async (sql, params) => { writes.push({sql,params}); return {lastID:2,changes:1}; },
  withClient: async fn => fn({query:async (sql, params) => {
    writes.push({sql,params});
    if (sql.includes('lower(trim(funcao))')) return overlapping ? {rows:[{id:42}],rowCount:1} : {rows:[],rowCount:0};
    if (sql.includes('SELECT * FROM hse_previsoes')) return {rows:[{id:3,funcao:'Montadora',empresa:'',fase:'',inicio:'2026-11-01',fim:'2026-11-30'}],rowCount:1};
    return {rows:[{id:3}],rowCount:1};
  }})
});
mock('../middleware/auth', { auth: (req,_res,next) => { req.tenantId=7; req.usuario={id:9}; next(); } });
mock('../middleware/rbac', { PERMISSIONS:{HSE_MANAGE:'hse.manage'}, requirePermission:() => (_req,_res,next) => next(), assertProjectAccess:async (_req,res,id) => { if (id === 1) return true; res.status(403).end(); return false; } });
const app = express();
app.use(express.json());
app.use('/hse', require('../routes/hse'));
const server = app.listen(0, '127.0.0.1', async () => {
  try {
    const url = `http://127.0.0.1:${server.address().port}/hse`;
    const request = (path, method, body) => fetch(url+path, {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let response = await fetch(url+'/mao-de-obra');
    assert.equal((await response.json()).pessoas[0].nome, 'Ana');
    response = await request('/mao-de-obra/usuario/1','PUT',{funcao:'Engenheira',tipo:'Indireta'});
    assert.equal(response.status,200);
    assert.deepEqual(writes.at(-1).params,[7,'usuario',1,'Engenheira','Indireta',9]);
    response = await request('/mao-de-obra/usuario/2','PUT',{funcao:'Engenheira',tipo:'Indireta'});
    assert.equal(response.status,404);
    response = await request('/mao-de-obra','POST',{nome:'Maria',funcao:'Montadora',tipo:'Terceiros'});
    assert.equal(response.status,201);
    response = await request('/mao-de-obra','POST',{nome:'Maria',funcao:'Montadora',tipo:'Inválido'});
    assert.equal(response.status,400);
    response = await request('/funcoes','POST',{nome:'Montadora'});
    assert.equal(response.status,201);
    response = await request('/mao-de-obra/1/status','PATCH',{ativo:false});
    assert.equal(response.status,200);
    assert.match(writes.at(-1).sql, /CAST\(\? AS INTEGER\)/);
    response = await request('/projetos/1/calendario','PUT',{dias:[1,2,3,4,5],excecoes:{'2026-11-07':true}});
    assert.equal(response.status,200);
    response = await fetch(url+'/projetos/1/planejamento');
    assert.equal((await response.json()).obra.data_inicio,'2026-01-15');
    response = await request('/projetos/1/previsoes','POST',{funcao:'Montadora',quantidade:0,inicio:'2026-11-02',fim:'2026-11-06'});
    assert.equal(response.status,201);
    assert.ok(writes.some(write => write.sql.includes('FOR UPDATE')));
    const beforeRevision = writes.length;
    response = await request('/projetos/1/previsoes','POST',{funcao:'Montadora',quantidade:8,inicio:'2026-11-10',fim:'2026-11-12',anterior_id:3});
    assert.equal(response.status,201);
    assert.equal(writes.slice(beforeRevision).filter(write => write.sql.includes('INSERT INTO hse_previsoes')).length,3);
    overlapping = true;
    response = await request('/projetos/1/previsoes','POST',{funcao:'Montadora',quantidade:5,inicio:'2026-11-02',fim:'2026-11-06'});
    assert.equal(response.status,409);
    overlapping = false;
    response = await request('/projetos/1/previsoes','POST',{funcao:'Montadora',quantidade:-1,inicio:'2026-11-02',fim:'2026-11-06'});
    assert.equal(response.status,400);
    response = await request('/projetos/2/calendario','PUT',{dias:[],excecoes:{}});
    assert.equal(response.status,403);
    console.log('HSE: listagem, validação, cadastro e edição aprovados.');
  } catch (error) { console.error(error); process.exitCode=1; }
  finally { server.close(); }
});
