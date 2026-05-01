const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { getQuery, allQuery, runQuery } = require('../config/database');
const { inferirPerfil } = require('../constants/access');
const { ensureAccessSchema } = require('../middleware/rbac');
const { auth, isAdm } = require('../middleware/auth');
const { hasForbiddenPasswordSequence } = require('../services/passwordPolicy');

const router = express.Router();
const GLOBAL_SIGNUP_CODE = process.env.GLOBAL_SIGNUP_CODE || '052298';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

const normalizeLogin = (value) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '')
  .replace(/[^a-zA-Z0-9._-]/g, '')
  .toLowerCase();
const normalizeName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, '')
  .replace(/[^a-z0-9]/g, '');

const generateUniqueLoginFromName = async (name) => {
  const base = normalizeName(name).slice(0, 14) || 'usuario';
  for (let i = 0; i < 50; i += 1) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const candidate = `${base}${suffix}`;
    const exists = await getQuery('SELECT id FROM usuarios WHERE login = ?', [candidate]);
    if (!exists) return candidate;
  }
  throw new Error('Não foi possível gerar login único.');
};

const isBcryptHash = (value) => /^\$2[aby]\$\d{2}\$/.test(String(value || ''));

const verifyPasswordWithLegacySupport = async (plainPassword, storedPassword) => {
  const senhaDigitada = String(plainPassword || '');
  const senhaArmazenada = String(storedPassword || '');

  if (!senhaArmazenada) return false;

  if (isBcryptHash(senhaArmazenada)) {
    return bcrypt.compare(senhaDigitada, senhaArmazenada);
  }

  // Compatibilidade com bases antigas que possam ter senha sem hash.
  return senhaDigitada === senhaArmazenada;
};

const ensureTenantTrialColumns = async () => {
  try { await runQuery('ALTER TABLE tenants ADD COLUMN trial_expires_at DATETIME'); } catch (_) {}
  try { await runQuery('ALTER TABLE tenants ADD COLUMN trial_ativo INTEGER DEFAULT 1'); } catch (_) {}
};

const generateSlug = (nomeEmpresa) => {
  const base = String(nomeEmpresa || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'empresa'}-${suffix}`;
};

const deleteRowsByIn = async (table, column, ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  try {
    await runQuery(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`, ids);
  } catch (_) {}
};

