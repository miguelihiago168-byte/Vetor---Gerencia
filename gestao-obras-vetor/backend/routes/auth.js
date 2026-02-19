const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getQuery, allQuery } = require('../config/database');
const { inferirPerfil } = require('../constants/access');
const { ensureAccessSchema } = require('../middleware/rbac');

const router = express.Router();

// Login
router.post('/login', [
  body('login').isLength({ min: 6, max: 6 }).isNumeric(),
  body('senha').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  try {
    await ensureAccessSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Login e senha devem ter 6 dígitos numéricos.' });
    }

    const { login, senha } = req.body;

    const usuario = await getQuery(
      'SELECT * FROM usuarios WHERE login = ? AND ativo = 1',
      [login]
    );

    if (!usuario) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const perfil = inferirPerfil(usuario);
    const projetos = await allQuery('SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?', [usuario.id]);
    const obrasVinculadas = projetos.map((item) => Number(item.projeto_id));

    const token = jwt.sign(
      { 
        id: usuario.id, 
        login: usuario.login, 
        nome: usuario.nome,
        funcao: usuario.funcao || perfil,
        perfil,
        setor: usuario.setor || null,
        setor_outro: usuario.setor_outro || null,
        is_gestor: usuario.is_gestor,
        is_adm: usuario.is_adm || 0,
        perfil_almoxarifado: usuario.perfil_almoxarifado || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        login: usuario.login,
        nome: usuario.nome,
        email: usuario.email,
        funcao: usuario.funcao || perfil,
        perfil,
        setor: usuario.setor || null,
        setor_outro: usuario.setor_outro || null,
        obras_vinculadas: obrasVinculadas,
        is_gestor: usuario.is_gestor,
        is_adm: usuario.is_adm || 0,
        perfil_almoxarifado: usuario.perfil_almoxarifado || null
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ erro: 'Erro ao realizar login.' });
  }
});

module.exports = router;
