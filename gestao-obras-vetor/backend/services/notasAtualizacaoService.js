const catalog=require('../data/notasAtualizacao');
function createUpdatesService(db,notes=catalog,clock=()=>new Date()){
 const published=()=>notes.filter(n=>Date.parse(n.publicado_em)<=clock().getTime()).sort((a,b)=>Date.parse(b.publicado_em)-Date.parse(a.publicado_em)||b.id-a.id);
 async function ensure(usuarioId,tenantId,readColumn){
  if(!['lido','lida'].includes(readColumn))throw Error('Coluna de leitura inválida');
  for(const n of published())await db.runQuery(`INSERT INTO notificacoes (tenant_id,usuario_id,tipo,titulo,mensagem,referencia_tipo,referencia_id,criado_em,${readColumn})
   VALUES (?,?,'sistema_atualizacao',?,?,'sistema_atualizacao',?,?,0)
   ON CONFLICT (tenant_id,usuario_id,referencia_tipo,referencia_id) WHERE referencia_tipo='sistema_atualizacao'
   DO UPDATE SET titulo=EXCLUDED.titulo,mensagem=EXCLUDED.mensagem
   WHERE notificacoes.titulo IS DISTINCT FROM EXCLUDED.titulo OR notificacoes.mensagem IS DISTINCT FROM EXCLUDED.mensagem`,[tenantId,usuarioId,n.titulo,n.resumo,n.id,n.publicado_em]);
 }
 async function list(usuarioId,tenantId,readColumn){
  await ensure(usuarioId,tenantId,readColumn);
  const rows=await db.allQuery(`SELECT referencia_id,${readColumn} AS lida FROM notificacoes WHERE usuario_id=? AND tenant_id=? AND referencia_tipo='sistema_atualizacao'`,[usuarioId,tenantId]);
  const states=new Map(rows.map(r=>[String(r.referencia_id),Number(r.lida)===1]));
  return published().map(n=>({...n,lida:states.get(String(n.id))||false}));
 }
 function find(slug){return published().find(n=>n.slug===slug);}
 async function markRead(slug,usuarioId,tenantId,readColumn){const note=find(slug);if(!note)return false;await ensure(usuarioId,tenantId,readColumn);await db.runQuery(`UPDATE notificacoes SET ${readColumn}=1 WHERE usuario_id=? AND tenant_id=? AND referencia_tipo='sistema_atualizacao' AND referencia_id=?`,[usuarioId,tenantId,note.id]);return true;}
 return {published,ensure,list,find,markRead};
}
module.exports={createUpdatesService};
