const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { auth } = require('../middleware/auth');
const { inferirPerfil } = require('../constants/access');
const { allQuery, getQuery, runQuery, withClient, getWithClient, allWithClient, execWithClient } = require('../config/database');
const { generateRirPdfBuffer } = require('../services/rirPdfService');
const { normalizarNomeInsumo } = require('../utils/estoque');
const { RDO_STATUS, RDO_ACTION, editableStatus, assertWorkflowAction } = require('../services/rdoWorkflowService');

const router = express.Router();
router.use(auth);
const viewRoles = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Almoxarife', 'Fiscal'];
const editRoles = ['ADM', 'Gestor Geral', 'Gestor da Qualidade', 'Almoxarife'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const root = path.resolve(__dirname, '..', 'uploads', 'rir');
const fields = ['fornecedor', 'data', 'pedido_compra', 'nota_fiscal', 'romaneio', 'veiculo', 'placa_veiculo', 'placa_carreta', 'motorista', 'transportadora', 'situacao_carga', 'condicoes_descarga', 'equipamentos', 'observacoes', 'conclusao', 'conformidade'];
const error = (res, err) => { console.error('[rir]', err); res.status(err.status || 400).json({ erro: err.message || 'Erro ao processar o RIR.' }); };
const deny = (message, status = 403) => Object.assign(new Error(message), { status });
async function access(req, projetoId, write = false) {
  const role = inferirPerfil(req.usuario);
  if (!(write ? editRoles : viewRoles).includes(role)) throw deny('Sem permissão para acessar o RIR.');
  const project = await getQuery('SELECT id, nome, rdo_exige_aprovacao_fiscal FROM projetos WHERE id=? AND tenant_id=?', [Number(projetoId), req.tenantId]);
  if (!project) throw deny('Obra não encontrada.', 404);
  if (!['ADM', 'Gestor Geral'].includes(role) && !(await getQuery('SELECT id FROM projeto_usuarios WHERE projeto_id=? AND usuario_id=? LIMIT 1', [project.id, req.usuario.id]))) throw deny('Sem acesso a esta obra.');
  return project;
}
async function report(req, id, write = false) {
  const row = await getQuery('SELECT * FROM rir_relatorios WHERE id=? AND tenant_id=?', [Number(id), req.tenantId]);
  if (!row) throw deny('RIR não encontrado.', 404);
  const project = await access(req, row.projeto_id, write);
  const [itens, anexos] = await Promise.all([
    allQuery(`SELECT ri.*, COALESCE(ri.descricao, i.nome) AS descricao, COALESCE(ri.unidade, i.unidade) AS unidade,
      COALESCE(ri.quantidade, ri.quantidade_prevista) AS quantidade, COALESCE(ri.quantidade_total, ri.quantidade_prevista) AS quantidade_total,
      l.lote, l.status_qualidade, l.pendencia_recebimento_id,
      x.quantidade_aprovada AS inspecao_aprovada, x.quantidade_bloqueada AS inspecao_bloqueada, x.quantidade_reprovada AS inspecao_reprovada, x.motivo AS inspecao_motivo
      FROM rir_itens ri LEFT JOIN estoque_lotes l ON l.id=ri.lote_id AND l.tenant_id=ri.tenant_id
      LEFT JOIN LATERAL (SELECT quantidade_aprovada, quantidade_bloqueada, quantidade_reprovada, motivo FROM estoque_inspecoes WHERE tenant_id=ri.tenant_id AND lote_id=ri.lote_id ORDER BY id DESC LIMIT 1) x ON TRUE
      LEFT JOIN estoque_insumos i ON i.id=l.insumo_id WHERE ri.rir_id=? AND ri.tenant_id=? ORDER BY ri.id`, [row.id, req.tenantId]),
    allQuery('SELECT id, nome, tipo, legenda FROM rir_anexos WHERE rir_id=? AND tenant_id=? ORDER BY id', [row.id, req.tenantId])
  ]);
  const signers = await allQuery('SELECT id, nome FROM usuarios WHERE id IN (?,?,?)', [row.criado_por || 0, row.gestor_aprovado_por || 0, row.fiscal_aprovado_por || 0]);
  const signer = id => signers.find(user => Number(user.id) === Number(id));
  return { ...row, projeto_nome: project.nome, exige_aprovacao_fiscal: Number(project.rdo_exige_aprovacao_fiscal ?? 1) !== 0, criado_por_nome: signer(row.criado_por)?.nome || null, gestor_aprovado_por_nome: signer(row.gestor_aprovado_por)?.nome || null, fiscal_aprovado_por_nome: signer(row.fiscal_aprovado_por)?.nome || null, itens, anexos };
}
function assertEditable(row, req) {
  if (Number(row.criado_por) !== Number(req.usuario.id)) throw deny('Apenas o criador pode editar a RIR.', 403);
  if (!editableStatus(row.status)) throw deny('A RIR não pode ser alterada durante ou após a aprovação.', 409);
}
function validateItem(item) {
  const descricao = String(item.descricao || '').trim(); const unidade = String(item.unidade || '').trim();
  if (!descricao || !unidade) throw new Error('Informe a descrição e a unidade de cada item.');
  const number = (value, label, positive = false) => {
    if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || (positive && Number(value) === 0)) throw new Error(`${label} inválida. ${positive ? 'Informe um valor maior que zero.' : 'Informe um valor igual ou maior que zero.'}`);
    return Number(value);
  };
  return { codigo: String(item.codigo || '').trim(), descricao, unidade, quantidade: number(item.quantidade, 'Quantidade'), quantidade_recebida: number(item.quantidade_recebida, 'Quantidade recebida'), quantidade_total: number(item.quantidade_total, 'Quantidade total', true) };
}
function validarConferencia(inspection, amount) {
  const parseAmount = (value) => { if (!/^\d+(?:\.\d{1,4})?$/.test(String(value))) throw new Error('Informe quantidades válidas na conferência.'); return Number(value); };
  const approved = parseAmount(inspection.aprovada); const blocked = parseAmount(inspection.bloqueada); const rejected = parseAmount(inspection.rejeitada);
  if (Math.abs(approved + blocked + rejected - amount) > 0.000001) throw new Error('A soma das quantidades aprovadas, bloqueadas e rejeitadas deve ser igual à quantidade recebida.');
  const reason = String(inspection.motivo || '').trim() || null;
  if ((blocked || rejected) && !reason) throw new Error('Informe o motivo da divergência na conferência.');
  return { approved, blocked, rejected, reason, status: rejected ? 'REPROVADO' : blocked ? 'BLOQUEADO' : 'APROVADO' };
}
async function insertItem(client, req, rirId, item, project, dados) {
  const data = validateItem(item);
  let loteId = null;
  let pending = null;
  const amount = data.quantidade_recebida;
  if (item.pendencia_recebimento_id) {
    const pendingId = Number(item.pendencia_recebimento_id);
    if (!Number.isSafeInteger(pendingId) || pendingId < 1) throw new Error('Pedido inválido.');
    pending = await getWithClient(client, `SELECT * FROM estoque_pendencias_recebimento WHERE id=? AND tenant_id=? AND projeto_solicitante_id=? FOR UPDATE`, [pendingId, req.tenantId, project.id]);
    if (!pending || !['AGUARDANDO_RECEBIMENTO', 'RECEBIMENTO_PARCIAL'].includes(pending.status)) throw new Error('Pedido indisponível para recebimento nesta obra.');
    if (!/^\d+(?:\.\d{1,4})?$/.test(String(item.quantidade_recebida)) || amount <= 0 || amount > Number(pending.quantidade_comprada) - Number(pending.quantidade_recebida) + 0.0000001) throw new Error('Informe uma quantidade recebida maior que zero e que não exceda o saldo do pedido.');
  }
  if (amount > 0) {
    if (!/^\d+(?:\.\d{1,4})?$/.test(String(item.quantidade_recebida))) throw new Error('Quantidade recebida inválida.');
    if (dados.data && (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data) || Number.isNaN(Date.parse(`${dados.data}T00:00:00Z`)) || new Date(`${dados.data}T00:00:00Z`).toISOString().slice(0, 10) !== dados.data)) throw new Error('Data de recebimento inválida.');
    const nome = pending?.descricao || data.descricao;
    const unidade = pending?.unidade || data.unidade;
    const normalized = normalizarNomeInsumo(nome);
    let approved = 0; let blocked = 0; let rejected = 0; let status = 'AGUARDANDO_INSPECAO'; let reason = null;
    if (item.inspecao?.modo === 'conferido') {
      ({ approved, blocked, rejected, reason, status } = validarConferencia(item.inspecao, amount));
    } else if (item.inspecao?.modo && item.inspecao.modo !== 'pendente') throw new Error('Situação de conferência inválida.');
    await execWithClient(client, `INSERT INTO estoque_insumos (tenant_id,nome,nome_normalizado,unidade,criado_por) VALUES (?,?,?,?,?) ON CONFLICT (tenant_id,nome_normalizado,unidade) DO UPDATE SET atualizado_em=NOW()`, [req.tenantId, nome, normalized, unidade, req.usuario.id]);
    const insumo = await getWithClient(client, 'SELECT id FROM estoque_insumos WHERE tenant_id=? AND nome_normalizado=? AND unidade=?', [req.tenantId, normalized, unidade]);
    const lote = await execWithClient(client, `INSERT INTO estoque_lotes (tenant_id,insumo_id,pendencia_recebimento_id,fornecedor_nome,nota_fiscal,observacoes,recebido_em,recebido_por,requer_inspecao,status_qualidade) VALUES (?,?,?,?,?,?,?,?,true,?)`, [req.tenantId, insumo.id, pending?.id || null, dados.fornecedor || pending?.fornecedor_nome || null, dados.nota_fiscal || null, `Recebimento pelo RIR #${rirId}`, dados.data || new Date().toISOString(), req.usuario.id, status]);
    loteId = lote.lastID;
    await execWithClient(client, `INSERT INTO estoque_saldos (tenant_id,lote_id,local_chave,tipo_local,projeto_id,quantidade,quantidade_quarentena) VALUES (?,?,?,'OBRA',?,?,?)`, [req.tenantId, loteId, `OBRA:${project.id}`, project.id, amount, amount - approved]);
    if (status !== 'AGUARDANDO_INSPECAO') await execWithClient(client, 'INSERT INTO estoque_inspecoes (tenant_id,lote_id,resultado,quantidade_aprovada,quantidade_bloqueada,quantidade_reprovada,motivo,inspecionado_por) VALUES (?,?,?,?,?,?,?,?)', [req.tenantId, loteId, status, approved, blocked, rejected, reason, req.usuario.id]);
    await execWithClient(client, `INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,tipo,quantidade,destino_chave,projeto_destino_id,observacoes,usuario_id) VALUES (?,?,?,'ENTRADA_COMPRA',?,?,?,?,?)`, [req.tenantId, loteId, insumo.id, amount, `OBRA:${project.id}`, project.id, `Recebimento pelo RIR #${rirId}`, req.usuario.id]);
    if (pending) { const received = Number(pending.quantidade_recebida) + amount;
      await execWithClient(client, 'UPDATE estoque_pendencias_recebimento SET quantidade_recebida=?,status=?,atualizado_em=NOW() WHERE id=? AND tenant_id=?', [received, received + 0.0000001 >= Number(pending.quantidade_comprada) ? 'RECEBIDO_TOTAL' : 'RECEBIMENTO_PARCIAL', pending.id, req.tenantId]); }
  }
  await execWithClient(client, 'INSERT INTO rir_itens (tenant_id,rir_id,lote_id,codigo,descricao,unidade,quantidade,quantidade_recebida,quantidade_total) VALUES (?,?,?,?,?,?,?,?,?)', [req.tenantId, rirId, loteId, data.codigo, data.descricao, data.unidade, data.quantidade, data.quantidade_recebida, data.quantidade_total]);
}
router.get('/projeto/:projetoId', async (req, res) => { try {
  await access(req, req.params.projetoId);
  res.json(await allQuery('SELECT r.*, (SELECT COUNT(*) FROM rir_itens i WHERE i.rir_id=r.id AND i.tenant_id=r.tenant_id) AS total_itens FROM rir_relatorios r WHERE r.tenant_id=? AND r.projeto_id=? ORDER BY r.id DESC', [req.tenantId, Number(req.params.projetoId)]));
} catch (e) { error(res, e); } });
router.get('/projeto/:projetoId/pedidos-pendentes', async (req, res) => { try {
  const project = await access(req, req.params.projetoId, true);
  res.json(await allQuery(`SELECT pe.id, pe.descricao, pe.unidade, pe.quantidade_comprada, pe.quantidade_recebida, pe.fornecedor_nome, pe.referencia_id, pe.referencia_tipo,
    (pe.quantidade_comprada-pe.quantidade_recebida) AS quantidade_pendente,
    (SELECT i.requisicao_id FROM requisicao_itens i WHERE pe.referencia_tipo='REQUISICAO_ITEM' AND i.id=pe.referencia_id) AS requisicao_id,
    (SELECT r.numero_requisicao FROM requisicao_itens i JOIN requisicoes r ON r.id=i.requisicao_id WHERE pe.referencia_tipo='REQUISICAO_ITEM' AND i.id=pe.referencia_id) AS numero_requisicao
    FROM estoque_pendencias_recebimento pe WHERE pe.tenant_id=? AND pe.projeto_solicitante_id=? AND pe.status IN ('AGUARDANDO_RECEBIMENTO','RECEBIMENTO_PARCIAL') ORDER BY pe.criado_em, pe.id`, [req.tenantId, project.id]));
} catch (e) { error(res, e); } });
router.get('/projeto/:projetoId/entradas', async (req, res) => { try {
  const project = await access(req, req.params.projetoId);
  res.json(await allQuery(`SELECT l.id, l.lote, l.nota_fiscal, l.fornecedor_nome, i.nome, i.unidade,
    COALESCE(old.quantidade_recebida, (SELECT SUM(m.quantidade) FROM estoque_movimentacoes m WHERE m.lote_id=l.id AND m.tenant_id=l.tenant_id AND m.projeto_destino_id=? AND m.tipo='ENTRADA_COMPRA')) AS quantidade_recebida FROM estoque_lotes l
    JOIN estoque_insumos i ON i.id=l.insumo_id
    LEFT JOIN material_recebimentos old ON old.id=l.material_recebimento_id AND old.tenant_id=l.tenant_id AND old.projeto_id=?
    WHERE l.tenant_id=? AND (old.id IS NOT NULL OR EXISTS (SELECT 1 FROM estoque_movimentacoes m WHERE m.lote_id=l.id AND m.tenant_id=l.tenant_id AND m.projeto_destino_id=? AND m.tipo='ENTRADA_COMPRA'))
      AND NOT EXISTS (SELECT 1 FROM rir_itens ri WHERE ri.tenant_id=l.tenant_id AND ri.lote_id=l.id)
    ORDER BY l.id DESC`, [project.id, project.id, req.tenantId, project.id]));
} catch (e) { error(res, e); } });
router.get('/:id', async (req, res) => { try { res.json(await report(req, req.params.id)); } catch (e) { error(res, e); } });
router.patch('/:id/fluxo', async (req, res) => { try {
  const existing = await report(req, req.params.id);
  const { acao, motivo } = req.body || {};
  await withClient(async client => {
    const row = await getWithClient(client, 'SELECT * FROM rir_relatorios WHERE id=? AND tenant_id=? FOR UPDATE', [existing.id, req.tenantId]);
    if (!row) throw deny('RIR não encontrado.', 404);
    const project = await getWithClient(client, 'SELECT rdo_exige_aprovacao_fiscal FROM projetos WHERE id=? AND tenant_id=?', [row.projeto_id, req.tenantId]);
    if (!project) throw deny('Obra não encontrada.', 404);
    const fiscalRequired = Number(project.rdo_exige_aprovacao_fiscal ?? 1) !== 0;
    const transition = assertWorkflowAction({ rdo: row, usuario: req.usuario, acao, motivo, exigeAprovacaoFiscal: fiscalRequired });
    if (acao === RDO_ACTION.SEND_TO_MANAGER) {
      const itemStatus = await getWithClient(client, `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE l.status_qualidade='AGUARDANDO_INSPECAO') AS pendentes
        FROM rir_itens i LEFT JOIN estoque_lotes l ON l.id=i.lote_id AND l.tenant_id=i.tenant_id WHERE i.rir_id=? AND i.tenant_id=?`, [row.id, req.tenantId]);
      if (!Number(itemStatus.total)) throw deny('Adicione pelo menos um item antes de enviar a RIR.', 400);
      if (Number(itemStatus.pendentes)) throw deny('Conclua a conferência dos itens que aguardam inspeção antes de enviar a RIR.', 409);
    }
    const isReturn = [RDO_ACTION.REQUEST_CORRECTION, RDO_ACTION.REJECT, RDO_ACTION.RETURN_APPROVED_TO_CORRECTION].includes(acao);
    const reset = isReturn || acao === RDO_ACTION.SEND_TO_MANAGER;
    const now = new Date().toISOString();
    const history = Array.isArray(row.historico_status) ? [...row.historico_status] : (() => { try { const parsed = JSON.parse(row.historico_status || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })();
    history.push({ acao, status: transition.nextStatus, etapa: transition.stage, por: req.usuario.id, nome: req.usuario.nome || null, em: now, motivo: motivo ? String(motivo).trim() : null });
    await execWithClient(client, `UPDATE rir_relatorios SET status=?, gestor_aprovado_por=?, gestor_aprovado_em=?, fiscal_aprovado_por=?, fiscal_aprovado_em=?, historico_status=?::jsonb, correcao_solicitada=?, correcao_motivo=?, atualizado_em=NOW() WHERE id=? AND tenant_id=?`, [
      transition.nextStatus,
      acao === RDO_ACTION.APPROVE_MANAGER ? req.usuario.id : reset ? null : row.gestor_aprovado_por,
      acao === RDO_ACTION.APPROVE_MANAGER ? now : reset ? null : row.gestor_aprovado_em,
      acao === RDO_ACTION.APPROVE_FISCAL ? req.usuario.id : reset ? null : row.fiscal_aprovado_por,
      acao === RDO_ACTION.APPROVE_FISCAL ? now : reset ? null : row.fiscal_aprovado_em,
      JSON.stringify(history), isReturn ? 1 : 0, isReturn ? String(motivo || '').trim() || null : null, row.id, req.tenantId
    ]);
  });
  const updated = await report(req, existing.id);
  try {
    let recipients = [];
    if (acao === RDO_ACTION.SEND_TO_MANAGER || (acao === RDO_ACTION.APPROVE_FISCAL && updated.status === RDO_STATUS.APPROVED)) {
      recipients = await allQuery(`SELECT DISTINCT u.id FROM usuarios u JOIN projeto_usuarios pu ON pu.usuario_id=u.id WHERE pu.projeto_id=? AND COALESCE(u.ativo::TEXT,'false') IN ('1','true','t') AND (u.perfil IN ('Gestor Geral','Gestor da Obra','Gestor Local','Gestor da Qualidade','Gestor de Qualidade') OR u.is_gestor=1)`, [existing.projeto_id]);
    } else if (acao === RDO_ACTION.APPROVE_MANAGER && updated.status === RDO_STATUS.FISCAL_REVIEW) {
      recipients = await allQuery(`SELECT DISTINCT u.id FROM usuarios u JOIN projeto_usuarios pu ON pu.usuario_id=u.id WHERE pu.projeto_id=? AND COALESCE(u.ativo::TEXT,'false') IN ('1','true','t') AND u.perfil='Fiscal'`, [existing.projeto_id]);
    }
    if (acao !== RDO_ACTION.SEND_TO_MANAGER) recipients.push({ id:existing.criado_por });
    const ids = [...new Set(recipients.map(user => Number(user.id)).filter(id => id > 0 && id !== Number(req.usuario.id)))];
    for (const id of ids) await runQuery("INSERT INTO notificacoes (tenant_id,usuario_id,tipo,mensagem,referencia_tipo,referencia_id) VALUES (?,?,?,?,'rir',?)", [req.tenantId, id, 'rir_fluxo', `RIR #${existing.id}: ${updated.status}${motivo ? ` - ${String(motivo).trim()}` : ''}.`, existing.id]);
  } catch (notifyError) { console.error('[rir] notificação:', notifyError.message); }
  res.json(updated);
} catch (e) { error(res, e); } });
router.post('/:id/itens/:itemId/conferir', async (req, res) => { try {
  const existing = await report(req, req.params.id, true);
  assertEditable(existing, req);
  const entry = existing.itens.find(item => Number(item.id) === Number(req.params.itemId));
  if (!entry?.lote_id) throw new Error('Item sem entrada de estoque para conferir.');
  const result = validarConferencia(req.body || {}, Number(entry.quantidade_recebida));
  await withClient(async client => {
    const lockedReport = await getWithClient(client, 'SELECT * FROM rir_relatorios WHERE id=? AND tenant_id=? FOR UPDATE', [existing.id, req.tenantId]);
    if (!lockedReport) throw deny('RIR não encontrado.', 404);
    assertEditable(lockedReport, req);
    const lote = await getWithClient(client, 'SELECT * FROM estoque_lotes WHERE id=? AND tenant_id=? FOR UPDATE', [entry.lote_id, req.tenantId]);
    if (!lote || lote.status_qualidade !== 'AGUARDANDO_INSPECAO') throw deny('Esta entrada já foi conferida ou não está aguardando inspeção.', 409);
    const saldo = await getWithClient(client, 'SELECT * FROM estoque_saldos WHERE tenant_id=? AND lote_id=? AND projeto_id=? FOR UPDATE', [req.tenantId, lote.id, existing.projeto_id]);
    if (!saldo || Math.abs(Number(saldo.quantidade_quarentena) - Number(entry.quantidade_recebida)) > 0.000001) throw deny('O saldo desta entrada foi alterado; confira a rastreabilidade antes de registrar.', 409);
    await execWithClient(client, 'UPDATE estoque_saldos SET quantidade_quarentena=quantidade_quarentena-?, atualizado_em=NOW() WHERE id=?', [result.approved, saldo.id]);
    await execWithClient(client, 'INSERT INTO estoque_inspecoes (tenant_id,lote_id,resultado,quantidade_aprovada,quantidade_bloqueada,quantidade_reprovada,motivo,inspecionado_por) VALUES (?,?,?,?,?,?,?,?)', [req.tenantId, lote.id, result.status, result.approved, result.blocked, result.rejected, result.reason, req.usuario.id]);
    await execWithClient(client, 'UPDATE estoque_lotes SET status_qualidade=? WHERE id=? AND tenant_id=?', [result.status, lote.id, req.tenantId]);
    if (result.approved) await execWithClient(client, "INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,tipo,quantidade,observacoes,usuario_id) VALUES (?,?,?,'LIBERACAO_QUALIDADE',?,?,?)", [req.tenantId, lote.id, lote.insumo_id, result.approved, `Conferência do RIR #${existing.id}`, req.usuario.id]);
    if (result.blocked + result.rejected) await execWithClient(client, "INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,tipo,quantidade,observacoes,usuario_id) VALUES (?,?,?,'BLOQUEIO_QUALIDADE',?,?,?)", [req.tenantId, lote.id, lote.insumo_id, result.blocked + result.rejected, result.reason, req.usuario.id]);
  });
  res.json(await report(req, existing.id));
} catch (e) { error(res, e); } });
router.post('/', async (req, res) => { try {
  const body = req.body || {}; const project = await access(req, body.projeto_id, true);
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (!itens.length) throw new Error('Adicione pelo menos um item.');
  const dados = Object.fromEntries(fields.map(key => [key, String(body.dados?.[key] || '').trim()]));
  const id = await withClient(async client => {
    const created = await execWithClient(client, 'INSERT INTO rir_relatorios (tenant_id,projeto_id,dados,criado_por) VALUES (?,?,?,?)', [req.tenantId, project.id, JSON.stringify(dados), req.usuario.id]);
    for (const item of itens) await insertItem(client, req, created.lastID, item, project, dados);
    return created.lastID;
  });
  res.status(201).json(await report(req, id));
} catch (e) { if (e.code === '23505') e.message = 'Uma das entradas já está vinculada a outro RIR.'; error(res, e); } });
router.put('/:id', async (req, res) => { try {
  const existing = await report(req, req.params.id, true);
  assertEditable(existing, req);
  const dados = Object.fromEntries(fields.map(key => [key, String(req.body?.dados?.[key] || '').trim()]));
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) throw new Error('Adicione pelo menos um item.');
  const ids = itens.filter(item => item.id != null).map(item => Number(item.id));
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0 || !existing.itens.some(old => Number(old.id) === id)) || new Set(ids).size !== ids.length) throw new Error('Identificação de item inválida.');
  for (const old of existing.itens.filter(item => item.lote_id)) {
    const edited = itens.find(item => Number(item.id) === Number(old.id));
    if (!edited || Number(edited.quantidade_recebida) !== Number(old.quantidade_recebida) || Number(edited.pendencia_recebimento_id || 0) !== Number(old.pendencia_recebimento_id || 0)) throw new Error('O recebimento já registrado no estoque não pode ser removido ou ter sua quantidade alterada no RIR.');
  }
  await withClient(async client => {
    const lockedReport = await getWithClient(client, 'SELECT * FROM rir_relatorios WHERE id=? AND tenant_id=? FOR UPDATE', [existing.id, req.tenantId]);
    if (!lockedReport) throw deny('RIR não encontrado.', 404);
    assertEditable(lockedReport, req);
    const currentItems = await allWithClient(client, 'SELECT id FROM rir_itens WHERE rir_id=? AND tenant_id=? ORDER BY id', [existing.id, req.tenantId]);
    if (currentItems.length !== existing.itens.length || currentItems.some((item, index) => Number(item.id) !== Number(existing.itens[index].id))) throw deny('O RIR foi alterado por outro usuário. Reabra o relatório antes de salvar.', 409);
    await execWithClient(client, 'UPDATE rir_relatorios SET dados=?, correcao_solicitada=0, atualizado_em=NOW() WHERE id=? AND tenant_id=?', [JSON.stringify(dados), Number(req.params.id), req.tenantId]);
    for (const old of existing.itens) if (!ids.includes(Number(old.id))) await execWithClient(client, 'DELETE FROM rir_itens WHERE id=? AND rir_id=? AND tenant_id=?', [old.id, existing.id, req.tenantId]);
    for (const item of itens) {
      if (item.id == null) { await insertItem(client, req, existing.id, item, { id: existing.projeto_id }, dados); continue; }
      const old = existing.itens.find(entry => Number(entry.id) === Number(item.id));
      if (!old.pendencia_recebimento_id && item.pendencia_recebimento_id) throw new Error('Adicione um novo item para registrar o recebimento de um pedido.');
      const data = validateItem(item);
      if (!old.lote_id && Number(old.quantidade_recebida) !== data.quantidade_recebida) throw new Error('Para registrar uma nova quantidade no estoque, adicione um novo item ao RIR.');
      await execWithClient(client, 'UPDATE rir_itens SET codigo=?, descricao=?, unidade=?, quantidade=?, quantidade_recebida=?, quantidade_total=? WHERE id=? AND rir_id=? AND tenant_id=?', [data.codigo, data.descricao, data.unidade, data.quantidade, data.quantidade_recebida, data.quantidade_total, Number(item.id), existing.id, req.tenantId]);
    }
  });
  res.json(await report(req, req.params.id));
} catch (e) { if (e.code === '23505') e.message = 'Uma das entradas já está vinculada a outro RIR.'; error(res, e); } });
router.post('/:id/anexos', upload.single('arquivo'), async (req, res) => { let filePath; try {
  const row = await report(req, req.params.id, true);
  assertEditable(row, req);
  if (!req.file || !['image/jpeg', 'image/png', 'application/pdf'].includes(req.file.mimetype)) throw new Error('Anexe uma imagem JPEG ou PNG, ou um PDF.');
  const bytes = req.file.buffer;
  const valid = req.file.mimetype === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) : req.file.mimetype === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.subarray(0, 5).toString() === '%PDF-';
  if (!valid) throw new Error('O conteúdo do arquivo não corresponde ao tipo informado.');
  if (req.file.mimetype.startsWith('image/')) {
    try { const probe = new PDFDocument(); probe.image(bytes, { fit: [1, 1] }); probe.end(); }
    catch (_) { throw new Error('A imagem está inválida ou não pode ser usada no relatório.'); }
  }
  const dir = path.join(root, String(req.tenantId)); fs.mkdirSync(dir, { recursive: true });
  filePath = path.join(dir, crypto.randomBytes(20).toString('hex'));
  fs.writeFileSync(filePath, req.file.buffer);
  await withClient(async client => {
    const locked = await getWithClient(client, 'SELECT * FROM rir_relatorios WHERE id=? AND tenant_id=? FOR UPDATE', [row.id, req.tenantId]);
    if (!locked) throw deny('RIR não encontrado.', 404); assertEditable(locked, req);
    await execWithClient(client, 'INSERT INTO rir_anexos (tenant_id,rir_id,caminho,nome,tipo,legenda,criado_por) VALUES (?,?,?,?,?,?,?)', [req.tenantId, row.id, filePath, path.basename(req.file.originalname), req.file.mimetype, String(req.body.legenda || ''), req.usuario.id]);
  });
  res.status(201).json(await report(req, row.id));
} catch (e) { if (filePath) fs.unlink(filePath, () => {}); error(res, e); } });
router.get('/:id/anexos/:anexoId', async (req, res) => { try {
  await report(req, req.params.id);
  const a = await getQuery('SELECT * FROM rir_anexos WHERE id=? AND rir_id=? AND tenant_id=?', [Number(req.params.anexoId), Number(req.params.id), req.tenantId]);
  if (!a) throw deny('Anexo não encontrado.', 404);
  res.type(a.tipo); res.setHeader('Content-Disposition', `inline; filename="${String(a.nome).replace(/[^a-zA-Z0-9._-]/g, '_')}"`); res.sendFile(a.caminho);
} catch (e) { error(res, e); } });
router.delete('/:id/anexos/:anexoId', async (req, res) => { try {
  const row = await report(req, req.params.id, true); assertEditable(row, req);
  const a = await getQuery('SELECT * FROM rir_anexos WHERE id=? AND rir_id=? AND tenant_id=?', [Number(req.params.anexoId), Number(req.params.id), req.tenantId]);
  if (!a) throw deny('Anexo não encontrado.', 404);
  await withClient(async client => {
    const locked = await getWithClient(client, 'SELECT * FROM rir_relatorios WHERE id=? AND tenant_id=? FOR UPDATE', [row.id, req.tenantId]);
    if (!locked) throw deny('RIR não encontrado.', 404); assertEditable(locked, req);
    await execWithClient(client, 'DELETE FROM rir_anexos WHERE id=? AND tenant_id=? AND rir_id=?', [a.id, req.tenantId, row.id]);
  });
  fs.unlink(a.caminho, () => {}); res.json(await report(req, req.params.id));
} catch (e) { error(res, e); } });
router.get('/:id/pdf', async (req, res) => { try {
  const row = await report(req, req.params.id);
  const signatures = await allQuery('SELECT id, nome, assinatura_png FROM usuarios WHERE id IN (?,?,?)', [row.criado_por || 0, row.gestor_aprovado_por || 0, row.fiscal_aprovado_por || 0]);
  const signer = id => signatures.find(user => Number(user.id) === Number(id)) || null;
  row.assinaturas = { criador: signer(row.criado_por), gestor: signer(row.gestor_aprovado_por), fiscal: signer(row.fiscal_aprovado_por) };
  const photos = await allQuery("SELECT * FROM rir_anexos WHERE rir_id=? AND tenant_id=? AND tipo IN ('image/jpeg','image/png') ORDER BY id", [row.id, req.tenantId]);
  const pdf = await generateRirPdfBuffer(row, photos);
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="RIR-${row.id}.pdf"`); res.send(pdf);
} catch (e) { if (!res.headersSent) error(res, e); else res.destroy(e); } });
module.exports = router;
module.exports.insertItem = insertItem;
