const express = require('express');
const { auth, isGestor } = require('../middleware/auth');
const { PERMISSIONS, requirePermission, assertProjectAccess, hasPermission } = require('../middleware/rbac');
const { allQuery, getQuery, runQuery, withClient, getWithClient, allWithClient, execWithClient } = require('../config/database');
const { randomUUID } = require('crypto');
const { adicionarDiasUteis, formatarData } = require('../services/ganttService');

const router = express.Router();
router.use(auth, requirePermission(PERMISSIONS.EAP_VIEW));

const fields = ['tipo', 'insumo_id', 'descricao', 'unidade', 'quantidade', 'custo_unitario',
  'data_necessidade', 'data_necessidade_manual', 'prazo_dias', 'data_solicitacao', 'data_entrega_prevista',
  'equipamento_inicio', 'equipamento_fim', 'equipamento_origem', 'observacoes'];

const validDate = (value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

function validate(body) {
  const data = Object.fromEntries(fields.map((key) => [key, body[key] === '' || body[key] == null ? null : body[key]]));
  data.descricao = String(data.descricao || '').trim();
  data.unidade = String(data.unidade || '').trim();
  if (data.data_necessidade_manual !== null && typeof data.data_necessidade_manual !== 'boolean') return { error: 'Origem da data inválida.' };
  if (data.data_necessidade_manual === null) data.data_necessidade_manual = true;
  if (!['material', 'insumo', 'equipamento'].includes(data.tipo)) return { error: 'Tipo inválido.' };
  if (!data.descricao || !data.unidade || data.descricao.length > 500 || data.unidade.length > 40) return { error: 'Informe descrição e unidade válidas.' };
  const numeric = (value) => /^\d{1,14}(?:\.\d{1,4})?$/.test(String(value));
  if (!numeric(data.quantidade) || Number(data.quantidade) <= 0) return { error: 'Quantidade deve ser maior que zero, com até quatro casas decimais.' };
  if (data.custo_unitario !== null && !numeric(data.custo_unitario)) return { error: 'Custo unitário inválido.' };
  if (data.prazo_dias !== null && (!/^\d{1,5}$/.test(String(data.prazo_dias)))) return { error: 'Prazo inválido.' };
  for (const key of ['data_necessidade', 'data_solicitacao', 'data_entrega_prevista', 'equipamento_inicio', 'equipamento_fim']) {
    if (!validDate(data[key])) return { error: 'Data inválida.' };
  }
  if (data.equipamento_inicio && data.equipamento_fim && data.equipamento_inicio > data.equipamento_fim) return { error: 'O término deve ser posterior ao início.' };
  if (data.tipo !== 'equipamento') {
    data.equipamento_inicio = data.equipamento_fim = data.equipamento_origem = null;
  } else if (data.equipamento_origem && !['proprio', 'alugado', 'a_contratar'].includes(data.equipamento_origem)) return { error: 'Origem de equipamento inválida.' };
  if (data.insumo_id !== null && (!/^\d+$/.test(String(data.insumo_id)) || Number(data.insumo_id) < 1)) return { error: 'Insumo inválido.' };
  return { data };
}

async function access(req, res) {
  const id = Number(req.params.projetoId);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ erro: 'Projeto inválido.' }); return false; }
  if (!await assertProjectAccess(req, res, id)) return false;
  const project = await getQuery('SELECT id, nome FROM projetos WHERE id=? AND tenant_id=?', [id, req.tenantId]);
  if (!project) { res.status(404).json({ erro: 'Projeto não encontrado.' }); return false; }
  return project;
}

async function checkInsumo(req, data) {
  if (!data.insumo_id) return true;
  const item = await getQuery('SELECT id, unidade FROM estoque_insumos WHERE id=? AND tenant_id=?', [data.insumo_id, req.tenantId]);
  return !!item && item.unidade === data.unidade && data.tipo !== 'equipamento';
}

