const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getQuery, allQuery, runQuery } = require('../config/database');
const { inferirPerfil } = require('../constants/access');
const { ensureAccessSchema } = require('../middleware/rbac');
const { auth, isAdm } = require('../middleware/auth');

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
    let tenantIds = [];
    try {
      const vinculosTenant = await allQuery(
        'SELECT tenant_id FROM usuario_tenants WHERE usuario_id = ? AND ativo = 1',
        [usuario.id]
      );
      tenantIds = vinculosTenant.map((item) => Number(item.tenant_id)).filter(Boolean);
    } catch (schemaErr) {
      console.warn('Aviso no login (usuario_tenants):', schemaErr?.message || schemaErr);
      tenantIds = [];
    }

    if (tenantIds.length === 0 && usuario.tenant_id) {
      tenantIds = [Number(usuario.tenant_id)];
    }

    const tenantIdAtivo = tenantIds[0] || null;

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
        perfil_almoxarifado: usuario.perfil_almoxarifado || null,
        tenant_id: tenantIdAtivo,
        tenant_ids: tenantIds,
        verificado: !!tenantIdAtivo
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
        perfil_almoxarifado: usuario.perfil_almoxarifado || null,
        tenant_id: tenantIdAtivo,
        tenant_ids: tenantIds,
        verificado: !!tenantIdAtivo
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ erro: 'Erro ao realizar login.' });
  }
});

// Registro público desativado
router.post('/register', [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('email').trim().isEmail().withMessage('E-mail inválido.'),
  body('senha').isLength({ min: 6, max: 6 }).withMessage('A senha deve ter exatamente 6 caracteres.')
], async (_req, res) => {
  return res.status(403).json({
    erro: 'Cadastro público desativado. Solicite um convite ao administrador.'
  });
});

