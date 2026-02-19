const express = require('express');
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/auth');
const { db, getQuery, allQuery, runQuery } = require('../config/database');
const { registrarAuditoria } = require('../middleware/auditoria');
const { PERMISSIONS, hasPermission, assertProjectAccess } = require('../middleware/rbac');
const { PERFIS, inferirPerfil } = require('../constants/access');

const router = express.Router();

let schemaReadyPromise = null;
const ensureSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await runQuery(`
        CREATE TABLE IF NOT EXISTS pedidos_compra_historico (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER NOT NULL,
          usuario_id INTEGER NOT NULL,
          tipo_alteracao TEXT NOT NULL,
          detalhes TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
};

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: function(req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'cotacao-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const updatePedidoStatus = (id, status, extra = {}) => {
  const fields = ['status'];
  const params = [status];
  Object.keys(extra).forEach((key) => {
    fields.push(key);
    params.push(extra[key]);
  });
  params.push(id);
  return runQuery(`UPDATE pedidos_compra SET ${fields.map((f) => `${f} = ?`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, params);
};

const registrarHistoricoPedido = async (pedidoId, usuarioId, tipoAlteracao, detalhes = null) => {
  await runQuery(
    `INSERT INTO pedidos_compra_historico (pedido_id, usuario_id, tipo_alteracao, detalhes) VALUES (?, ?, ?, ?)`,
    [pedidoId, usuarioId, tipoAlteracao, detalhes ? JSON.stringify(detalhes) : null]
  );
};

const listarDestinatariosNotificacao = async (pedido) => {
  const gestoresGerais = await allQuery(`
    SELECT id FROM usuarios
    WHERE ativo = 1 AND deletado_em IS NULL
      AND (
        perfil = ?
        OR (perfil IS NULL AND is_gestor = 1 AND COALESCE(is_adm, 0) = 0)
      )
  `, [PERFIS.GESTOR_GERAL]);

  const adms = await allQuery(`
    SELECT id FROM usuarios
    WHERE ativo = 1 AND deletado_em IS NULL
      AND (
        perfil = ?
        OR (perfil IS NULL AND COALESCE(is_adm, 0) = 1)
      )
  `, [PERFIS.ADM]);

  const gestoresObra = await allQuery(`
    SELECT DISTINCT u.id
    FROM usuarios u
    INNER JOIN projeto_usuarios pu ON pu.usuario_id = u.id
    WHERE pu.projeto_id = ?
      AND u.ativo = 1
      AND u.deletado_em IS NULL
      AND (
        u.perfil = ?
        OR (u.perfil IS NULL AND u.is_gestor = 1)
      )
  `, [pedido.projeto_id, PERFIS.GESTOR_OBRA]);

  const ids = new Set([
    pedido.solicitante_id,
    ...gestoresGerais.map((u) => u.id),
    ...gestoresObra.map((u) => u.id),
    ...adms.map((u) => u.id)
  ]);

  return [...ids].filter(Boolean);
};

const notificarPedido = async (pedido, tipo, mensagem) => {
  const destinatarios = await listarDestinatariosNotificacao(pedido);
  for (const usuarioId of destinatarios) {
    await runQuery(
      'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, tipo, mensagem, 'pedido', pedido.id]
    );
  }
};

const carregarPedido = async (id) => getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [id]);

const requirePedidoPermission = (permission) => async (req, res, next) => {
  try {
    const pedido = await carregarPedido(req.params.id);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

    req.pedido = pedido;

    if (!hasPermission(req.usuario, permission)) {
      return res.status(403).json({ erro: 'Acesso negado para esta ação.' });
    }

    const allowed = await assertProjectAccess(req, res, pedido.projeto_id);
    if (!allowed) return;

    next();
  } catch (error) {
    console.error('Erro ao validar permissão do pedido:', error);
    res.status(500).json({ erro: 'Erro ao validar permissão.' });
  }
};

const requireCreatePermissionWithProject = async (req, res, next) => {
  try {
    const projetoId = Number(req.body.projeto_id);
    if (!projetoId) {
      return res.status(400).json({ erro: 'projeto_id é obrigatório.' });
    }

    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_CREATE)) {
      return res.status(403).json({ erro: 'Acesso negado para criar solicitação de compra.' });
    }

    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    next();
  } catch (error) {
    console.error('Erro ao validar criação de pedido:', error);
    res.status(500).json({ erro: 'Erro ao validar permissão.' });
  }
};