router.get('/projeto/:projetoId', async (req, res) => {
  try {
    const project = await access(req, res); if (!project) return;
    const items = await allQuery(`SELECT m.*,
      CASE WHEN m.data_necessidade_manual THEN m.data_necessidade ELSE COALESCE(e.data_inicio_planejada, m.data_necessidade) END AS data_necessidade_efetiva,
      CASE WHEN m.insumo_id IS NOT NULL AND m.atividade_id IS NOT NULL AND
        (SELECT COUNT(*) FROM mapa_suprimentos x WHERE x.tenant_id=m.tenant_id AND x.projeto_original_id=m.projeto_original_id AND x.atividade_original_id=m.atividade_original_id AND x.insumo_id=m.insumo_id)=1
      THEN (SELECT SUM(a.quantidade) FROM estoque_aplicacoes a JOIN estoque_lotes l ON l.id=a.lote_id
        LEFT JOIN rdo_atividades ra ON ra.id=a.rdo_atividade_id
        WHERE a.tenant_id=m.tenant_id AND a.projeto_id=m.projeto_id AND l.insumo_id=m.insumo_id AND a.unidade=m.unidade
          AND COALESCE(a.atividade_eap_id, ra.atividade_eap_id)=m.atividade_id
          AND (a.atividade_eap_id IS NULL OR ra.atividade_eap_id IS NULL OR a.atividade_eap_id=ra.atividade_eap_id))
      ELSE NULL END AS quantidade_consumida
      FROM mapa_suprimentos m LEFT JOIN atividades_eap e ON e.id=m.atividade_id AND e.projeto_id=m.projeto_id AND e.tenant_id=m.tenant_id
      WHERE m.tenant_id=? AND m.projeto_id=? AND m.removido_em IS NULL ORDER BY m.id`, [req.tenantId, project.id]);
    if (hasPermission(req.usuario, PERMISSIONS.REQUISICAO_VIEW)) {
      const links = await allQuery(`SELECT v.necessidade_id, v.quantidade, v.requisicao_item_id, i.quantidade AS quantidade_item, i.status_item,
        r.id AS requisicao_id, r.numero_requisicao, p.quantidade_comprada, p.quantidade_recebida,
        (SELECT MAX(l.recebido_em) FROM estoque_lotes l WHERE l.tenant_id=v.tenant_id AND l.pendencia_recebimento_id=p.id) AS ultima_entrega,
        (SELECT COUNT(*) FROM mapa_suprimentos_requisicoes t WHERE t.tenant_id=v.tenant_id AND t.requisicao_item_id=v.requisicao_item_id) AS vinculos_item,
        (SELECT SUM(t.quantidade) FROM mapa_suprimentos_requisicoes t WHERE t.tenant_id=v.tenant_id AND t.requisicao_item_id=v.requisicao_item_id) AS total_vinculado
        FROM mapa_suprimentos_requisicoes v JOIN mapa_suprimentos m ON m.id=v.necessidade_id
        LEFT JOIN requisicao_itens i ON i.id=v.requisicao_item_id
        LEFT JOIN requisicoes r ON r.id=i.requisicao_id
        LEFT JOIN estoque_pendencias_recebimento p ON p.tenant_id=v.tenant_id AND p.referencia_tipo='REQUISICAO_ITEM' AND p.referencia_id=i.id
        WHERE v.tenant_id=? AND m.projeto_id=?`, [req.tenantId, project.id]);
      for (const item of items) item.compras = links.filter((link) => String(link.necessidade_id) === String(item.id));
    }
    res.json({ projeto: project, necessidades: items });
  } catch (error) { console.error('[mapa] consulta:', error); res.status(500).json({ erro: 'Não foi possível carregar o mapa.' }); }
});

router.get('/projeto/:projetoId/insumos', async (req, res) => {
  try {
    const project = await access(req, res); if (!project) return;
    const items = await allQuery('SELECT id, nome, unidade FROM estoque_insumos WHERE tenant_id=? ORDER BY nome, unidade', [req.tenantId]);
    res.json(items);
  } catch (error) { console.error('[mapa] catálogo:', error); res.status(500).json({ erro: 'Não foi possível carregar os insumos.' }); }
});

router.get('/projeto/:projetoId/sugestao-data', async (req, res) => {
  try {
    const project = await access(req, res); if (!project) return;
    const { necessidade, prazo } = req.query;
    if (!necessidade || !validDate(necessidade) || !/^\d{1,5}$/.test(String(prazo ?? ''))) return res.status(400).json({ erro: 'Informe a data necessária e um prazo válido.' });
    res.json({ data_solicitacao: formatarData(adicionarDiasUteis(necessidade, -Number(prazo))) });
  } catch (error) { console.error('[mapa] sugestão de data:', error); res.status(500).json({ erro: 'Não foi possível sugerir a data.' }); }
});