// Geração de convite (somente ADM)
router.post('/convites', auth, isAdm, [
  body('email').trim().isEmail().withMessage('E-mail inválido.'),
  body('tenant_id').isInt().withMessage('tenant_id é obrigatório.'),
  body('dias_expiracao').optional().isInt({ min: 1, max: 30 }),
  body('perfil').optional().isString(),
  body('setor').optional().isString(),
  body('setor_outro').optional().isString(),
  body('nome').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: errors.array()[0].msg });
    }

    const { email, tenant_id, dias_expiracao, perfil, setor, setor_outro, nome } = req.body;
    const tenant = await getQuery('SELECT id, nome FROM tenants WHERE id = ? AND ativo = 1', [tenant_id]);
    if (!tenant) {
      return res.status(404).json({ erro: 'Tenant não encontrado.' });
    }

    const token = crypto.randomUUID();
    const dias = Number(dias_expiracao || 7);
    const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

    await runQuery(
      `INSERT INTO convites
        (token, tenant_id, email, nome, perfil, setor, setor_outro, expira_em, criado_por, ativo, usado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        token,
        Number(tenant_id),
        String(email).trim().toLowerCase(),
        nome || null,
        perfil || 'ADM',
        setor || 'Administrativo',
        setor_outro || null,
        expiraEm,
        req.usuario.id
      ]
    );

    res.status(201).json({
      token,
      tenant_id: Number(tenant_id),
      tenant_nome: tenant.nome,
      expira_em: expiraEm,
      convite_url: `/register/${token}`
    });
  } catch (error) {
    console.error('Erro ao criar convite:', error);
    res.status(500).json({ erro: 'Erro ao criar convite.' });
  }
});

// Validação do convite
router.get('/register/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const convite = await getQuery(
      `SELECT c.id, c.email, c.nome, c.perfil, c.setor, c.setor_outro, c.tenant_id, t.nome AS tenant_nome, c.expira_em,
              c.usado, c.ativo
       FROM convites c
       LEFT JOIN tenants t ON t.id = c.tenant_id
       WHERE c.token = ?`,
      [token]
    );

    if (!convite || Number(convite.ativo) !== 1 || Number(convite.usado) === 1 || new Date(convite.expira_em) < new Date()) {
      return res.status(404).json({ erro: 'Convite inválido, expirado ou já utilizado.' });
    }

    res.json({
      valido: true,
      email: convite.email,
      nome: convite.nome,
      perfil: convite.perfil,
      setor: convite.setor,
      setor_outro: convite.setor_outro,
      tenant_id: convite.tenant_id,
      tenant_nome: convite.tenant_nome,
      expira_em: convite.expira_em
    });
  } catch (error) {
    console.error('Erro ao validar convite:', error);
    res.status(500).json({ erro: 'Erro ao validar convite.' });
  }
});

// Registro restrito por token
router.post('/register/:token', [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('senha').isLength({ min: 6, max: 6 }).withMessage('A senha deve ter exatamente 6 caracteres.'),
  body('email').optional().isEmail().withMessage('E-mail inválido.')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: errors.array()[0].msg });
    }

    const { token } = req.params;
    const { nome, senha } = req.body;

    const convite = await getQuery(
      `SELECT * FROM convites WHERE token = ?`,
      [token]
    );

    if (!convite || Number(convite.ativo) !== 1 || Number(convite.usado) === 1 || new Date(convite.expira_em) < new Date()) {
      return res.status(404).json({ erro: 'Convite inválido, expirado ou já utilizado.' });
    }

    const senhaValida = /^(?=(.*\d){4,})(?=.*[a-zA-Z])(?=.*[^a-zA-Z0-9]).{6}$/.test(senha);
    if (!senhaValida) {
      return res.status(400).json({
        erro: 'A senha deve ter exatamente 6 caracteres com pelo menos 4 números, 1 letra e 1 caractere especial.'
      });
    }

    const email = String(convite.email || '').trim().toLowerCase();
    const emailExistente = await getQuery('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (emailExistente) {
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail.' });
    }

    const ultimoUsuario = await getQuery('SELECT login FROM usuarios ORDER BY CAST(login AS INTEGER) DESC LIMIT 1');
    const proximoNumero = ultimoUsuario ? parseInt(ultimoUsuario.login, 10) + 1 : 1;
    const login = String(proximoNumero).padStart(6, '0');

    const perfilConvite = convite.perfil || 'ADM';
    const isGestor = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local'].includes(perfilConvite) ? 1 : 0;
    const isAdmFlag = perfilConvite === 'ADM' ? 1 : 0;

    const senhaHash = await bcrypt.hash(senha, 10);
    const insertUser = await runQuery(
      `INSERT INTO usuarios (login, senha, nome, email, perfil, funcao, setor, setor_outro, is_gestor, is_adm, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        login,
        senhaHash,
        String(nome).trim(),
        email,
        perfilConvite,
        perfilConvite,
        convite.setor || 'Administrativo',
        convite.setor_outro || null,
        isGestor,
        isAdmFlag,
        Number(convite.tenant_id)
      ]
    );

    const usuarioId = insertUser.lastID;
    await runQuery('INSERT OR IGNORE INTO usuario_tenants (usuario_id, tenant_id, ativo) VALUES (?, ?, 1)', [usuarioId, Number(convite.tenant_id)]);
    await runQuery('UPDATE convites SET usado = 1, usado_em = CURRENT_TIMESTAMP, usuario_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [usuarioId, convite.id]);

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ erro: 'Configuração inválida do servidor (JWT_SECRET).' });
    }

    const jwtToken = jwt.sign(
      {
        id: usuarioId,
        login,
        nome: String(nome).trim(),
        funcao: perfilConvite,
        perfil: perfilConvite,
        setor: convite.setor || 'Administrativo',
        setor_outro: convite.setor_outro || null,
        is_gestor: isGestor,
        is_adm: isAdmFlag,
        tenant_id: Number(convite.tenant_id),
        tenant_ids: [Number(convite.tenant_id)],
        verificado: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(201).json({
      token: jwtToken,
      usuario: {
        id: usuarioId,
        login,
        nome: String(nome).trim(),
        email,
        perfil: perfilConvite,
        tenant_id: Number(convite.tenant_id),
        tenant_ids: [Number(convite.tenant_id)],
        verificado: true
      }
    });
  } catch (error) {
    console.error('Erro no registro por convite:', error);
    res.status(500).json({ erro: 'Erro ao criar conta por convite.' });
  }
});

module.exports = router;
