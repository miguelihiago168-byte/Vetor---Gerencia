const express = require('express');
const { body, validationResult } = require('express-validator');
const { runQuery, allQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');

const router = express.Router();

// Listar catálogo de mão de obra
router.get('/', auth, async (req, res) => {
  try {
    const rows = await allQuery('SELECT * FROM mao_obra ORDER BY nome');
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar mao_obra', err);
    res.status(500).json({ erro: 'Erro ao listar mão de obra.' });
  }
});

// Criar item de mão de obra
router.post('/', auth, [body('nome').notEmpty()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ erro: 'Dados inválidos', detalhes: errors.array() });

    const { nome, funcao } = req.body;
    const result = await runQuery('INSERT INTO mao_obra (nome, funcao, criado_por) VALUES (?, ?, ?)', [nome, funcao || null, req.usuario.id]);
    res.status(201).json({ mensagem: 'Mão de obra criada', id: result.lastID });
  } catch (err) {
    console.error('Erro ao criar mao_obra', err);
    res.status(500).json({ erro: 'Erro ao criar mão de obra.' });
  }
});

// Atualizar
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await getQuery('SELECT * FROM mao_obra WHERE id = ?', [id]);
    if (!item) return res.status(404).json({ erro: 'Registro não encontrado.' });

    // Permite apenas gestor ou criador
    if (item.criado_por !== req.usuario.id && !req.usuario.is_gestor) return res.status(403).json({ erro: 'Sem permissão.' });

    const { nome, funcao } = req.body;
    await runQuery('UPDATE mao_obra SET nome = ?, funcao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [nome || item.nome, funcao || item.funcao, id]);
    res.json({ mensagem: 'Atualizado.' });
  } catch (err) {
    console.error('Erro ao atualizar mao_obra', err);
    res.status(500).json({ erro: 'Erro ao atualizar.' });
  }
});

// Deletar (apenas gestor)
router.delete('/:id', auth, isGestor, async (req, res) => {
  try {
    const { id } = req.params;
    await runQuery('DELETE FROM mao_obra WHERE id = ?', [id]);
    res.json({ mensagem: 'Deletado.' });
  } catch (err) {
    console.error('Erro ao deletar mao_obra', err);
    res.status(500).json({ erro: 'Erro ao deletar.' });
  }
});

module.exports = router;
