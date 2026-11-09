const assert = require('node:assert/strict');
const id = require.resolve('../config/database');
const folha = {id:1,tenant_id:1,projeto_id:10,tipo_folha:'MONTAGEM',numero:'FV-MON-1',fiq_numero:'FIQ-1-10-000001',revisao:1,status:'EM_ANALISE',identificacao:{},resumo:{},modelo_snapshot:{configuracao:{sections:[]}},projeto_nome:'Obra teste',criado_em:'2026-01-01T12:00:00Z'};
require.cache[id]={id,filename:id,loaded:true,exports:{
  getQuery:async sql => sql.includes('FROM folhas_verificacao f JOIN projetos') ? folha : null,
  allQuery:async () => []
}};
const {generateFolhaVerificacaoPdfBuffer}=require('../services/folhasVerificacaoPdfService');
(async()=>{const result=await generateFolhaVerificacaoPdfBuffer(1);assert.equal(result.buffer.subarray(0,5).toString(),'%PDF-');assert.ok(result.buffer.length>1000);console.log('FIQ PDF: documento pendente gerado.');})().catch(error=>{console.error(error);process.exitCode=1;});
