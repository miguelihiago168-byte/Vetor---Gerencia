const express = require('express');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Listar notificações do usuário logado
router.get('/', auth, async (req, res) => {
  try {
    const lista = await allQuery(
      `SELECT * FROM notificacoes WHERE usuario_id = ? AND lido = 0 ORDER BY criado_em DESC LIMIT 50`,
      [req.usuario.id]
    );
    res.json(lista);
  } catch (error) {
    console.error('Erro ao listar notificações:', error);
    res.status(500).json({ erro: 'Erro ao listar notificações.' });
  }
});

// Marcar notificação como lida
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await getQuery('SELECT * FROM notificacoes WHERE id = ?', [id]);
    if (!notif) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    if (notif.usuario_id !== req.usuario.id) return res.status(403).json({ erro: 'Sem permissão.' });

    await runQuery('UPDATE notificacoes SET lido = 1 WHERE id = ?', [id]);
    res.json({ mensagem: 'Notificação marcada como lida.' });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({ erro: 'Erro ao marcar como lida.' });
  }
});

module.exports = router;