const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env')});
if (!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST || 'localhost')) {
  throw new Error('Este teste requer PostgreSQL local.');
}
const {pool,translateQuery} = require('../config/database');
const {physicalHistory,buildSnapshot} = require('../services/relatorioSemanalService');

async function run() {
  const client = await pool.connect();
  const query = (sql,params) => client.query(sql,params);
  try {
    await query('BEGIN');
    // Use the installed column types, with no writes to application tables.
    for (const table of ['atividades_eap','rdos','atividade_eap_eventos','historico_atividades','auditoria']) {
      await query(`CREATE TEMP TABLE ${table} AS SELECT * FROM public.${table} WITH NO DATA`);
    }
    await query(`
      INSERT INTO atividades_eap(id,tenant_id,projeto_id,criado_em) VALUES
        (1,1,10,'2026-01-01'),(2,1,20,'2026-01-01'),(3,2,30,'2026-01-01');
      INSERT INTO rdos(id,tenant_id,projeto_id,data_relatorio) VALUES
        (11,1,10,'2026-03-06'),(12,1,20,'2026-03-06'),(13,2,30,'2026-03-06');
      INSERT INTO atividade_eap_eventos(id,tenant_id,atividade_eap_id,rdo_id,origem,percentual_anterior,percentual_novo,criado_em) VALUES
        (1,1,1,11,'rdo_criado',0,15,'2026-03-06 16:00Z'),
        (2,1,1,11,'rdo_aprovado',40,65,'2026-03-09 13:00Z'),
        (3,1,1,11,'rdo_revertido',65,20,'2026-03-10 15:00Z'),
        (4,1,1,NULL,'recalculo_manual',65,55,'2026-03-12 15:00Z'),
        (5,1,2,12,'rdo_aprovado',0,70,'2026-03-06 15:00Z'),
        (6,2,3,13,'rdo_aprovado',0,80,'2026-03-06 15:00Z'),
        (7,1,1,12,'rdo_aprovado',0,90,'2026-03-06 15:00Z');
      INSERT INTO historico_atividades(id,tenant_id,atividade_eap_id,rdo_id,percentual_anterior,percentual_novo,criado_em)
        VALUES (8,1,1,11,40,40,'2026-02-28 15:00Z');
      INSERT INTO auditoria(id,tenant_id,tabela,registro_id,acao,dados_novos,criado_em)
        VALUES (9,1,'atividades_eap',1,'RECALCULAR','{"percentual_executado":40}','2026-02-27 12:00Z');
    `);
    const history = await physicalHistory(async (sql,args)=>(await query(translateQuery(sql),args)).rows,1,10);
    assert.deepEqual(history.map(row=>row.id),[9,8,2,4]);
    const activities = (await query('SELECT * FROM atividades_eap WHERE id=1')).rows;
    function progress(start,end) {
      return buildSnapshot({project:{nome:'Teste'},start,end,activities,history,entries:[],rdos:[],photos:[],weather:[]}).eap[0].fisico;
    }
    assert.equal(progress('2026-03-02','2026-03-08').atual,40);
    assert.equal(progress('2026-03-09','2026-03-11').atual,65);
    assert.equal(progress('2026-03-12','2026-03-15').evolucao,-10);
    console.log('PostgreSQL: aprovação tardia, reversão pendente, recálculo confirmado, legado, auditoria e isolamento validados.');
  } finally {
    await query('ROLLBACK');
    client.release();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
