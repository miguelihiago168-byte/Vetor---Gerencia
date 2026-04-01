const jwt = require('jsonwebtoken');
const { carregarPerfilUsuario } = require('./rbac');
const { allQuery } = require('../config/database');
const { runWithTenantContext, ensureTenantDatabase } = require('../config/database');
const { PERFIS, inferirPerfil } = require('../constants/access');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuarioAtual = await carregarPerfilUsuario(decoded.id);
    if (!usuarioAtual) {
      return res.status(401).json({ erro: 'Usuário inválido ou inativo.' });
    }

    req.usuario = {
      ...decoded,
      ...usuarioAtual,
      perfil: inferirPerfil(usuarioAtual)
    };

    const tenantIds = Array.isArray(decoded.tenant_ids)
      ? decoded.tenant_ids.map((t) => Number(t)).filter(Boolean)
      : [];

    const tenantDoToken = decoded.tenant_id ? Number(decoded.tenant_id) : null;
    const tenantHeader = req.header('x-tenant-id') ? Number(req.header('x-tenant-id')) : null;

    let tenantIdAtivo = tenantHeader || tenantDoToken || null;
    if (!tenantIdAtivo && tenantIds.length > 0) {
      tenantIdAtivo = tenantIds[0];
    }

    // Em tokens legados (sem tenant_ids), verificar vínculos no banco
    if ((!tenantIdAtivo || tenantIds.length === 0) && req.usuario?.id) {
      try {
        const vinculos = await allQuery('SELECT tenant_id FROM usuario_tenants WHERE usuario_id = ? AND ativo = 1', [req.usuario.id]);
        const idsBanco = vinculos.map(v => Number(v.tenant_id)).filter(Boolean);
        if (!tenantIdAtivo && idsBanco.length > 0) tenantIdAtivo = idsBanco[0];
        if (tenantIds.length === 0) req.usuario.tenant_ids = idsBanco;
      } catch (_) {
        // ignora fallback
      }
    }

    const allowedTenantIds = Array.isArray(req.usuario.tenant_ids)
      ? req.usuario.tenant_ids.map((t) => Number(t)).filter(Boolean)
      : [];

    if (!tenantIdAtivo) {
      return res.status(403).json({ erro: 'Usuário sem tenant ativo.' });
    }

    if (allowedTenantIds.length > 0 && !allowedTenantIds.includes(tenantIdAtivo)) {
      return res.status(403).json({ erro: 'Tenant inválido para este usuário.' });
    }

    req.tenantId = tenantIdAtivo;
    req.usuario.tenant_id = tenantIdAtivo;

    const isAuthRoute = String(req.originalUrl || '').startsWith('/api/auth');
    if (isAuthRoute) {
      return next();
    }

    await ensureTenantDatabase(tenantIdAtivo);
    return runWithTenantContext(tenantIdAtivo, () => next());
  } catch (error) {
    res.status(401).json({ erro: 'Token inválido.' });
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