const units = (value) => {
  const text = String(value);
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(text)) return null;
  const [whole, decimal = ''] = text.split('.');
  return BigInt(whole) * 10000n + BigInt(decimal.padEnd(4, '0'));
};
const decimal = (value) => `${value / 10000n}.${String(value % 10000n).padStart(4, '0')}`;
const conflict = (message) => Object.assign(new Error(message), { status: 409 });

router.post('/projeto/:projetoId/requisicoes', isGestor, requirePermission(PERMISSIONS.REQUISICAO_CREATE), async (req, res) => {
  try {
    const project = await access(req, res); if (!project) return;
    const selected = req.body.itens;
    if (!Array.isArray(selected) || !selected.length || selected.length > 100) return res.status(400).json({ erro: 'Selecione entre 1 e 100 necessidades.' });
    const requests = new Map();
    for (const item of selected) {
      const id = Number(item.id); const amount = units(item.quantidade);
      if (!Number.isSafeInteger(id) || id < 1 || amount === null || amount <= 0n || requests.has(id)) return res.status(400).json({ erro: 'Necessidade ou quantidade inválida ou duplicada.' });
      requests.set(id, amount);
    }
    const ids = [...requests.keys()].sort((a, b) => a - b);
    const result = await withClient(async (client) => {
      const rows = await allWithClient(client, `SELECT m.*, CASE WHEN m.data_necessidade_manual THEN m.data_necessidade ELSE COALESCE(e.data_inicio_planejada,m.data_necessidade) END AS data_necessidade_efetiva
        FROM mapa_suprimentos m LEFT JOIN atividades_eap e ON e.id=m.atividade_id AND e.projeto_id=m.projeto_id AND e.tenant_id=m.tenant_id
        WHERE m.tenant_id=? AND m.projeto_id=? AND m.removido_em IS NULL AND m.id IN (${ids.map(() => '?').join(',')}) ORDER BY m.id FOR UPDATE OF m`, [req.tenantId, project.id, ...ids]);
      if (rows.length !== ids.length) throw conflict('Uma necessidade não existe ou não pertence a esta obra.');
      const groups = new Map();
      for (const row of rows) {
        if (!row.atividade_id) throw conflict('A atividade de uma das necessidades foi excluída.');
        if (row.tipo === 'equipamento' && !row.equipamento_origem) throw conflict('Informe a origem do equipamento antes de encaminhá-lo.');
        if (row.tipo === 'equipamento' && row.equipamento_origem === 'proprio') throw conflict('Equipamento próprio não pode ser encaminhado como compra.');
        await allWithClient(client, `SELECT i.id FROM requisicao_itens i JOIN mapa_suprimentos_requisicoes v ON v.requisicao_item_id=i.id
          WHERE v.tenant_id=? AND v.necessidade_id=? ORDER BY i.id FOR UPDATE OF i`, [req.tenantId, row.id]);
        const links = await allWithClient(client, `SELECT v.quantidade, i.id AS item_id, i.quantidade AS quantidade_item, i.status_item,
          (SELECT SUM(x.quantidade) FROM mapa_suprimentos_requisicoes x WHERE x.tenant_id=v.tenant_id AND x.requisicao_item_id=v.requisicao_item_id) AS total_vinculado
          FROM mapa_suprimentos_requisicoes v LEFT JOIN requisicao_itens i ON i.id=v.requisicao_item_id WHERE v.tenant_id=? AND v.necessidade_id=?`, [req.tenantId, row.id]);
        let covered = 0n;
        for (const link of links) {
          if (!link.item_id) throw conflict('Uma requisição vinculada foi removida; confira o histórico antes de solicitar novamente.');
          if (['Reprovado', 'Cancelado'].includes(link.status_item)) continue;
          if (units(link.quantidade_item) !== units(link.total_vinculado)) throw conflict('Uma quantidade da requisição vinculada foi alterada; confira o histórico antes de solicitar novamente.');
          covered += units(link.quantidade);
        }
        const amount = requests.get(Number(row.id));
        if (covered + amount > units(row.quantidade)) throw conflict('A quantidade solicitada excede a necessidade ainda não encaminhada.');
        const key = row.insumo_id ? JSON.stringify([row.insumo_id, row.unidade, row.data_necessidade_efetiva || '', row.data_entrega_prevista || '', row.prazo_dias, row.tipo, row.equipamento_origem || '', row.descricao.trim().toLocaleLowerCase('pt-BR'), String(row.observacoes || '').trim().toLocaleLowerCase('pt-BR')]) : `livre:${row.id}`;
        if (!groups.has(key)) groups.set(key, { row, amount: 0n, entries: [] });
        const group = groups.get(key); group.amount += amount; group.entries.push({ row, amount });
      }
      if (groups.size > 10) throw conflict('A requisição permite até 10 itens diferentes; selecione menos necessidades.');
      const dataNumero = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const numeroProvisorio = `MAP-${dataNumero}-${randomUUID()}`;
      const created = await execWithClient(client, `INSERT INTO requisicoes (grupo_id, tenant_destino_id, projeto_destino_id, numero_requisicao, projeto_id, solicitante_id, tipo_material, urgencia, observacao_geral)
        VALUES (?, ?, ?, ?, ?, ?, 'Outros', 'Normal', ?)`, [req.grupoId, req.tenantId, project.id, numeroProvisorio, project.id, req.usuario.id, 'Originada no Mapa de Suprimentos.']);
      const numero = `MAP-${dataNumero}-${String(created.lastID).padStart(6, '0')}`;
      await execWithClient(client, 'UPDATE requisicoes SET numero_requisicao=? WHERE id=?', [numero, created.lastID]);
      for (const group of groups.values()) {
        const item = await execWithClient(client, `INSERT INTO requisicao_itens (requisicao_id, descricao, quantidade, unidade, especificacao_tecnica, justificativa) VALUES (?, ?, ?, ?, ?, ?)`, [created.lastID, group.row.descricao, decimal(group.amount), group.row.unidade, group.row.observacoes || null, 'Necessidade planejada no Mapa de Suprimentos.']);
        for (const entry of group.entries) await execWithClient(client, `INSERT INTO mapa_suprimentos_requisicoes (tenant_id, necessidade_id, requisicao_item_id, requisicao_item_original_id, quantidade) VALUES (?, ?, ?, ?, ?)`, [req.tenantId, entry.row.id, item.lastID, item.lastID, decimal(entry.amount)]);
      }
      await execWithClient(client, `INSERT INTO requisicao_historico (requisicao_id, usuario_id, tipo_evento, status_novo, detalhes) VALUES (?, ?, 'REQUISICAO_CRIADA', 'Em análise', ?)`, [created.lastID, req.usuario.id, JSON.stringify({ numero, origem: 'mapa_suprimentos' })]);
      return { id: created.lastID, numero };
    });
    res.status(201).json(result);
  } catch (error) { if (error.status) return res.status(error.status).json({ erro: error.message }); console.error('[mapa] requisição:', error); res.status(500).json({ erro: 'Não foi possível criar a requisição.' }); }
});

