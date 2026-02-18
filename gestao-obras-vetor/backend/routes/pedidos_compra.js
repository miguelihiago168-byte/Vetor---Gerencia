const express = require('express');
const { auth, isGestor, isAdm } = require('../middleware/auth');
const { db, getQuery, allQuery, runQuery } = require('../config/database');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Upload de PDFs das cotações
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: function(req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    cb(null, 'cotacao-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Helper: atualizar status
const updatePedidoStatus = (id, status, extra = {}) => {
  const fields = ['status'];
  const params = [status];
  Object.keys(extra).forEach((k) => { fields.push(k); params.push(extra[k]); });
  params.push(id);
  return runQuery(`UPDATE pedidos_compra SET ${fields.map(f=>`${f} = ?`).join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, params);
};

// Criar Solicitação: Site Manager (qualquer usuário ativo)
router.post('/', auth, async (req, res) => {
  try {
    const { projeto_id, descricao, quantidade, unidade, aplicacao_local } = req.body;
    if (!projeto_id || !descricao || !quantidade) {
      return res.status(400).json({ erro: 'projeto_id, descricao e quantidade são obrigatórios.' });
    }
    const result = await runQuery(`
      INSERT INTO pedidos_compra (projeto_id, solicitante_id, descricao, quantidade, unidade, aplicacao_local, status)
      VALUES (?, ?, ?, ?, ?, ?, 'SOLICITADO')
    `, [projeto_id, req.usuario.id, descricao, quantidade, unidade || null, aplicacao_local || null]);
    const pedido = await getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [result.lastID]);
    res.json({ pedido });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao criar solicitação.' });
  }
});

// Aprovação Inicial: Gestor -> muda para APROVADO_GESTOR_INICIAL e EM_COTACAO
router.patch('/:id/aprovar-inicial', auth, isGestor, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [id]);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.status !== 'SOLICITADO') return res.status(400).json({ erro: 'Status inválido para aprovação inicial.' });
    await updatePedidoStatus(id, 'APROVADO_GESTOR_INICIAL', { gestor_aprovador_id: req.usuario.id });
    res.json({ ok: true, status: 'APROVADO_GESTOR_INICIAL' });
  } catch (e) {
    res.status(500).json({ erro: 'Erro na aprovação.' });
  }
});

// Inserir Cotação: ADM (exatamente 3 no total)
router.post('/:id/cotacoes', auth, isAdm, upload.single('pdf'), async (req, res) => {
  try {
    const { id } = req.params;
    const { fornecedor, valor_unitario, marca, modelo, prazo_entrega, condicoes_pagamento, garantia, frete, observacoes } = req.body;
    const pedido = await getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [id]);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (!['APROVADO_GESTOR_INICIAL','EM_COTACAO'].includes(pedido.status)) return res.status(400).json({ erro: 'Pedido não está liberado para cotação.' });
    const count = await getQuery('SELECT COUNT(*) as total FROM cotacoes WHERE pedido_id = ?', [id]);
    if (count.total >= 3) return res.status(400).json({ erro: 'Já existem 3 cotações.' });

    const pdfPath = req.file ? ('/uploads/' + req.file.filename) : null;
    await runQuery(`
      INSERT INTO cotacoes (pedido_id, fornecedor, valor_unitario, marca, modelo, prazo_entrega, condicoes_pagamento, garantia, frete, observacoes, pdf_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, fornecedor, valor_unitario, marca || null, modelo || null, prazo_entrega || null, condicoes_pagamento || null, garantia || null, frete || null, observacoes || null, pdfPath]);

    const novoCount = await getQuery('SELECT COUNT(*) as total FROM cotacoes WHERE pedido_id = ?', [id]);
    if (pedido.status === 'APROVADO_GESTOR_INICIAL') {
      // primeira cotação inserida → entra em EM_COTACAO
      await updatePedidoStatus(id, 'EM_COTACAO', { adm_responsavel_id: req.usuario.id });
    }
    if (novoCount.total === 3) {
      // finalizou as 3
      await updatePedidoStatus(id, 'COTADO');
    }

    const cotas = await allQuery('SELECT * FROM cotacoes WHERE pedido_id = ?', [id]);
    res.json({ cotacoes: cotas });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao inserir cotação.' });
  }
});

// Escolha do Orçamento: Gestor seleciona uma cotação
router.patch('/:id/selecionar/:cotacaoId', auth, isGestor, async (req, res) => {
  try {
    const { id, cotacaoId } = req.params;
    const pedido = await getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [id]);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.status !== 'COTADO') return res.status(400).json({ erro: 'Pedido não está com 3 cotações finalizadas.' });

    const cotacao = await getQuery('SELECT * FROM cotacoes WHERE id = ? AND pedido_id = ?', [cotacaoId, id]);
    if (!cotacao) return res.status(404).json({ erro: 'Cotação não encontrada.' });

    await runQuery('UPDATE cotacoes SET status = \"SELECIONADA\" WHERE id = ?', [cotacaoId]);
    await runQuery('UPDATE cotacoes SET status = \"NAO_SELECIONADA\" WHERE pedido_id = ? AND id <> ?', [id, cotacaoId]);
    await updatePedidoStatus(id, 'APROVADO_PARA_COMPRA', { cotacao_vencedora_id: cotacaoId });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao selecionar cotação.' });
  }
});

// Finalizar Compra: ADM marca como comprado + notificação
router.patch('/:id/comprado', auth, isAdm, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [id]);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.status !== 'APROVADO_PARA_COMPRA') return res.status(400).json({ erro: 'Pedido não está aprovado para compra.' });

    await updatePedidoStatus(id, 'COMPRADO');
    // Log de notificação para o Site Manager
    console.log(`[NOTIF] Pedido #${id} COMPRADO. Notificar solicitante ${pedido.solicitante_id}.`);
    await runQuery(`INSERT INTO auditoria (tabela, registro_id, acao, dados_novos, usuario_id) VALUES ('pedidos_compra', ?, 'COMPRADO', '{"status":"COMPRADO"}', ?)`, [id, req.usuario.id]);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao finalizar compra.' });
  }
});

// Reprovar com motivo: ADM ou Gestor
router.patch('/:id/reprovar', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ erro: 'Informe o motivo da reprovação.' });
    // Apenas ADM ou Gestor
    if (!(req.usuario.is_adm || req.usuario.is_gestor)) {
      return res.status(403).json({ erro: 'Apenas ADM/Gestor podem reprovar.' });
    }
    const pedido = await getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [id]);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (['APROVADO_PARA_COMPRA','COMPRADO'].includes(pedido.status)) {
      return res.status(400).json({ erro: 'Pedido já aprovado para compra ou comprado. Não é possível reprovar.' });
    }
    await updatePedidoStatus(id, 'REPROVADO', { reprovado_motivo: motivo });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao reprovar.' });
  }
});

// Listar pedidos por projeto
router.get('/projeto/:projetoId', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    const pedidos = await allQuery('SELECT * FROM pedidos_compra WHERE projeto_id = ? ORDER BY criado_em DESC', [projetoId]);
    res.json(pedidos);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao listar pedidos.' });
  }
});

// Detalhar pedido + cotações
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await getQuery('SELECT * FROM pedidos_compra WHERE id = ?', [id]);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const cotacoes = await allQuery('SELECT * FROM cotacoes WHERE pedido_id = ?', [id]);
    res.json({ pedido, cotacoes });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao detalhar pedido.' });
  }
});

module.exports = router;