router.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    console.error('Erro ao preparar schema de compras:', error);
    res.status(500).json({ erro: 'Erro interno ao preparar módulo de compras.' });
  }
});

router.post('/', [auth, requireCreatePermissionWithProject], async (req, res) => {
  try {
    const { projeto_id, descricao, quantidade, unidade, aplicacao_local } = req.body;
    if (!descricao || !quantidade) {
      return res.status(400).json({ erro: 'descricao e quantidade são obrigatórios.' });
    }

    const result = await runQuery(`
      INSERT INTO pedidos_compra (projeto_id, solicitante_id, descricao, quantidade, unidade, aplicacao_local, status)
      VALUES (?, ?, ?, ?, ?, ?, 'SOLICITADO')
    `, [Number(projeto_id), req.usuario.id, descricao, quantidade, unidade || null, aplicacao_local || null]);

    const pedido = await carregarPedido(result.lastID);
    await registrarHistoricoPedido(pedido.id, req.usuario.id, 'CRIADO', {
      status: pedido.status,
      descricao,
      quantidade,
      unidade: unidade || null,
      aplicacao_local: aplicacao_local || null
    });

    await registrarAuditoria('pedidos_compra', pedido.id, 'CREATE', null, pedido, req.usuario.id, { strict: true });
    await notificarPedido(pedido, 'pedido_criado', `Nova solicitação de compra #${pedido.id} criada.`);

    res.status(201).json({ pedido });
  } catch (error) {
    console.error('Erro ao criar solicitação:', error);
    res.status(500).json({ erro: 'Erro ao criar solicitação.' });
  }
});

