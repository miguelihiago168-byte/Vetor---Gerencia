const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

// Gerar login automático (6 dígitos)
const gerarLogin = async (preferencia) => {
  // se houver preferência (login gerado no frontend), tentar usar
  if (preferencia) {
    // verificar unicidade
    const existente = await getQuery('SELECT id FROM usuarios WHERE login = ?', [preferencia]);
    if (!existente) return preferencia;
  }

  const ultimoUsuario = await getQuery(
    'SELECT login FROM usuarios ORDER BY CAST(login AS INTEGER) DESC LIMIT 1'
  );
  
  if (!ultimoUsuario) {
    return '000001';
  }
  
  const proximoNumero = parseInt(ultimoUsuario.login) + 1;
  return proximoNumero.toString().padStart(6, '0');
};

// Listar usuários
router.get('/', auth, async (req, res) => {
  try {
    const usuarios = await allQuery(`
      SELECT id, login, nome, email, pin, is_gestor, ativo, criado_em 
      FROM usuarios 
      ORDER BY nome
    `);
    
    res.json(usuarios);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
});

// Gerar novo login sem criar usuário
router.get('/novo-login', [auth, isGestor], async (req, res) => {
  try {
    const login = await gerarLogin();
    res.json({ login });
  } catch (error) {
    console.error('Erro ao gerar login:', error);
    res.status(500).json({ erro: 'Erro ao gerar login.' });
  }
});

// Obter usuário por id (inclui projeto vinculado se existir)
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await getQuery('SELECT id, login, nome, email, pin, is_gestor, ativo, criado_em, atualizado_em FROM usuarios WHERE id = ?', [id]);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const proj = await getQuery('SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ? LIMIT 1', [id]);
    usuario.projeto_id = proj ? proj.projeto_id : null;

    res.json(usuario);
  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({ erro: 'Erro ao obter usuário.' });
  }
});

// Criar usuário
router.post('/', [auth, isGestor], [
  body('nome').trim().notEmpty(),
  body('projeto_id').isInt(),
  body('senha').isLength({ min: 6, max: 6 }).isNumeric(),
  body('pin').optional().isLength({ min: 6, max: 6 }).isNumeric(),
  body('email').optional({ checkFalsy: true }).isEmail(),
  body('is_gestor').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos. Verifique os campos.' });
    }

    const { nome, senha, pin, email, is_gestor, projeto_id } = req.body;
    // aceitar login fornecido (gerado pelo front) quando presente e único
    const preferenciaLogin = req.body.login;
    const login = await gerarLogin(preferenciaLogin);

    const senhaHash = await bcrypt.hash(senha, 10);
    
    // Gerar PIN aleatório se não fornecido
    let pinFinal = pin;
    if (!pin) {
      pinFinal = Math.floor(Math.random() * 900000 + 100000).toString();
    }

    const result = await runQuery(`
      INSERT INTO usuarios (login, senha, pin, nome, email, is_gestor, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [login, senhaHash, pinFinal, nome, (email && email.length) ? email : null, is_gestor ? 1 : 0, req.usuario.id]);

    // Vincular ao projeto se informado (requisito: usuário deve ser vinculado a um projeto ao criar)
    if (projeto_id) {
      try {
        await runQuery(`INSERT OR IGNORE INTO projeto_usuarios (projeto_id, usuario_id) VALUES (?, ?)`,[projeto_id, result.lastID]);
      } catch (e) {
        console.warn('Falha ao vincular usuário ao projeto:', e);
      }
    }

    await registrarAuditoria('usuarios', result.lastID, 'CREATE', null, { login, nome, email, is_gestor }, req.usuario.id);

    res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: { id: result.lastID, login, nome, email, pin: pinFinal, is_gestor, projeto_id: projeto_id || null }
    });

  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ erro: 'Erro ao criar usuário.' });
  }
});

// Tornar usuário gestor
router.patch('/:id/gestor', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const { is_gestor } = req.body;

    const usuarioAnterior = await getQuery('SELECT * FROM usuarios WHERE id = ?', [id]);

    await runQuery(
      'UPDATE usuarios SET is_gestor = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [is_gestor ? 1 : 0, id]
    );

    const usuarioNovo = await getQuery('SELECT * FROM usuarios WHERE id = ?', [id]);

    await registrarAuditoria('usuarios', id, 'UPDATE', usuarioAnterior, usuarioNovo, req.usuario.id);

    res.json({ mensagem: 'Permissões atualizadas com sucesso.' });

  } catch (error) {
    console.error('Erro ao atualizar permissões:', error);
    res.status(500).json({ erro: 'Erro ao atualizar permissões.' });
  }
});

// Atualizar usuário (gestor)
router.put('/:id', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioAnterior = await getQuery('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (!usuarioAnterior) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const { nome, senha, pin, is_gestor, ativo } = req.body;

    const updates = [];
    const params = [];

    if (nome !== undefined) { updates.push('nome = ?'); params.push(nome); }
    if (pin !== undefined) { updates.push('pin = ?'); params.push(pin); }
    if (is_gestor !== undefined) { updates.push('is_gestor = ?'); params.push(is_gestor ? 1 : 0); }
    if (ativo !== undefined) { updates.push('ativo = ?'); params.push(ativo ? 1 : 0); }
    if (senha !== undefined && senha !== '') {
      const senhaHash = await bcrypt.hash(senha, 10);
      updates.push('senha = ?'); params.push(senhaHash);
    }

    if (updates.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    params.push(id);
    const sql = `UPDATE usuarios SET ${updates.join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`;
    await runQuery(sql, params);

    // atualizar vínculo com projeto se informado
    if (req.body.projeto_id !== undefined) {
      const projetoId = req.body.projeto_id;
      try {
        // remover vínculos anteriores e inserir novo (assumindo um vínculo por usuário)
        await runQuery('DELETE FROM projeto_usuarios WHERE usuario_id = ?', [id]);
        if (projetoId) {
          await runQuery('INSERT OR IGNORE INTO projeto_usuarios (projeto_id, usuario_id) VALUES (?, ?)', [projetoId, id]);
        }
      } catch (e) {
        console.warn('Falha ao atualizar vínculo do usuário com projeto:', e);
      }
    }

    const usuarioNovo = await getQuery('SELECT id, login, nome, email, pin, is_gestor, ativo, criado_em, atualizado_em FROM usuarios WHERE id = ?', [id]);
    await registrarAuditoria('usuarios', id, 'UPDATE', usuarioAnterior, usuarioNovo, req.usuario.id);

    res.json({ mensagem: 'Usuário atualizado com sucesso.', usuario: usuarioNovo });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ erro: 'Erro ao atualizar usuário.' });
  }
});

// Desativar usuário
router.delete('/:id', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;

    await runQuery(
      'UPDATE usuarios SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    await registrarAuditoria('usuarios', id, 'DELETE', null, { ativo: 0 }, req.usuario.id);

    res.json({ mensagem: 'Usuário desativado com sucesso.' });

  } catch (error) {
    console.error('Erro ao desativar usuário:', error);
    res.status(500).json({ erro: 'Erro ao desativar usuário.' });
  }
});

module.exports = router;
