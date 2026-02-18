const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getQuery, runQuery } = require('../config/database');

const router = express.Router();

// Login
router.post('/login', [
  body('login').isLength({ min: 6, max: 6 }).isNumeric(),
  body('senha').isLength({ min: 6, max: 6 }).isNumeric()
], async (req, res) => {
  try {
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

    const token = jwt.sign(
      { 
        id: usuario.id, 
        login: usuario.login, 
        nome: usuario.nome,
        is_gestor: usuario.is_gestor,
        is_adm: usuario.is_adm || 0
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
        is_gestor: usuario.is_gestor,
        is_adm: usuario.is_adm || 0
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ erro: 'Erro ao realizar login.' });
  }
});

module.exports = router;
