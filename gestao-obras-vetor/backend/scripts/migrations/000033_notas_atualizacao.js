module.exports={
 id:'000033_notas_atualizacao',
 description:'Notificações de atualização com leitura individual por usuário e empresa',
 async up({run}){
  await run('DROP INDEX IF EXISTS idx_notificacoes_unicas');
  await run(`CREATE UNIQUE INDEX idx_notificacoes_unicas ON notificacoes(usuario_id,tipo,titulo,mensagem)
   WHERE tipo IS DISTINCT FROM 'reuniao_lembrete' AND tipo IS DISTINCT FROM 'sistema_atualizacao'`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacao_atualizacao_empresa ON notificacoes(tenant_id,usuario_id,referencia_tipo,referencia_id)
   WHERE referencia_tipo='sistema_atualizacao'`);
 }
};
