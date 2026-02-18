const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();
// Gerar PDF da RNC
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const rnc = await getQuery(`
      SELECT r.*, p.nome AS projeto_nome, u.nome AS criado_por_nome, g.nome AS responsavel_nome, rd.data_relatorio AS rdo_data
      FROM rnc r
      LEFT JOIN projetos p ON r.projeto_id = p.id
      LEFT JOIN usuarios u ON r.criado_por = u.id
      LEFT JOIN usuarios g ON r.responsavel_id = g.id
      LEFT JOIN rdos rd ON r.rdo_id = rd.id
      WHERE r.id = ?
    `, [id]);

    if (!rnc) return res.status(404).json({ erro: 'RNC não encontrada.' });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="RNC-${id}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text('RELATÓRIO DE NÃO CONFORMIDADE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(`Projeto: ${rnc.projeto_nome || rnc.projeto_id}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).text(`Título: ${rnc.titulo}`);
    doc.text(`Status: ${rnc.status}`);
    doc.text(`Gravidade: ${rnc.gravidade}`);
    if (rnc.data_prevista_encerramento) doc.text(`Data prevista para encerramento: ${new Date(rnc.data_prevista_encerramento).toLocaleDateString('pt-BR')}`);
    if (rnc.origem) doc.text(`Origem: ${rnc.origem}`);
    if (rnc.area_afetada) doc.text(`Área afetada: ${rnc.area_afetada}`);
    if (rnc.norma_referencia) doc.text(`Norma/Referência: ${rnc.norma_referencia}`);
    doc.text(`Responsável: ${rnc.responsavel_nome || 'N/A'}`);
    if (rnc.rdo_id) doc.text(`RDO Relacionado: ${rnc.rdo_id} (${rnc.rdo_data ? new Date(rnc.rdo_data).toLocaleDateString('pt-BR') : 'N/A'})`);
    doc.text(`Criado por: ${rnc.criado_por_nome || 'N/A'}`);
    doc.text(`Criado em: ${rnc.criado_em ? new Date(rnc.criado_em).toLocaleString('pt-BR') : 'N/A'}`);
    if (rnc.resolvido_em) doc.text(`Encerrado em: ${new Date(rnc.resolvido_em).toLocaleString('pt-BR')}`);
    doc.moveDown();

    doc.fontSize(12).text('Descrição:', { underline: true });
    doc.text(rnc.descricao || '—');
    doc.moveDown();

    if (rnc.acao_corretiva) {
      doc.text('Ação Corretiva:', { underline: true });
      doc.text(rnc.acao_corretiva);
      doc.moveDown();
    }

    if (rnc.descricao_correcao) {
      doc.text('Correção realizada:', { underline: true });
      doc.text(rnc.descricao_correcao);
      doc.moveDown();
    }

    if (rnc.registros_fotograficos) {
      doc.text('Registros fotográficos:', { underline: true });
      doc.text(rnc.registros_fotograficos);
      doc.moveDown();
    }

    doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    doc.end();
  } catch (error) {
    console.error('Erro ao gerar PDF da RNC:', error);
    res.status(500).json({ erro: 'Erro ao gerar PDF.' });
  }
});

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
      responsavel_id,
      data_prevista_encerramento,
      origem,
      area_afetada,
      norma_referencia,
      registros_fotograficos
    } = req.body;

    const result = await runQuery(`
      INSERT INTO rnc (
        projeto_id, rdo_id, titulo, descricao, gravidade, status, acao_corretiva, responsavel_id,
        data_prevista_encerramento, origem, area_afetada, norma_referencia, registros_fotograficos, criado_por
      )
      VALUES (?, ?, ?, ?, ?, 'Aberta', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      projeto_id,
      rdo_id || null,
      titulo,
      descricao,
      gravidade,
      acao_corretiva || null,
      responsavel_id || null,
      data_prevista_encerramento || null,
      origem || null,
      area_afetada || null,
      norma_referencia || null,
      registros_fotograficos || null,
      req.usuario.id
    ]);

    await registrarAuditoria('rnc', result.lastID, 'CREATE', null, req.body, req.usuario.id);

    // Notificar responsável, se definido
    if (responsavel_id) {
      try {
        await runQuery(
          'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
          [responsavel_id, 'rnc_atribuida', `Você foi atribuído como responsável da RNC #${result.lastID}.`, 'rnc', result.lastID]
        );
      } catch (e) {
        console.warn('Falha ao registrar notificação de responsável RNC:', e?.message || e);
      }
    }

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

    // Impedir edição se RNC está encerrada
    if (rncAtual.status === 'Encerrada') {
      return res.status(403).json({ erro: 'Não é possível editar uma RNC encerrada.' });
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
      descricao_correcao,
      responsavel_id,
      rdo_id,
      data_prevista_encerramento,
      origem,
      area_afetada,
      norma_referencia,
      registros_fotograficos
    } = req.body;

    // Detectar mudança de responsável para notificar
    const novoResponsavel = responsavel_id ?? rncAtual.responsavel_id;

    await runQuery(`
      UPDATE rnc SET
        titulo = ?,
        descricao = ?,
        gravidade = ?,
        status = ?,
        acao_corretiva = ?,
        descricao_correcao = ?,
        responsavel_id = ?,
        rdo_id = ?,
        data_prevista_encerramento = ?,
        origem = ?,
        area_afetada = ?,
        norma_referencia = ?,
        registros_fotograficos = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      titulo,
      descricao,
      gravidade,
      status,
      acao_corretiva || null,
      descricao_correcao || rncAtual.descricao_correcao || null,
      responsavel_id || null,
      rdo_id || null,
      data_prevista_encerramento || null,
      origem || null,
      area_afetada || null,
      norma_referencia || null,
      registros_fotograficos || null,
      id
    ]);

    const novo = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    await registrarAuditoria('rnc', id, 'UPDATE', rncAtual, novo, req.usuario.id);

    // Se responsável mudou, notificar novo responsável
    if (rncAtual.responsavel_id !== novo.responsavel_id && novo.responsavel_id) {
      try {
        await runQuery(
          'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
          [novo.responsavel_id, 'rnc_atribuida', `Você foi atribuído como responsável da RNC #${id}.`, 'rnc', id]
        );
      } catch (e) {
        console.warn('Falha ao registrar notificação de mudança de responsável:', e?.message || e);
      }
    }

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

    // Notificar gestor(es) que há RNC para aprovação (opcional simples: todos gestores)
    try {
      const gestores = await allQuery('SELECT id FROM usuarios WHERE is_gestor = 1');
      for (const g of gestores) {
        await runQuery(
          'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
          [g.id, 'rnc_para_aprovacao', `RNC #${id} foi enviada para aprovação.`, 'rnc', id]
        );
      }
    } catch (e) {
      console.warn('Falha ao notificar gestores sobre aprovação de RNC:', e?.message || e);
    }

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

    // Impedir deleção se RNC está encerrada
    if (rncAtual.status === 'Encerrada') {
      return res.status(403).json({ erro: 'Não é possível deletar uma RNC encerrada. Use a visualização para consultar.' });
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
    const { descricao_correcao } = req.body;

    const rncAtual = await getQuery('SELECT * FROM rnc WHERE id = ?', [id]);
    if (!rncAtual) return res.status(404).json({ erro: 'RNC não encontrada.' });

    // somente criador, responsável ou gestor podem submeter correção
    if (rncAtual.criado_por !== req.usuario.id && rncAtual.responsavel_id !== req.usuario.id && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Sem permissão para submeter correção.' });
    }

    await runQuery(
      'UPDATE rnc SET descricao_correcao = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [descricao_correcao || null, 'Em andamento', id]
    );

    await registrarAuditoria('rnc', id, 'CORRECAO_SUBMETIDA', rncAtual, { descricao_correcao }, req.usuario.id);

    res.json({ mensagem: 'Correção registrada e RNC marcada como Em andamento.' });
  } catch (error) {
    console.error('Erro ao submeter correção da RNC:', error);
    res.status(500).json({ erro: 'Erro ao submeter correção.' });
  }
});

module.exports = router;