const purgeTenantData = async (tenantId) => {
  const numericTenantId = Number(tenantId);
  if (!Number.isInteger(numericTenantId) || numericTenantId <= 0) return;

  const projectRows = await allQuery('SELECT id FROM projetos WHERE tenant_id = ?', [numericTenantId]).catch(() => []);
  const projetoIds = projectRows.map((r) => Number(r.id)).filter(Boolean);

  const rdoRows = await allQuery('SELECT id FROM rdos WHERE tenant_id = ?', [numericTenantId]).catch(() => []);
  const rdoIds = rdoRows.map((r) => Number(r.id)).filter(Boolean);

  const rncRows = await allQuery('SELECT id FROM rnc WHERE tenant_id = ?', [numericTenantId]).catch(() => []);
  const rncIds = rncRows.map((r) => Number(r.id)).filter(Boolean);

  const atividadeRows = await allQuery('SELECT id FROM atividades_eap WHERE tenant_id = ?', [numericTenantId]).catch(() => []);
  const atividadeIds = atividadeRows.map((r) => Number(r.id)).filter(Boolean);

  await deleteRowsByIn('projeto_usuarios', 'projeto_id', projetoIds);
  await deleteRowsByIn('requisicoes', 'projeto_id', projetoIds);
  await deleteRowsByIn('pedidos_compra', 'projeto_id', projetoIds);
  await deleteRowsByIn('anexos', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_atividades', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_logs', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_mao_obra', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_clima', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_comentarios', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_materiais', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_ocorrencias', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_assinaturas', 'rdo_id', rdoIds);
  await deleteRowsByIn('rdo_fotos', 'rdo_id', rdoIds);
  await deleteRowsByIn('historico_atividades', 'rdo_id', rdoIds);
  await deleteRowsByIn('rnc_anexos', 'rnc_id', rncIds);
  await deleteRowsByIn('historico_atividades', 'atividade_eap_id', atividadeIds);

  try { await runQuery('DELETE FROM atividades_eap WHERE tenant_id = ?', [numericTenantId]); } catch (_) {}
  try { await runQuery('DELETE FROM rdos WHERE tenant_id = ?', [numericTenantId]); } catch (_) {}
  try { await runQuery('DELETE FROM rnc WHERE tenant_id = ?', [numericTenantId]); } catch (_) {}
  try { await runQuery('DELETE FROM projetos WHERE tenant_id = ?', [numericTenantId]); } catch (_) {}
  try { await runQuery('DELETE FROM auditoria WHERE tenant_id = ?', [numericTenantId]); } catch (_) {}
  try { await runQuery('DELETE FROM convites WHERE tenant_id = ?', [numericTenantId]); } catch (_) {}

  const vinculos = await allQuery('SELECT usuario_id FROM usuario_tenants WHERE tenant_id = ?', [numericTenantId]).catch(() => []);
  const userIds = vinculos.map((r) => Number(r.usuario_id)).filter(Boolean);

  for (const userId of userIds) {
    const otherTenants = await allQuery(
      'SELECT tenant_id FROM usuario_tenants WHERE usuario_id = ? AND tenant_id != ? AND ativo = 1',
      [userId, numericTenantId]
    ).catch(() => []);

    if (otherTenants.length === 0) {
      try { await runQuery('DELETE FROM usuarios WHERE id = ?', [userId]); } catch (_) {}
    }
  }

  try { await runQuery('DELETE FROM usuario_tenants WHERE tenant_id = ?', [numericTenantId]); } catch (_) {}
  try { await runQuery('DELETE FROM tenants WHERE id = ?', [numericTenantId]); } catch (_) {}

  const tenantDbPath = path.join(__dirname, '..', 'database', 'tenants', `tenant_${numericTenantId}.db`);
  try {
    if (fs.existsSync(tenantDbPath)) fs.unlinkSync(tenantDbPath);
  } catch (_) {}
};

const cleanupExpiredTrials = async () => {
  await ensureTenantTrialColumns();
  const expired = await allQuery(
    `SELECT id FROM tenants
     WHERE trial_ativo = 1
       AND trial_expires_at IS NOT NULL
       AND datetime(trial_expires_at) <= datetime('now')`
  ).catch(() => []);

  for (const t of expired) {
    // Apenas desativa; dados preservados até o usuário confirmar exclusão
    await runQuery(
      'UPDATE tenants SET trial_ativo = 0, ativo = 0 WHERE id = ?',
      [Number(t.id)]
    ).catch(() => {});
  }
};

setInterval(() => {
  cleanupExpiredTrials().catch((err) => {
    console.warn('Falha na limpeza periódica de trials:', err?.message || err);
  });
}, 60 * 60 * 1000).unref();

