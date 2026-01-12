const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

// Listar RNC por projeto
router.get('/projeto/:projetoId', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    const lista = await allQuery(`
      SELECT r.*, u.nome AS criado_por_nome, g.nome AS responsavel_nome, rd.data_relatorio AS rdo_data
      FROM rnc r
      LEFT JOIN usuarios u ON r.criado_por = u.id
      LEFT JOIN usuarios g ON r.responsavel_id = g.id
      LEFT JOIN rdos rd ON r.rdo_id = rd.id
      WHERE r.projeto_id = ?
      ORDER BY r.criado_em DESC
    `, [projetoId]);

    res.json(lista);
  } catch (error) {
    console.error('Erro ao listar RNC:', error);
    res.status(500).json({ erro: 'Erro ao listar RNC.' });
  }
});

// Criar RNC
router.post('/', auth, [
  body('projeto_id').isInt(),
  body('titulo').trim().notEmpty(),
  body('descricao').trim().notEmpty(),
  body('gravidade').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos.' });
    }

    const {
      projeto_id,
      rdo_id,
      titulo,
      descricao,
      gravidade,
      acao_corretiva,
      responsavel_id
    } = req.body;

    const result = await runQuery(`
      INSERT INTO rnc (projeto_id, rdo_id, titulo, descricao, gravidade, status, acao_corretiva, responsavel_id, criado_por)
      VALUES (?, ?, ?, ?, ?, 'Aberta', ?, ?, ?)
    `, [projeto_id, rdo_id || null, titulo, descricao, gravidade, acao_corretiva || null, responsavel_id || null, req.usuario.id]);

    await registrarAuditoria('rnc', result.lastID, 'CREATE', null, req.body, req.usuario.id);

    res.status(201).json({ mensagem: 'RNC criada com sucesso.', id: result.lastID });
  } catch (error) {
    console.error('Erro ao criar RNC:', error);
    res.status(500).json({ erro: 'Erro ao criar RNC.' });
  }
});

// Atualizar RNC
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);

    if (!rncAtual) {
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }

    if (rncAtual.criado_por !== req.usuario.id && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Sem permissão para editar esta RNC.' });
    }

    const {
      titulo,
      descricao,
      gravidade,
      status,
      acao_corretiva,
      responsavel_id,
      rdo_id
    } = req.body;

    await runQuery(`
      UPDATE rnc SET
        titulo = ?,
        descricao = ?,
        gravidade = ?,
        status = ?,
        acao_corretiva = ?,
        responsavel_id = ?,
        rdo_id = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [titulo, descricao, gravidade, status, acao_corretiva || null, responsavel_id || null, rdo_id || null, id]);

    const novo = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    await registrarAuditoria('rnc', id, 'UPDATE', rncAtual, novo, req.usuario.id);

    res.json({ mensagem: 'RNC atualizada.' });
  } catch (error) {
    console.error('Erro ao atualizar RNC:', error);
    res.status(500).json({ erro: 'Erro ao atualizar RNC.' });
  }
});

// Alterar status
// Alterar status (somente gestor)
router.patch('/:id/status', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validos = ['Aberta', 'Em andamento', 'Encerrada', 'Reprovada', 'Em análise'];

    if (!validos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    if (!rncAtual) {
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }

    const resolvidoEm = status === 'Encerrada' ? new Date().toISOString() : null;

    await runQuery(
      'UPDATE rnc SET status = ?, resolvido_em = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [status, resolvidoEm, id]
    );

    await registrarAuditoria('rnc', id, 'STATUS_CHANGE', rncAtual, { status }, req.usuario.id);

    res.json({ mensagem: 'Status atualizado.' });
  } catch (error) {
    console.error('Erro ao alterar status da RNC:', error);
    res.status(500).json({ erro: 'Erro ao alterar status.' });
  }
});

// Enviar RNC para aprovação (criador ou responsável)
router.post('/:id/enviar-aprovacao', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    if (!rncAtual) return res.status(404).json({ erro: 'RNC não encontrada.' });

    // somente criador ou responsável podem enviar para aprovação
    if (rncAtual.criado_por !== req.usuario.id && rncAtual.responsavel_id !== req.usuario.id && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Sem permissão para enviar para aprovação.' });
    }

    await runQuery('UPDATE rnc SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', ['Em análise', id]);
    await registrarAuditoria('rnc', id, 'ENVIADO_APROVACAO', rncAtual, { por: req.usuario.id }, req.usuario.id);

    res.json({ mensagem: 'RNC enviada para aprovação.' });
  } catch (error) {
    console.error('Erro ao enviar RNC para aprovação:', error);
    res.status(500).json({ erro: 'Erro ao enviar para aprovação.' });
  }
});

// Deletar RNC (somente gestor)
router.delete('/:id', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);

    if (!rncAtual) {
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }

    await runQuery('DELETE FROM rnc WHERE id = ?', [id]);
    await registrarAuditoria('rnc', id, 'DELETE', rncAtual, null, req.usuario.id);

    res.json({ mensagem: 'RNC removida.' });
  } catch (error) {
    console.error('Erro ao deletar RNC:', error);
    res.status(500).json({ erro: 'Erro ao deletar RNC.' });
  }
});

// Submeter correção (responsável ou criador) — envia correção e altera status para 'Em andamento'
router.post('/:id/corrigir', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { acao_corretiva } = req.body;

    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    if (!rncAtual) return res.status(404).json({ erro: 'RNC não encontrada.' });

    // somente criador, responsável ou gestor podem submeter correção
    if (rncAtual.criado_por !== req.usuario.id && rncAtual.responsavel_id !== req.usuario.id && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Sem permissão para submeter correção.' });
    }

    await runQuery(
      'UPDATE rnc SET acao_corretiva = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [acao_corretiva || null, 'Em andamento', id]
    );

    await registrarAuditoria('rnc', id, 'CORRECAO_SUBMETIDA', rncAtual, { acao_corretiva }, req.usuario.id);

    res.json({ mensagem: 'Correção registrada e RNC marcada como Em andamento.' });
  } catch (error) {
    console.error('Erro ao submeter correção da RNC:', error);
    res.status(500).json({ erro: 'Erro ao submeter correção.' });
  }
});

module.exports = router;