router.post('/projeto/:projetoId', isGestor, async (req, res) => {
  try {
    const project = await access(req, res); if (!project) return;
    const { data, error } = validate(req.body); if (error) return res.status(400).json({ erro: error });
    const activity = await getQuery(`SELECT a.id, a.codigo_eap, a.descricao,
      EXISTS (SELECT 1 FROM atividades_eap child WHERE child.pai_id=a.id AND child.projeto_id=a.projeto_id AND child.tenant_id=a.tenant_id) AS tem_filhos
      FROM atividades_eap a WHERE a.id=? AND a.projeto_id=? AND a.tenant_id=?`, [req.body.atividade_id, project.id, req.tenantId]);
    if (!activity) return res.status(400).json({ erro: 'Atividade inválida para esta obra.' });
    if (activity.tem_filhos) return res.status(409).json({ erro: 'Cadastre insumos nas atividades sem subdivisões da EAP.' });
    if (!await checkInsumo(req, data)) return res.status(400).json({ erro: 'Insumo ou unidade inválidos.' });
    const values = fields.map((field) => data[field]);
    const result = await runQuery(`INSERT INTO mapa_suprimentos (tenant_id, projeto_id, atividade_id, projeto_original_id, atividade_original_id, atividade_codigo, atividade_descricao, criado_por, ${fields.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${fields.map(() => '?').join(', ')})`, [req.tenantId, project.id, activity.id, project.id, activity.id, activity.codigo_eap || '', activity.descricao || '', req.usuario.id, ...values]);
    res.status(201).json({ id: result.lastID });
  } catch (error) { console.error('[mapa] criação:', error); res.status(500).json({ erro: 'Não foi possível registrar a necessidade.' }); }
});

