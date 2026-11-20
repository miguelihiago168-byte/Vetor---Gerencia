const express = require('express');
const { createWeeklyReportPdf } = require('../services/relatorioSemanalPdf');
const { buildCutoffCurve } = require('../services/relatorioSemanalCurve');
const {resolveReportUpload,companyLogos}=require('../services/relatorioSemanalAssets');
const {createHash} = require('node:crypto');
const { photoFields, restorePhotos, compactPhoto, captureImages, validatePhotoLimits, PhotoChoiceError } = require('../services/relatorioSemanalFotos');
const { auth } = require('../middleware/auth');
const { PERMISSIONS, requirePermission, assertProjectAccess, hasPermission } = require('../middleware/rbac');
const { allQuery, getQuery, runQuery, withClient, allWithClient, getWithClient } = require('../config/database');
const { validPeriod, physicalHistory, buildSnapshot, mergeChoices, restoreSavedActivities, validateChoices } = require('../services/relatorioSemanalService');
const { compararMaoObra } = require('../services/hseComparativo');
const { consolidateWeather } = require('../services/relatorioSemanalClima');
const router = express.Router();
router.use(auth, requirePermission(PERMISSIONS.EAP_VIEW));
async function projectAccess(req, res) {
  const id = Number(req.params.projetoId);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ erro: 'Projeto inválido.' }); return null; }
  if (!await assertProjectAccess(req, res, id)) return null;
  const project = await getQuery('SELECT id,nome,empresa_responsavel,empresa_executante,logo_empresa_responsavel,logo_empresa_executante FROM projetos WHERE id=? AND tenant_id=?', [id, req.tenantId]);
  req.weeklyProject=project;
  if (!project) res.status(404).json({ erro: 'Projeto não encontrado.' });
  return project;
}
async function source(req, project, inicio, fim) {
  return withClient(async client => {
  const allQuery = (sql, params) => allWithClient(client, sql, params);
  const getQuery = (sql, params) => getWithClient(client, sql, params);
  const params = [req.tenantId, project.id, fim];
  const rdos = await allQuery("SELECT id, data_relatorio, mao_obra_detalhada, atividades_avulsas FROM rdos WHERE tenant_id=? AND projeto_id=? AND status='Aprovado' AND data_relatorio>=? AND data_relatorio<=? ORDER BY data_relatorio,id", [req.tenantId, project.id, inicio, fim]);
  const activities = await allQuery('SELECT id, pai_id, codigo_eap, nome, descricao, quantidade_total, peso_percentual_projeto, percentual_previsto, percentual_executado, status, criado_em, atualizado_em, data_inicio_planejada, data_fim_planejada FROM atividades_eap WHERE tenant_id=? AND projeto_id=? ORDER BY codigo_eap,id', [req.tenantId, project.id]);
  const history = await physicalHistory(allQuery, req.tenantId, project.id);
  const entries = await allQuery("SELECT ra.atividade_eap_id, ra.quantidade_executada, ra.percentual_executado, r.data_relatorio FROM rdo_atividades ra JOIN rdos r ON r.id=ra.rdo_id WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio<=? ORDER BY r.data_relatorio,r.id,ra.id", params);
  const photos = await photoMetadata(req,project.id,inicio,fim,allQuery);
  const weather = await allQuery("SELECT r.data_relatorio AS data, c.periodo, c.condicao_tempo, c.condicao_trabalho, c.pluviometria_mm FROM rdo_clima c JOIN rdos r ON r.id=c.rdo_id WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio>=? AND r.data_relatorio<=? ORDER BY r.data_relatorio,c.id", [req.tenantId, project.id, inicio, fim]);
  const weatherOccurrences = await allQuery("SELECT r.data_relatorio AS data, o.data_ocorrencia, o.hora_inicio, o.hora_fim, o.em_andamento FROM rdo_ocorrencias o JOIN rdos r ON r.id=o.rdo_id WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio>=? AND r.data_relatorio<=? AND o.categoria='Clima' AND o.paralisacao=1 ORDER BY r.data_relatorio,o.id", [req.tenantId, project.id, inicio, fim]);
  const supplyAvailable = hasPermission(req.usuario, PERMISSIONS.REQUISICAO_VIEW);
  let supplies=[], supplyLinks=[];
  if (supplyAvailable) {
    supplies=await allQuery(`SELECT m.id,m.descricao,m.unidade,m.quantidade,m.atividade_codigo,m.data_entrega_prevista,
      CASE WHEN m.data_necessidade_manual THEN m.data_necessidade ELSE COALESCE(e.data_inicio_planejada,m.data_necessidade) END AS data_necessidade_efetiva
      FROM mapa_suprimentos m LEFT JOIN atividades_eap e ON e.id=m.atividade_id AND e.projeto_id=m.projeto_id AND e.tenant_id=m.tenant_id
      WHERE m.tenant_id=? AND m.projeto_id=? AND m.removido_em IS NULL ORDER BY m.id`, [req.tenantId,project.id]);
    supplyLinks=await allQuery(`SELECT v.necessidade_id,v.quantidade,v.requisicao_item_id,i.quantidade AS quantidade_item,i.status_item,p.quantidade_recebida,
      (SELECT COUNT(*) FROM mapa_suprimentos_requisicoes t WHERE t.tenant_id=v.tenant_id AND t.requisicao_item_id=v.requisicao_item_id) AS vinculos_item,
      (SELECT SUM(t.quantidade) FROM mapa_suprimentos_requisicoes t WHERE t.tenant_id=v.tenant_id AND t.requisicao_item_id=v.requisicao_item_id) AS total_vinculado
      FROM mapa_suprimentos_requisicoes v JOIN mapa_suprimentos m ON m.id=v.necessidade_id
      LEFT JOIN requisicao_itens i ON i.id=v.requisicao_item_id
      LEFT JOIN estoque_pendencias_recebimento p ON p.tenant_id=v.tenant_id AND p.referencia_tipo='REQUISICAO_ITEM' AND p.referencia_id=i.id
      WHERE v.tenant_id=? AND m.projeto_id=?`,[req.tenantId,project.id]);
  }
  const snapshot=buildSnapshot({ project, start: inicio, end: fim, rdos, activities, entries, history, photos, weather, supplies, supplyLinks, supplyAvailable });
  const calendario = await getQuery('SELECT dias,excecoes FROM hse_calendarios WHERE tenant_id=? AND projeto_id=? AND atualizado_em < ((?::date + 1)::timestamp AT TIME ZONE ?)',[req.tenantId,project.id,fim,process.env.APP_TIME_ZONE || 'America/Sao_Paulo']);
  const previsoes = await allQuery("SELECT id,funcao,quantidade,inicio,fim FROM hse_previsoes WHERE tenant_id=? AND projeto_id=? AND ativa AND inicio<=? AND fim>=? AND criado_em < ((?::date + 1)::timestamp AT TIME ZONE ?)",[req.tenantId,project.id,fim,inicio,fim,process.env.APP_TIME_ZONE || 'America/Sao_Paulo']);
  const rdosPresenca = await allQuery('SELECT id,data_relatorio,status,mao_obra_detalhada FROM rdos WHERE tenant_id=? AND projeto_id=? AND data_relatorio>=? AND data_relatorio<=? ORDER BY data_relatorio,id',[req.tenantId,project.id,inicio,fim]);
  snapshot.clima_consolidado = consolidateWeather({ inicio, fim, rdos, allRdos: rdosPresenca, weather, occurrences: weatherOccurrences, calendario });
  snapshot.comparativo_mao_obra = compararMaoObra({inicio,fim,calendario,previsoes,rdos:rdosPresenca});
  snapshot.curva_s=await cutoffCurve(req,project.id,fim,activities,entries,allQuery);
  snapshot.logos_empresas=companyLogos(project,req.tenantId);
  snapshot.revisao_atividades = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return snapshot;
  }, undefined, undefined, { readOnlySnapshot:true });
}
async function photoMetadata(req,projectId,inicio,fim,query=allQuery){return query(`SELECT f.id,f.rdo_id,f.descricao,f.atividade_avulsa_descricao,r.data_relatorio,
  ae.id AS atividade_eap_id, ae.codigo_eap AS atividade_codigo,COALESCE(NULLIF(ae.nome,''),ae.descricao,f.atividade_avulsa_descricao) AS atividade_nome
  FROM rdo_fotos f JOIN rdos r ON r.id=f.rdo_id AND (f.tenant_id IS NULL OR f.tenant_id=r.tenant_id)
  LEFT JOIN rdo_atividades ra ON ra.id=f.rdo_atividade_id AND ra.rdo_id=r.id AND (ra.tenant_id IS NULL OR ra.tenant_id=r.tenant_id)
  LEFT JOIN atividades_eap ae ON ae.id=COALESCE(ra.atividade_eap_id,(to_jsonb(f)->>'atividade_eap_id')::bigint) AND ae.projeto_id=r.projeto_id AND ae.tenant_id=r.tenant_id
  WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio>=? AND r.data_relatorio<=? ORDER BY r.data_relatorio,f.ordem,f.id`,[req.tenantId,projectId,inicio,fim]);}
