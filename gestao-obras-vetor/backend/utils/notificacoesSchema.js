const {allQuery}=require('../config/database');
async function getNotificacoesReadColumn(){
 const columns=await allQuery('PRAGMA table_info(notificacoes)');
 return columns.some(c=>String(c.name)==='lido')?'lido':'lida';
}
module.exports={getNotificacoesReadColumn};