// Login
router.post('/login', [
  body('usuario').optional().isString(),
  body('login').optional().isString(),
  body('senha').isString().isLength({ min: 1, max: 72 })
], async (req, res) => {
  try {
    await ensureAccessSchema();
    await cleanupExpiredTrials();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Usuário ou senha inválidos.' });
    }

    const usuarioInput = String(req.body.usuario || req.body.login || '').trim();
    const { senha } = req.body;

    if (!usuarioInput) {
      return res.status(400).json({ erro: 'Informe usuário ou e-mail.' });
    }

    const usuario = await getQuery(
      'SELECT * FROM usuarios WHERE ativo = 1 AND (login = ? OR lower(email) = lower(?))',
      [usuarioInput, usuarioInput]
    );

    if (!usuario) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const senhaValida = await verifyPasswordWithLegacySupport(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    // Migra automaticamente senha legada para bcrypt após login bem-sucedido.
    if (!isBcryptHash(usuario.senha)) {
      const senhaHashAtualizada = await bcrypt.hash(String(senha), 10);
      await runQuery('UPDATE usuarios SET senha = ? WHERE id = ?', [senhaHashAtualizada, usuario.id]);
      usuario.senha = senhaHashAtualizada;
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
    if (!tenantIdAtivo) {
      return res.status(403).json({ erro: 'Conta sem tenant ativo.' });
    }

    const tenant = await getQuery(
      'SELECT id, trial_expires_at, trial_ativo, ativo FROM tenants WHERE id = ?',
      [tenantIdAtivo]
    );
    if (!tenant) {
      return res.status(403).json({ erro: 'Tenant não encontrado.' });
    }

    // Conta desativada por expiração de trial
    if (Number(tenant.ativo) === 0 && tenant.trial_expires_at) {
      return res.status(403).json({
        codigo: 'TRIAL_EXPIRADO',
        erro: 'Seu período de teste de 30 dias expirou. Assine o serviço para continuar.',
        tenant_id: tenantIdAtivo
      });
    }

    if (Number(tenant.ativo) === 0) {
      return res.status(403).json({ erro: 'Tenant inativo ou inexistente.' });
    }

    // Edge case: trial vencido mas cleanup ainda não rodou
    if (tenant.trial_expires_at && new Date(tenant.trial_expires_at) <= new Date()) {
      await runQuery('UPDATE tenants SET trial_ativo = 0, ativo = 0 WHERE id = ?', [tenantIdAtivo]);
      return res.status(403).json({
        codigo: 'TRIAL_EXPIRADO',
        erro: 'Seu período de teste de 30 dias expirou. Assine o serviço para continuar.',
        tenant_id: tenantIdAtivo
      });
    }

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
      { expiresIn: req.body.manterLogin === false ? '8h' : JWT_EXPIRES_IN }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        login: usuario.login,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone || null,
        avatar: usuario.avatar || null,
        funcao: usuario.funcao || perfil,
        perfil,
        setor: usuario.setor || null,
        setor_outro: usuario.setor_outro || null,
        primeiro_acesso_pendente: Number(usuario.primeiro_acesso_pendente) === 1,
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

// Registro público: cria tenant de teste por 30 dias
router.post('/register', [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('empresa').trim().notEmpty().withMessage('Empresa é obrigatória.'),
  body('email').trim().isEmail().withMessage('E-mail inválido.'),
  body('usuario').optional().isString(),
  body('senha').isString().isLength({ min: 1, max: 72 }).withMessage('Senha inválida.'),
  body('codigo_acesso').isString().notEmpty().withMessage('Código de acesso é obrigatório.')
], async (req, res) => {
  try {
    await ensureTenantTrialColumns();
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: errors.array()[0].msg });
    }

    const { nome, empresa, email, usuario, senha, codigo_acesso } = req.body;

    if (hasForbiddenPasswordSequence(senha)) {
      return res.status(400).json({
        erro: 'Senha não pode conter sequência crescente ou decrescente de letras/números (ex: abcd, 1234, 9876).'
      });
    }

    if (String(codigo_acesso).trim() !== GLOBAL_SIGNUP_CODE) {
      return res.status(403).json({ erro: 'Código global inválido para criação de conta.' });
    }

    const emailNormalizado = String(email || '').trim().toLowerCase();
    const emailExistente = await getQuery('SELECT id FROM usuarios WHERE lower(email) = lower(?)', [emailNormalizado]);
    if (emailExistente) {
      return res.status(409).json({ erro: 'Já existe conta cadastrada com este e-mail.' });
    }

    let usuarioLimpo = normalizeLogin(usuario);
    if (!usuarioLimpo) {
      usuarioLimpo = await generateUniqueLoginFromName(nome);
    }

    const existente = await getQuery('SELECT id FROM usuarios WHERE login = ?', [usuarioLimpo]);
    if (existente) {
      return res.status(409).json({ erro: 'Usuário já existe. Tente novamente para gerar outro.' });
    }

    const trialExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const tenantNome = String(empresa || '').trim();
    const tenantSlug = generateSlug(tenantNome);

    const tenantInsert = await runQuery(
      'INSERT INTO tenants (nome, slug, ativo, trial_expires_at, trial_ativo) VALUES (?, ?, 1, ?, 1)',
      [tenantNome, tenantSlug, trialExpiresAt]
    );
    const tenantId = Number(tenantInsert.lastID);

    const senhaHash = await bcrypt.hash(String(senha), 10);
    const userInsert = await runQuery(
      `INSERT INTO usuarios (login, senha, nome, email, perfil, funcao, setor, is_gestor, is_adm, tenant_id, ativo, primeiro_acesso_pendente)
       VALUES (?, ?, ?, ?, 'Gestor Geral', 'Gestor Geral', 'Administrativo', 1, 0, ?, 1, 1)`,
      [usuarioLimpo, senhaHash, String(nome || '').trim(), emailNormalizado, tenantId]
    );

    await runQuery('INSERT INTO usuario_tenants (usuario_id, tenant_id, ativo) VALUES (?, ?, 1)', [Number(userInsert.lastID), tenantId]);

    return res.status(201).json({
      mensagem: 'Conta de teste criada com sucesso.',
      usuario: usuarioLimpo,
      trial_expires_at: trialExpiresAt,
      dias_teste: 30
    });
  } catch (error) {
    console.error('Erro no cadastro público:', error);
    return res.status(500).json({ erro: 'Erro ao criar conta de teste.' });
  }
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

    if (hasForbiddenPasswordSequence(senha)) {
      return res.status(400).json({
        erro: 'Senha não pode conter sequência crescente ou decrescente de letras/números (ex: abcd, 1234, 9876).'
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
      `INSERT INTO usuarios (login, senha, nome, email, perfil, funcao, setor, setor_outro, is_gestor, is_adm, tenant_id, primeiro_acesso_pendente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      token: jwtToken,
      usuario: {
        id: usuarioId,
        login,
        nome: String(nome).trim(),
        email,
        perfil: perfilConvite,
        funcao: perfilConvite,
        setor: convite.setor || 'Administrativo',
        setor_outro: convite.setor_outro || null,
        primeiro_acesso_pendente: true,
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
// Recuperação de senha — solicitar token
router.post('/esqueci-senha', [
  body('login').isString().trim().notEmpty().withMessage('Informe o login ou e-mail.')
], async (req, res) => {
  try {
    await runQuery('ALTER TABLE usuarios ADD COLUMN password_reset_token TEXT').catch(() => {});
    await runQuery('ALTER TABLE usuarios ADD COLUMN password_reset_expires DATETIME').catch(() => {});

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ mensagem: 'Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.' });
    }

    const loginInput = String(req.body.login || '').trim();

    const usuario = await getQuery(
      'SELECT id, login, nome, email, tenant_id FROM usuarios WHERE ativo = 1 AND (login = ? OR lower(email) = lower(?))',
      [loginInput, loginInput]
    );

    if (!usuario || !usuario.email) {
      return res.json({ mensagem: 'Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 horas

    await runQuery(
      'UPDATE usuarios SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
      [token, expires, usuario.id]
    );

    try {
      const { sendEmail } = require('../services/emailService');
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/redefinir-senha/${token}`;

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
          <h2 style="color: #0284c7; margin-top: 0;">Redefinição de senha</h2>
          <p>Olá, <strong>${usuario.nome}</strong>.</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no sistema <strong>Vetor Gestão de Obras</strong>.</p>
          <p>Clique no botão abaixo para criar uma nova senha. O link é válido por <strong>2 horas</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background: #0284c7; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">
              Redefinir minha senha
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Se você não solicitou a redefinição, ignore este e-mail. Sua senha permanecerá a mesma.</p>
          <p style="color: #94a3b8; font-size: 12px;">Ou acesse: <a href="${resetUrl}" style="color: #0284c7;">${resetUrl}</a></p>
        </div>
      `;

      await sendEmail(
        usuario.tenant_id,
        null,
        usuario.email,
        'Redefinição de senha — Vetor Gestão de Obras',
        htmlBody,
        null,
        { includeSignature: false }
      );
    } catch (emailErr) {
      console.warn('Falha ao enviar e-mail de recuperação de senha:', emailErr?.message || emailErr);
    }

    return res.json({ mensagem: 'Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.' });
  } catch (error) {
    console.error('Erro em esqueci-senha:', error);
    return res.json({ mensagem: 'Se o usuário existir, as instruções foram enviadas ao e-mail cadastrado.' });
  }
});

// Recuperação de senha — redefinir com token
router.post('/redefinir-senha', [
  body('token').isString().trim().notEmpty().withMessage('Token inválido.'),
  body('senha').isString().isLength({ min: 1, max: 72 }).withMessage('Senha inválida.')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: errors.array()[0].msg });
    }

    const { token, senha } = req.body;

    if (!token || token.length < 32) {
      return res.status(400).json({ erro: 'Token inválido.' });
    }

    if (hasForbiddenPasswordSequence(senha)) {
      return res.status(400).json({ erro: 'Senha não pode conter sequências simples (ex: 1234, abcd).' });
    }

    const usuario = await getQuery(
      'SELECT id, password_reset_token, password_reset_expires FROM usuarios WHERE ativo = 1 AND password_reset_token = ?',
      [token]
    );

    if (!usuario) {
      return res.status(400).json({ erro: 'Token inválido ou expirado.' });
    }

    if (!usuario.password_reset_expires || new Date(usuario.password_reset_expires) <= new Date()) {
      await runQuery(
        'UPDATE usuarios SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?',
        [usuario.id]
      );
      return res.status(400).json({ erro: 'Link expirado. Solicite um novo link de recuperação.' });
    }

    const senhaHash = await bcrypt.hash(String(senha), 10);
    await runQuery(
      'UPDATE usuarios SET senha = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?',
      [senhaHash, usuario.id]
    );

    return res.json({ mensagem: 'Senha redefinida com sucesso. Você já pode fazer login.' });
  } catch (error) {
    console.error('Erro em redefinir-senha:', error);
    return res.status(500).json({ erro: 'Erro ao redefinir senha.' });
  }
});

// Cancelamento e exclusão definitiva de conta (trial expirado)
router.post('/cancelar-conta', [
  body('login').isString().trim().notEmpty(),
  body('senha').isString().isLength({ min: 1, max: 72 }),
  body('tenant_id').isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos.' });
    }

    const { login: loginInput, senha, tenant_id } = req.body;

    // Valida credenciais independente do status do tenant
    const usuario = await getQuery(
      'SELECT id, senha AS senhaHash FROM usuarios WHERE ativo = 1 AND (login = ? OR lower(email) = lower(?))',
      [loginInput.trim(), loginInput.trim()]
    );

    if (!usuario) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const senhaValida = await verifyPasswordWithLegacySupport(senha, usuario.senhaHash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const numericTenantId = Number(tenant_id);
    if (!numericTenantId) {
      return res.status(400).json({ erro: 'tenant_id inválido.' });
    }

    await purgeTenantData(numericTenantId);

    return res.json({ mensagem: 'Conta excluída definitivamente.' });
  } catch (error) {
    console.error('Erro em cancelar-conta:', error);
    return res.status(500).json({ erro: 'Erro ao excluir conta.' });
  }
});

module.exports = router;