router.put('/projeto/:projetoId/:id', isGestor, async (req, res) => {
  try {
    const project = await access(req, res); if (!project) return;
    const { data, error } = validate(req.body); if (error) return res.status(400).json({ erro: error });
    if (!await checkInsumo(req, data)) return res.status(400).json({ erro: 'Insumo ou unidade inválidos.' });
    const result = await withClient(async (client) => {
      const current = await getWithClient(client, 'SELECT * FROM mapa_suprimentos WHERE id=? AND projeto_id=? AND tenant_id=? AND removido_em IS NULL FOR UPDATE', [req.params.id, project.id, req.tenantId]);
      if (!current) return { changes: 0 };
      const linked = await getWithClient(client, 'SELECT id FROM mapa_suprimentos_requisicoes WHERE tenant_id=? AND necessidade_id=? LIMIT 1', [req.tenantId, current.id]);
      if (linked) {
        if (current.tipo !== data.tipo || String(current.insumo_id || '') !== String(data.insumo_id || '') || current.descricao !== data.descricao || current.unidade !== data.unidade) return { linked: true };
        const coverage = await getWithClient(client, `SELECT COALESCE(SUM(v.quantidade),0) AS total FROM mapa_suprimentos_requisicoes v
          LEFT JOIN requisicao_itens i ON i.id=v.requisicao_item_id WHERE v.tenant_id=? AND v.necessidade_id=? AND (i.id IS NULL OR i.status_item NOT IN ('Cancelado','Reprovado'))`, [req.tenantId, current.id]);
        if (units(data.quantidade) < units(coverage.total)) return { belowCoverage: true };
      }
      return execWithClient(client, `UPDATE mapa_suprimentos SET ${fields.map((field) => `${field}=?`).join(', ')}, atualizado_em=NOW() WHERE id=? AND projeto_id=? AND tenant_id=? AND removido_em IS NULL`, [...fields.map((field) => data[field]), req.params.id, project.id, req.tenantId]);
    });
    if (result.linked) return res.status(409).json({ erro: 'Item vinculado a uma requisição: tipo, descrição, unidade e catálogo não podem ser alterados.' });
    if (result.belowCoverage) return res.status(409).json({ erro: 'A quantidade não pode ser menor que a já encaminhada para Compras.' });
    if (!result.changes) return res.status(404).json({ erro: 'Necessidade não encontrada.' });
    res.json({ mensagem: 'Necessidade atualizada.' });
  } catch (error) { console.error('[mapa] edição:', error); res.status(500).json({ erro: 'Não foi possível atualizar a necessidade.' }); }
});

router.delete('/projeto/:projetoId/:id', isGestor, async (req, res) => {
  try {
    const project = await access(req, res); if (!project) return;
    const result = await withClient(async (client) => {
      const current = await getWithClient(client, 'SELECT id FROM mapa_suprimentos WHERE id=? AND projeto_id=? AND tenant_id=? AND removido_em IS NULL FOR UPDATE', [req.params.id, project.id, req.tenantId]);
      if (!current) return { changes: 0 };
      const linked = await getWithClient(client, 'SELECT id FROM mapa_suprimentos_requisicoes WHERE tenant_id=? AND necessidade_id=? LIMIT 1', [req.tenantId, current.id]);
      if (linked) return { linked: true };
      return execWithClient(client, 'UPDATE mapa_suprimentos SET removido_em=NOW(), atualizado_em=NOW() WHERE id=? AND projeto_id=? AND tenant_id=? AND removido_em IS NULL', [req.params.id, project.id, req.tenantId]);
    });
    if (result.linked) return res.status(409).json({ erro: 'Necessidade vinculada a uma requisição não pode ser removida.' });
    if (!result.changes) return res.status(404).json({ erro: 'Necessidade não encontrada.' });
    res.json({ mensagem: 'Necessidade removida.' });
  } catch (error) { console.error('[mapa] remoção:', error); res.status(500).json({ erro: 'Não foi possível remover a necessidade.' }); }
});

module.exports = router;
module.exports.validate = validate;
