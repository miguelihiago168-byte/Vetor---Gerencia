const assert = require('node:assert/strict');
const mock = (name, exports) => { const id = require.resolve(name); require.cache[id] = { id, filename:id, loaded:true, exports }; };
const state = { selected:true, status:'Aprovado para compra', date:null, history:0, role:'ADM' };
mock('../config/database', {
  getQuery: async (sql) => {
    if (sql.includes('FROM requisicao_itens')) return { id:2, status_item:state.status };
    if (sql.includes('FROM requisicoes')) return { projeto_id:10 };
    if (sql.includes('FROM requisicao_cotacoes')) return state.selected ? { id:3, data_entrega_prevista:state.date } : null;
    throw new Error(sql);
  },
  runQuery: async (sql, params) => { if (sql.startsWith('UPDATE requisicao_cotacoes')) state.date=params[0]; else if (sql.includes('INSERT INTO requisicao_historico')) state.history++; return { changes:1 }; },
  allQuery: async () => []
});
mock('../middleware/rbac', { carregarPerfilUsuario:async()=>({ perfil:state.role }), assertProjectAccess:async()=>true });
mock('../middleware/auth', { auth:(req,_res,next)=>{req.usuario={id:1};next();} });
(async()=>{
  const express=require('express'); const app=express(); app.use(express.json()); app.use('/requisicoes',require('../routes/requisicoes'));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    const save = (date) => fetch(`http://127.0.0.1:${server.address().port}/requisicoes/1/itens/2/cotacoes/3/previsao-entrega`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({data_entrega_prevista:date})});
    assert.equal((await save('2026-11-30')).status,200); assert.equal(state.date,'2026-11-30'); assert.equal(state.history,1);
    assert.equal((await save('2026-02-30')).status,400); assert.equal(state.date,'2026-11-30');
    state.selected=false; assert.equal((await save('2026-12-01')).status,409); state.selected=true;
    state.status='Em cotação'; assert.equal((await save('2026-12-01')).status,409); state.status='Comprado';
    assert.equal((await save('2026-12-01')).status,200);
    state.role='Almoxarife'; assert.equal((await save('2026-12-02')).status,403);
    console.log('previsaoCotacao: data, seleção, situação e permissão verificadas.');
  } finally { await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
