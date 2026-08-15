const express = require('express');
const router = express.Router();
const { allQuery, getQuery, runQuery, withClient, runWithRequestContext } = require('../config/database');
const { auth } = require('../middleware/auth');
const { inferirPerfil } = require('../constants/access');

router.use(auth);

const canApprove = (user) => ['ADM', 'Gestor Geral'].includes(inferirPerfil(user));
const fail = (res, status, erro) => res.status(status).json({ erro });

const getTransfer = (id) => getQuery(
  `SELECT tr.*, go.nome AS grupo_nome, tor.nome AS tenant_origem_nome, tde.nome AS tenant_destino_nome,
          so.nome AS solicitante_nome, ao.nome AS aprovada_origem_nome, ad.nome AS aprovada_destino_nome
   FROM transferencias_recursos tr
   JOIN grupos_empresariais go ON go.id = tr.grupo_id
   JOIN tenants tor ON tor.id = tr.tenant_origem_id
   JOIN tenants tde ON tde.id = tr.tenant_destino_id
   JOIN usuarios so ON so.id = tr.solicitada_por
   LEFT JOIN usuarios ao ON ao.id = tr.aprovada_origem_por
   LEFT JOIN usuarios ad ON ad.id = tr.aprovada_destino_por
   WHERE tr.id = ?`, [Number(id)]
);

const hydrate = async (id) => {
  const transfer = await getTransfer(id);
  if (!transfer) return null;
  transfer.itens = await allQuery(
    `SELECT * FROM transferencia_recurso_itens WHERE transferencia_id = ? ORDER BY id`, [Number(id)]
  );
  return transfer;
};

router.get('/', async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT tr.*, tor.nome AS tenant_origem_nome, tde.nome AS tenant_destino_nome, u.nome AS solicitante_nome
       FROM transferencias_recursos tr
       JOIN tenants tor ON tor.id = tr.tenant_origem_id
       JOIN tenants tde ON tde.id = tr.tenant_destino_id
       JOIN usuarios u ON u.id = tr.solicitada_por
       WHERE tr.grupo_id = ? ORDER BY tr.criada_em DESC`, [req.grupoId]
    );
    res.json(rows);
  } catch (error) {
    console.error('[transferencias] listagem:', error);
    fail(res, 500, 'Erro ao listar transferências.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const transfer = await hydrate(req.params.id);
    if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
    res.json(transfer);
  } catch (error) {
    console.error('[transferencias] detalhe:', error);
    fail(res, 500, 'Erro ao buscar transferência.');
  }
});

router.post('/', async (req, res) => {
  try {
    const { tenant_destino_id, itens, motivo } = req.body || {};
    const destinationId = Number(tenant_destino_id);
    if (!destinationId || destinationId === Number(req.tenantId)) return fail(res, 400, 'Informe outro CNPJ de destino.');
    if (!Array.isArray(itens) || itens.length === 0) return fail(res, 400, 'Informe ao menos um recurso.');

    const destination = await getQuery('SELECT id FROM tenants WHERE id = ? AND grupo_id = ? AND ativo = 1', [destinationId, req.grupoId]);
    if (!destination) return fail(res, 400, 'CNPJ de destino inválido para o grupo empresarial.');

    const prepared = [];
    for (const item of itens) {
      const type = String(item.tipo_recurso || '').toUpperCase();
      const projectId = Number(item.projeto_destino_id);
      if (!['MATERIAL', 'FERRAMENTA'].includes(type) || !projectId) return fail(res, 400, 'Item de transferência inválido.');
      const destinationProject = await runWithRequestContext({
        userId: req.usuario.id,
        tenantId: destinationId,
        groupId: req.grupoId,
        role: req.usuario.perfil,
      }, () => getQuery('SELECT id FROM projetos WHERE id = ? AND tenant_id = ?', [projectId, destinationId]));
      if (!destinationProject) return fail(res, 400, 'Projeto de destino inválido.');
      if (type === 'MATERIAL') {
        const qty = Number(item.quantidade);
        const material = await getQuery('SELECT id, nome_material, unidade FROM material_recebimentos WHERE id = ?', [Number(item.material_recebimento_origem_id)]);
        if (!material || !(qty > 0)) return fail(res, 400, 'Material ou quantidade inválidos.');
        prepared.push({ type, materialId: material.id, toolId: null, projectId, quantity: qty, unit: item.unidade || material.unidade, description: material.nome_material });
      } else {
        const tool = await getQuery('SELECT id, nome FROM almox_ferramentas WHERE id = ?', [Number(item.ferramenta_origem_id)]);
        if (!tool) return fail(res, 400, 'Ferramenta de origem inválida.');
        prepared.push({ type, materialId: null, toolId: tool.id, projectId, quantity: null, unit: null, description: tool.nome });
      }
    }

    const created = await runQuery(
      `INSERT INTO transferencias_recursos (grupo_id, tenant_origem_id, tenant_destino_id, solicitada_por, motivo)
       VALUES (?, ?, ?, ?, ?)`, [req.grupoId, req.tenantId, destinationId, req.usuario.id, motivo || null]
    );
    for (const item of prepared) {
      await runQuery(
        `INSERT INTO transferencia_recurso_itens
          (transferencia_id, tipo_recurso, material_recebimento_origem_id, ferramenta_origem_id, projeto_destino_id, quantidade, unidade, descricao_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [created.lastID, item.type, item.materialId, item.toolId, item.projectId, item.quantity, item.unit, item.description]
      );
    }
    res.status(201).json(await hydrate(created.lastID));
  } catch (error) {
    console.error('[transferencias] criação:', error);
    fail(res, 500, 'Erro ao solicitar transferência.');
  }
});