router.patch('/:id', [auth, requirePedidoPermission(PERMISSIONS.PURCHASE_CREATE)], async (req, res) => {
  try {
    const pedidoAtual = req.pedido;
    const perfil = inferirPerfil(req.usuario);

    const usuarioPodeEditar = req.usuario.id === pedidoAtual.solicitante_id || [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.ADM].includes(perfil);
    if (!usuarioPodeEditar) {
      return res.status(403).json({ erro: 'Sem permissão para editar este pedido.' });
    }

    if (['COMPRADO', 'REPROVADO'].includes(pedidoAtual.status)) {
      return res.status(400).json({ erro: 'Pedido finalizado não pode ser editado.' });
    }

    const camposPermitidos = ['descricao', 'quantidade', 'unidade', 'aplicacao_local'];
    const updates = [];
    const params = [];

    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) {
        updates.push(`${campo} = ?`);
        params.push(req.body[campo]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo válido para atualização.' });
    }

    params.push(req.params.id);
    await runQuery(`UPDATE pedidos_compra SET ${updates.join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, params);

    const pedidoNovo = await carregarPedido(req.params.id);
    await registrarHistoricoPedido(pedidoNovo.id, req.usuario.id, 'EDITADO', {
      antes: {
        descricao: pedidoAtual.descricao,
        quantidade: pedidoAtual.quantidade,
        unidade: pedidoAtual.unidade,
        aplicacao_local: pedidoAtual.aplicacao_local
      },
      depois: {
        descricao: pedidoNovo.descricao,
        quantidade: pedidoNovo.quantidade,
        unidade: pedidoNovo.unidade,
        aplicacao_local: pedidoNovo.aplicacao_local
      }
    });

    await registrarAuditoria('pedidos_compra', pedidoNovo.id, 'UPDATE', pedidoAtual, pedidoNovo, req.usuario.id, { strict: true });
    await notificarPedido(pedidoNovo, 'pedido_editado', `Solicitação de compra #${pedidoNovo.id} foi editada.`);

    res.json({ pedido: pedidoNovo });
  } catch (error) {
    console.error('Erro ao editar pedido:', error);
    res.status(500).json({ erro: 'Erro ao editar pedido.' });
  }
});

router.patch('/:id/aprovar-inicial', [auth, requirePedidoPermission(PERMISSIONS.PURCHASE_APPROVE)], async (req, res) => {
  try {
    const pedido = req.pedido;
    if (pedido.status !== 'SOLICITADO') {
      return res.status(400).json({ erro: 'Status inválido para aprovação inicial.' });
    }

    await updatePedidoStatus(pedido.id, 'APROVADO_GESTOR_INICIAL', { gestor_aprovador_id: req.usuario.id });
    const pedidoNovo = await carregarPedido(pedido.id);

    await registrarHistoricoPedido(pedido.id, req.usuario.id, 'APROVADO', { de: pedido.status, para: pedidoNovo.status });
    await registrarAuditoria('pedidos_compra', pedido.id, 'STATUS_CHANGE', pedido, pedidoNovo, req.usuario.id, { strict: true });
    await notificarPedido(pedidoNovo, 'pedido_aprovado', `Solicitação de compra #${pedido.id} foi aprovada.`);

    res.json({ ok: true, status: pedidoNovo.status });
  } catch (error) {
    console.error('Erro na aprovação inicial:', error);
    res.status(500).json({ erro: 'Erro na aprovação.' });
  }
});

router.post('/:id/cotacoes', [auth, requirePedidoPermission(PERMISSIONS.PURCHASE_FINANCE), upload.single('pdf')], async (req, res) => {
  try {
    const pedido = req.pedido;
    if (!['APROVADO_GESTOR_INICIAL', 'EM_COTACAO'].includes(pedido.status)) {
      return res.status(400).json({ erro: 'Pedido não está liberado para cotação.' });
    }

    const count = await getQuery('SELECT COUNT(*) as total FROM cotacoes WHERE pedido_id = ?', [pedido.id]);
    if (count.total >= 3) return res.status(400).json({ erro: 'Já existem 3 cotações.' });

    const { fornecedor, valor_unitario, marca, modelo, prazo_entrega, condicoes_pagamento, garantia, frete, observacoes } = req.body;

    if (!fornecedor || !valor_unitario) {
      return res.status(400).json({ erro: 'Fornecedor e valor_unitario são obrigatórios.' });
    }

    const pdfPath = req.file ? (`/uploads/${req.file.filename}`) : null;
    await runQuery(`
      INSERT INTO cotacoes (pedido_id, fornecedor, valor_unitario, marca, modelo, prazo_entrega, condicoes_pagamento, garantia, frete, observacoes, pdf_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [pedido.id, fornecedor, valor_unitario, marca || null, modelo || null, prazo_entrega || null, condicoes_pagamento || null, garantia || null, frete || null, observacoes || null, pdfPath]);

    const novoCount = await getQuery('SELECT COUNT(*) as total FROM cotacoes WHERE pedido_id = ?', [pedido.id]);
    if (pedido.status === 'APROVADO_GESTOR_INICIAL') {
      await updatePedidoStatus(pedido.id, 'EM_COTACAO', { adm_responsavel_id: req.usuario.id });
    }
    if (novoCount.total === 3) {
      await updatePedidoStatus(pedido.id, 'COTADO');
    }

    const pedidoNovo = await carregarPedido(pedido.id);
    await registrarHistoricoPedido(pedido.id, req.usuario.id, 'COTACAO_INSERIDA', { total_cotacoes: novoCount.total, status: pedidoNovo.status });
    await registrarAuditoria('pedidos_compra', pedido.id, 'COTACAO', pedido, pedidoNovo, req.usuario.id, { strict: true });

    const cotacoes = await allQuery('SELECT * FROM cotacoes WHERE pedido_id = ?', [pedido.id]);
    res.json({ cotacoes });
  } catch (error) {
    console.error('Erro ao inserir cotação:', error);
    res.status(500).json({ erro: 'Erro ao inserir cotação.' });
  }
});

router.patch('/:id/selecionar/:cotacaoId', [auth, requirePedidoPermission(PERMISSIONS.PURCHASE_APPROVE)], async (req, res) => {
  try {
    const pedido = req.pedido;
    if (pedido.status !== 'COTADO') {
      return res.status(400).json({ erro: 'Pedido não está com 3 cotações finalizadas.' });
    }

    const cotacao = await getQuery('SELECT * FROM cotacoes WHERE id = ? AND pedido_id = ?', [req.params.cotacaoId, pedido.id]);
    if (!cotacao) return res.status(404).json({ erro: 'Cotação não encontrada.' });

    await runQuery('UPDATE cotacoes SET status = "SELECIONADA" WHERE id = ?', [req.params.cotacaoId]);
    await runQuery('UPDATE cotacoes SET status = "NAO_SELECIONADA" WHERE pedido_id = ? AND id <> ?', [pedido.id, req.params.cotacaoId]);
    await updatePedidoStatus(pedido.id, 'APROVADO_PARA_COMPRA', { cotacao_vencedora_id: req.params.cotacaoId });

    const pedidoNovo = await carregarPedido(pedido.id);
    await registrarHistoricoPedido(pedido.id, req.usuario.id, 'COTACAO_SELECIONADA', { cotacao_id: Number(req.params.cotacaoId) });
    await registrarAuditoria('pedidos_compra', pedido.id, 'STATUS_CHANGE', pedido, pedidoNovo, req.usuario.id, { strict: true });
    await notificarPedido(pedidoNovo, 'pedido_aprovado', `Solicitação de compra #${pedido.id} foi aprovada para compra.`);

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao selecionar cotação:', error);
    res.status(500).json({ erro: 'Erro ao selecionar cotação.' });
  }
});

router.patch('/:id/comprado', [auth, requirePedidoPermission(PERMISSIONS.PURCHASE_FINANCE)], async (req, res) => {
  try {
    const pedido = req.pedido;
    if (pedido.status !== 'APROVADO_PARA_COMPRA') {
      return res.status(400).json({ erro: 'Pedido não está aprovado para compra.' });
    }

    await updatePedidoStatus(pedido.id, 'COMPRADO');
    const pedidoNovo = await carregarPedido(pedido.id);

    await registrarHistoricoPedido(pedido.id, req.usuario.id, 'COMPRADO', { de: pedido.status, para: pedidoNovo.status });
    await registrarAuditoria('pedidos_compra', pedido.id, 'COMPRADO', pedido, pedidoNovo, req.usuario.id, { strict: true });

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao finalizar compra:', error);
    res.status(500).json({ erro: 'Erro ao finalizar compra.' });
  }
});

router.patch('/:id/reprovar', [auth, requirePedidoPermission(PERMISSIONS.PURCHASE_APPROVE)], async (req, res) => {
  try {
    const pedido = req.pedido;
    const { motivo } = req.body;

    if (!motivo || !String(motivo).trim()) {
      return res.status(400).json({ erro: 'Informe o motivo da reprovação.' });
    }

    if (['APROVADO_PARA_COMPRA', 'COMPRADO'].includes(pedido.status)) {
      return res.status(400).json({ erro: 'Pedido já aprovado para compra ou comprado. Não é possível reprovar.' });
    }

    await updatePedidoStatus(pedido.id, 'REPROVADO', { reprovado_motivo: String(motivo).trim() });
    const pedidoNovo = await carregarPedido(pedido.id);

    await registrarHistoricoPedido(pedido.id, req.usuario.id, 'REPROVADO', { de: pedido.status, para: 'REPROVADO', motivo: String(motivo).trim() });
    await registrarAuditoria('pedidos_compra', pedido.id, 'REPROVADO', pedido, pedidoNovo, req.usuario.id, { strict: true });
    await notificarPedido(pedidoNovo, 'pedido_reprovado', `Solicitação de compra #${pedido.id} foi reprovada.`);

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao reprovar pedido:', error);
    res.status(500).json({ erro: 'Erro ao reprovar.' });
  }
});

router.get('/projeto/:projetoId', auth, async (req, res) => {
  try {
    const projetoId = Number(req.params.projetoId);
    if (!hasPermission(req.usuario, PERMISSIONS.PURCHASE_VIEW)) {
      return res.status(403).json({ erro: 'Acesso negado para visualizar compras.' });
    }

    const allowed = await assertProjectAccess(req, res, projetoId);
    if (!allowed) return;

    const pedidos = await allQuery('SELECT * FROM pedidos_compra WHERE projeto_id = ? ORDER BY criado_em DESC', [projetoId]);
    res.json(pedidos);
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({ erro: 'Erro ao listar pedidos.' });
  }
});

router.get('/:id', [auth, requirePedidoPermission(PERMISSIONS.PURCHASE_VIEW)], async (req, res) => {
  try {
    const pedido = req.pedido;
    const cotacoes = await allQuery('SELECT * FROM cotacoes WHERE pedido_id = ?', [pedido.id]);
    const historico = await allQuery(`
      SELECT h.*, u.nome AS usuario_nome
      FROM pedidos_compra_historico h
      LEFT JOIN usuarios u ON u.id = h.usuario_id
      WHERE h.pedido_id = ?
      ORDER BY h.criado_em DESC
    `, [pedido.id]);

    res.json({ pedido, cotacoes, historico });
  } catch (error) {
    console.error('Erro ao detalhar pedido:', error);
    res.status(500).json({ erro: 'Erro ao detalhar pedido.' });
  }
});

module.exports = router;