async function cutoffCurve(req,projectId,cutoff,activities,entries,query=allQuery){
  activities=activities || await query('SELECT id,pai_id,quantidade_total,peso_percentual_projeto,percentual_previsto,data_inicio_planejada,data_fim_planejada FROM atividades_eap WHERE tenant_id=? AND projeto_id=?',[req.tenantId,projectId]);
  entries=entries || await query("SELECT ra.atividade_eap_id,ra.quantidade_executada,ra.percentual_executado,r.data_relatorio FROM rdo_atividades ra JOIN rdos r ON r.id=ra.rdo_id WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio<=? ORDER BY r.data_relatorio,r.id,ra.id",[req.tenantId,projectId,cutoff]);
  const dependencies=await query('SELECT * FROM atividades_dependencias WHERE projeto_id=? AND confirmada_usuario=1',[projectId]);
  return buildCutoffCurve(activities,entries,cutoff,dependencies);
}
async function readSnapshot(req,item) {
  if (!item) return item;
  const content = typeof item.conteudo === 'string' ? JSON.parse(item.conteudo) : item.conteudo;
  const project = item.projeto_id || req.params.projetoId;
  if (content.curva_s?.versao_corte !== 1 || content.curva_s.corte !== item.fim) {
    content.curva_s_historica_indisponivel = true;
  }
  if (!content.logos_empresas) content.logos_empresas = companyLogos(req.weeklyProject,req.tenantId);
  if (content.fotos.some(photo => photo.atividade_eap_id === undefined)) {
    const rows = await photoMetadata(req,project,item.inicio,item.fim);
    const metadata = new Map(rows.map(row => [String(row.id),row]));
    for (const [index,photo] of content.fotos.entries()) {
      if (photo.atividade_eap_id !== undefined) continue;
      const row = metadata.get(String(photo.id));
      const label = photo.atividade;
      Object.assign(photo, photoFields(row || {}));
      if (label) photo.atividade = label;
      if (photo.selecionada) photo.ordem_selecao ??= index + 1;
    }
  }
  item.conteudo=content;
  return item;
}
async function report(req) { return readSnapshot(req,await getQuery('SELECT * FROM relatorios_semanais WHERE id=? AND tenant_id=? AND projeto_id=?', [req.params.id, req.tenantId, req.params.projetoId])); }
const withoutImages = data => ({ ...data, logos_empresas:(data.logos_empresas||[]).map(({imagem,...logo})=>logo), fotos: data.fotos.map(({ imagem, ...photo }) => ({...photo, tem_imagem: !!imagem})) });
const visibleReport = (data,req) => ({ ...withoutImages(data), suprimentos:hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW) ? (data.suprimentos ?? null) : null });
function restoreSavedSources(fresh, saved) {
  restoreSavedActivities(fresh, saved);
  restorePhotos(fresh, saved);
  // O comparativo é parte do retrato emitido, mesmo ao atualizar outras fontes.
  fresh.comparativo_mao_obra = saved.comparativo_mao_obra;
}
const prepareImages = (req, data) => captureImages(data, req.tenantId, req.params.projetoId, allQuery);
function sendPdf(res, report, disposition) {
  const doc = createWeeklyReportPdf(report);
  const warnings = report.fotos.filter(photo => photo.selecionada && photo.aviso).length;
  res.setHeader('X-Fotos-Indisponiveis', String(warnings));
  res.setHeader('Content-Disposition', disposition);
  res.type('application/pdf');
  doc.pipe(res);
  doc.end();
}
const fail = (res, error) => {
  if (res.headersSent) return;
  if (error instanceof PhotoChoiceError) return res.status(error.status).json({erro:error.message});
  console.error('[relatório semanal]', error);
  res.status(500).json({ erro: 'Não foi possível processar o relatório semanal.' });
};
function sourcesChanged(draft, basis, res) {
  if (!draft.revisao_atividades || draft.revisao_atividades === basis.revisao_atividades) return false;
  res.status(409).json({erro:'As fontes do relatório mudaram. Prepare o relatório ou atualize as fontes novamente para revisar os valores.'});
  return true;
}
router.get('/projeto/:projetoId', async (req,res) => { try { if (!await projectAccess(req,res)) return; res.json(await allQuery('SELECT id,inicio,fim,criado_em,atualizado_em FROM relatorios_semanais WHERE tenant_id=? AND projeto_id=? ORDER BY inicio DESC,id DESC', [req.tenantId,req.params.projetoId])); } catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/fontes', async (req,res) => { try { const project=await projectAccess(req,res); if (!project) return; const {inicio,fim}=req.query; if (!validPeriod(inicio,fim)) return res.status(400).json({erro:'Escolha um período válido de até 31 dias.'}); res.json(await source(req,project,inicio,fim)); } catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/curva-s', async(req,res)=>{try{const project=await projectAccess(req,res);if(!project)return;const {corte}=req.query;if(!validPeriod(corte,corte))return res.status(400).json({erro:'Informe uma data de corte válida.'});res.json(await cutoffCurve(req,project.id,corte));}catch(e){fail(res,e);}});
router.get('/projeto/:projetoId/fotos/:fotoId', async (req,res) => { try {
  if (!await projectAccess(req,res)) return;
  const photo = await getQuery("SELECT f.caminho_arquivo, f.tipo FROM rdo_fotos f JOIN rdos r ON r.id=f.rdo_id AND (f.tenant_id IS NULL OR f.tenant_id=r.tenant_id) WHERE f.id=? AND r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado'", [req.params.fotoId,req.tenantId,req.params.projetoId]);
  if (!photo) return res.status(404).json({erro:'Foto não encontrada.'});
  const file=resolveReportUpload(photo.caminho_arquivo,req.tenantId);
  if (!file) return res.status(404).json({erro:'Arquivo da foto não encontrado.'});
  if (req.query.miniatura === '1') {
    const bytes = await compactPhoto(file, 400);
    return res.type('image/jpeg').send(bytes);
  }
  res.type(photo.tipo || 'application/octet-stream').sendFile(file);
} catch(e){ fail(res,e); } });
router.post('/projeto/:projetoId/preview', async (req,res) => { try {
  const project=await projectAccess(req,res); if(!project) return;
  const draft=req.body || {}; let saved=null;
  if(draft.relatorio_id) {
    saved=await getQuery('SELECT * FROM relatorios_semanais WHERE id=? AND tenant_id=? AND projeto_id=?',[draft.relatorio_id,req.tenantId,project.id]);
    if(!saved) return res.status(404).json({erro:'Relatório não encontrado.'});
    saved=await readSnapshot(req,saved);
  }
  if(!saved && !validPeriod(draft.inicio,draft.fim)) return res.status(400).json({erro:'Período inválido.'});
  const previous=saved ? (typeof saved.conteudo==='string'?JSON.parse(saved.conteudo):saved.conteudo) : null;
  const basis=saved && !draft.atualizar_fontes ? previous : await source(req,project,saved?.inicio || draft.inicio,saved?.fim || draft.fim);
  if (sourcesChanged(draft,basis,res)) return;
  if (previous && basis !== previous) restoreSavedSources(basis, previous);
  if(draft.atualizar_curva){basis.curva_s=await cutoffCurve(req,project.id,basis.fim);basis.curva_s_historica_indisponivel=false;} const snapshot=mergeChoices(basis,draft);
  const check={...snapshot, atividades:snapshot.atividades.map(a=>a.status==='Concluída'?a:{...a,incluir:a.incluir===true,previsao:a.incluir===true && !a.previsao?'9999-12-31':a.previsao}),problemas:(snapshot.problemas||[]).map(p=>({...p,problema:p.problema||'-',solucao:p.solucao||'-',data:p.data||'2000-01-01'}))};
  const error=validateChoices(check); if(error) return res.status(400).json({erro:error});
  await prepareImages(req,snapshot);
  if(!hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW)) snapshot.suprimentos=null;
  sendPdf(res, snapshot, 'inline; filename="previa-relatorio-semanal.pdf"');
} catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/:id', async (req,res) => { try { if (!await projectAccess(req,res)) return; const item=await report(req); if (!item) return res.status(404).json({erro:'Relatório não encontrado.'}); res.json({...item,conteudo:visibleReport(typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo,req)}); } catch(e){ fail(res,e); } });
router.post('/projeto/:projetoId', async (req,res) => { try {
  const project = await projectAccess(req,res);
  if (!project) return;
  const draft = req.body;
  if (!Array.isArray(draft?.fotos)) return res.status(400).json({erro:'Seleção de fotografias inválida.'});
  // Group membership is only available after loading the approved sources.
  const invalidDraft = validateChoices({...draft,fotos:[],clima:[],efetivo:[]});
  if (invalidDraft) return res.status(400).json({erro:invalidDraft});
  const fresh = await source(req,project,draft.inicio,draft.fim);
  if (sourcesChanged(draft,fresh,res)) return;
  const snapshot = mergeChoices(fresh,draft);
  const error = validateChoices(snapshot);
  if (error) return res.status(400).json({erro:error});
  await prepareImages(req,snapshot);
  const result = await runQuery('INSERT INTO relatorios_semanais (tenant_id,projeto_id,inicio,fim,conteudo,criado_por) VALUES (?,?,?,?,?,?)',
    [req.tenantId,project.id,draft.inicio,draft.fim,JSON.stringify(snapshot),req.usuario.id]);
  res.status(201).json({id:result.lastID,conteudo:visibleReport(snapshot,req)});
} catch(e){ fail(res,e); } });
router.put('/projeto/:projetoId/:id', async (req,res) => { try {
  const project = await projectAccess(req,res);
  if (!project) return;
  const item = await report(req);
  if (!item) return res.status(404).json({erro:'Relatório não encontrado.'});
  const draft = req.body || {};
  const original = item.conteudo;
  const basis = draft.atualizar_fontes ? await source(req,project,item.inicio,item.fim) : original;
  if (sourcesChanged(draft,basis,res)) return;
  if (basis !== original) restoreSavedSources(basis,original);
  if (!hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW)) basis.suprimentos=original.suprimentos ?? null;
  if (draft.atualizar_curva) { basis.curva_s=await cutoffCurve(req,project.id,item.fim); basis.curva_s_historica_indisponivel=false; }
  const snapshot = mergeChoices(basis,draft);
  const error = validateChoices(snapshot);
  if (error) return res.status(400).json({erro:error});
  await prepareImages(req,snapshot);
  await runQuery('UPDATE relatorios_semanais SET conteudo=?, atualizado_em=NOW() WHERE id=? AND tenant_id=? AND projeto_id=?',
    [JSON.stringify(snapshot),item.id,req.tenantId,project.id]);
  res.json({id:item.id,conteudo:visibleReport(snapshot,req)});
} catch(e){ fail(res,e); } });
router.post('/projeto/:projetoId/:id/atualizar', async (req,res) => { try {
  const project = await projectAccess(req,res);
  if (!project) return;
  const item = await report(req);
  if (!item) return res.status(404).json({erro:'Relatório não encontrado.'});
  const fresh = await source(req,project,item.inicio,item.fim);
  restoreSavedSources(fresh,item.conteudo);
  const snapshot = mergeChoices(fresh,req.body?.atividades ? req.body : item.conteudo);
  const error = validatePhotoLimits(snapshot.fotos);
  if (error) return res.status(400).json({erro:error});
  res.json(visibleReport(snapshot,req));
} catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/:id/foto/:fotoId', async (req,res) => { try {
  if (!await projectAccess(req,res)) return;
  const photo = await getQuery(`SELECT foto->>'imagem' AS imagem, foto->>'tipo_imagem' AS tipo_imagem
    FROM relatorios_semanais rs CROSS JOIN LATERAL jsonb_array_elements(rs.conteudo->'fotos') foto
    WHERE rs.id=? AND rs.tenant_id=? AND rs.projeto_id=?
      AND foto->>'id'=? AND foto->>'selecionada'='true' LIMIT 1`,
    [req.params.id,req.tenantId,req.params.projetoId,req.params.fotoId]);
  if (!photo?.imagem) return res.status(404).end();
  const bytes = Buffer.from(photo.imagem,'base64');
  if (req.query.miniatura === '1') return res.type('image/jpeg').send(await compactPhoto(bytes,400));
  res.type(photo.tipo_imagem || 'image/jpeg').send(bytes);
} catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/:id/pdf', async (req,res) => { try {
  if(!await projectAccess(req,res)) return;
  const item=await report(req); if(!item) return res.status(404).json({erro:'Relatorio nao encontrado.'});
  const data=typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo;
  if (!hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW)) data.suprimentos=null;
  await prepareImages(req,data);
  sendPdf(res, data, `attachment; filename="relatorio-semanal-${item.id}.pdf"`);
} catch(e){ fail(res,e); } });
module.exports=router;
