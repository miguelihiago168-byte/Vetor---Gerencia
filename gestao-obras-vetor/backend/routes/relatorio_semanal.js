const express = require('express');
const { createWeeklyReportPdf } = require('../services/relatorioSemanalPdf');
const { buildCutoffCurve } = require('../services/relatorioSemanalCurve');
const {resolveReportUpload,companyLogos}=require('../services/relatorioSemanalAssets');
const fs = require('fs');
const path = require('path');
const { auth } = require('../middleware/auth');
const { PERMISSIONS, requirePermission, assertProjectAccess, hasPermission } = require('../middleware/rbac');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { validPeriod, buildSnapshot, mergeChoices, validateChoices } = require('../services/relatorioSemanalService');
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
  const params = [req.tenantId, project.id, fim];
  const rdos = await allQuery("SELECT id, data_relatorio, mao_obra_detalhada, atividades_avulsas FROM rdos WHERE tenant_id=? AND projeto_id=? AND status='Aprovado' AND data_relatorio>=? AND data_relatorio<=? ORDER BY data_relatorio,id", [req.tenantId, project.id, inicio, fim]);
  const activities = await allQuery('SELECT id, pai_id, codigo_eap, nome, descricao, quantidade_total, peso_percentual_projeto, percentual_previsto, percentual_executado, status, data_inicio_planejada, data_fim_planejada FROM atividades_eap WHERE tenant_id=? AND projeto_id=? ORDER BY codigo_eap,id', [req.tenantId, project.id]);
  const entries = await allQuery("SELECT ra.atividade_eap_id, ra.quantidade_executada, ra.percentual_executado, r.data_relatorio FROM rdo_atividades ra JOIN rdos r ON r.id=ra.rdo_id WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio<=? ORDER BY r.data_relatorio,r.id,ra.id", params);
  const photos = await photoMetadata(req,project.id,inicio,fim);
  const weather = await allQuery("SELECT r.data_relatorio AS data, c.periodo, c.condicao_tempo, c.condicao_trabalho, c.pluviometria_mm FROM rdo_clima c JOIN rdos r ON r.id=c.rdo_id WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio>=? AND r.data_relatorio<=? ORDER BY r.data_relatorio,c.id", [req.tenantId, project.id, inicio, fim]);
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
  const snapshot=buildSnapshot({ project, start: inicio, end: fim, rdos, activities, entries, photos, weather, supplies, supplyLinks, supplyAvailable });
  snapshot.curva_s=await cutoffCurve(req,project.id,fim,activities,entries);
  snapshot.logos_empresas=companyLogos(project,req.tenantId);
  return snapshot;
}
async function photoMetadata(req,projectId,inicio,fim){return allQuery(`SELECT f.id,f.rdo_id,f.descricao,f.atividade_avulsa_descricao,r.data_relatorio,
  ae.codigo_eap AS atividade_codigo,COALESCE(NULLIF(ae.nome,''),ae.descricao,f.atividade_avulsa_descricao) AS atividade_nome
  FROM rdo_fotos f JOIN rdos r ON r.id=f.rdo_id
  LEFT JOIN rdo_atividades ra ON ra.id=f.rdo_atividade_id AND ra.rdo_id=r.id
  LEFT JOIN atividades_eap ae ON ae.id=ra.atividade_eap_id AND ae.projeto_id=r.projeto_id AND ae.tenant_id=r.tenant_id
  WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio>=? AND r.data_relatorio<=? ORDER BY r.data_relatorio,f.ordem,f.id`,[req.tenantId,projectId,inicio,fim]);}
