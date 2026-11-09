// Exercise the real route handlers against isolated PostgreSQL TEMP tables.
const assert = require('node:assert/strict');
require('dotenv').config({path:require('node:path').join(__dirname,'..','.env')});
if (process.env.DB_HOST && !['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST)) throw new Error('O teste requer PostgreSQL local.');
const database = require('../config/database');

(async () => {
  const client = await database.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TEMP TABLE folhas_verificacao (id BIGINT PRIMARY KEY,tenant_id BIGINT,projeto_id BIGINT,tipo_folha TEXT,numero TEXT,fiq_numero TEXT,status TEXT,versao INT,modelo_snapshot JSONB,identificacao JSONB,populacao_total INT,amostra_prevista INT,criterio_aceitacao TEXT,maximo_nc INT,resumo JSONB,resultado_lote TEXT,atividade_eap_id BIGINT,rdo_id BIGINT,aprovado_por BIGINT,aprovado_em TIMESTAMPTZ,atualizado_por BIGINT,atualizado_em TIMESTAMPTZ);
      CREATE TEMP TABLE usuarios (id BIGINT,nome TEXT,perfil TEXT,assinatura_png TEXT);
      CREATE TEMP TABLE folhas_verificacao_respostas (id BIGINT PRIMARY KEY,tenant_id BIGINT,folha_id BIGINT,ponto_id BIGINT,item_snapshot JSONB,resultado TEXT,observacao TEXT);
      CREATE TEMP TABLE folhas_verificacao_medicoes (id BIGINT,tenant_id BIGINT,folha_id BIGINT,resultado TEXT,dados_extras JSONB,elemento TEXT,localizacao TEXT,observacao TEXT);
      CREATE TEMP TABLE folhas_verificacao_vinculos (folha_origem_id BIGINT,folha_destino_id BIGINT,obrigatorio BOOLEAN);
      CREATE TEMP TABLE folhas_verificacao_pontos (id BIGINT,folha_id BIGINT,resultado TEXT,status_montagem TEXT,status_torque TEXT,liberado BOOLEAN);
      CREATE TEMP TABLE folhas_verificacao_assinaturas (id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,folha_id BIGINT,tipo TEXT,usuario_id BIGINT,nome_snapshot TEXT,perfil_snapshot TEXT,assinatura_snapshot TEXT,versao_folha INT,ip TEXT,assinado_em TIMESTAMPTZ DEFAULT NOW(),UNIQUE(folha_id,tipo,versao_folha));
      CREATE TEMP TABLE folhas_verificacao_historico (id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,folha_id BIGINT,acao TEXT,status_anterior TEXT,status_novo TEXT,dados JSONB,usuario_id BIGINT,criado_em TIMESTAMPTZ DEFAULT NOW());
      CREATE TEMP TABLE folhas_verificacao_rncs (id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,folha_id BIGINT,rnc_id BIGINT,resposta_id BIGINT,medicao_id BIGINT,ensaio_eletrico_id BIGINT,torque_eletrico_id BIGINT,nao_conformidade_id BIGINT,dados_snapshot JSONB);
      CREATE TEMP TABLE folhas_verificacao_eletrica_ensaios (id BIGINT,tenant_id BIGINT,folha_id BIGINT,resultado TEXT,tipo TEXT,observacao TEXT);
      CREATE TEMP TABLE folhas_verificacao_evidencias (id BIGINT,tenant_id BIGINT,folha_id BIGINT,resposta_id BIGINT,medicao_id BIGINT,nome_arquivo TEXT,caminho_arquivo TEXT,descricao TEXT,ensaio_eletrico_id BIGINT,torque_eletrico_id BIGINT,nao_conformidade_id BIGINT);
      CREATE TEMP TABLE rnc (id BIGSERIAL PRIMARY KEY,tenant_id BIGINT,projeto_id BIGINT,rdo_id BIGINT,titulo TEXT,descricao TEXT,gravidade TEXT,status TEXT,acao_corretiva TEXT,origem TEXT,area_afetada TEXT,registros_fotograficos JSONB,criado_por BIGINT);
      CREATE TEMP TABLE atividades_eap (id BIGINT PRIMARY KEY,tenant_id BIGINT,projeto_id BIGINT,pai_id BIGINT);
      INSERT INTO atividades_eap VALUES (100,1,10,NULL),(101,1,10,100),(200,1,20,NULL);
      CREATE TEMP TABLE projetos (id BIGINT,tenant_id BIGINT,empresa_responsavel TEXT,empresa_executante TEXT);
      INSERT INTO projetos VALUES (10,1,'Cliente','Executante');
      CREATE TEMP TABLE folhas_verificacao_modelos (id BIGINT,tenant_id BIGINT,ativo BOOLEAN,tipo_folha TEXT,codigo TEXT,nome TEXT,configuracao JSONB);
      INSERT INTO folhas_verificacao_modelos VALUES (1,1,TRUE,'MONTAGEM','MODELO','Modelo','{"sections":[{"items":["Critério"]}]}');
      CREATE TEMP TABLE folhas_verificacao_sequencias (tenant_id BIGINT,projeto_id BIGINT,tipo_folha TEXT,ultimo_numero BIGINT,PRIMARY KEY (tenant_id,projeto_id,tipo_folha));
      CREATE TEMP SEQUENCE fiq_test_ids START 2;
      CREATE TEMP SEQUENCE fiq_answer_ids START 20;
      ALTER TABLE folhas_verificacao ALTER COLUMN id SET DEFAULT nextval('fiq_test_ids');
      ALTER TABLE folhas_verificacao ALTER COLUMN status SET DEFAULT 'RASCUNHO', ALTER COLUMN versao SET DEFAULT 1, ALTER COLUMN resultado_lote SET DEFAULT 'PENDENTE';
      ALTER TABLE folhas_verificacao ADD COLUMN modelo_id BIGINT, ADD COLUMN empresa_responsavel_snapshot JSONB, ADD COLUMN empresa_executante_snapshot JSONB, ADD COLUMN equipe_snapshot JSONB, ADD COLUMN unidade_populacao TEXT, ADD COLUMN criado_por BIGINT, ADD COLUMN enviado_em TIMESTAMPTZ, ADD COLUMN revisao INT DEFAULT 1, ADD COLUMN folha_origem_id BIGINT;
      ALTER TABLE folhas_verificacao_respostas ALTER COLUMN id SET DEFAULT nextval('fiq_answer_ids');
      ALTER TABLE folhas_verificacao_respostas ADD COLUMN modelo_item_id BIGINT, ADD COLUMN valor_texto TEXT, ADD COLUMN valor_numero NUMERIC, ADD COLUMN justificativa TEXT, ADD COLUMN responsavel_id BIGINT, ADD COLUMN prazo_correcao DATE;
      CREATE TEMP TABLE folhas_verificacao_torque_config (folha_id BIGINT);
      INSERT INTO usuarios VALUES (10,'Aprovadora','Gestor da Qualidade',NULL);
      INSERT INTO folhas_verificacao (id,tenant_id,projeto_id,tipo_folha,numero,fiq_numero,status,versao,modelo_snapshot,identificacao,populacao_total,amostra_prevista,criterio_aceitacao,maximo_nc,resumo,resultado_lote)
        VALUES (1,1,10,'MONTAGEM','FV-1','FIQ-1-10-000001','EM_ANALISE',1,'{"configuracao":{"sections":[{"items":["Critério"]}]}}','{}',0,0,'C_ZERO',0,'{}','NAO_CONFORME');
      INSERT INTO folhas_verificacao_respostas (id,tenant_id,folha_id,ponto_id,item_snapshot,resultado,observacao) VALUES (11,1,1,NULL,'{"chave":"0-0","rotulo":"Critério","obrigatorio":true}','NAO_CONFORME','Desvio');
      INSERT INTO folhas_verificacao_evidencias (id,tenant_id,folha_id,resposta_id,medicao_id,nome_arquivo,caminho_arquivo,descricao) VALUES (7,1,1,11,NULL,'foto.jpg','tenant_1/foto.jpg','Foto do desvio');
      INSERT INTO folhas_verificacao_eletrica_ensaios VALUES (21,1,1,'NAO_CONFORME','isolamento',NULL);
      INSERT INTO folhas_verificacao_evidencias (id,tenant_id,folha_id,ensaio_eletrico_id,nome_arquivo,caminho_arquivo) VALUES (8,1,1,21,'ensaio.png','tenant_1/ensaio.png');
    `);
    const query = (sql,params=[]) => client.query(database.translateQuery(sql),params);
    const all = async (sql,params=[]) => (await query(sql,params)).rows;
    const get = async (sql,params=[]) => (await all(sql,params))[0] || null;
    const exec = async (_client,sql,params=[],options={}) => {
      const returning = /^\s*INSERT\b/i.test(sql) && options.returnColumn !== null && !/RETURNING\s+\S/i.test(sql) ? ` RETURNING ${options.returnColumn || 'id'}` : '';
      const result = await query(sql + returning,params); return {lastID:result.rows[0]?.[options.returnColumn || 'id'],changes:result.rowCount};
    };
    const mock = (name,exports) => { const id=require.resolve(name); require.cache[id]={id,filename:id,loaded:true,exports}; };
    mock('../config/database',{...database,allQuery:all,getQuery:get,runQuery:(sql,p)=>exec(client,sql,p),withClient:fn=>fn(client),getWithClient:(_c,sql,p)=>get(sql,p),allWithClient:(_c,sql,p)=>all(sql,p),execWithClient:exec});
    mock('../middleware/rbac',{assertProjectAccess:async (req,res,projectId)=>{if(Number(projectId)!==10){res.status(403).json({erro:'Acesso negado'});return false;}return true;}});
    mock('../middleware/auditoria',{registrarAuditoria:async()=>{}});
    const router=require('../routes/folhas_verificacao');
    const route=(path)=>router.stack.find(layer=>layer.route?.path===path && layer.route.methods.post).route;
    const invoke=async(path,body={},profile='Gestor da Qualidade',sheetId=1)=>{
      const req={params:{id:String(sheetId)},body,tenantId:1,usuario:{id:10,perfil:profile},ip:'127.0.0.1'};
      const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
      let allowed=false; route(path).stack[1].handle(req,res,()=>{allowed=true;});
      if (allowed) await route(path).stack.at(-1).handle(req,res);
      return res;
    };
    assert.equal((await invoke('/:id/aprovar',{},'Fiscal')).code,403);
    assert.equal((await invoke('/:id/aprovar')).code,409);
    const first=await invoke('/:id/rnc-item',{resposta_id:11}); assert.equal(first.code,201);
    assert.equal((await get('SELECT registros_fotograficos FROM rnc WHERE id=?',[first.data.id])).registros_fotograficos[0].caminho_arquivo,'tenant_1/foto.jpg');
    const duplicate=await invoke('/:id/rnc-item',{resposta_id:11}); assert.equal(duplicate.data.id,first.data.id);
    const second=await invoke('/:id/rnc-item',{resposta_id:11,justificativa_nova_ocorrencia:'Outra ocorrência'}); assert.equal(second.code,201); assert.notEqual(second.data.id,first.data.id);
    const electrical=await invoke('/:id/rnc-item',{ensaio_eletrico_id:21}); assert.equal(electrical.code,201);
    assert.equal((await get('SELECT registros_fotograficos FROM rnc WHERE id=?',[electrical.data.id])).registros_fotograficos[0].caminho_arquivo,'tenant_1/ensaio.png');
    assert.equal((await invoke('/:id/aprovar',{justificativa_nok:'Aceito após análise'})).code,200);
    const sheet=await get('SELECT status,resultado_lote,aprovado_por FROM folhas_verificacao WHERE id=1');
    assert.equal(sheet.status,'APROVADA'); assert.equal(sheet.resultado_lote,'NAO_CONFORME'); assert.equal(Number(sheet.aprovado_por),10);
    const event=await get("SELECT dados,usuario_id FROM folhas_verificacao_historico WHERE acao='APPROVE'");
    assert.equal(event.dados.justificativa_nok,'Aceito após análise'); assert.equal(Number(event.usuario_id),10);
    const createRoute=route('/projeto/:projetoId');
    const create=async activity=>{
      const req={params:{projetoId:'10'},body:{modelo_id:1,atividade_eap_id:activity,identificacao:{}},tenantId:1,usuario:{id:10,perfil:'Gestor da Qualidade'}};
      const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
      await createRoute.stack.at(-1).handle(req,res); return res;
    };
    assert.equal((await create(200)).code,400);
    const created=await create(101); assert.equal(created.code,201); assert.equal(created.data.fiq_numero,'FIQ-1-10-000001');
    const snapshot=await get('SELECT modelo_snapshot,atividade_eap_id FROM folhas_verificacao WHERE id=?',[created.data.id]);
    assert.equal(snapshot.modelo_snapshot.configuracao.sections[0].items[0],'Critério'); assert.equal(Number(snapshot.atividade_eap_id),101);
    await client.query("UPDATE folhas_verificacao_modelos SET configuracao='{}' WHERE id=1");
    assert.equal((await get('SELECT modelo_snapshot FROM folhas_verificacao WHERE id=?',[created.data.id])).modelo_snapshot.configuracao.sections[0].items[0],'Critério');
    assert.equal((await invoke('/:id/enviar-analise',{},'Gestor da Qualidade',created.data.id)).code,409);
    await query("INSERT INTO folhas_verificacao_respostas (id,tenant_id,folha_id,ponto_id,item_snapshot,resultado,observacao) VALUES (12,1,?,NULL,'{\"chave\":\"0-0\",\"rotulo\":\"Critério\",\"obrigatorio\":true}','CONFORME',NULL)",[created.data.id]);
    assert.equal((await invoke('/:id/enviar-analise',{},'Gestor da Qualidade',created.data.id)).code,200);
    assert.equal((await invoke('/:id/aprovar',{},'Gestor da Qualidade',created.data.id)).code,200);
    await client.query("UPDATE folhas_verificacao SET status='REPROVADA_BLOQUEADA' WHERE id=1");
    assert.equal((await invoke('/:id/abrir-reinspecao',{justificativa:'Reinspecionar após correção'})).code,409,'RNC aberta impede reinspeção');
    await client.query("UPDATE rnc SET status='Encerrada'");
    const inspection=await invoke('/:id/abrir-reinspecao',{justificativa:'Correção executada'});
    assert.equal(inspection.code,201,JSON.stringify(inspection.data));
    assert.equal((await get('SELECT resultado FROM folhas_verificacao_respostas WHERE id=11')).resultado,'NAO_CONFORME');
    assert.equal((await get('SELECT resultado FROM folhas_verificacao_respostas WHERE folha_id=?',[inspection.data.id])).resultado,'PENDENTE');
    await client.query("UPDATE folhas_verificacao SET status='RASCUNHO' WHERE id=1");
    const patchRoute=router.stack.find(layer=>layer.route?.path==='/:id' && layer.route.methods.patch).route;
    for (const activityId of [100,200]) {
      const req={params:{id:'1'},body:{atividade_eap_id:activityId},tenantId:1,usuario:{id:10,perfil:'Gestor da Qualidade'}};
      const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
      await patchRoute.stack.at(-1).handle(req,res);
      assert.equal(res.code,400,'rejeita atividade agrupadora ou de outra obra');
    }
    console.log('FIQ PostgreSQL: autorização, NOK justificado, auditoria e RNCs por ocorrência validados em tabelas temporárias.');
  } finally { await client.query('ROLLBACK');client.release();await database.pool.end(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
