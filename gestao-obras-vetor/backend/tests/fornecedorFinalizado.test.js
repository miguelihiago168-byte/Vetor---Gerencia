const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path:path.join(__dirname,'..','.env') });
if (process.env.DB_HOST && !['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST)) throw new Error('Este teste requer PostgreSQL local.');
const db = require('../config/database');
const mock = (name, exports) => { const id=require.resolve(name); require.cache[id]={id,filename:id,loaded:true,exports}; };
(async()=>{
  const client=await db.pool.connect(); let server;
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE projetos (id BIGINT PRIMARY KEY, nome TEXT);
      CREATE TEMP TABLE requisicoes (id BIGINT PRIMARY KEY, projeto_id BIGINT, numero_requisicao TEXT, tipo_material TEXT);
      CREATE TEMP TABLE requisicao_itens (id BIGINT PRIMARY KEY, requisicao_id BIGINT, descricao TEXT, quantidade NUMERIC, unidade TEXT, status_item TEXT, atualizado_em TIMESTAMPTZ);
      CREATE TEMP TABLE requisicao_cotacoes (id BIGINT PRIMARY KEY, item_id BIGINT, selecionada INTEGER, valor_unitario NUMERIC, fornecedor_id BIGINT, fornecedor_nome TEXT, cnpj TEXT, prazo_entrega TEXT, condicao_pagamento TEXT);
      CREATE TEMP TABLE fornecedores (id BIGINT PRIMARY KEY, nome_fantasia TEXT, razao_social TEXT, cnpj TEXT);
      CREATE TEMP TABLE requisicao_historico (id BIGINT PRIMARY KEY, item_id BIGINT, tipo_evento TEXT, usuario_id BIGINT);
      CREATE TEMP TABLE usuarios (id BIGINT PRIMARY KEY, nome TEXT);
      CREATE TEMP TABLE pedidos_compra (id BIGINT PRIMARY KEY, descricao TEXT, quantidade NUMERIC, unidade TEXT, projeto_id BIGINT, cotacao_vencedora_id BIGINT, adm_responsavel_id BIGINT, atualizado_em TIMESTAMPTZ, status TEXT);
      CREATE TEMP TABLE cotacoes (id BIGINT PRIMARY KEY, pedido_id BIGINT, valor_unitario NUMERIC, fornecedor TEXT, prazo_entrega TEXT);
      INSERT INTO projetos VALUES (1,'Obra'); INSERT INTO requisicoes VALUES (1,1,'REQ-1','Material');
      INSERT INTO requisicao_itens VALUES (1,1,'Cabo',2,'m','Comprado',NOW()),(2,1,'Duto',1,'un','Comprado',NOW());
      INSERT INTO fornecedores VALUES (1,'Nome fantasia','Razão social','222');
      INSERT INTO requisicao_cotacoes VALUES (1,1,1,10,NULL,'Fornecedor informado','111',NULL,NULL),(2,2,1,20,1,NULL,NULL,NULL,NULL);`);
    const all=async(sql,args=[]) => (await client.query(db.translateQuery(sql),args)).rows;
    mock('../config/database',{allQuery:all,getQuery:async()=>null,runQuery:async()=>({})});
    mock('../middleware/rbac',{carregarPerfilUsuario:async()=>({perfil:'ADM'}),assertProjectAccess:async()=>true});
    mock('../middleware/auth',{auth:(req,_res,next)=>{req.usuario={id:1};next();}});
    const express=require('express'); const app=express(); app.use('/requisicoes',require('../routes/requisicoes'));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const response=await fetch(`http://127.0.0.1:${server.address().port}/requisicoes/finalizadas?projeto_id=1`);
    assert.equal(response.status,200); const data=await response.json();
    assert.equal(data.find(x=>Number(x.item_id)===1).fornecedor_nome,'Fornecedor informado');
    assert.equal(data.find(x=>Number(x.item_id)===1).fornecedor_cnpj,'111');
    assert.equal(data.find(x=>Number(x.item_id)===2).fornecedor_nome,'Nome fantasia');
    console.log('fornecedorFinalizado: nome da cotação e cadastro verificados.');
  } finally { if(server) await new Promise(resolve=>server.close(resolve)); await client.query('ROLLBACK'); client.release(); await db.pool.end(); }
})().catch(err=>{console.error(err);process.exitCode=1;});
