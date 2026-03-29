const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getQuery, allQuery, runQuery } = require('../config/database');
const { inferirPerfil } = require('../constants/access');
const { ensureAccessSchema } = require('../middleware/rbac');

const router = express.Router();

// Login
router.post('/login', [
  body('login').isLength({ min: 6, max: 6 }).isNumeric(),
  body('senha').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    await ensureAccessSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Login ou senha inválidos.' });
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
    let obrasVinculadas = [];
    try {
      const projetos = await allQuery('SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?', [usuario.id]);
      obrasVinculadas = projetos.map((item) => Number(item.projeto_id));
    } catch (schemaErr) {
      // Em ambiente recém-inicializado, a tabela pode ainda não existir.
      // Permitir login e retornar sem vínculos para evitar erro 500.
      console.warn('Aviso no login (projeto_usuarios):', schemaErr?.message || schemaErr);
      obrasVinculadas = [];
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET ausente no ambiente.');
      return res.status(500).json({ erro: 'Configuração inválida do servidor (JWT_SECRET).' });
    }

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

// Registro público
router.post('/register', [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('email').trim().isEmail().withMessage('E-mail inválido.'),
  body('senha').isLength({ min: 6, max: 6 }).withMessage('A senha deve ter exatamente 6 caracteres.')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: errors.array()[0].msg });
    }

    const { nome, email, senha } = req.body;

    // Validar formato da senha: exatamente 6 chars, >= 4 dígitos, >= 1 letra, >= 1 especial
    const senhaValida = /^(?=(.*\d){4,})(?=.*[a-zA-Z])(?=.*[^a-zA-Z0-9]).{6}$/.test(senha);
    if (!senhaValida) {
      return res.status(400).json({
        erro: 'A senha deve ter exatamente 6 caracteres com pelo menos 4 números, 1 letra e 1 caractere especial.'
      });
    }

    // Verificar se e-mail já existe
    const emailExistente = await getQuery('SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase()]);
    if (emailExistente) {
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
    }

    // Gerar login sequencial
    const ultimoUsuario = await getQuery(
      'SELECT login FROM usuarios ORDER BY CAST(login AS INTEGER) DESC LIMIT 1'
    );
    const proximoNumero = ultimoUsuario ? parseInt(ultimoUsuario.login, 10) + 1 : 1;
    const login = String(proximoNumero).padStart(6, '0');

    const senhaHash = await bcrypt.hash(senha, 10);

    await runQuery(
      `INSERT INTO usuarios (login, senha, nome, email, perfil, funcao, setor, is_gestor, is_adm)
       VALUES (?, ?, ?, ?, 'Gestor Geral', 'Gestor Geral', 'Administrativo', 1, 0)`,
      [login, senhaHash, nome.trim(), email.toLowerCase()]
    );

    res.status(201).json({
      mensagem: 'Conta criada com sucesso.',
      login
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ erro: 'Erro ao criar conta. Tente novamente.' });
  }
});

module.exports = router;