router.post('/:id/aprovar-origem', async (req, res) => {
  if (!canApprove(req.usuario)) return fail(res, 403, 'Somente ADM ou Gestor Geral aprova transferências.');
  try {
    const transfer = await getTransfer(req.params.id);
    if (!transfer || Number(transfer.tenant_origem_id) !== Number(req.tenantId)) return fail(res, 404, 'Transferência de origem não encontrada.');
    if (transfer.status !== 'PENDENTE_ORIGEM') return fail(res, 409, 'Transferência não aguarda aprovação de origem.');

    await withClient(async (client) => {
      const items = (await client.query('SELECT * FROM transferencia_recurso_itens WHERE transferencia_id = $1 FOR UPDATE', [transfer.id])).rows;
      for (const item of items.filter((row) => row.tipo_recurso === 'MATERIAL')) {
        const materialResult = await client.query(
          `SELECT m.*, COALESCE((SELECT SUM(a.quantidade) FROM material_aplicacoes a
             WHERE a.recebimento_id = m.id AND a.tipo_movimento IN ('Aplicação','Saída','Devolução','Descarte')), 0) AS utilizado
           FROM material_recebimentos m WHERE m.id = $1 FOR UPDATE`, [item.material_recebimento_origem_id]
        );
        const material = materialResult.rows[0];
        const available = Number(material?.quantidade_aprovada || 0) - Number(material?.utilizado || 0) - Number(material?.quantidade_reservada || 0);
        if (!material || available < Number(item.quantidade)) throw new Error(`Saldo insuficiente para ${item.descricao_snapshot}.`);
        await client.query('UPDATE material_recebimentos SET quantidade_reservada = quantidade_reservada + $1 WHERE id = $2', [item.quantidade, material.id]);
      }
      await client.query(
        `UPDATE transferencias_recursos SET status = 'PENDENTE_DESTINO', aprovada_origem_por = $1, aprovada_origem_em = NOW() WHERE id = $2`,
        [req.usuario.id, transfer.id]
      );
    });
    res.json(await hydrate(req.params.id));
  } catch (error) {
    console.error('[transferencias] aprovação origem:', error);
    fail(res, 409, error.message || 'Não foi possível aprovar a origem.');
  }
});

router.post('/:id/aprovar-destino', async (req, res) => {
  if (!canApprove(req.usuario)) return fail(res, 403, 'Somente ADM ou Gestor Geral aprova transferências.');
  try {
    const transfer = await getTransfer(req.params.id);
    if (!transfer || Number(transfer.tenant_destino_id) !== Number(req.tenantId)) return fail(res, 404, 'Transferência de destino não encontrada.');
    if (transfer.status !== 'PENDENTE_DESTINO') return fail(res, 409, 'Transferência não aguarda aprovação de destino.');
    await withClient(async (client) => {
      await client.query('UPDATE transferencias_recursos SET aprovada_destino_por = $1, aprovada_destino_em = NOW() WHERE id = $2', [req.usuario.id, transfer.id]);
      await client.query('SELECT app_concluir_transferencia($1, $2)', [transfer.id, req.usuario.id]);
    });
    res.json(await hydrate(req.params.id));
  } catch (error) {
    console.error('[transferencias] aprovação destino:', error);
    fail(res, 409, error.message || 'Não foi possível concluir a transferência.');
  }
});

router.post('/:id/rejeitar', async (req, res) => {
  if (!canApprove(req.usuario)) return fail(res, 403, 'Somente ADM ou Gestor Geral rejeita transferências.');
  try {
    const transfer = await getTransfer(req.params.id);
    if (!transfer) return fail(res, 404, 'Transferência não encontrada.');
    if (![Number(transfer.tenant_origem_id), Number(transfer.tenant_destino_id)].includes(Number(req.tenantId))) {
      return fail(res, 403, 'Tenant sem acesso à transferência.');
    }
    await withClient((client) => client.query(
      'SELECT app_rejeitar_transferencia($1, $2, $3)',
      [transfer.id, req.usuario.id, req.body?.motivo || null]
    ));
    res.json(await hydrate(req.params.id));
  } catch (error) {
    console.error('[transferencias] rejeição:', error);
    fail(res, 409, error.message || 'Não foi possível rejeitar a transferência.');
  }
});

module.exports = router;
