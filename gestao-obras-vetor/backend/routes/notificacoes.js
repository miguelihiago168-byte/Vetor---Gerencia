const express = require('express');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

const getNotificacoesReadColumn = async () => {
  const columns = await allQuery('PRAGMA table_info(notificacoes)');
  const names = new Set((columns || []).map((column) => String(column.name)));
  return names.has('lido') ? 'lido' : 'lida';
};

// Listar notificações do usuário logado
router.get('/', auth, async (req, res) => {
  try {
    const readColumn = await getNotificacoesReadColumn();
    const lista = await allQuery(
      `SELECT n.*,
              CASE
                WHEN n.referencia_tipo = 'reuniao' THEN mr.projeto_id
                WHEN n.referencia_tipo = 'estoque_transferencia' THEN et.destino_projeto_id
                ELSE NULL
              END AS projeto_id
       FROM notificacoes n
       LEFT JOIN mensagem_reunioes mr
         ON n.referencia_tipo = 'reuniao'
        AND mr.id = n.referencia_id
       LEFT JOIN estoque_transferencias et
         ON n.referencia_tipo = 'estoque_transferencia'
        AND et.id = n.referencia_id
       WHERE n.usuario_id = ?
         AND COALESCE(n.${readColumn}, 0) = 0
       ORDER BY n.criado_em DESC
       LIMIT 50`,
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
    const readColumn = await getNotificacoesReadColumn();
    const notif = await getQuery('SELECT * FROM notificacoes WHERE id = ?', [id]);
    if (!notif) return res.status(404).json({ erro: 'Notificação não encontrada.' });
    if (notif.usuario_id !== req.usuario.id) return res.status(403).json({ erro: 'Sem permissão.' });

    await runQuery(`UPDATE notificacoes SET ${readColumn} = 1 WHERE id = ?`, [id]);
    res.json({ mensagem: 'Notificação marcada como lida.' });
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({ erro: 'Erro ao marcar como lida.' });
  }
});

// Marcar todas as notificações do usuário como lidas
router.patch('/marcar-todas-lidas', auth, async (req, res) => {
  try {
    const readColumn = await getNotificacoesReadColumn();
    await runQuery(`UPDATE notificacoes SET ${readColumn} = 1 WHERE usuario_id = ? AND COALESCE(${readColumn}, 0) = 0`, [req.usuario.id]);
    res.json({ mensagem: 'Todas as notificações marcadas como lidas.' });
  } catch (error) {
    console.error('Erro ao marcar todas como lidas:', error);
    res.status(500).json({ erro: 'Erro ao marcar todas como lidas.' });
  }
});

module.exports = router;
