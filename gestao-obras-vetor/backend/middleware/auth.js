const jwt = require('jsonwebtoken');
const { carregarPerfilUsuario } = require('./rbac');
const { allQuery } = require('../config/database');
const { runWithTenantContext, ensureTenantDatabase } = require('../config/database');
const { PERFIS, inferirPerfil } = require('../constants/access');

const auth = async (req, res, next) => {
  try {
    // Accept token from Authorization header OR ?token= query param (for file downloads)
    const headerToken = req.header('Authorization')?.replace('Bearer ', '');
    const token = headerToken || req.query?.token;
    
    if (!token) {
      return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('[auth] JWT_SECRET ausente no ambiente.');
      return res.status(500).json({
        codigo: 'AUTH_CONFIGURATION_ERROR',
        erro: 'Configuracao invalida do servidor de autenticacao.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuarioAtual = await carregarPerfilUsuario(decoded.id);
    if (!usuarioAtual) {
      return res.status(401).json({ erro: 'Usuário inválido ou inativo.' });
    }

    const perfil = inferirPerfil(usuarioAtual);
    if (!perfil) {
      console.warn(`[auth] Usuario ${usuarioAtual.id} possui perfil invalido ou ausente.`);
      return res.status(403).json({
        codigo: 'INVALID_USER_PROFILE',
        erro: 'Usuario sem perfil de acesso valido. Contate um administrador.'
      });
    }

    req.usuario = {
      ...decoded,
      ...usuarioAtual,
      perfil
    };

    const tenantDoToken = decoded.tenant_id ? Number(decoded.tenant_id) : null;
    const tenantHeader = req.header('x-tenant-id') ? Number(req.header('x-tenant-id')) : null;

    const vinculos = await allQuery(
      'SELECT tenant_id FROM usuario_tenants WHERE usuario_id = ? AND ativo = 1',
      [req.usuario.id]
    );
    const allowedTenantIds = vinculos.map((v) => Number(v.tenant_id)).filter(Boolean);
    req.usuario.tenant_ids = allowedTenantIds;
    const tenantIdAtivo = tenantHeader || tenantDoToken || allowedTenantIds[0] || null;

    // Em tokens legados (sem tenant_ids), verificar vínculos no banco
    if (!tenantIdAtivo) {
      return res.status(403).json({ erro: 'Usuário sem tenant ativo.' });
    }

    if (allowedTenantIds.length > 0 && !allowedTenantIds.includes(tenantIdAtivo)) {
      return res.status(403).json({ erro: 'Tenant inválido para este usuário.' });
    }

    req.tenantId = tenantIdAtivo;
    req.usuario.tenant_id = tenantIdAtivo;

    // The tenant is a CNPJ row in the shared database. Its group is part of
    // the verified request context used by PostgreSQL RLS policies.
    const tenant = await ensureTenantDatabase(tenantIdAtivo);
    const grupoId = Number(tenant.grupo_id);
    if (!grupoId) {
      return res.status(403).json({
        codigo: 'TENANT_GROUP_MISSING',
        erro: 'Tenant sem grupo empresarial configurado.'
      });
    }

    req.grupoId = grupoId;
    req.usuario.grupo_id = grupoId;
    return runWithTenantContext(tenantIdAtivo, () => next(), {
      userId: req.usuario.id,
      groupId: grupoId,
      role: perfil,
    });
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({
        codigo: 'TOKEN_EXPIRED',
        erro: 'Token expirado.'
      });
    }

    if (error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') {
      return res.status(401).json({
        codigo: 'TOKEN_INVALID',
        erro: 'Token inválido.'
      });
    }

    if (error?.code === 'DATABASE_SCHEMA_OUTDATED') {
      console.error('[auth] Schema desatualizado durante autenticacao:', error.message);
      return res.status(500).json({
        codigo: 'DATABASE_SCHEMA_OUTDATED',
        erro: 'Schema do banco desatualizado. Execute as migrations pendentes.',
        migration: error.migration || null
      });
    }

    const message = String(error?.message || '');
    if (message.includes('Banco tenant') || message.includes('tenant_id')) {
      console.error('[auth] Falha de tenant durante autenticacao:', message);
      return res.status(403).json({
        codigo: 'TENANT_INVALID',
        erro: 'Tenant invalido ou indisponivel para este usuario.'
      });
    }

    console.error('[auth] Erro interno durante autenticacao:', error);
    return res.status(500).json({
      codigo: 'AUTH_INTERNAL_ERROR',
      erro: 'Erro interno ao validar autenticacao.'
    });
  }
};

const isGestor = (req, res, next) => {
  const perfil = inferirPerfil(req.usuario);
  if (![PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA].includes(perfil)) {
    return res.status(403).json({ erro: 'Acesso negado. Apenas gestores podem realizar esta ação.' });
  }
  next();
};

const isAdm = (req, res, next) => {
  const perfil = inferirPerfil(req.usuario);
  if (perfil !== PERFIS.ADM) {
    return res.status(403).json({ erro: 'Acesso negado. Apenas ADM podem realizar esta ação.' });
  }
  next();
};

module.exports = { auth, isGestor, isAdm };