async function cutoffCurve(req,projectId,cutoff,activities,entries){
  activities=activities || await allQuery('SELECT id,pai_id,quantidade_total,peso_percentual_projeto,percentual_previsto,data_inicio_planejada,data_fim_planejada FROM atividades_eap WHERE tenant_id=? AND projeto_id=?',[req.tenantId,projectId]);
  entries=entries || await allQuery("SELECT ra.atividade_eap_id,ra.quantidade_executada,ra.percentual_executado,r.data_relatorio FROM rdo_atividades ra JOIN rdos r ON r.id=ra.rdo_id WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND r.data_relatorio<=? ORDER BY r.data_relatorio,r.id,ra.id",[req.tenantId,projectId,cutoff]);
  const dependencies=await allQuery('SELECT * FROM atividades_dependencias WHERE projeto_id=? AND confirmada_usuario=1',[projectId]);
  return buildCutoffCurve(activities,entries,cutoff,dependencies);
}
async function correctCurve(req,item){if(!item)return item;const content=typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo;if(content.curva_s?.versao_corte!==1 || content.curva_s.corte!==item.fim)content.curva_s=await cutoffCurve(req,item.projeto_id||req.params.projetoId,item.fim);if(!content.logos_empresas)content.logos_empresas=companyLogos(req.weeklyProject,req.tenantId);if(content.fotos.some(f=>!f.atividade)){const metadata=await photoMetadata(req,item.projeto_id||req.params.projetoId,item.inicio,item.fim);for(const f of content.fotos){const m=metadata.find(p=>String(p.id)===String(f.id));if(m)f.atividade=photoActivity(m);}}item.conteudo=content;return item;}
const photoActivity=photo=>[photo.atividade_codigo,photo.atividade_nome||photo.atividade_avulsa_descricao].filter(Boolean).join(' — ')||'Atividade não informada';
async function report(req) { return correctCurve(req,await getQuery('SELECT * FROM relatorios_semanais WHERE id=? AND tenant_id=? AND projeto_id=?', [req.params.id, req.tenantId, req.params.projetoId])); }
const withoutImages = data => ({ ...data, logos_empresas:(data.logos_empresas||[]).map(({imagem,...logo})=>logo), fotos: data.fotos.map(({ imagem, ...photo }) => photo) });
const visibleReport = (data,req) => ({ ...withoutImages(data), suprimentos:hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW) ? (data.suprimentos ?? null) : null });
async function captureImages(req, snapshot) {
  for (const photo of snapshot.fotos) {
    if (!photo.selecionada) { delete photo.imagem; continue; }
    if (photo.imagem) continue;
    const file = await getQuery('SELECT f.caminho_arquivo, f.tipo FROM rdo_fotos f JOIN rdos r ON r.id=f.rdo_id WHERE f.id=? AND r.id=? AND r.tenant_id=? AND r.projeto_id=?', [photo.id,photo.rdo_id,req.tenantId,req.params.projetoId]);
    if (!file) throw new Error('Foto selecionada indisponível.');
    const full=resolveReportUpload(file.caminho_arquivo,req.tenantId);
    if (!full) throw new Error('Arquivo da foto não encontrado nas pastas de uploads configuradas.');
    photo.imagem=(await fs.promises.readFile(full)).toString('base64'); photo.tipo_imagem=file.tipo || 'image/jpeg';
  }
}
const fail = (res, e) => { console.error('[relatório semanal]', e); if (!res.headersSent) res.status(500).json({ erro: 'Não foi possível processar o relatório semanal.' }); };
router.get('/projeto/:projetoId', async (req,res) => { try { if (!await projectAccess(req,res)) return; res.json(await allQuery('SELECT id,inicio,fim,criado_em,atualizado_em FROM relatorios_semanais WHERE tenant_id=? AND projeto_id=? ORDER BY inicio DESC,id DESC', [req.tenantId,req.params.projetoId])); } catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/fontes', async (req,res) => { try { const project=await projectAccess(req,res); if (!project) return; const {inicio,fim}=req.query; if (!validPeriod(inicio,fim)) return res.status(400).json({erro:'Escolha um período válido de até sete dias.'}); res.json(await source(req,project,inicio,fim)); } catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/curva-s', async(req,res)=>{try{const project=await projectAccess(req,res);if(!project)return;const {corte}=req.query;if(!validPeriod(corte,corte))return res.status(400).json({erro:'Informe uma data de corte válida.'});res.json(await cutoffCurve(req,project.id,corte));}catch(e){fail(res,e);}});
router.get('/projeto/:projetoId/fotos/:fotoId', async (req,res) => { try {
  if (!await projectAccess(req,res)) return;
  const photo = await getQuery("SELECT f.caminho_arquivo, f.tipo FROM rdo_fotos f JOIN rdos r ON r.id=f.rdo_id WHERE f.id=? AND r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado'", [req.params.fotoId,req.tenantId,req.params.projetoId]);
  if (!photo) return res.status(404).json({erro:'Foto não encontrada.'});
  const file=resolveReportUpload(photo.caminho_arquivo,req.tenantId);
  if (!file) return res.status(404).json({erro:'Arquivo da foto não encontrado.'});
  res.type(photo.tipo || 'application/octet-stream').sendFile(file);
} catch(e){ fail(res,e); } });
router.post('/projeto/:projetoId/preview', async (req,res) => { try {
  const project=await projectAccess(req,res); if(!project) return;
  const draft=req.body || {}; let saved=null;
  if(draft.relatorio_id) {
    saved=await getQuery('SELECT * FROM relatorios_semanais WHERE id=? AND tenant_id=? AND projeto_id=?',[draft.relatorio_id,req.tenantId,project.id]);
    if(!saved) return res.status(404).json({erro:'Relatório não encontrado.'});
    saved=await correctCurve(req,saved);
  }
  if(!saved && !validPeriod(draft.inicio,draft.fim)) return res.status(400).json({erro:'Período inválido.'});
  const previous=saved ? (typeof saved.conteudo==='string'?JSON.parse(saved.conteudo):saved.conteudo) : null;
  const basis=saved && !draft.atualizar_fontes ? previous : await source(req,project,saved?.inicio || draft.inicio,saved?.fim || draft.fim);
  if(previous && basis!==previous) for(const photo of basis.fotos) {const old=previous.fotos.find(f=>String(f.id)===String(photo.id));if(old?.imagem){photo.imagem=old.imagem;photo.tipo_imagem=old.tipo_imagem;}}
  if(draft.atualizar_curva)basis.curva_s=await cutoffCurve(req,project.id,basis.fim); const snapshot=mergeChoices(basis,draft);
  const check={...snapshot, atividades:snapshot.atividades.map(a=>a.status==='Concluída'?a:{...a,incluir:a.incluir===true,previsao:a.incluir===true && !a.previsao?'9999-12-31':a.previsao}),problemas:(snapshot.problemas||[]).map(p=>({...p,problema:p.problema||'-',solucao:p.solucao||'-',data:p.data||'2000-01-01'}))};
  const error=validateChoices(check); if(error) return res.status(400).json({erro:error});
  await captureImages(req,snapshot);
  if(!hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW)) snapshot.suprimentos=null;
  const doc=createWeeklyReportPdf(snapshot);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="previa-relatorio-semanal.pdf"');doc.pipe(res);doc.end();
} catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/:id', async (req,res) => { try { if (!await projectAccess(req,res)) return; const item=await report(req); if (!item) return res.status(404).json({erro:'Relatório não encontrado.'}); res.json({...item,conteudo:visibleReport(typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo,req)}); } catch(e){ fail(res,e); } });
router.post('/projeto/:projetoId', async (req,res) => { try { const project=await projectAccess(req,res); if (!project) return; const data=req.body; const error=validateChoices(data); if(error) return res.status(400).json({erro:error}); const fresh=await source(req,project,data.inicio,data.fim); const snapshot=mergeChoices(fresh,data); const err=validateChoices(snapshot); if(err) return res.status(400).json({erro:err}); await captureImages(req,snapshot); const result=await runQuery('INSERT INTO relatorios_semanais (tenant_id,projeto_id,inicio,fim,conteudo,criado_por) VALUES (?,?,?,?,?,?)',[req.tenantId,project.id,data.inicio,data.fim,JSON.stringify(snapshot),req.usuario.id]); res.status(201).json({id:result.lastID,conteudo:visibleReport(snapshot,req)}); } catch(e){ fail(res,e); } });
router.put('/projeto/:projetoId/:id', async (req,res) => { try { const project=await projectAccess(req,res); if (!project) return; const item=await report(req); if(!item) return res.status(404).json({erro:'Relatório não encontrado.'}); const original=typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo; const basis=req.body?.atualizar_fontes ? await source(req,project,item.inicio,item.fim) : original; for (const photo of basis.fotos) { const old=original.fotos.find(f=>String(f.id)===String(photo.id)); if (old?.imagem) { photo.imagem=old.imagem; photo.tipo_imagem=old.tipo_imagem; } } if (!hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW)) basis.suprimentos=original.suprimentos ?? null; if(req.body?.atualizar_curva)basis.curva_s=await cutoffCurve(req,project.id,item.fim); const snapshot=mergeChoices(basis,req.body || {}); const error=validateChoices(snapshot); if(error) return res.status(400).json({erro:error}); await captureImages(req,snapshot); await runQuery('UPDATE relatorios_semanais SET conteudo=?, atualizado_em=NOW() WHERE id=? AND tenant_id=? AND projeto_id=?',[JSON.stringify(snapshot),item.id,req.tenantId,req.params.projetoId]); res.json({id:item.id,conteudo:withoutImages(snapshot)}); } catch(e){ fail(res,e); } });
router.post('/projeto/:projetoId/:id/atualizar', async (req,res) => { try { const project=await projectAccess(req,res); if(!project) return; const item=await report(req); if(!item) return res.status(404).json({erro:'Relatório não encontrado.'}); const previous=typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo; const fresh=await source(req,project,item.inicio,item.fim); res.json(visibleReport(mergeChoices(fresh,previous),req)); } catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/:id/foto/:fotoId', async (req,res) => { try { if(!await projectAccess(req,res)) return; const item=await report(req); if(!item) return res.status(404).end(); const data=typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo; const photo=data.fotos.find(f=>String(f.id)===String(req.params.fotoId) && f.selecionada && f.imagem); if(!photo) return res.status(404).end(); res.setHeader('Content-Type',photo.tipo_imagem || 'image/jpeg'); res.send(Buffer.from(photo.imagem,'base64')); } catch(e){ fail(res,e); } });
router.get('/projeto/:projetoId/:id/pdf', async (req,res) => { try {
  if(!await projectAccess(req,res)) return;
  const item=await report(req); if(!item) return res.status(404).json({erro:'Relatorio nao encontrado.'});
  const data=typeof item.conteudo==='string'?JSON.parse(item.conteudo):item.conteudo;
  if (!hasPermission(req.usuario,PERMISSIONS.REQUISICAO_VIEW)) data.suprimentos=null; const doc=createWeeklyReportPdf(data);
  res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="relatorio-semanal-${item.id}.pdf"`);
  doc.pipe(res); doc.end();
} catch(e){ fail(res,e); } });
module.exports=router;
